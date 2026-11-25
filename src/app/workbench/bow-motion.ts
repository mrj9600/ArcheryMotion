import { SensorData } from '../recording/recording-file';

const DEG = Math.PI / 180;

/**
 * How a MantisX on the bow is turned, found from the field recordings of 23–24 November
 * 2026 (see docs/mantisx-protocol.md):
 * - gyro x is the bow's side axis; positive = the bow turns up (as for an uphill shot: the top toward the archer).
 * - gyro z is the bow's vertical axis; positive = the bow turns to the right, as the
 *   archer sees it.
 * - gyro y is the arrow axis and is not sent.
 * - roll positive = the top of the bow tilts to the right, pitch positive = the bow points
 *   down, the top away from the archer (checked against a WitMotion's gravity, 25 November 2026).
 */
export const MANTIS_BOW_AXES = { side: { axis: 0, sign: 1 }, vertical: { axis: 2, sign: -1 } } as const;

/** The bow's angular speed in its own directions (deg/s), one value per sample. */
export interface BowMotion {
  /** Positive = the bow turns up (aims higher). */
  up: Float32Array;
  /** Positive = the bow turns to the right, as the archer sees it. */
  right: Float32Array;
}

/**
 * The bow's turning up/down and left/right, for a MantisX on the bow. The sensor's
 * rotation is split using its cant and pitch, so a canted bow still shows "left" as left.
 * Turning about the arrow axis (not measured) is left out, which only matters when the bow
 * points far up or down (the left/right part is good within about ±30°).
 * Returns undefined for other sensors (WitMotion on the bow needs its axes found first).
 */
export function bowMotion(data: SensorData, kind: string): BowMotion | undefined {
  if (kind !== 'mantisx-ble' || !data.gyro || !data.euler) return undefined;
  const n = data.t.length;
  const up = new Float32Array(n);
  const right = new Float32Array(n);
  const { side, vertical } = MANTIS_BOW_AXES;
  for (let k = 0; k < n; k++) {
    // Rotation about the bow's right and up axes (right-hand rule): + = nose up, + = nose left
    const wRight = side.sign * data.gyro[3 * k + side.axis];
    const wUp = vertical.sign * data.gyro[3 * k + vertical.axis];
    const roll = data.euler[3 * k] * DEG;
    const pitch = data.euler[3 * k + 1] * DEG;
    // The world's up direction in the bow's (right, forward, up) frame
    const ux = -Math.sin(roll) * Math.cos(pitch);
    const uz = Math.cos(roll) * Math.cos(pitch);
    up[k] = (wRight * uz - wUp * ux) / Math.max(0.2, Math.cos(pitch));
    right[k] = -(wRight * ux + wUp * uz);
  }
  return { up, right };
}

/** How far the bow turned in the release, in degrees. */
export interface ReleaseTurn {
  up: number;
  right: number;
}

/** From just before the release (ms) to the end of the window, the first follow-through. */
export const RELEASE_TURN_WINDOW: [number, number] = [-50, 250];

/** Index of the first sample at or after `time`. */
function firstAt(t: Float64Array, time: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Adds up how far the bow turned around a release (degrees). */
export function releaseTurn(t: Float64Array, motion: BowMotion, releaseTime: number, window = RELEASE_TURN_WINDOW): ReleaseTurn | undefined {
  const from = firstAt(t, releaseTime + window[0]);
  const to = firstAt(t, releaseTime + window[1]);
  if (to - from < 2) return undefined;
  let up = 0;
  let right = 0;
  for (let k = from + 1; k < to; k++) {
    const dt = (t[k] - t[k - 1]) / 1000;
    if (dt > 0.05) return undefined; // a gap in the data
    up += ((motion.up[k] + motion.up[k - 1]) / 2) * dt;
    right += ((motion.right[k] + motion.right[k - 1]) / 2) * dt;
  }
  return { up, right };
}

/**
 * The set-up before the raise: the bow points at least this much further down than at full
 * draw (degrees) for at least SETUP_STILL_MS. Usually 15–22°; one shot on 25 November 2026
 * (the first after a long pause) was set up only 9° down.
 */
const SETUP_DROP = 7;
const SETUP_STILL_MS = 500;
/** Taken down after the shot: the bow points this much further down than in the follow-through (degrees). */
const LETDOWN_DROP = 12;

/** Median of the MantisX pitch between two times, or undefined without data. */
function medianPitch(t: Float64Array, euler: Float32Array, from: number, to: number): number | undefined {
  const v: number[] = [];
  for (let k = firstAt(t, from); k < t.length && t[k] < to; k++) if (Number.isFinite(euler[3 * k + 1])) v.push(euler[3 * k + 1]);
  if (!v.length) return undefined;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}

/**
 * The whole shot: from when the bow starts to be raised from the set-up (pointing down) to
 * when it starts to be taken down after the release. MantisX only (pitch + = pointing
 * down). Returns undefined when the raise or the let-down is not found within 15 s / 10 s.
 */
export function shotSpan(data: SensorData, kind: string, releaseTime: number): [number, number] | undefined {
  if (kind !== 'mantisx-ble' || !data.euler) return undefined;
  const { t, euler } = data;
  const pitch = (k: number) => euler[3 * k + 1];
  // Raise: the last set-up sample before the release, then back to where the bow was still
  // at the set-up level
  const hold = medianPitch(t, euler, releaseTime - 1500, releaseTime - 300);
  if (hold === undefined) return undefined;
  // Going back from the release: the first sample of a stretch of SETUP_STILL_MS that is all
  // at least SETUP_DROP lower than the hold (a short dip while aiming does not count)
  let cross = -1;
  let low = -1;
  for (let k = firstAt(t, releaseTime - 500) - 1; k >= 0 && t[k] > releaseTime - 15000; k--) {
    if (pitch(k) > hold + SETUP_DROP) {
      if (low < 0) low = k;
      if (t[low] - t[k] >= SETUP_STILL_MS) {
        cross = low;
        break;
      }
    } else low = -1;
  }
  if (cross < 0) return undefined;
  // The set-up level, from before the bow has come far up the raise
  const setup = medianPitch(t, euler, t[cross] - 1500, t[cross] - 300);
  if (setup === undefined) return undefined;
  let start = cross;
  while (start > 0 && t[start - 1] > t[cross] - 3000 && pitch(start) < setup - 2) start--;
  // Let-down: the first sample 12° lower than the follow-through, then back to where the bow
  // was still at the follow-through level
  const after = medianPitch(t, euler, releaseTime + 300, releaseTime + 1000);
  if (after === undefined) return undefined;
  let down = -1;
  for (let k = firstAt(t, releaseTime + 300); k < t.length && t[k] < releaseTime + 10000; k++) {
    if (pitch(k) > after + LETDOWN_DROP) {
      down = k;
      break;
    }
  }
  if (down < 0) return undefined;
  let end = down;
  while (end > 0 && t[end] > releaseTime + 300 && pitch(end) > after + 2) end--;
  return [t[start], t[end]];
}
