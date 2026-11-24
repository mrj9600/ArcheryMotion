import { MotionSample, Vec3 } from '../sensors/sensor.model';
import { SensorData } from '../recording/recording-file';
import { RELEASE_G, ReleaseDetector } from '../recording/release-detector';
import { HoldDetector, HoldLimits, HoldStats } from '../training/hold-detector';
import { bowMotion } from './bow-motion';

/** One curve: a value per sample of a sensor. */
export interface Series {
  label: string;
  color: string;
  values: Float32Array;
}

/** A group of curves drawn in the same plot, e.g. the three gyro axes. */
export interface Channel {
  key: string;
  label: string;
  unit: string;
  series: Series[];
}

const AXIS_COLORS = ['#e5463d', '#2f9e44', '#2b7fd8'];
/** Drawn in the text colour of the page. */
export const TEXT_COLOR = 'text';

/** Splits a sensor's interleaved arrays into curves, grouped as they are plotted. */
export function channelsOf(data: SensorData, kind = ''): Channel[] {
  const channels: Channel[] = [];
  const n = data.t.length;
  const split = (arr: Float32Array, size: number, i: number) => {
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) out[k] = arr[k * size + i];
    return out;
  };
  const magnitude = (arr: Float32Array) => {
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) out[k] = Math.hypot(arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]);
    return out;
  };
  const axes = (arr: Float32Array, labels: string[]) =>
    labels.map((label, i) => ({ label, color: AXIS_COLORS[i], values: split(arr, 3, i) }));

  if (data.gyro) {
    channels.push({
      key: 'gyro',
      label: 'Vinkelhastighed',
      unit: '°/s',
      series: [...axes(data.gyro, ['x', 'y', 'z']), { label: '|ω|', color: TEXT_COLOR, values: magnitude(data.gyro) }],
    });
  }
  const bow = bowMotion(data, kind);
  if (bow) {
    channels.push({
      key: 'bow',
      label: 'Buens bevægelse',
      unit: '°/s',
      series: [
        { label: 'op', color: AXIS_COLORS[0], values: bow.up },
        { label: 'højre', color: AXIS_COLORS[2], values: bow.right },
      ],
    });
  }
  if (data.euler) {
    channels.push({ key: 'euler', label: 'Vinkler', unit: '°', series: axes(data.euler, ['roll', 'pitch', 'yaw']) });
  }
  if (data.acc) {
    channels.push({
      key: 'acc',
      label: 'Acceleration',
      unit: 'g',
      series: [...axes(data.acc, ['x', 'y', 'z']), { label: '|a|', color: TEXT_COLOR, values: magnitude(data.acc) }],
    });
  }
  if (data.accMagnitude) {
    channels.push({
      key: 'accMagnitude',
      label: 'Dynamisk acceleration',
      unit: 'g',
      series: [{ label: '|a|', color: TEXT_COLOR, values: data.accMagnitude }],
    });
  }
  return channels;
}

function vec(arr: Float32Array | undefined, i: number): Vec3 | undefined {
  if (!arr) return undefined;
  const v: Vec3 = [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  return Number.isNaN(v[0]) ? undefined : v;
}

/** The i'th sample as the detectors see it live. Time is ms since the session started. */
export function sampleAt(data: SensorData, i: number): MotionSample {
  const m = data.accMagnitude?.[i];
  return {
    time: data.t[i],
    acc: vec(data.acc, i),
    gyro: vec(data.gyro, i),
    euler: vec(data.euler, i),
    accMagnitude: m === undefined || Number.isNaN(m) ? undefined : m,
  };
}

/** Runs the release detection over a whole recording; returns the release times. */
export function detectReleases(data: SensorData, threshold: number): number[] {
  const detector = new ReleaseDetector(threshold);
  const out: number[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const s = sampleAt(data, i);
    if (detector.feed(s)) out.push(s.time);
  }
  return out;
}

/**
 * Runs the hold detection over a whole recording, looking for a new hold right after
 * each one ends (live, the drill only looks during its "ready" phase). Shots found with
 * the release threshold end a hold, as in the drill.
 */
export function detectHolds(data: SensorData, limits: HoldLimits, releaseThreshold = RELEASE_G): HoldStats[] {
  const detector = new HoldDetector(limits);
  const releases = new ReleaseDetector(releaseThreshold);
  const out: HoldStats[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const sample = sampleAt(data, i);
    const events = releases.feed(sample) ? [detector.release(sample.time, sample.euler)].filter((e) => !!e) : detector.feed(sample);
    for (const e of events) {
      if (e.type === 'end') {
        out.push(detector.stats());
        detector.arm();
      }
    }
  }
  return out;
}

/** Index of the first sample at or after time t (binary search). */
export function indexAt(t: Float64Array, time: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** m:ss.s for a session time in ms. */
export function formatTime(ms: number, decimals = 1): string {
  const sign = ms < 0 ? '-' : '';
  const s = Math.abs(ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(decimals).replace('.', ',');
  return `${sign}${m}:${rest.padStart(decimals ? 3 + decimals : 2, '0')}`;
}
