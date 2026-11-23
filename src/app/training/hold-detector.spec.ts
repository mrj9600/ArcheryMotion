import { describe, expect, it } from 'vitest';
import { MotionSample, Vec3 } from '../sensors/sensor.model';
import { HoldDetector, HoldEvent } from './hold-detector';

/** Feeds `seconds` of 100 Hz samples whose gyro is given by `gyro(t)` (t in s since t0). */
function run(d: HoldDetector, from: number, seconds: number, gyro: (t: number) => Vec3, pitch = () => 0): HoldEvent[] {
  const events: HoldEvent[] = [];
  for (let i = 0; i < seconds * 100; i++) {
    const t = from + i / 100;
    const sample: MotionSample = { time: t * 1000, gyro: gyro(t), euler: [0, pitch(), 0] };
    events.push(...d.feed(sample));
  }
  return events;
}

const sway = (amp: number) => (t: number): Vec3 => [amp * Math.sin(t * 3), amp * Math.cos(t * 2), 0];

describe('HoldDetector', () => {
  it('does not start without a draw movement first', () => {
    const d = new HoldDetector();
    expect(run(d, 0, 3, sway(1))).toEqual([]);
    expect(d.state).toBe('waiting');
  });

  it('finds the start and end of a hold and keeps the let-down out of it', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]); // raising and drawing
    const events = [...run(d, 1, 10, sway(1.5)), ...run(d, 11, 1, () => [80, 0, 0])];
    const start = events.find((e) => e.type === 'start')!;
    const end = events.find((e) => e.type === 'end')!;
    expect(start.time).toBeGreaterThan(1000);
    expect(start.time).toBeLessThan(1600);
    expect(end.time).toBeGreaterThan(10900);
    expect(end.time).toBeLessThan(11100);
    const stats = d.stats();
    expect(stats.heldMs).toBeGreaterThan(9000);
    expect(stats.goodFormMs).toBe(stats.heldMs);
    expect(stats.warnings).toEqual([]);
    expect(stats.sway).toBeGreaterThan(0.5);
    expect(stats.sway).toBeLessThan(2);
    expect(stats.drift).toBeLessThan(0.1);
  });

  it('warns when the sway grows to well above the first seconds', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    const events = [...run(d, 1, 6, sway(1)), ...run(d, 7, 5, sway(5))];
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings.length).toBe(1);
    const stats = d.stats();
    expect(stats.goodFormMs).toBeGreaterThan(4500);
    expect(stats.goodFormMs).toBeLessThan(7000);
  });

  it('warns on tremor (fast shaking)', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    const shake = (t: number): Vec3 => [4 * Math.sin(t * 2 * Math.PI * 12), 0, 0];
    const events = [...run(d, 1, 6, sway(1)), ...run(d, 7, 4, (t) => sway(1)(t).map((v, i) => v + shake(t)[i]) as Vec3)];
    expect(events.some((e) => e.type === 'warning')).toBe(true);
    expect(d.stats().tremor).toBeGreaterThan(0.5);
  });

  it('measures drift of the bow angle', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    run(d, 1, 8, sway(0.5), () => 0);
    run(d, 9, 2, sway(0.5), () => 3); // bow dropped 3°
    run(d, 11, 1, () => [80, 0, 0]);
    expect(d.stats().drift).toBeGreaterThan(2.5);
  });

  it('ends the hold at a shot and ignores the bow settling after it', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    run(d, 1, 5, sway(1));
    const end = d.release(6000, [0, 0, 0]);
    expect(end).toEqual({ type: 'end', time: 6000, by: 'shot' });
    expect(d.stats().heldMs).toBeGreaterThan(4500);
    d.arm();
    // The bow swings in the sling and comes to rest: no new hold
    const after = [...run(d, 6, 1, () => [60, 0, 0]), ...run(d, 7, 4, sway(0.5))];
    expect(after.some((e) => e.type === 'start')).toBe(false);
  });

  it('ends a hold when the bow slowly moves far from where it started', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    const events = run(d, 1, 12, sway(1), () => 0);
    expect(events.some((e) => e.type === 'start')).toBe(true);
    // Raised 15° over 3 s, slower than the end speed
    const drift = run(d, 13, 3, sway(1), () => 0).concat(run(d, 16, 3, sway(1), () => 15));
    expect(drift.some((e) => e.type === 'end')).toBe(true);
  });

  it('uses a given holding level from the start', () => {
    const d = new HoldDetector();
    d.setReference([0, 0, 0]);
    run(d, 0, 1, () => [40, 0, 0], () => 30);
    expect(run(d, 1, 3, sway(1), () => 30)).toEqual([]); // bow resting 30° higher
    run(d, 4, 1, () => [40, 0, 0], () => 5);
    expect(run(d, 5, 2, sway(1), () => 5).some((e) => e.type === 'start')).toBe(true);
  });

  it('only starts the next hold near the first full-draw pose', () => {
    const d = new HoldDetector();
    run(d, 0, 1, () => [40, 0, 0]);
    run(d, 1, 5, sway(1), () => 0);
    run(d, 6, 1, () => [80, 0, 0]);
    d.arm();
    run(d, 7, 1, () => [40, 0, 0], () => -50);
    expect(run(d, 8, 3, sway(1), () => -50)).toEqual([]); // bow pointing down, resting
    run(d, 11, 1, () => [40, 0, 0], () => 0);
    expect(run(d, 12, 2, sway(1), () => 0).some((e) => e.type === 'start')).toBe(true);
  });
});
