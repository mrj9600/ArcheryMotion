import { MotionSample } from '../sensors/sensor.model';

/**
 * Default release threshold (g). In the field recordings (MantisX on a 42 lb barebow,
 * 2026-11-23/24) every shot gave 9.1–16 g, while swinging and lowering the bow after a
 * shot gave up to 1.8 g, and a knock on the bow between shots 4.5 g, which the old 4 g
 * counted as a shot. Not yet checked with a WitMotion sensor on the bow.
 */
export const RELEASE_G = 6;

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

  constructor(public threshold = RELEASE_G) {}

  /** Returns true if this sample is a release. */
  feed(sample: MotionSample): boolean {
    const ready = sample.time - this.lastRelease > COOLDOWN_MS;
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
