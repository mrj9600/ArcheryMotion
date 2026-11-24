import { MotionSample } from '../sensors/sensor.model';

/**
 * Limits for the automatic pause, from the first field recordings (MantisX on the bow):
 * a bow put down on a stand turns at most 0.6–1 deg/s (sensor noise), while a bow held
 * in the hand, even resting between shots, regularly goes above 2 deg/s. (Doubled with
 * the corrected MantisX gyro scale.)
 */
export const PAUSE_LIMITS = {
  /** Every sample below this (deg/s) counts as the bow lying still. */
  stillMax: 2,
  /** How long the bow must lie still before the recording pauses (ms). */
  pauseAfterMs: 10000,
  /** Smoothed speed (deg/s) that counts as the bow being picked up again. */
  resume: 6,
};

/** Time constant (s) of the smoothed speed used to resume. */
const RESUME_TAU = 0.1;

/**
 * Finds when the bow has been put down (no movement at all for a while) and when it is
 * picked up again, so the recording can pause while the archer fetches arrows.
 */
export class PauseDetector {
  paused = false;

  private stillSince?: number;
  private speed = 0;
  private lastTime?: number;

  constructor(private readonly limits = PAUSE_LIMITS) {}

  /** Returns 'pause' or 'resume' when the state changes. */
  feed(sample: MotionSample): 'pause' | 'resume' | undefined {
    const gyro = sample.gyro;
    if (!gyro) return undefined;
    const t = sample.time;
    const dt = this.lastTime === undefined ? 0 : Math.min((t - this.lastTime) / 1000, 0.2);
    this.lastTime = t;
    const mag = Math.hypot(gyro[0], gyro[1], gyro[2]);
    this.speed += (1 - Math.exp(-dt / RESUME_TAU)) * (mag - this.speed);

    if (this.paused) {
      if (this.speed > this.limits.resume) {
        this.paused = false;
        this.stillSince = undefined;
        return 'resume';
      }
      return undefined;
    }
    if (mag >= this.limits.stillMax) {
      this.stillSince = undefined;
      return undefined;
    }
    this.stillSince ??= t;
    if (t - this.stillSince >= this.limits.pauseAfterMs) {
      this.paused = true;
      return 'pause';
    }
    return undefined;
  }

  /** Forgets the still time, e.g. after a manual resume. */
  reset(): void {
    this.paused = false;
    this.stillSince = undefined;
  }
}
