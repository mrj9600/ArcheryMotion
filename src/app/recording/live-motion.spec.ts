import { describe, expect, it } from 'vitest';
import { combineAxes, liveTrace, SampleRing } from './live-motion';

describe('SampleRing', () => {
  it('keeps the newest samples in order and drops the oldest', () => {
    const ring = new SampleRing();
    for (let k = 0; k < 7000; k++) ring.push(k, { time: k, gyro: [k, 0, 0] });
    const d = ring.data(6990);
    expect(d.t.length).toBe(10);
    expect(d.t[0]).toBe(6990);
    expect(d.gyro![3 * 9]).toBe(6999);
    expect(d.acc).toBeUndefined();
    expect(ring.data().t[0]).toBe(1000);
  });
});

describe('combineAxes', () => {
  it('averages up and keeps the raise axis across it', () => {
    const a = combineAxes([
      { up: [0, 0, 1], raise: [1, 0, 0], shots: 1, spread: 0 },
      { up: [0, 0.1, 0.995], raise: [1, 0, 0.1], shots: 1, spread: 0 },
    ])!;
    expect(a.shots).toBe(2);
    expect(Math.abs(a.up[0] * a.raise[0] + a.up[1] * a.raise[1] + a.up[2] * a.raise[2])).toBeLessThan(1e-6);
  });
});

describe('liveTrace', () => {
  it('shows the last seconds around where the bow has been', () => {
    // MantisX: the bow turns up steadily (gyro x) for 4 s at 100 Hz
    const ring = new SampleRing();
    for (let k = 0; k <= 400; k++) ring.push(k * 10, { time: k * 10, gyro: [2, 0, 0], euler: [1, 0, 0] });
    const tr = liveTrace(ring.data(), 'mantisx-ble', [], 4000)!;
    expect(tr.t[tr.t.length - 1]).toBe(0);
    expect(tr.t[0]).toBe(-3000);
    // Centred: the middle of the window is 0, the end 3 s × 2°/s / 2 above it
    expect(tr.bow.up[tr.t.length - 1]).toBeCloseTo(3, 1);
    expect(tr.bow.cant[0]).toBeCloseTo(1, 5);
  });
});
