import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { calibrated, createCalibration, sampleToQuaternion, SensorAxis } from './orientation';

const DEG = MathUtils.DEG2RAD;

/** Sensor-frame quaternion -> sample with Euler angles, as a WitMotion sensor would report. */
function sampleFrom(q: Quaternion) {
  const e = new Euler().setFromQuaternion(q, 'ZYX');
  return { time: 0, euler: [e.x / DEG, e.y / DEG, e.z / DEG] as [number, number, number] };
}

/** Rotation about an axis given in the sensor's world frame (Z up). */
function rot(axis: [number, number, number], deg: number) {
  return new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), deg * DEG);
}

function displayAfter(forward: SensorAxis, mount: Quaternion, motion: (fwd: Vector3) => Quaternion) {
  const q0 = mount;
  const sensorForward = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] }[forward];
  const fwdWorld = new Vector3(...(sensorForward as [number, number, number])).applyQuaternion(q0);
  const q = motion(fwdWorld).multiply(q0);
  const cal = createCalibration(sampleToQuaternion(sampleFrom(q0))!, forward);
  return calibrated(sampleToQuaternion(sampleFrom(q))!, cal);
}

describe('orientation calibration', () => {
  // Sensor flat, X axis towards the target, archer facing 37° in the sensor's world
  const mount = rot([0, 0, 1], 37);

  it('shows canting as rotation about the arrow axis (scene Z)', () => {
    const d = displayAfter('+X', mount, (f) => rot([f.x, f.y, f.z], 20));
    expect(Math.abs(d.x)).toBeLessThan(1e-3);
    expect(Math.abs(d.y)).toBeLessThan(1e-3);
    expect(Math.abs(d.z)).toBeCloseTo(Math.sin(10 * DEG), 3);
  });

  it('shows aiming up as rotation about the lateral axis (scene X)', () => {
    const d = displayAfter('+X', mount, (f) => rot([-f.y, f.x, 0], -15));
    expect(Math.abs(d.y)).toBeLessThan(1e-3);
    expect(Math.abs(d.z)).toBeLessThan(1e-3);
    expect(Math.abs(d.x)).toBeCloseTo(Math.sin(7.5 * DEG), 3);
  });

  it('works for a sensor mounted on its side with Y towards the target', () => {
    const side = rot([0, 0, 1], -60).multiply(rot([0, 1, 0], 90));
    const d = displayAfter('+Y', side, (f) => rot([f.x, f.y, f.z], 25));
    expect(Math.abs(d.x)).toBeLessThan(1e-3);
    expect(Math.abs(d.y)).toBeLessThan(1e-3);
  });

  it('tared lying on its side shows upright when the bow is raised', () => {
    const upright = mount;
    const fwd = new Vector3(1, 0, 0).applyQuaternion(upright);
    // Top limb to the left (seen from behind) = +90° about the backwards axis
    const lying = rot([-fwd.x, -fwd.y, -fwd.z], 90).multiply(upright.clone());
    const cal = createCalibration(sampleToQuaternion(sampleFrom(lying))!, '+X', 'sideLeft');

    const atTare = calibrated(sampleToQuaternion(sampleFrom(lying))!, cal);
    const up = new Vector3(0, 1, 0).applyQuaternion(atTare);
    expect(up.x).toBeCloseTo(-1, 3);

    const raised = calibrated(sampleToQuaternion(sampleFrom(upright))!, cal);
    expect(Math.abs(raised.w)).toBeCloseTo(1, 3);
  });
});
