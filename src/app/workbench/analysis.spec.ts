import { describe, expect, it } from 'vitest';
import { SensorData } from '../recording/recording-file';
import { HOLD_LIMITS } from '../training/hold-detector';
import { channelsOf, detectHolds, detectReleases, formatTime, indexAt, sampleAt } from './analysis';

/** 100 Hz recording: raise/draw, hold with small sway, release jolt at 8 s, let-down. */
function recording(): SensorData {
  const n = 1200;
  const t = new Float64Array(n);
  const gyro = new Float32Array(n * 3);
  const acc = new Float32Array(n * 3);
  const euler = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = i / 100;
    t[i] = i * 10;
    let w = 1 * Math.sin(s * 3);
    if (s < 1) w = 40;
    else if (s >= 8 && s < 9) w = 80;
    gyro.set([w, 0.5 * Math.cos(s * 2), 0], i * 3);
    acc.set([0, 0, s >= 8 && s < 8.05 ? 3 : 1], i * 3);
    euler.set([0, 0, 0], i * 3);
  }
  return { t, gyro, acc, euler };
}

describe('workbench analysis', () => {
  it('splits interleaved arrays into curves', () => {
    const data = recording();
    const channels = channelsOf(data);
    expect(channels.map((c) => c.key)).toEqual(['gyro', 'euler', 'acc']);
    const gyro = channels[0];
    expect(gyro.series.map((s) => s.label)).toEqual(['x', 'y', 'z', '|ω|']);
    expect(gyro.series[0].values[0]).toBe(40);
    expect(gyro.series[3].values[0]).toBeCloseTo(Math.hypot(40, 0.5), 3);
  });

  it('builds samples like the live sensors and leaves out NaN fields', () => {
    const data = recording();
    data.euler![0] = NaN;
    const s = sampleAt(data, 0);
    expect(s.time).toBe(0);
    expect(s.gyro?.[0]).toBe(40);
    expect(s.euler).toBeUndefined();
  });

  it('finds the release and the hold again', () => {
    const data = recording();
    const releases = detectReleases(data, 0.5);
    expect(releases).toEqual([8000]);
    const holds = detectHolds(data, HOLD_LIMITS);
    expect(holds.length).toBe(1);
    expect(holds[0].heldMs).toBeGreaterThan(6000);
    expect(holds[0].heldMs).toBeLessThan(7000);
  });

  it('finds sample indices and formats times', () => {
    const t = new Float64Array([0, 10, 20, 30]);
    expect(indexAt(t, 15)).toBe(2);
    expect(indexAt(t, -5)).toBe(0);
    expect(indexAt(t, 99)).toBe(4);
    expect(formatTime(65400)).toBe('1:05,4');
    expect(formatTime(0)).toBe('0:00,0');
  });
});
