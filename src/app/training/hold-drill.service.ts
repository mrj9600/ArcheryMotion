import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { HoldDrill, HoldRep } from '../data/models';
import { beep, beeps, speak, vibrate } from '../recording/cues';
import { Recorder } from '../recording/recorder.service';
import { SensorManager } from '../sensors/sensor-manager.service';
import { HoldDetector, HoldEvent } from './hold-detector';

export type HoldPhase = 'idle' | 'ready' | 'holding' | 'rest' | 'done';

export interface HoldSettings {
  holdSeconds: number;
  reps: number;
  restSeconds: number;
}

/** Wait after a hold before the result is read aloud: time to feel the hold yourself. */
const SPEAK_DELAY_MS = 1500;

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
  private subscription?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private restEnd = 0;
  private targetReached = false;
  private startedBy: 'auto' | 'manual' = 'auto';
  private lastSampleTime = 0;

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
    this.results.set([]);
    this.subscription = this.manager.sampleEvents.subscribe(({ slot, sample }) => {
      if (slot !== this.recorder.mainBow()) return;
      this.lastSampleTime = sample.time;
      if (this.phase() !== 'ready' && this.phase() !== 'holding') return;
      for (const event of this.detector.feed(sample)) this.onEvent(event);
    });
    this.timer = setInterval(() => this.tick(), 100);
    this.rep.set(1);
    this.ready();
  }

  /** Stops the drill (the recording is stopped by the caller). */
  stop(): void {
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

  private async finishRep(endedBy: 'auto' | 'manual'): Promise<void> {
    const stats = this.detector.stats();
    const target = this.settings().holdSeconds * 1000;
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
    this.results.update((list) => [...list, result]);
    this.recorder.session()?.drill?.results.push(result);
    void this.recorder.saveSession();

    if (this.speech()) setTimeout(() => speak(spoken(result)), SPEAK_DELAY_MS);

    if (this.rep() >= this.settings().reps) {
      this.phase.set('done');
      setTimeout(() => beeps([660, 880, 1320], 150), this.speech() ? 0 : 300);
    } else {
      this.phase.set('rest');
      this.restEnd = performance.now() + this.settings().restSeconds * 1000;
      this.restLeft.set(this.settings().restSeconds * 1000);
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
