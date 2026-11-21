import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { createCalibration, sampleToQuaternion } from '../sensors/orientation';
import { MotionSample } from '../sensors/sensor.model';
import { analyzeShot } from './shot-analysis';
import { Shot } from './shot.model';

const DEG = MathUtils.DEG2RAD;

function step(t: number, tau: number): number {
  if (t <= 0) return 0;
  const s = t / tau;
  return 1 - Math.exp(-s) * (1 + s);
}

/**
 * Synthetic shot: sensor with +X towards the target, archer facing 30° in the sensor's
 * world. At t = 0 the bow jumps 6 cm forward, drops 2.5 cm and tips 25° forward.
 */
function syntheticShot(rate = 100): Shot {
  const heading = 30 * DEG;
  const fwd = new Vector3(Math.cos(heading), Math.sin(heading), 0);
  const pos = (t: number) => fwd.clone().multiplyScalar(0.06 * step(t, 0.05)).add(new Vector3(0, 0, -0.025 * step(t, 0.12)));
  const angles = (t: number): [number, number, number] => [0, 25 * step(t, 0.15), 30];

  const samples: MotionSample[] = [];
  const h = 0.001;
  for (let i = -200; i <= 150; i++) {
    const t = i / rate;
    const acc = pos(t + h).add(pos(t - h)).sub(pos(t).multiplyScalar(2)).divideScalar(h * h);
    const e = angles(t);
    const q = new Quaternion().setFromEuler(new Euler(e[0] * DEG, e[1] * DEG, e[2] * DEG, 'ZYX'));
    const body = acc.divideScalar(9.81).add(new Vector3(0, 0, 1)).applyQuaternion(q.clone().invert());
    samples.push({ time: 10000 + t * 1000, acc: [body.x, body.y, body.z], euler: e });
  }
  const calibration = createCalibration(sampleToQuaternion(samples[0])!, '+X');
  return {
    id: 1,
    recordedAt: new Date(),
    releaseTime: 10000,
    trigger: 'manual',
    sensors: [{ name: 'sim', kind: 'simulated', role: 'bow', calibration, samples }],
  };
}

describe('shot analysis', () => {
  const analysis = analyzeShot(syntheticShot());
  const bow = analysis.bow!;
  const at = (t: number) => bow.times.findIndex((x) => x >= t - 1e-9);

  it('puts the release at t = 0 and finds the sample rate', () => {
    expect(bow.times[at(0)]).toBeCloseTo(0, 6);
    expect(bow.sampleRate).toBeCloseTo(100, 0);
  });

  it('estimates the displacement in the archer frame', () => {
    const d = bow.displacement[at(0.4)]!;
    expect(d.forward).toBeCloseTo(6, 0);
    expect(d.up).toBeCloseTo(-2.5, 0);
    expect(Math.abs(d.right)).toBeLessThan(0.3);
  });

  it('has no displacement before the window and zero at release', () => {
    expect(bow.displacement[at(-1)]).toBeUndefined();
    const d = bow.displacement[at(0)]!;
    expect(Math.hypot(d.forward, d.up, d.right)).toBeLessThan(0.1);
  });

  it('reports the bow tipping forward as negative vertical angle', () => {
    const a = bow.angles[at(1)];
    expect(a.vertical).toBeLessThan(-20);
    expect(Math.abs(a.cant)).toBeLessThan(0.5);
    expect(Math.abs(a.horizontal)).toBeLessThan(0.5);
  });
});
