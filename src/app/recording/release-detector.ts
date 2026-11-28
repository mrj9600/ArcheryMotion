import { MotionSample } from '../sensors/sensor.model';

/**
 * Default release threshold (g). In the field recordings (MantisX on a 42 lb barebow,
 * 2026-11-23/24) every shot gave 9.1–16 g, while swinging and lowering the bow after a
 * shot gave up to 1.8 g, and a knock on the bow between shots 4.5 g, which the old 4 g
 * counted as a shot. Not yet checked with a WitMotion sensor on the bow.
 */
export const RELEASE_G = 6;

/**
 * At full draw the bow is held still, so a jolt while the bow is turning a lot is not a
 * release (a knock while the bow is moved). The bow's total turning (deg) from 1 s to 50 ms
 * before the jolt must stay below this. In the recordings of 23–28 November 2026 a real
 * shot turned at most 4.9°, the two false shots of 28 November 36° and 51°.
 */
export const STILL_BEFORE_DEG = 15;
const STILL_WINDOW: [number, number] = [-1000, -50];

/** Minimum time between two detected releases (ms). */
const COOLDOWN_MS = 3000;
/** Time constant of the running mean the release is detected against (s). */
const BASELINE_TAU = 0.3;

/**
 * Finds the release in the bow sensor's samples. While aiming, the measured acceleration
 * is almost constant (gravity in the sensor frame). The release is the first sample whose
 * acceleration differs from the running mean by more than the threshold (g), which
 * catches a jolt in any direction. Sensors that only send the size of the dynamic
 * acceleration (MantisX) are compared directly.
 */
export class ReleaseDetector {
  private lastRelease = -Infinity;
  private baseline?: { acc: [number, number, number]; time: number };
  /** The bow's turning (deg) per sample over the last second. */
  private turns: { time: number; deg: number }[] = [];
  private lastGyro?: number;

  constructor(public threshold = RELEASE_G) {}

  /** How far the bow turned (deg) in the window before `time`. */
  private turnedBefore(time: number): number {
    let sum = 0;
    for (const x of this.turns) if (x.time >= time + STILL_WINDOW[0] && x.time <= time + STILL_WINDOW[1]) sum += x.deg;
    return sum;
  }

  /** Returns true if this sample is a release. */
  feed(sample: MotionSample): boolean {
    if (sample.gyro) {
      const dt = this.lastGyro === undefined ? 0 : sample.time - this.lastGyro;
      this.lastGyro = sample.time;
      if (dt > 0 && dt < 200) this.turns.push({ time: sample.time, deg: (Math.hypot(...sample.gyro) * dt) / 1000 });
      while (this.turns.length && this.turns[0].time < sample.time + STILL_WINDOW[0]) this.turns.shift();
    }
    const ready = sample.time - this.lastRelease > COOLDOWN_MS && this.turnedBefore(sample.time) < STILL_BEFORE_DEG;
    if (!sample.acc) {
      if (sample.accMagnitude !== undefined && ready && sample.accMagnitude > this.threshold) {
        this.lastRelease = sample.time;
        return true;
      }
      return false;
    }
    const acc = sample.acc;
    const base = this.baseline;
    if (!base || sample.time - base.time > 1000) {
      this.baseline = { acc: [...acc], time: sample.time };
      return false;
    }
    const deviation = Math.hypot(acc[0] - base.acc[0], acc[1] - base.acc[1], acc[2] - base.acc[2]);
    const alpha = 1 - Math.exp(-(sample.time - base.time) / 1000 / BASELINE_TAU);
    for (let i = 0; i < 3; i++) base.acc[i] += alpha * (acc[i] - base.acc[i]);
    base.time = sample.time;
    if (ready && deviation > this.threshold) {
      this.lastRelease = sample.time;
      return true;
    }
    return false;
  }
}
