import { SensorData } from '../recording/recording-file';

type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const angle = (a: V3, b: V3) => (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI;

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

/** A gap longer than this (ms) in the arm data makes a sum unusable. */
const MAX_GAP_MS = 200;

/**
 * App builds whose MantisX times are too early (by 1–46 s, growing through the recording):
 * a MantisX that went silent while lying still was timed as if the phone had held its data
 * back (fixed in build 49, see docs/mantisx-protocol.md).
 */
export function hasMantisTimeBug(build: number | undefined): boolean {
  return build !== undefined && build >= 37 && build <= 48;
}

/** Size of a sensor's jolt (g without gravity) at sample k. */
function jolt(data: SensorData, k: number): number {
  if (data.accMagnitude) return data.accMagnitude[k];
  if (!data.acc) return 0;
  return Math.abs(Math.hypot(data.acc[3 * k], data.acc[3 * k + 1], data.acc[3 * k + 2]) - 1);
}

function peakIn(data: SensorData, from: number, to: number): number | undefined {
  let best = -1;
  let at: number | undefined;
  for (let k = firstAt(data.t, from); k < data.t.length && data.t[k] <= to; k++) {
    const v = jolt(data, k);
    if (v > best) {
      best = v;
      at = data.t[k];
    }
  }
  return at;
}

/** An arm moves less in the release than the bow; a jolt above this (g) is the release. */
const ARM_JOLT_G = 0.5;

/**
 * The release time in the arm sensor's data for each shot: the arm's jolt in the release,
 * lined up with the bow's jolt. With `timeBug` the bow's times are too early and the offset
 * grows through the recording, so the arm's jolt is searched for after the previous offset.
 * Returns arm time minus bow time per shot id (only shots where a jolt was found).
 */
export function pairReleases(
  bow: SensorData,
  arm: SensorData,
  shots: { id: string; releaseTime: number }[],
  timeBug: boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  let offset: number | undefined;
  for (const shot of [...shots].sort((a, b) => a.releaseTime - b.releaseTime)) {
    const bowPeak = peakIn(bow, shot.releaseTime - 300, shot.releaseTime + 300);
    if (bowPeak === undefined) continue;
    const [from, to] = !timeBug ? [bowPeak - 300, bowPeak + 300] : offset === undefined ? [bowPeak - 2000, bowPeak + 60000] : [bowPeak + offset - 500, bowPeak + offset + 12000];
    // The first clear jolt, not the biggest: with a wide window it may hold the next shot too
    for (let k = firstAt(arm.t, from); k < arm.t.length && arm.t[k] <= to; k++) {
      if (jolt(arm, k) <= ARM_JOLT_G) continue;
      const armPeak = peakIn(arm, arm.t[k], arm.t[k] + 300)!;
      offset = armPeak - bowPeak;
      out.set(shot.id, shot.releaseTime + offset);
      break;
    }
  }
  return out;
}

/** The arm sensor's own directions, found from the raises in a recording. */
export interface ArmAxes {
  /** Up in the sensor frame (the gravity direction at full draw). */
  up: V3;
  /** The axis the arm turns about to go up (horizontal at full draw). */
  raise: V3;
  /** Shots the axes were found from. */
  shots: number;
  /** Largest angle between one shot's raise axis and the common one (degrees). */
  spread: number;
}

/** The bow points at least this much down (MantisX pitch, degrees) in the set-up before the raise. */
const SETUP_PITCH = 12;

/** Mean acc (gravity, when still) in the arm sensor between two times. */
function meanAcc(arm: SensorData, from: number, to: number): V3 | undefined {
  const s: V3 = [0, 0, 0];
  let n = 0;
  for (let k = firstAt(arm.t, from); k < arm.t.length && arm.t[k] < to; k++) {
    const a = arm.acc!;
    if (!Number.isFinite(a[3 * k])) continue;
    s[0] += a[3 * k];
    s[1] += a[3 * k + 1];
    s[2] += a[3 * k + 2];
    n++;
  }
  return n ? [s[0] / n, s[1] / n, s[2] / n] : undefined;
}

/** Turn about `axis` (degrees, right-hand rule) between two times, or NaN over a gap. */
export function turnAbout(arm: SensorData, axis: V3, from: number, to: number): number {
  const g = arm.gyro!;
  let sum = 0;
  const end = firstAt(arm.t, to);
  for (let k = firstAt(arm.t, from) + 1; k < end; k++) {
    const dt = arm.t[k] - arm.t[k - 1];
    if (dt > MAX_GAP_MS) return NaN;
    sum += dot(axis, [g[3 * k], g[3 * k + 1], g[3 * k + 2]]) * (dt / 1000);
  }
  return sum;
}

/**
 * Finds which way is up and left/right for an arm sensor, however it is strapped on. In
 * each shot the bow is first set up pointing down and then raised to full draw, and the arm
 * goes up with it. The change of the gravity direction in the arm sensor from the set-up to
 * the hold gives the axis the arm turns about to go up; gravity in the hold gives up. A
 * sensor is not moved during a recording, so the shots are put together into one set of axes.
 * Needs a MantisX on the bow (its pitch shows the set-up) and an arm sensor with acc and gyro.
 */
export function findArmAxes(bow: SensorData, arm: SensorData, shots: { id: string; releaseTime: number }[], armRelease: Map<string, number>): ArmAxes | undefined {
  if (!bow.euler || !arm.acc || !arm.gyro) return undefined;
  const ups: V3[] = [];
  const raises: V3[] = [];
  for (const shot of shots) {
    const armTime = armRelease.get(shot.id);
    if (armTime === undefined) continue;
    let setup: number | undefined;
    for (let d = -3000; d > -15000; d -= 100) {
      const k = firstAt(bow.t, shot.releaseTime + d);
      if (k < bow.t.length && Math.abs(bow.t[k] - (shot.releaseTime + d)) < 200 && bow.euler[3 * k + 1] > SETUP_PITCH) {
        setup = armTime + d;
        break;
      }
    }
    if (setup === undefined) continue;
    const gSetup = meanAcc(arm, setup - 500, setup);
    const gHold = meanAcc(arm, armTime - 2000, armTime - 300);
    if (!gSetup || !gHold || angle(gSetup, gHold) < 10) continue;
    const up = norm(gHold);
    const axis = norm(cross(gSetup, gHold));
    let raise = norm([axis[0] - dot(axis, up) * up[0], axis[1] - dot(axis, up) * up[1], axis[2] - dot(axis, up) * up[2]]);
    // The sign: the raise must count as going up
    const turned = turnAbout(arm, raise, setup - 500, armTime - 300);
    if (!Number.isFinite(turned)) continue;
    if (turned < 0) raise = [-raise[0], -raise[1], -raise[2]];
    ups.push(up);
    raises.push(raise);
  }
  if (!ups.length) return undefined;
  const sum = (vs: V3[]) => norm(vs.reduce<V3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]));
  const up = sum(ups);
  const r = sum(raises);
  const raise = norm([r[0] - dot(r, up) * up[0], r[1] - dot(r, up) * up[1], r[2] - dot(r, up) * up[2]]);
  return { up, raise, shots: ups.length, spread: Math.max(...raises.map((v) => angle(v, raise))) };
}

/** How far the arm went (degrees): positive up and positive right, as the archer sees it. */
export interface ArmTurn {
  up: number;
  right: number;
}

export interface ArmShot {
  /** The last second of the hold (1 s to 0.1 s before the release). */
  hold: ArmTurn;
  /** The release, 0.05 s before to 0.25 s after. */
  release: ArmTurn;
  /** Seconds after the release until the arm is 10° below the hold (taken down). */
  downAfter?: number;
}

export const ARM_WINDOWS = { hold: [-1000, -100], release: [-50, 250] } as const;

function turn(arm: SensorData, axes: ArmAxes, from: number, to: number): ArmTurn {
  // Turning about up by the right-hand rule is to the left
  return { up: turnAbout(arm, axes.raise, from, to), right: -turnAbout(arm, axes.up, from, to) };
}

/** The arm's movement in one shot, from the arm sensor's release time. */
export function armShot(arm: SensorData, axes: ArmAxes, armTime: number): ArmShot {
  let downAfter: number | undefined;
  let sum = 0;
  const g = arm.gyro!;
  for (let k = firstAt(arm.t, armTime) + 1; k < arm.t.length && arm.t[k] < armTime + 8000; k++) {
    const dt = arm.t[k] - arm.t[k - 1];
    if (dt > MAX_GAP_MS) break;
    sum += dot(axes.raise, [g[3 * k], g[3 * k + 1], g[3 * k + 2]]) * (dt / 1000);
    if (sum < -10) {
      downAfter = (arm.t[k] - armTime) / 1000;
      break;
    }
  }
  return {
    hold: turn(arm, axes, armTime + ARM_WINDOWS.hold[0], armTime + ARM_WINDOWS.hold[1]),
    release: turn(arm, axes, armTime + ARM_WINDOWS.release[0], armTime + ARM_WINDOWS.release[1]),
    downAfter,
  };
}
