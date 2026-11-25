import { SensorData } from '../recording/recording-file';
import { ArmAxes } from './arm-motion';
import { BowMotion } from './bow-motion';

/** One shot ready to be played back, sampled evenly from the raise to the let-down. */
export interface ReplayTrace {
  shotId: string;
  number: number;
  rating?: 'good' | 'bad';
  /** ms from the release (negative before), every STEP_MS. */
  t: Float32Array;
  /** Where the bow points (degrees), 0 at the release: + up (top toward the archer), + right. */
  bow: { up: Float32Array; right: Float32Array; cant: Float32Array };
  /** Each arm sensor: how far the arm has moved (degrees), 0 at the release. */
  arms: { label: string; up: Float32Array; right: Float32Array }[];
}

/** Time between the points of a trace (ms). */
export const STEP_MS = 10;

/** A gap in the data longer than this (ms) adds nothing (the value stays). */
const MAX_GAP_MS = 200;

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

/**
 * Adds up a rate (deg/s) from `from` to `to` (sensor time, ms) and returns the running sum
 * at each of `grid` (ms from `zero`), with the value at `zero` taken as 0.
 */
function integrate(t: Float64Array, rate: (k: number) => number, zero: number, grid: Float32Array): Float32Array {
  const out = new Float32Array(grid.length);
  const from = zero + grid[0];
  const to = zero + grid[grid.length - 1];
  let k = Math.max(1, firstAt(t, from));
  let sum = 0;
  let prevTime = from;
  let prevRate = k - 1 < t.length ? rate(k - 1) : 0;
  for (let i = 0; i < grid.length; i++) {
    const at = zero + grid[i];
    for (; k < t.length && t[k] <= at && t[k] <= to; k++) {
      const r = rate(k);
      const dt = t[k] - prevTime;
      if (dt > 0 && dt <= MAX_GAP_MS && Number.isFinite(r) && Number.isFinite(prevRate)) sum += ((r + prevRate) / 2) * (dt / 1000);
      prevTime = t[k];
      prevRate = r;
    }
    out[i] = sum;
  }
  // 0 at the release
  const z = Math.max(0, Math.min(grid.length - 1, Math.round(-grid[0] / STEP_MS)));
  const base = out[z];
  for (let i = 0; i < out.length; i++) out[i] -= base;
  return out;
}

/** The value of `values` (one per sample) at each grid time, linearly between samples. */
function resample(t: Float64Array, values: (k: number) => number, zero: number, grid: Float32Array): Float32Array {
  const out = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const at = zero + grid[i];
    const k = firstAt(t, at);
    if (k <= 0) out[i] = values(0);
    else if (k >= t.length) out[i] = values(t.length - 1);
    else {
      const f = (at - t[k - 1]) / (t[k] - t[k - 1] || 1);
      out[i] = values(k - 1) + f * (values(k) - values(k - 1));
    }
  }
  return out;
}

const dot = (a: number[], g: Float32Array, k: number) => a[0] * g[3 * k] + a[1] * g[3 * k + 1] + a[2] * g[3 * k + 2];

export interface ReplayInput {
  shot: { id: string; number: number; releaseTime: number; selfRating?: 'good' | 'bad' };
  /** From the start of the raise to the start of the let-down (session time, ms). */
  span: [number, number];
  bow: SensorData;
  motion: BowMotion;
  arms: { label: string; data: SensorData; axes: ArmAxes; /** The release in the arm's own time. */ release: number }[];
}

/** Builds the trace of one shot. The bow needs angles (roll for the cant). */
export function buildReplay({ shot, span, bow, motion, arms }: ReplayInput): ReplayTrace | undefined {
  if (!bow.euler) return undefined;
  const from = Math.round((span[0] - shot.releaseTime) / STEP_MS) * STEP_MS;
  const to = Math.round((span[1] - shot.releaseTime) / STEP_MS) * STEP_MS;
  if (to <= from) return undefined;
  const n = (to - from) / STEP_MS + 1;
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = from + i * STEP_MS;
  const euler = bow.euler;
  return {
    shotId: shot.id,
    number: shot.number,
    rating: shot.selfRating,
    t,
    bow: {
      up: integrate(bow.t, (k) => motion.up[k], shot.releaseTime, t),
      right: integrate(bow.t, (k) => motion.right[k], shot.releaseTime, t),
      cant: resample(bow.t, (k) => euler[3 * k], shot.releaseTime, t),
    },
    arms: arms
      .filter((a) => a.data.gyro)
      .map((a) => {
        const g = a.data.gyro!;
        const up = a.axes.up;
        const raise = a.axes.raise;
        return {
          label: a.label,
          up: integrate(a.data.t, (k) => dot(raise, g, k), a.release, t),
          // Turning about up (right-hand rule) is to the left
          right: integrate(a.data.t, (k) => -dot(up, g, k), a.release, t),
        };
      }),
  };
}
