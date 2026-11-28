import { describe, expect, it } from 'vitest';
import { Vec3 } from '../sensors/sensor.model';
import { PauseDetector } from './pause-detector';

/** Feeds `seconds` of 100 Hz samples; returns the events with their times (s). */
function run(d: PauseDetector, from: number, seconds: number, gyro: (t: number) => Vec3, pitch?: (t: number) => number): [string, number][] {
  const out: [string, number][] = [];
  for (let i = 0; i < seconds * 100; i++) {
    const t = from + i / 100;
    const e = d.feed({ time: t * 1000, gyro: gyro(t), euler: pitch ? [0, pitch(t), 0] : undefined });
    if (e) out.push([e, t]);
  }
  return out;
}

const noise = (amp: number) => (t: number): Vec3 => [amp * Math.sin(t * 37), amp * Math.cos(t * 23), 0];

describe('PauseDetector', () => {
  it('does not pause while the bow is held, even quietly', () => {
    const d = new PauseDetector();
    // Resting in the hand: mostly calm, but now and then above 2.3 deg/s
    expect(run(d, 0, 60, (t) => noise(t % 4 < 0.3 ? 3.4 : 1.1)(t))).toEqual([]);
  });

  it('pauses after 10 s on a stand and resumes when picked up', () => {
    const d = new PauseDetector();
    const down = run(d, 0, 30, noise(0.7));
    expect(down.length).toBe(1);
    expect(down[0][0]).toBe('pause');
    expect(down[0][1]).toBeCloseTo(10, 0);
    const up = run(d, 30, 1, () => [20, 0, 0]);
    expect(up[0][0]).toBe('resume');
    expect(up[0][1]).toBeLessThan(30.1);
  });

  it('pauses when the bow is carried flat for 10 s and resumes when it is taken up to shoot', () => {
    const d = new PauseDetector();
    const walking = noise(40);
    // Shooting steeply downhill (55°) for 15 s does not pause
    expect(run(d, 0, 15, walking, () => 55)).toEqual([]);
    // Carried pointing down (80°) while walking
    const walk = run(d, 15, 30, walking, () => -80);
    expect(walk).toEqual([['pause', expect.closeTo(25, 0)]]);
    // Still moving and flat: stays paused; pointing at a target again: resumes after 0.5 s
    const back = run(d, 45, 3, walking, (t) => (t < 46 ? -80 : 10));
    expect(back.length).toBe(1);
    expect(back[0][0]).toBe('resume');
    expect(back[0][1]).toBeCloseTo(46.5, 1);
  });
});
