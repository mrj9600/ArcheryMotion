import { MotionSample } from '../sensors/sensor.model';

/**
 * Thresholds on the bow's angular speed (deg/s). They are first guesses: the recordings
 * from the field are what they should be tuned against.
 */
export const HOLD_LIMITS = {
  /** Speed that counts as raising/drawing the bow. Needed before a hold can start. */
  move: 20,
  /** Below this the bow counts as still. */
  still: 8,
  /** Above this the hold has ended (let-down or shot). */
  end: 25,
  /** How long the bow must be still before the hold counts as started (ms). */
  settleMs: 800,
  /** Max change of roll/pitch from the reference full-draw pose (degrees). */
  poseTolerance: 20,
};

/** Time constants (s): state speed, and the split between slow sway and fast tremor. */
const SPEED_TAU = 0.2;
const SWAY_TAU = 0.1;

export type HoldEvent =
  | { type: 'start'; time: number; by: 'auto' | 'manual' }
  | { type: 'warning'; time: number }
  | { type: 'end'; time: number; by: 'auto' | 'manual' };

export interface HoldStats {
  start: number;
  end?: number;
  heldMs: number;
  goodFormMs: number;
  sway: number;
  tremor: number;
  drift?: number;
  warnings: number[];
  perSecond: { sway: number[]; tremor: number[] };
}

interface Second {
  sway: number;
  tremor: number;
  /** Mean roll and pitch, if the sensor sends angles. */
  pose?: [number, number];
}

/**
 * Finds a hold at full draw in the bow sensor's samples and measures how still it is.
 *
 * A hold starts when the bow has moved (raised and drawn) and then stays still for a
 * moment; from the second hold on, the bow must also point roughly like it did in the
 * first one. It ends when the bow moves fast again (let-down or shot).
 *
 * The angular speed is split into slow *sway* (aiming movement) and fast *tremor*
 * (shaking, typically fatigue). Each whole second of the hold gets both values. Seconds
 * 1–2 are the archer's own baseline; when later seconds are clearly worse two seconds in
 * a row, the form is breaking down and a warning is given.
 */
export class HoldDetector {
  state: 'waiting' | 'holding' | 'ended' = 'waiting';

  /** Smoothed angular speed (deg/s), useful for a live display. */
  speed = 0;

  private lastTime?: number;
  private slow: [number, number, number] = [0, 0, 0];
  private moved = false;
  private stillSince?: number;
  private lastCalm = 0;
  private reference?: [number, number];

  private start = 0;
  private end?: number;
  private seconds: Second[] = [];
  private bucket = { n: 0, sway: 0, tremor: 0, roll: 0, pitch: 0, poses: 0 };
  private warnings: number[] = [];
  private badRun = 0;

  /** Waits for a new hold. The full-draw pose found so far is kept. */
  arm(): void {
    this.state = 'waiting';
    this.moved = false;
    this.stillSince = undefined;
    this.end = undefined;
  }

  feed(sample: MotionSample): HoldEvent[] {
    const gyro = sample.gyro;
    if (!gyro) return [];
    const t = sample.time;
    const dt = this.lastTime === undefined ? 0 : Math.min((t - this.lastTime) / 1000, 0.2);
    this.lastTime = t;

    const mag = Math.hypot(gyro[0], gyro[1], gyro[2]);
    this.speed += (1 - Math.exp(-dt / SPEED_TAU)) * (mag - this.speed);
    const a = 1 - Math.exp(-dt / SWAY_TAU);
    for (let i = 0; i < 3; i++) this.slow[i] += a * (gyro[i] - this.slow[i]);

    const events: HoldEvent[] = [];
    if (this.state === 'waiting') {
      if (this.speed > HOLD_LIMITS.move) this.moved = true;
      if (this.speed > HOLD_LIMITS.still || !this.inPose(sample)) {
        this.stillSince = undefined;
      } else {
        this.stillSince ??= t;
        if (this.moved && t - this.stillSince >= HOLD_LIMITS.settleMs) {
          events.push(this.begin(this.stillSince, 'auto'));
        }
      }
    } else if (this.state === 'holding') {
      if (this.speed > HOLD_LIMITS.end) {
        events.push(this.finish(Math.max(this.lastCalm, this.start), 'auto'));
        return events;
      }
      if (this.speed < HOLD_LIMITS.still * 1.5) this.lastCalm = t;
      this.collect(sample, gyro);
      while (t - this.start >= (this.seconds.length + 1) * 1000) {
        const warning = this.closeSecond();
        if (warning) events.push(warning);
      }
    }
    return events;
  }

  /** Starts the hold now, e.g. when the automatic detection does not catch it. */
  startManual(time: number): HoldEvent {
    return this.begin(time, 'manual');
  }

  endManual(time: number): HoldEvent | undefined {
    return this.state === 'holding' ? this.finish(time, 'manual') : undefined;
  }

  /** Statistics of the running or last hold. */
  stats(now?: number): HoldStats {
    const end = this.end ?? now ?? this.lastTime ?? this.start;
    const heldMs = Math.max(0, end - this.start);
    // Only whole seconds that ended before the hold did (the let-down is not part of it)
    const secs = this.seconds.filter((_, i) => this.start + (i + 1) * 1000 <= end);
    const rms = (key: 'sway' | 'tremor') =>
      secs.length ? Math.sqrt(secs.reduce((sum, s) => sum + s[key] ** 2, 0) / secs.length) : 0;
    const ref = secs[0]?.pose;
    let drift: number | undefined;
    if (ref) {
      drift = 0;
      for (const s of secs) {
        if (s.pose) drift = Math.max(drift, Math.hypot(s.pose[0] - ref[0], wrap(s.pose[1] - ref[1])));
      }
    }
    const firstWarning = this.warnings[0];
    return {
      start: this.start,
      end: this.end,
      heldMs,
      goodFormMs: firstWarning !== undefined ? Math.min(heldMs, firstWarning - this.start) : heldMs,
      sway: rms('sway'),
      tremor: rms('tremor'),
      drift,
      warnings: [...this.warnings],
      perSecond: { sway: secs.map((s) => s.sway), tremor: secs.map((s) => s.tremor) },
    };
  }

  /** Sway of the last whole second, for a live display. */
  get lastSway(): number | undefined {
    return this.seconds.at(-1)?.sway;
  }

  private begin(time: number, by: 'auto' | 'manual'): HoldEvent {
    this.state = 'holding';
    this.start = time;
    this.end = undefined;
    this.lastCalm = time;
    this.seconds = [];
    this.warnings = [];
    this.badRun = 0;
    this.resetBucket();
    return { type: 'start', time, by };
  }

  private finish(time: number, by: 'auto' | 'manual'): HoldEvent {
    this.state = 'ended';
    this.end = time;
    // Remember how the bow points at full draw, to recognise the next hold
    const pose = this.seconds[0]?.pose;
    if (pose && !this.reference && time - this.start > 2000) this.reference = pose;
    return { type: 'end', time, by };
  }

  private inPose(sample: MotionSample): boolean {
    if (!this.reference || !sample.euler) return true;
    const [roll, pitch] = sample.euler;
    return (
      Math.abs(roll - this.reference[0]) < HOLD_LIMITS.poseTolerance &&
      Math.abs(wrap(pitch - this.reference[1])) < HOLD_LIMITS.poseTolerance
    );
  }

  private collect(sample: MotionSample, gyro: [number, number, number]): void {
    const b = this.bucket;
    const s = this.slow;
    b.n++;
    b.sway += s[0] ** 2 + s[1] ** 2 + s[2] ** 2;
    b.tremor += (gyro[0] - s[0]) ** 2 + (gyro[1] - s[1]) ** 2 + (gyro[2] - s[2]) ** 2;
    if (sample.euler) {
      b.roll += sample.euler[0];
      b.pitch += sample.euler[1];
      b.poses++;
    }
  }

  /** Ends the current second; returns a warning if the form is breaking down. */
  private closeSecond(): HoldEvent | undefined {
    const b = this.bucket;
    const second: Second = {
      sway: b.n ? Math.sqrt(b.sway / b.n) : 0,
      tremor: b.n ? Math.sqrt(b.tremor / b.n) : 0,
      pose: b.poses ? [b.roll / b.poses, b.pitch / b.poses] : undefined,
    };
    this.seconds.push(second);
    this.resetBucket();

    const n = this.seconds.length;
    if (n < 4) return undefined; // seconds 1–2 are the baseline, second 0 is settling
    const base = this.seconds.slice(1, 3);
    const baseSway = (base[0].sway + base[1].sway) / 2;
    const baseTremor = (base[0].tremor + base[1].tremor) / 2;
    const bad =
      second.sway > Math.max(2 * baseSway, baseSway + 2) || second.tremor > Math.max(2 * baseTremor, baseTremor + 1.5);
    this.badRun = bad ? this.badRun + 1 : Math.min(this.badRun, 0);
    if (this.badRun >= 2) {
      this.badRun = -1; // the next warning needs three more bad seconds
      // The form began to break down at the start of the first of the two bad seconds
      this.warnings.push(this.start + (n - 2) * 1000);
      return { type: 'warning', time: this.start + n * 1000 };
    }
    return undefined;
  }

  private resetBucket(): void {
    this.bucket = { n: 0, sway: 0, tremor: 0, roll: 0, pitch: 0, poses: 0 };
  }
}

/** Angle difference wrapped to ±180°. */
function wrap(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
