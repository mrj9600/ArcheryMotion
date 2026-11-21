import { AimTrace, axisScore, findPhases, TRACE_HZ } from './shot-phases';

const smooth = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
};

/** Bow pointing down, raised to +15°, drawn down onto the target, held, released at 0. */
function syntheticTrace(holdSway = 0.3): AimTrace {
  const times: number[] = [];
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let i = -900; i <= 150; i++) {
    const t = i / TRACE_HZ;
    let e: number;
    if (t < -7.5) e = -40;
    else if (t < -5.5) e = -40 + 55 * smooth((t + 7.5) / 2);
    else if (t < -4) e = 15 - 15 * smooth((t + 5.5) / 1.5);
    else e = 0;
    const sway = t > -4 && t < 0 ? Math.sin(t * 7) * holdSway : 0;
    times.push(t);
    vertical.push(e + sway);
    horizontal.push(sway * 0.5);
  }
  return { times, vertical, horizontal, elevation: vertical.slice() };
}

describe('shot phases', () => {
  it('splits a shot into setup, draw, target, hold and after', () => {
    const { spans, durations } = findPhases(syntheticTrace());
    expect(spans.map((s) => s.phase)).toEqual(['setup', 'draw', 'target', 'hold', 'after']);

    const draw = spans.find((s) => s.phase === 'draw')!;
    expect(draw.start).toBeCloseTo(-5.5, 1); // the highest point
    const hold = spans.find((s) => s.phase === 'hold')!;
    expect(hold.start).toBeLessThan(-3.9); // within 2° from about 4 s before release
    expect(durations.target).toBeGreaterThan(0);
    expect(durations.target).toBeLessThan(0.5);
    // Setup starts where the bow pointed more than 25° down
    const setup = spans.find((s) => s.phase === 'setup')!;
    expect(setup.start).toBeGreaterThan(-7.5);
    expect(setup.start).toBeLessThan(-6.5);
  });

  it('scores a still hold as 100 and a shaky hold lower', () => {
    const still = findPhases(syntheticTrace(0)).score!;
    const shaky = findPhases(syntheticTrace(0.6)).score!;
    expect(still.stability).toBeCloseTo(100, 5);
    expect(shaky.stability).toBeLessThan(still.stability);
    expect(shaky.reasons.length).toBeGreaterThan(0);
    expect(shaky.segments.length).toBe(6); // 3 s window in half seconds
  });

  it('gives about 88-92 for a steady 1 °/s movement', () => {
    const values = Array.from({ length: 301 }, (_, i) => i * 0.01);
    const times = values.map((_, i) => (i - 300) / TRACE_HZ);
    const s = axisScore(values, times, 0, 300, 'vertical')!;
    // Equal steps (up to rounding): weighted mean below 1 °/s because early steps weigh less
    expect(s.score).toBeGreaterThan(88);
    expect(s.score).toBeLessThan(94);
    expect(s.meanSpeed).toBeGreaterThan(0.5);
    expect(s.meanSpeed).toBeLessThan(1);
  });
});
