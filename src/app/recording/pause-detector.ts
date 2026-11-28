import { MotionSample } from '../sensors/sensor.model';

/**
 * Limits for the automatic pause, from the first field recordings (MantisX on the bow):
 * a bow put down on a stand turns at most 0.7–1.1 deg/s (sensor noise), while a bow held
 * in the hand, even resting between shots, regularly goes above 2.3 deg/s. (Scaled up by
 * 2.29 with the corrected MantisX gyro scale.)
 */
export const PAUSE_LIMITS = {
  /** Every sample below this (deg/s) counts as the bow lying still. */
  stillMax: 2.3,
  /** How long the bow must lie still before the recording pauses (ms). */
  pauseAfterMs: 10000,
  /** Smoothed speed (deg/s) that counts as the bow being picked up again. */
  resume: 6.9,
  /**
   * The bow carried flat (pointing steeply up or down, |pitch| at least this, degrees) for
   * `pauseAfterMs` also pauses: walking between targets. From the field recordings of
   * 28 November 2026: carried, the bow points 75–85° up or down; when shooting, even steeply
   * downhill, it stays within about 60° and never that long.
   */
  flatPitch: 60,
  /** After a pause, the bow must point within this (|pitch|, degrees) for `backMs` to resume. */
  backPitch: 45,
  backMs: 500,
};

/** Time constant (s) of the smoothed speed used to resume. */
const RESUME_TAU = 0.1;

/**
 * Finds when the bow has been put down (no movement at all for a while) or is carried flat
 * (pointing steeply up or down for a while), and when it is taken up to shoot again, so the
 * recording can pause while the archer fetches arrows or walks to the next target. It
 * resumes when the bow moves and points within `backPitch` (the bow's pitch needs angles,
 * e.g. a MantisX; without them only the stillness counts).
 */
export class PauseDetector {
  paused = false;

  private stillSince?: number;
  private flatSince?: number;
  /** Since when the bow has pointed within backPitch (undefined: not now). */
  private levelSince?: number;
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
    const pitch = sample.euler ? Math.abs(sample.euler[1]) : 0;
    if (pitch < this.limits.backPitch) this.levelSince ??= t;
    else this.levelSince = undefined;

    if (this.paused) {
      if (this.speed > this.limits.resume && this.levelSince !== undefined && t - this.levelSince >= this.limits.backMs) {
        this.reset();
        return 'resume';
      }
      return undefined;
    }
    if (pitch >= this.limits.flatPitch) this.flatSince ??= t;
    else this.flatSince = undefined;
    if (mag >= this.limits.stillMax) this.stillSince = undefined;
    else this.stillSince ??= t;
    const still = this.stillSince !== undefined && t - this.stillSince >= this.limits.pauseAfterMs;
    const flat = this.flatSince !== undefined && t - this.flatSince >= this.limits.pauseAfterMs;
    if (still || flat) {
      this.paused = true;
      return 'pause';
    }
    return undefined;
  }

  /** Forgets the still time, e.g. after a manual resume. */
  reset(): void {
    this.paused = false;
    this.stillSince = undefined;
    this.flatSince = undefined;
  }
}
