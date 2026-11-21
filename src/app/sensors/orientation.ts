import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { MotionSample } from './sensor.model';

const DEG = MathUtils.DEG2RAD;

/** Which of the sensor's own axes points towards the target when mounted. */
export type SensorAxis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
export const SENSOR_AXES: SensorAxis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

/**
 * Sensor frame is Z-up (x, y, z); three.js is Y-up, so we map
 * sensor (x, y, z) -> scene (x, z, -y). Applies to vectors and quaternion vector parts.
 */
export function sensorToScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/** A sample's orientation in the sensor's own world frame (Z up). */
export function sampleToSensorQuaternion(sample: MotionSample, target = new Quaternion()): Quaternion | undefined {
  if (sample.quat) {
    const [x, y, z, w] = sample.quat;
    return target.set(x, y, z, w).normalize();
  }
  if (sample.euler) {
    const [roll, pitch, yaw] = sample.euler;
    // R = Rz(yaw) * Ry(pitch) * Rx(roll)  ->  three.js order 'ZYX'
    return target.setFromEuler(new Euler(roll * DEG, pitch * DEG, yaw * DEG, 'ZYX'));
  }
  return undefined;
}

/** Converts a sample's orientation to a three.js quaternion (sensor body -> scene world). */
export function sampleToQuaternion(sample: MotionSample, target = new Quaternion()): Quaternion | undefined {
  const q = sampleToSensorQuaternion(sample, target);
  if (!q) return undefined;
  const [x, y, z] = sensorToScene(q.x, q.y, q.z);
  return target.set(x, y, z, q.w);
}

/** How the bow is held when "Nulstil" is pressed (always aiming at the target). */
export type TarePose = 'upright' | 'sideLeft' | 'sideRight';
export const TARE_POSES: { value: TarePose; label: string }[] = [
  { value: 'upright', label: 'Lodret' },
  { value: 'sideLeft', label: 'På siden, øverste ben mod venstre' },
  { value: 'sideRight', label: 'På siden, øverste ben mod højre' },
];

/** Model orientation for each tare pose, relative to upright (rotation about the arrow axis, scene Z). */
function poseQuaternion(pose: TarePose): Quaternion {
  const angle = pose === 'sideLeft' ? Math.PI / 2 : pose === 'sideRight' ? -Math.PI / 2 : 0;
  return new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle);
}

/** Calibration captured at "Nulstil": the bow is held in a known pose, aiming at the target. */
export interface Calibration {
  /** Sensor orientation at tare. */
  reference: Quaternion;
  /** Rotation about vertical that turns scene -Z into the bow's aiming direction at tare. */
  heading: Quaternion;
  /** Model orientation at tare (upright or lying on its side). */
  pose: Quaternion;
  /** Kept so the calibration can be rebuilt when settings change. */
  forward: SensorAxis;
  tarePose: TarePose;
}

/**
 * Builds the calibration from the orientation at tare and the sensor axis that points
 * towards the target. Only the horizontal part of that axis is used.
 */
export function createCalibration(reference: Quaternion, forward: SensorAxis, tarePose: TarePose = 'upright'): Calibration {
  const sign = forward[0] === '-' ? -1 : 1;
  const axis = forward[1];
  const v = sensorToScene(axis === 'X' ? sign : 0, axis === 'Y' ? sign : 0, axis === 'Z' ? sign : 0);
  const world = new Vector3(...v).applyQuaternion(reference);
  world.y = 0;

  const heading = new Quaternion();
  if (world.lengthSq() > 1e-4) {
    // Rotation about Y by θ maps (0,0,-1) to (-sinθ, 0, -cosθ)
    const theta = Math.atan2(-world.x, -world.z);
    heading.setFromAxisAngle(new Vector3(0, 1, 0), theta);
  }
  return { reference: reference.clone(), heading, pose: poseQuaternion(tarePose), forward, tarePose };
}

/**
 * Orientation to show on a model whose rest pose is "upright, aiming along -Z":
 * H⁻¹ · q · q₀⁻¹ · H · P, i.e. the rotation since tare, expressed relative to the bow's
 * heading, applied to the pose the bow had at tare.
 */
export function calibrated(q: Quaternion, cal: Calibration, target = new Quaternion()): Quaternion {
  const hInv = cal.heading.clone().invert();
  const refInv = cal.reference.clone().invert();
  return target.copy(hInv).multiply(q).multiply(refInv).multiply(cal.heading).multiply(cal.pose);
}
