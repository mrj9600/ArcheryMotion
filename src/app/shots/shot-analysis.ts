import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { calibrated, sampleToQuaternion, sampleToSensorQuaternion, sensorToScene } from '../sensors/orientation';
import { SensorRole } from '../sensors/sensor.model';
import { RecordedSensor, Shot } from './shot.model';
import { AimTrace, findPhases, PhaseResult, resample } from './shot-phases';

const G = 9.81;
const RAD = MathUtils.RAD2DEG;

/** Time window (s, relative to release) where displacement is estimated. */
export const DISPLACEMENT_WINDOW: [number, number] = [-0.3, 0.6];
/** Window before release where the bow is assumed still; used to remove bias and gravity leak. */
const STILL_WINDOW: [number, number] = [-0.6, -0.05];

export interface BowAngles {
  /** Cant, positive = top of the bow to the right (degrees). */
  cant: number;
  /** Positive = aiming higher (degrees). */
  vertical: number;
  /** Positive = aiming more to the right (degrees). */
  horizontal: number;
}

export interface BowDisplacement {
  /** Centimetres, in the archer's frame at tare. */
  forward: number;
  up: number;
  right: number;
}

export interface SensorTrack {
  role: SensorRole;
  name: string;
  /** Seconds relative to the release. */
  times: number[];
  /** Display orientation (scene frame, calibrated). */
  quats: (Quaternion | undefined)[];
}

export interface BowTrack extends SensorTrack {
  /** Angles relative to the moment of release. */
  angles: BowAngles[];
  /** Displacement; undefined outside DISPLACEMENT_WINDOW. */
  displacement: (BowDisplacement | undefined)[];
  sampleRate: number;
  /** Aim trace at TRACE_HZ, phases and stability score. */
  trace?: AimTrace;
  phases?: PhaseResult;
}

export interface ShotAnalysis {
  tracks: SensorTrack[];
  /** Main bow sensor: the first with a displacement estimate, else the first bow sensor. */
  bow?: BowTrack;
  /** All sensors placed on the bow, in connection order. */
  bows: BowTrack[];
  /** Full time range of the recording (s). */
  range: [number, number];
}

/**
 * BLE delivers samples in bursts, so receive times are uneven. Assume the sensor
 * sampled at a fixed rate and spread the samples evenly over the received span,
 * with the sample nearest the release at t = 0.
 */
function uniformTimes(rec: RecordedSensor, releaseTime: number): { times: number[]; dt: number } {
  const s = rec.samples;
  if (s.length < 2) return { times: s.map(() => 0), dt: 0 };
  const dt = (s[s.length - 1].time - s[0].time) / (s.length - 1) / 1000;
  let rel = s.findIndex((x) => x.time >= releaseTime);
  if (rel < 0) rel = s.length - 1;
  return { times: s.map((_, i) => (i - rel) * dt), dt };
}

function toAngles(q: Quaternion): BowAngles {
  // Scene: X right, Y up, -Z towards target. 'YXZ' = heading, then elevation, then cant.
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return { horizontal: -e.y * RAD, vertical: e.x * RAD, cant: -e.z * RAD };
}

function trackFor(rec: RecordedSensor, releaseTime: number): SensorTrack & { dt: number } {
  const { times, dt } = uniformTimes(rec, releaseTime);
  const quats = rec.samples.map((s) => {
    const q = sampleToQuaternion(s);
    return q && rec.calibration ? calibrated(q, rec.calibration) : q;
  });
  return { role: rec.role, name: rec.name, times, quats, dt };
}

/**
 * Double-integrates the bow's acceleration around the release.
 * 1. Rotate each acceleration into the sensor's world frame and remove 1 g.
 * 2. Subtract the mean of the still period before release (sensor bias + gravity leak
 *    from small orientation errors).
 * 3. Integrate from the start of the window with zero velocity.
 * 4. Express the result in the archer's frame (forward / up / right at tare).
 */
export function estimateDisplacement(rec: RecordedSensor, times: number[]): (BowDisplacement | undefined)[] {
  const n = rec.samples.length;
  const world: (Vector3 | undefined)[] = rec.samples.map((s) => {
    const q = sampleToSensorQuaternion(s);
    if (!q || !s.acc) return undefined;
    return new Vector3(...s.acc).applyQuaternion(q).sub(new Vector3(0, 0, 1)).multiplyScalar(G);
  });

  const inWindow = (t: number, w: [number, number]) => t >= w[0] && t <= w[1];
  const still = world.filter((a, i): a is Vector3 => !!a && inWindow(times[i], STILL_WINDOW));
  const bias = new Vector3();
  if (still.length) {
    still.forEach((a) => bias.add(a));
    bias.divideScalar(still.length);
  }

  const headingInv = rec.calibration?.heading.clone().invert() ?? new Quaternion();
  const result: (BowDisplacement | undefined)[] = new Array(n).fill(undefined);
  const v = new Vector3();
  const p = new Vector3();
  let prevA: Vector3 | undefined;
  let prevT = 0;

  for (let i = 0; i < n; i++) {
    const t = times[i];
    const a = world[i];
    if (!inWindow(t, DISPLACEMENT_WINDOW) || !a) continue;
    const ac = a.clone().sub(bias);
    if (prevA) {
      const h = t - prevT;
      const vPrev = v.clone();
      v.addScaledVector(prevA.clone().add(ac), h / 2);
      p.addScaledVector(vPrev.add(v), h / 2);
    }
    prevA = ac;
    prevT = t;

    const scene = new Vector3(...sensorToScene(p.x, p.y, p.z)).applyQuaternion(headingInv);
    result[i] = { right: scene.x * 100, up: scene.y * 100, forward: -scene.z * 100 };
  }
  return result;
}

/** Sensors that report no heading (yaw is fixed), so left/right is unknown. */
const NO_HEADING_KINDS = new Set(['mantisx-ble']);

function bowTrackFor(rec: RecordedSensor, track: SensorTrack & { dt: number }): BowTrack {
  const releaseIdx = Math.max(0, track.times.findIndex((t) => t >= 0));
  const qRel = track.quats[releaseIdx];
  const ref = qRel ? toAngles(qRel) : { cant: 0, vertical: 0, horizontal: 0 };
  const hasHeading = !NO_HEADING_KINDS.has(rec.kind);
  const absolute = track.quats.map((q) => (q ? toAngles(q) : undefined));
  const angles = absolute.map((a) =>
    a
      ? {
          cant: a.cant - ref.cant,
          vertical: a.vertical - ref.vertical,
          horizontal: hasHeading ? a.horizontal - ref.horizontal : NaN,
        }
      : { cant: NaN, vertical: NaN, horizontal: NaN },
  );

  // Left/right for sensors without heading: integrate the gyro z rate, as the MantisX app does
  let horizontal: (number | undefined)[] = angles.map((a) => (Number.isNaN(a.horizontal) ? undefined : a.horizontal));
  if (!hasHeading && rec.samples.some((s) => s.gyro)) {
    let sum = 0;
    const integrated = rec.samples.map((s) => (sum += (s.gyro?.[2] ?? 0) * track.dt));
    const atRelease = integrated[releaseIdx];
    horizontal = integrated.map((v) => v - atRelease);
  }

  const bow: BowTrack = {
    ...track,
    sampleRate: track.dt ? 1 / track.dt : 0,
    angles,
    displacement: estimateDisplacement(rec, track.times),
  };

  if (track.times.length > 2) {
    const from = track.times[0];
    const to = track.times[track.times.length - 1];
    const idx = track.times.map((_, i) => i);
    const r = resample(track.times, idx, from, to);
    const trace: AimTrace = {
      times: r.times,
      // Not smoothed: a real WitMotion sensor lying still moves only ~0.05 °/s between
      // samples, so sensor noise is negligible next to aiming movement.
      horizontal: r.values.map((i) => horizontal[i]),
      vertical: r.values.map((i) => angles[i].vertical),
      elevation: r.values.map((i) => absolute[i]?.vertical ?? 0),
    };
    if (trace.vertical.every((v) => !Number.isNaN(v))) {
      bow.trace = trace;
      bow.phases = findPhases(trace);
    }
  }
  return bow;
}

export function analyzeShot(shot: Shot): ShotAnalysis {
  const tracks: SensorTrack[] = [];
  const bows: BowTrack[] = [];
  let range: [number, number] = [0, 0];

  for (const rec of shot.sensors) {
    if (!rec.samples.length) continue;
    const base = trackFor(rec, shot.releaseTime);
    const track = rec.role === 'bow' ? bowTrackFor(rec, base) : base;
    if (rec.role === 'bow') bows.push(track as BowTrack);
    tracks.push(track);
    range = [Math.min(range[0], track.times[0]), Math.max(range[1], track.times[track.times.length - 1])];
  }
  // The main bow is the first one that has a displacement estimate (needs an acceleration vector)
  const bow = bows.find((b) => b.displacement.some((d) => d)) ?? bows[0];
  return { tracks, bow, bows, range };
}

/** Index of the sample closest to time t (times sorted ascending). */
export function indexAt(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
}
