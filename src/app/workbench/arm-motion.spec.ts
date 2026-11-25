import { describe, expect, it } from 'vitest';
import { SensorData } from '../recording/recording-file';
import { armShot, findArmAxes, hasMantisTimeBug, pairReleases } from './arm-motion';

type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const tr = (a: M3): M3 => a[0].map((_, j) => a.map((r) => r[j]));
const apply = (a: M3, v: number[]) => a.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const D = Math.PI / 180;
const rotX = (a: number): M3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a: number): M3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotZ = (a: number): M3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

/** The arm's elevation (deg, + up) and heading (deg, + right) over time, for one shot released at `rel`. */
function path(t: number, rel: number): [number, number] {
  const d = t - rel;
  if (d < -6000) return [-30, 0]; // set-up, bow pointing down
  if (d < -5000) return [-30 + (30 * (d + 6000)) / 1000, 0]; // the raise
  if (d < 0) return [0, 0]; // hold
  if (d < 200) return [(-5 * d) / 200, (3 * d) / 200]; // release: down 5°, right 3°
  if (d < 2000) return [-5, 3];
  return [-40, 3]; // taken down
}

/**
 * A bow (MantisX: pitch + = pointing down, a jolt at the release) and an arm sensor strapped
 * on at an odd angle, 100 Hz. The arm's data runs `lag` ms after the bow's.
 */
function recording(releases: number[], lag: (i: number) => number, mount: M3) {
  const n = Math.ceil((releases[releases.length - 1] + 4000) / 10);
  const bow: SensorData = { t: new Float64Array(n), euler: new Float32Array(3 * n), gyro: new Float32Array(3 * n), accMagnitude: new Float32Array(n) };
  const arm: SensorData = { t: new Float64Array(n), acc: new Float32Array(3 * n), gyro: new Float32Array(3 * n) };
  const orient = (t: number, rel: number) => {
    const [e, h] = path(t, rel);
    // Arm along world x; up = turn about -y, right = turn about -z
    return mul(mul(rotZ(-h * D), rotY(-e * D)), mount);
  };
  for (let k = 0; k < n; k++) {
    const t = k * 10;
    bow.t[k] = t;
    const i = releases.findIndex((r) => t < r + 3000);
    const rel = releases[i < 0 ? releases.length - 1 : i];
    bow.euler![3 * k + 1] = -path(t, rel)[0] * 0.7;
    bow.accMagnitude![k] = Math.abs(t - rel) < 5 ? 15 : 0.05;
    // The arm sensor: its own clock is `lag` ms ahead
    const ta = t + lag(i < 0 ? releases.length - 1 : i);
    arm.t[k] = ta;
    const R = orient(t, rel);
    const g = apply(tr(R), [0, 0, 1]);
    arm.acc!.set(g.map((v, j) => v + (Math.abs(t - rel) < 5 && j === 0 ? 2 : 0)), 3 * k);
    // Angular velocity in the sensor frame from the change of orientation over the next 10 ms
    const dR = mul(tr(R), orient(t + 10, rel));
    const w = [dR[2][1] - dR[1][2], dR[0][2] - dR[2][0], dR[1][0] - dR[0][1]].map((v) => (v / 2 / 0.01) / D);
    arm.gyro!.set(w, 3 * k);
  }
  const shots = releases.map((r, i) => ({ id: `s${i}`, releaseTime: r }));
  return { bow, arm, shots };
}

const mount = mul(rotX(70 * D), rotZ(-35 * D));

describe('arm motion', () => {
  it('knows which app builds have the MantisX time bug', () => {
    expect(hasMantisTimeBug(36)).toBe(false);
    expect(hasMantisTimeBug(37)).toBe(true);
    expect(hasMantisTimeBug(48)).toBe(true);
    expect(hasMantisTimeBug(49)).toBe(false);
    expect(hasMantisTimeBug(undefined)).toBe(false);
  });

  it('pairs the arm releases with the bow releases, also when the offset grows', () => {
    const { bow, arm, shots } = recording([10000, 25000, 40000], (i) => 18000 + 300 * i, mount);
    const pairs = pairReleases(bow, arm, shots, true);
    expect(pairs.get('s0')! - 10000).toBeCloseTo(18000, -1);
    expect(pairs.get('s2')! - 40000).toBeCloseTo(18600, -1);
    expect(pairReleases(bow, arm, shots, false).size).toBe(0);
  });

  it('finds up and right from the raises, however the sensor is strapped on', () => {
    const { bow, arm, shots } = recording([10000, 25000], () => 20, mount);
    const pairs = pairReleases(bow, arm, shots, false);
    const axes = findArmAxes(bow, arm, shots, pairs)!;
    expect(axes.shots).toBe(2);
    expect(axes.spread).toBeLessThan(1);
    const shot = armShot(arm, axes, pairs.get('s1')!);
    expect(shot.hold.up).toBeCloseTo(0, 1);
    expect(shot.hold.right).toBeCloseTo(0, 1);
    expect(shot.release.up).toBeCloseTo(-5, 0);
    expect(shot.release.right).toBeCloseTo(3, 0);
    expect(shot.downAfter).toBeCloseTo(2, 1);
  });
});
