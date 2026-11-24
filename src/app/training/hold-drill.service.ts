import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { HoldDrill, HoldRep } from '../data/models';
import { beep, beeps, speak, vibrate } from '../recording/cues';
import { Recorder } from '../recording/recorder.service';
import { SensorManager } from '../sensors/sensor-manager.service';
import { ReleaseDetector } from '../recording/release-detector';
import { HOLD_LIMITS, HoldDetector, HoldEndedBy, HoldEvent } from './hold-detector';

/**
 * 'level': before the first hold, the archer raises the bow to the level it will be held
 * at, so the drill knows the full-draw pose and does not take the bow resting higher (or
 * the set-up before the draw) for a hold.
 */
export type HoldPhase = 'idle' | 'level' | 'ready' | 'holding' | 'rest' | 'done';

export interface HoldSettings {
  holdSeconds: number;
  reps: number;
  restSeconds: number;
}

/** Wait after a hold before the result is read aloud: time to feel the hold yourself. */
const SPEAK_DELAY_MS = 1500;

/**
 * A hold that ends by itself (let-down or drift) within this time was not a hold at full
 * draw but the bow held still for a moment while being raised or set up. It does not use
 * up a repetition (ms; at most half the target time). Field test 2026-11-24: the bow held
 * still at set-up started a "hold" that ended 1.5 s later when the archer drew.
 */
const FALSE_START_MS = 2500;

/**
 * Before the first hold the bow must be still longer than at full draw, so picking up the
 * bow does not count as the holding level (ms).
 */
const LEVEL_SETTLE_MS = 2000;

/** The spoken instruction for the level step is about this long; the bow is not raised yet (ms). */
const LEVEL_INSTRUCTION_MS = 4000;

/**
 * A hold that ends by itself before the target time is kept back this long (ms). If the
 * bow settles again in that time, the first "hold" was the set-up before the draw (which
 * is higher, as in BEST, and can be still for 3 s); the new hold replaces it in the same
 * repetition. After a real let-down the bow is lowered and does not settle at full draw
 * again so soon.
 */
const SETUP_WINDOW_MS = 4000;

/**
 * Runs the holding drill (Holding SPT) on top of a recording: hold full draw for the
 * target time, let down, rest, repeat. The bow sensor starts and ends each hold; sounds
 * tell the archer when the time starts, when it is reached ("let down"), and when the
 * form breaks down, so the screen does not need to be watched.
 */
@Injectable({ providedIn: 'root' })
export class HoldDrillRunner {
  private readonly recorder = inject(Recorder);
  private readonly manager = inject(SensorManager);

  readonly settings = signal<HoldSettings>(loadSettings());
  readonly speech = signal(true);

  readonly phase = signal<HoldPhase>('idle');
  /** Current repetition, 1-based. */
  readonly rep = signal(0);
  /** Time held in the current hold (ms). */
  readonly held = signal(0);
  readonly restLeft = signal(0);
  /** Smoothed angular speed of the bow (deg/s). */
  readonly speed = signal(0);
  readonly warning = signal(false);
  readonly results = signal<HoldRep[]>([]);

  private detector = new HoldDetector();
  private levelDetector = new HoldDetector({ ...HOLD_LIMITS, settleMs: LEVEL_SETTLE_MS });
  private releases = new ReleaseDetector();
  private subscription?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private restEnd = 0;
  private targetReached = false;
  private startedBy: 'auto' | 'manual' = 'auto';
  private lastSampleTime = 0;
  private lastEuler?: [number, number, number];
  private levelFrom = 0;
  /** A hold that ended early, waiting to see whether it was only the set-up. */
  private pending?: { result: HoldRep; until: number; endedAt: number };

  setSettings(changes: Partial<HoldSettings>): void {
    const next = { ...this.settings(), ...changes };
    this.settings.set(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage not available */
    }
  }

  /** Starts a recording with the drill attached. */
  async start(archerId: string, setupId: string | undefined, place?: string): Promise<void> {
    await this.recorder.start(archerId, setupId, place);
    const session = this.recorder.session();
    if (!session) return;
    const drill: HoldDrill = { kind: 'hold', ...this.settings(), results: [] };
    session.drill = drill;
    await this.recorder.saveSession();

    this.detector = new HoldDetector();
    this.levelDetector = new HoldDetector({ ...HOLD_LIMITS, settleMs: LEVEL_SETTLE_MS });
    this.releases = new ReleaseDetector(this.recorder.threshold());
    this.results.set([]);
    this.subscription = this.manager.sampleEvents.subscribe(({ slot, sample }) => {
      if (slot !== this.recorder.mainBow()) return;
      this.lastSampleTime = sample.time;
      if (sample.euler) this.lastEuler = sample.euler;
      this.releases.threshold = this.recorder.threshold();
      const shot = this.releases.feed(sample);
      if (this.phase() === 'level') {
        // A "hold" here is the bow raised to the level and kept still
        if (performance.now() < this.levelFrom) return;
        if (this.levelDetector.feed(sample).some((e) => e.type === 'start')) this.levelFound(sample.euler);
        return;
      }
      if (this.phase() !== 'ready' && this.phase() !== 'holding') return;
      if (shot) {
        const event = this.detector.release(sample.time, sample.euler);
        if (event) this.onEvent(event);
        return;
      }
      for (const event of this.detector.feed(sample)) this.onEvent(event);
    });
    this.timer = setInterval(() => this.tick(), 100);
    this.rep.set(1);
    this.lastEuler = undefined;
    this.pending = undefined;
    this.detector.arm();
    this.levelDetector.arm();
    this.levelFrom = performance.now() + (this.speech() ? LEVEL_INSTRUCTION_MS : 0);
    this.phase.set('level');
    if (this.speech()) speak('Hæv buen til det niveau, du skal holde i, og hold den stille.');
  }

  /** Uses the bow's angles now as the holding level (when the automatic step misses it). */
  levelNow(): void {
    if (this.phase() === 'level') this.levelFound(this.lastEuler);
  }

  /** Starts without a holding level; the first shot will give it. */
  skipLevel(): void {
    if (this.phase() === 'level') this.startFirstRep();
  }

  private levelFound(euler: [number, number, number] | undefined): void {
    if (euler) this.detector.setReference(euler);
    beeps([660, 990]);
    vibrate(100);
    this.startFirstRep();
  }

  private startFirstRep(): void {
    this.ready(); // arm() keeps the reference pose
  }

  /** Stops the drill (the recording is stopped by the caller). */
  stop(): void {
    if (this.pending) {
      // Keep the last hold even if the drill is stopped while it waits
      const { result, endedAt } = this.pending;
      this.pending = undefined;
      this.commit(result, endedAt);
    }
    this.subscription?.unsubscribe();
    clearInterval(this.timer);
    this.phase.set('idle');
    this.warning.set(false);
  }

  /** Starts the hold by hand when the automatic detection misses it. */
  startNow(): void {
    if (this.phase() === 'ready') this.onEvent(this.detector.startManual(this.now()));
  }

  /** Ends the hold by hand. */
  endNow(): void {
    if (this.phase() !== 'holding') return;
    const event = this.detector.endManual(this.now());
    if (event) this.onEvent(event);
  }

  skipRest(): void {
    if (this.phase() === 'rest') this.nextRep();
  }

  /** Time base of the samples, so manual events line up with the sensor data. */
  private now(): number {
    return this.lastSampleTime || performance.now();
  }

  private onEvent(event: HoldEvent): void {
    switch (event.type) {
      case 'start':
        // The early end just before was the set-up, not a hold
        this.pending = undefined;
        this.phase.set('holding');
        this.startedBy = event.by;
        this.targetReached = false;
        this.warning.set(false);
        beep(880, 180);
        vibrate(100);
        break;
      case 'warning':
        this.warning.set(true);
        beep(300, 350);
        vibrate(300);
        break;
      case 'end':
        void this.finishRep(event.by);
        break;
    }
  }

  private tick(): void {
    this.speed.set(this.detector.speed);
    if (this.pending && performance.now() >= this.pending.until) {
      const { result, endedAt } = this.pending;
      this.pending = undefined;
      this.commit(result, endedAt);
    }
    if (this.phase() === 'holding') {
      const held = performance.now() - this.detector.stats().start;
      this.held.set(Math.max(0, held));
      if (!this.targetReached && held >= this.settings().holdSeconds * 1000) {
        this.targetReached = true;
        beeps([1320, 1320, 1320]); // let down
        vibrate(400);
      }
    } else if (this.phase() === 'rest') {
      const left = this.restEnd - performance.now();
      const before = Math.ceil(this.restLeft() / 1000);
      this.restLeft.set(Math.max(0, left));
      const secs = Math.ceil(left / 1000);
      if (secs !== before && secs > 0 && secs <= 3) beep(660, 60);
      if (left <= 0) this.nextRep();
    }
  }

  private async finishRep(endedBy: HoldEndedBy): Promise<void> {
    const stats = this.detector.stats();
    const target = this.settings().holdSeconds * 1000;
    if (isFalseStart(endedBy, this.startedBy, stats.heldMs, target)) {
      // Not counted: wait for the real hold in the same repetition
      beep(440, 120);
      this.ready();
      return;
    }
    const result: HoldRep = {
      number: this.rep(),
      start: this.recorder.sessionTime(stats.start),
      end: this.recorder.sessionTime(stats.end ?? stats.start + stats.heldMs),
      heldMs: stats.heldMs,
      goodFormMs: stats.goodFormMs,
      completed: stats.heldMs >= target - 250,
      startedBy: this.startedBy,
      endedBy,
      sway: round(stats.sway, 2),
      tremor: round(stats.tremor, 2),
      drift: stats.drift !== undefined ? round(stats.drift, 2) : undefined,
      warnings: stats.warnings.map((t) => this.recorder.sessionTime(t)),
      perSecond: { sway: stats.perSecond.sway.map((v) => round(v, 2)), tremor: stats.perSecond.tremor.map((v) => round(v, 2)) },
    };
    this.held.set(stats.heldMs);
    if (endedBy === 'auto' && this.startedBy === 'auto' && !result.completed) {
      // Maybe only the set-up: wait a moment for a real hold in the same repetition
      const now = performance.now();
      this.pending = { result, until: now + SETUP_WINDOW_MS, endedAt: now };
      this.ready();
      return;
    }
    this.commit(result, performance.now());
  }

  private commit(result: HoldRep, endedAt: number): void {
    this.results.update((list) => [...list, result]);
    this.recorder.session()?.drill?.results.push(result);
    void this.recorder.saveSession();

    if (this.speech()) setTimeout(() => speak(spoken(result)), SPEAK_DELAY_MS);

    if (this.rep() >= this.settings().reps) {
      this.phase.set('done');
      setTimeout(() => beeps([660, 880, 1320], 150), this.speech() ? 0 : 300);
    } else {
      this.phase.set('rest');
      this.restEnd = endedAt + this.settings().restSeconds * 1000;
      this.restLeft.set(Math.max(0, this.restEnd - performance.now()));
    }
  }

  private nextRep(): void {
    this.rep.update((n) => n + 1);
    this.ready();
    beeps([880, 880]);
    vibrate(150);
  }

  private ready(): void {
    this.detector.arm();
    this.held.set(0);
    this.warning.set(false);
    this.phase.set('ready');
  }
}

const SETTINGS_KEY = 'archery-motion.hold-drill';

function loadSettings(): HoldSettings {
  const defaults: HoldSettings = { holdSeconds: 30, reps: 5, restSeconds: 30 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** A short hold that ended by itself was the bow held still while being raised, not a hold. */
export function isFalseStart(endedBy: HoldEndedBy, startedBy: 'auto' | 'manual', heldMs: number, targetMs: number): boolean {
  return endedBy === 'auto' && startedBy === 'auto' && heldMs < Math.min(FALSE_START_MS, targetMs / 2);
}

/** Short spoken summary: the most important first. */
export function spoken(rep: HoldRep): string {
  const held = Math.round(rep.heldMs / 1000);
  const good = Math.round(rep.goodFormMs / 1000);
  const parts = [`${held} sekunder`];
  if (rep.warnings.length) parts.push(`god form i ${good}`);
  else parts.push('stabil hele vejen');
  if (rep.drift !== undefined && rep.drift >= 2) parts.push(`buen drev ${Math.round(rep.drift)} grader`);
  return parts.join('. ') + '.';
}
