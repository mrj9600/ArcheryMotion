import { describe, expect, it } from 'vitest';
import { SensorData } from '../recording/recording-file';
import { bowMotion, releaseTurn, shotSpan } from './bow-motion';

/** n samples at 100 Hz with the same gyro and angles. */
function constant(n: number, gyro: [number, number, number], roll = 0, pitch = 0): SensorData {
  const t = new Float64Array(n);
  const g = new Float32Array(n * 3);
  const e = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    t[k] = k * 10;
    g.set(gyro, k * 3);
    e.set([roll, pitch, 0], k * 3);
  }
  return { t, gyro: g, euler: e };
}

describe('bowMotion (MantisX)', () => {
  it('reads gyro x as up/down and gyro z as left/right on an upright bow', () => {
    const up = bowMotion(constant(3, [10, 0, 0]), 'mantisx-ble')!;
    expect(up.up[0]).toBeCloseTo(10, 5);
    expect(up.right[0]).toBeCloseTo(0, 5);
    const right = bowMotion(constant(3, [0, 0, 10]), 'mantisx-ble')!;
    expect(right.right[0]).toBeCloseTo(10, 5);
    expect(right.up[0]).toBeCloseTo(0, 5);
  });

  it('keeps left/right as left/right when the bow is canted', () => {
    // Top tilted 90° to the right: turning right in the world is about the bow's side axis
    const m = bowMotion(constant(3, [10, 0, 0], 90), 'mantisx-ble')!;
    expect(m.right[0]).toBeCloseTo(10, 4);
    expect(m.up[0]).toBeCloseTo(0, 4);
  });

  it('is only made for a MantisX', () => {
    expect(bowMotion(constant(3, [1, 0, 0]), 'witmotion-ble')).toBeUndefined();
  });
});

describe('releaseTurn', () => {
  it('adds up the turn around the release', () => {
    const data = constant(200, [0, 0, -20]); // turning left at 20 deg/s
    const turn = releaseTurn(data.t, bowMotion(data, 'mantisx-ble')!, 1000)!;
    expect(turn.right).toBeCloseTo(-20 * 0.29, 1);
    expect(turn.up).toBeCloseTo(0, 5);
  });

  it('gives nothing across a gap in the data', () => {
    const data = constant(200, [0, 0, 1]);
    for (let k = 110; k < 200; k++) data.t[k] += 50; // 60 ms without data, then on
    expect(releaseTurn(data.t, bowMotion(data, 'mantisx-ble')!, 1000)).toBeUndefined();
  });
});

describe('shotSpan', () => {
  it('runs from the start of the raise to the start of the let-down', () => {
    // 100 Hz; set-up pointing 20° down, raise at 2-3 s, hold, release at 8 s, let-down from 10 s
    const n = 1300;
    const t = new Float64Array(n);
    const e = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const s = k / 100;
      t[k] = k * 10;
      const pitch = s < 2 ? 20 : s < 3 ? 20 - 20 * (s - 2) : s < 8 ? 0 : s < 10 ? -10 : s < 11 ? -10 + 50 * (s - 10) : 40;
      e[3 * k + 1] = pitch;
    }
    const span = shotSpan({ t, euler: e }, 'mantisx-ble', 8000)!;
    expect(span[0]).toBeGreaterThan(1900);
    expect(span[0]).toBeLessThan(2200);
    expect(span[1]).toBeGreaterThan(9900);
    expect(span[1]).toBeLessThan(10100);
    expect(shotSpan({ t, euler: e }, 'witmotion-ble', 8000)).toBeUndefined();
  });
});
