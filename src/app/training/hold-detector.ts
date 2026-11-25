import { MotionSample } from '../sensors/sensor.model';

/**
 * Thresholds on the bow's angular speed (deg/s). Tuned on the first field recordings
 * (barebow, MantisX on the bow, 2026-11-23): at full draw the bow turns about 2.3–3.7 deg/s
 * on average, and lowering it onto the target from the set-up position peaks around
 * 28–41 deg/s (smoothed). (The values were tuned before the MantisX gyro scale was
 * corrected, and scaled up with it by 2.29.)
 */
export interface HoldLimits {
  move: number;
  still: number;
  end: number;
  settleMs: number;
  poseTolerance: number;
  poseAbove: number;
  poseBelow: number;
  driftLimit: number;
}

export const HOLD_LIMITS: HoldLimits = {
  /** Speed that counts as raising/drawing the bow. Needed before a hold can start. */
  move: 23,
  /** Below this the bow counts as still. */
  still: 18,
  /** Above this the hold has ended (let-down). A shot ends it too, see release(). */
  end: 27.5,
  /** How long the bow must be still before the hold counts as started (ms). */
  settleMs: 800,
  /**
   * Max difference of roll/pitch (degrees) from the full-draw pose for a new hold to
   * start. The pose comes from the archer raising the bow to the holding level before the
   * drill, or from a shot.
   */
  poseTolerance: 20,
  /**
   * Max degrees the bow may point higher than the full-draw pose. Wide, because the level
   * step gives a pose up to ~20° below the real full draw (the archer holds the bow at
   * set-up height), and the bow is rarely still pointing higher than at full draw.
   * (Positive pitch is the bow pointing *down*, the top away from the archer; confirmed 25 November 2026.)
   */
  poseAbove: 30,
  /**
   * Max degrees the bow may point *lower* than the full-draw pose. The set-up before the
   * draw is 15–22° lower and can be just as still for 3 s (field test 2026-11-24), while
   * a real hold may well be higher than the pose found from the level step.
   */
  poseBelow: 10,
  /**
   * Max change of roll/pitch (degrees) from where the hold started, for it to go on.
   * Between shots the bow often rests 15–35° lower and just as still as at full draw.
   */
  driftLimit: 10,
};

/**
 * After a shot, the bow swings in the sling and is lowered; none of that may count as
 * the movement before a new hold (ms).
 */
const AFTER_SHOT_MS = 3000;

/** Time constants (s): state speed, and the split between slow sway and fast tremor. */
const SPEED_TAU = 0.2;
const SWAY_TAU = 0.1;

export type HoldEvent =
  | { type: 'start'; time: number; by: 'auto' | 'manual' }
  | { type: 'warning'; time: number }
  | { type: 'end'; time: number; by: HoldEndedBy };

/** How a hold ended: the bow moved (let-down), by hand, or the archer shot. */
export type HoldEndedBy = 'auto' | 'manual' | 'shot';

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
 * first one. It ends when the bow moves fast again (let-down) or at a shot. Letting down
 * without shooting is the usual way to end a hold in the drill, but archers may shoot.
 *
 * The angular speed is split into slow *sway* (aiming movement) and fast *tremor*
 * (shaking, typically fatigue). Each whole second of the hold gets both values. Seconds
 * 1–2 are the archer's own baseline; when later seconds are clearly worse two seconds in
 * a row, the form is breaking down and a warning is given.
 */
export class HoldDetector {
  state: 'waiting' | 'holding' | 'ended' = 'waiting';

  constructor(private readonly limits: HoldLimits = HOLD_LIMITS) {}

  /** Smoothed angular speed (deg/s), useful for a live display. */
  speed = 0;

  private lastTime?: number;
  private slow: [number, number, number] = [0, 0, 0];
  private moved = false;
  private stillSince?: number;
  private lastCalm = 0;
  private reference?: [number, number];
  private lastShot = -Infinity;
  private startPose?: [number, number];

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
      const afterShot = t - this.lastShot < AFTER_SHOT_MS;
      if (this.speed > this.limits.move && !afterShot) this.moved = true;
      if (afterShot || this.speed > this.limits.still || !this.inPose(sample)) {
        this.stillSince = undefined;
      } else {
        this.stillSince ??= t;
        if (this.moved && t - this.stillSince >= this.limits.settleMs) {
          events.push(this.begin(this.stillSince, 'auto', sample.euler));
        }
      }
    } else if (this.state === 'holding') {
      if (this.speed > this.limits.end) {
        events.push(this.finish(Math.max(this.lastCalm, this.start), 'auto'));
        return events;
      }
      if (this.drifted(sample)) {
        events.push(this.finish(Math.max(this.lastCalm, this.start), 'auto'));
        return events;
      }
      if (this.speed < this.limits.still * 1.5) this.lastCalm = t;
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

  /**
   * Tells the detector that the archer shot (found by the release detection). A running
   * hold ends at the release, and a new hold needs a new movement after the bow has
   * settled from the shot. The bow's angles at the release are a sure full-draw pose, so
   * they become the reference that later holds must be near.
   */
  release(time: number, euler?: [number, number, number]): HoldEvent | undefined {
    this.lastShot = time;
    if (euler) this.reference = [euler[0], euler[1]];
    this.moved = false;
    this.stillSince = undefined;
    return this.state === 'holding' ? this.finish(Math.max(time, this.start), 'shot') : undefined;
  }

  /** Sets the full-draw pose (roll, pitch) that a new hold must be near. */
  setReference(euler: [number, number, number]): void {
    this.reference = [euler[0], euler[1]];
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

  private begin(time: number, by: 'auto' | 'manual', euler?: [number, number, number]): HoldEvent {
    this.state = 'holding';
    this.startPose = euler ? [euler[0], euler[1]] : undefined;
    this.start = time;
    this.end = undefined;
    this.lastCalm = time;
    this.seconds = [];
    this.warnings = [];
    this.badRun = 0;
    this.resetBucket();
    return { type: 'start', time, by };
  }

  private finish(time: number, by: HoldEndedBy): HoldEvent {
    this.state = 'ended';
    this.end = time;
    // Remember how the bow points at full draw, to recognise the next hold
    const pose = this.seconds[0]?.pose;
    if (pose && !this.reference && by !== 'shot' && time - this.start > 2000) this.reference = pose;
    return { type: 'end', time, by };
  }

  /** The bow has moved away from where the hold started (slowly, so the speed did not end it). */
  private drifted(sample: MotionSample): boolean {
    if (!this.startPose || !sample.euler) return false;
    const [roll, pitch] = sample.euler;
    return (
      Math.abs(wrap(roll - this.startPose[0])) > this.limits.driftLimit ||
      Math.abs(wrap(pitch - this.startPose[1])) > this.limits.driftLimit
    );
  }

  private inPose(sample: MotionSample): boolean {
    if (!this.reference || !sample.euler) return true;
    const [roll, pitch] = sample.euler;
    // Positive pitch is the bow pointing down (top away from the archer)
    const up = -wrap(pitch - this.reference[1]);
    return (
      Math.abs(roll - this.reference[0]) < this.limits.poseTolerance &&
      up < this.limits.poseAbove &&
      up > -this.limits.poseBelow
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
      second.sway > Math.max(2 * baseSway, baseSway + 4.6) || second.tremor > Math.max(2 * baseTremor, baseTremor + 3.4);
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
