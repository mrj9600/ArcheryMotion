import { describe, expect, it } from 'vitest';
import { SensorData } from '../recording/recording-file';
import { buildReplay } from './shot-replay';

describe('buildReplay', () => {
  it('adds up the bow and arm movement from the raise to the let-down, 0 at the release', () => {
    // 100 Hz for 10 s; the bow turns up at 2°/s and right at 1°/s, the cant is 3°
    const n = 1001;
    const t = new Float64Array(n);
    const euler = new Float32Array(3 * n);
    const up = new Float32Array(n).fill(2);
    const right = new Float32Array(n).fill(1);
    // The arm turns about its raise axis (sensor x) at 4°/s; its own clock runs 500 ms later
    const armT = new Float64Array(n);
    const gyro = new Float32Array(3 * n);
    for (let k = 0; k < n; k++) {
      t[k] = k * 10;
      euler[3 * k] = 3;
      armT[k] = k * 10 + 500;
      gyro[3 * k] = 4;
    }
    const bow: SensorData = { t, euler };
    const arm: SensorData = { t: armT, gyro };
    const trace = buildReplay({
      shot: { id: 'a', number: 1, releaseTime: 6000 },
      span: [2000, 8000],
      bow,
      motion: { up, right },
      arms: [{ label: 'Buearm', data: arm, axes: { up: [0, 0, 1], raise: [1, 0, 0], shots: 1, spread: 0 }, release: 6500 }],
    })!;
    expect(trace.t[0]).toBe(-4000);
    expect(trace.t[trace.t.length - 1]).toBe(2000);
    const at = (ms: number) => (ms + 4000) / 10;
    expect(trace.bow.up[at(0)]).toBeCloseTo(0, 5);
    expect(trace.bow.up[at(-4000)]).toBeCloseTo(-8, 1);
    expect(trace.bow.right[at(2000)]).toBeCloseTo(2, 1);
    expect(trace.bow.cant[at(-1000)]).toBeCloseTo(3, 5);
    expect(trace.arms[0].up[at(1000)]).toBeCloseTo(4, 1);
    expect(trace.arms[0].right[at(1000)]).toBeCloseTo(0, 5);
  });
});
