import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { BUILD_INFO } from '../build-info';
import { Db, newId } from '../data/db';
import { SampleChunk, Session, ShotRecord, TargetElevation } from '../data/models';
import { SensorManager, SensorSlot } from '../sensors/sensor-manager.service';
import { ChunkBuffer } from './chunk-buffer';
import { beep, ScreenWakeLock, vibrate } from './cues';
import { PauseDetector } from './pause-detector';
import { RELEASE_G, ReleaseDetector } from './release-detector';

interface Track {
  index: number;
  buffer: ChunkBuffer;
  /** While paused: the last couple of seconds, saved when recording resumes. */
  recent: { t: number; sample: Parameters<ChunkBuffer['add']>[1] }[];
}

/** Data kept from just before a resume, so the start of the movement is not lost (ms). */
const PRE_RESUME_MS = 2000;

/**
 * Records a session: every sample from every connected sensor is written to IndexedDB
 * in chunks, and releases detected on the bow sensor become shots. Each shot gets the
 * current tags (target elevation, distance, crawl), which can be corrected afterwards.
 */
@Injectable({ providedIn: 'root' })
export class Recorder {
  private readonly db = inject(Db);
  private readonly manager = inject(SensorManager);

  readonly session = signal<Session | undefined>(undefined);
  /** Shots of the running session, newest first. */
  readonly shots = signal<ShotRecord[]>([]);
  readonly error = signal<string | undefined>(undefined);

  /** Tags given to the next shot. */
  readonly target = signal<TargetElevation>('level');
  readonly distance = signal<number | undefined>(undefined);
  readonly crawl = signal<string>('');
  /** Release threshold in g. */
  readonly threshold = signal(RELEASE_G);
  readonly sound = signal(true);
  /** Set while paused: saving stops, and so does the release detection. */
  readonly paused = signal<'auto' | 'manual' | undefined>(undefined);

  private t0 = 0;
  private tracks = new Map<SensorSlot, Track>();
  private detector = new ReleaseDetector();
  private pauseDetector = new PauseDetector();
  private subscription?: Subscription;
  private readonly wakeLock = new ScreenWakeLock();
  private writes: Promise<unknown> = Promise.resolve();

  async start(archerId: string, setupId: string | undefined, place?: string): Promise<void> {
    if (this.session()) return;
    void this.db.requestPersistence();
    beep(660, 60); // unlocks audio from the user's tap
    const session: Session = {
      id: newId(),
      archerId,
      setupId,
      startedAt: Date.now(),
      place: place || undefined,
      sensors: [],
      shotCount: 0,
      sampleCount: 0,
      app: BUILD_INFO,
    };
    this.t0 = performance.now();
    this.tracks.clear();
    this.detector = new ReleaseDetector(this.threshold());
    this.pauseDetector = new PauseDetector();
    this.paused.set(undefined);
    this.shots.set([]);
    this.error.set(undefined);
    this.session.set(session);
    await this.db.saveSession(session);
    this.subscription = this.manager.sampleEvents.subscribe(({ slot, sample }) => this.onSample(slot, sample));
    await this.wakeLock.enable();
  }

  async stop(): Promise<void> {
    const session = this.session();
    if (!session) return;
    this.subscription?.unsubscribe();
    this.paused.set(undefined);
    for (const track of this.tracks.values()) this.write(track.buffer.flush());
    await this.writes;
    // Roles may have been changed during the session
    for (const [slot, track] of this.tracks) session.sensors[track.index].role = slot.role();
    session.endedAt = Date.now();
    await this.db.saveSession(session);
    await this.wakeLock.disable();
    this.session.set(undefined);
  }

  async updateShot(shot: ShotRecord, changes: Partial<ShotRecord>): Promise<void> {
    const updated = { ...shot, ...changes };
    this.shots.update((list) => list.map((s) => (s.id === shot.id ? updated : s)));
    await this.db.saveShot(updated);
  }

  /** Converts a sample time (performance.now()) to session time (ms since start). */
  sessionTime(time: number): number {
    return time - this.t0;
  }

  /** Saves changes made to the running session object (e.g. drill results). */
  async saveSession(): Promise<void> {
    const session = this.session();
    if (session) await this.db.saveSession(session);
  }

  /** The bow sensor used for release detection, if any. */
  mainBow(): SensorSlot | undefined {
    return this.manager.slots().find((s) => s.role() === 'bow');
  }

  /** Pauses by hand; only the button resumes it (the bow may move while walking). */
  pause(): void {
    if (!this.session() || this.paused()) return;
    this.beginPause('manual', performance.now() - this.t0);
  }

  resume(): void {
    if (!this.paused()) return;
    this.endPause(performance.now() - this.t0);
    this.pauseDetector.reset();
  }

  private beginPause(by: 'auto' | 'manual', time: number): void {
    const session = this.session()!;
    this.paused.set(by);
    (session.pauses ??= []).push({ start: time, by });
    for (const track of this.tracks.values()) {
      this.write(track.buffer.flush());
      track.recent = [];
    }
    void this.db.saveSession(session);
    beep(440, 120);
  }

  private endPause(time: number): void {
    const session = this.session()!;
    this.paused.set(undefined);
    const pause = session.pauses?.at(-1);
    // The kept seconds before the resume are saved, so the pause ends where they start
    let from = time;
    for (const track of this.tracks.values()) {
      if (track.recent.length) from = Math.min(from, track.recent[0].t);
      for (const r of track.recent) this.write(track.buffer.add(r.t, r.sample));
      session.sampleCount += track.recent.length;
      track.recent = [];
    }
    if (pause && pause.end === undefined) pause.end = Math.max(pause.start, from);
    void this.db.saveSession(session);
    beep(880, 80);
  }

  setThreshold(g: number): void {
    this.threshold.set(g);
    this.detector.threshold = g;
  }

  private onSample(slot: SensorSlot, sample: Parameters<ChunkBuffer['add']>[1]): void {
    const session = this.session()!;
    let track = this.tracks.get(slot);
    if (!track) {
      const index = session.sensors.length;
      session.sensors.push({ index, name: slot.sensor.name, kind: slot.sensor.kind, role: slot.role() });
      track = { index, buffer: new ChunkBuffer(session.id, index), recent: [] };
      this.tracks.set(slot, track);
      void this.db.saveSession(session);
    }
    const t = sample.time - this.t0;
    const mainBow = slot.role() === 'bow' && this.isMainBow(slot);
    if (mainBow) {
      const change = this.pauseDetector.feed(sample);
      if (change === 'pause' && !this.paused()) this.beginPause('auto', t);
      else if (change === 'resume' && this.paused() === 'auto') this.endPause(t);
    }
    if (this.paused()) {
      track.recent.push({ t, sample });
      while (track.recent.length && t - track.recent[0].t > PRE_RESUME_MS) track.recent.shift();
      return;
    }
    session.sampleCount++;
    this.write(track.buffer.add(t, sample));
    if (mainBow && this.detector.feed(sample)) {
      void this.addShot(t, 'auto');
    }
  }

  /** Only the first bow sensor detects releases. */
  private isMainBow(slot: SensorSlot): boolean {
    return this.mainBow() === slot;
  }

  private async addShot(releaseTime: number, trigger: ShotRecord['trigger']): Promise<void> {
    const session = this.session();
    if (!session) return;
    session.shotCount++;
    const shot: ShotRecord = {
      id: newId(),
      sessionId: session.id,
      number: session.shotCount,
      releaseTime,
      trigger,
      target: this.target(),
      distance: this.distance(),
      crawl: this.crawl() || undefined,
    };
    this.shots.update((list) => [shot, ...list]);
    if (this.sound()) beep();
    vibrate();
    try {
      await this.db.saveShot(shot);
      await this.db.saveSession(session);
    } catch (e) {
      this.error.set(`Kunne ikke gemme skud: ${e}`);
    }
  }

  private write(chunk: SampleChunk | undefined): void {
    if (!chunk) return;
    this.writes = this.writes
      .then(() => this.db.addChunk(chunk))
      .catch((e) => this.error.set(`Kunne ikke gemme data: ${e}`));
  }
}
