import { describe, expect, it } from 'vitest';
import { DataWatch } from './data-watch';

describe('DataWatch', () => {
  it('warns when a sensor is silent while the recording runs', () => {
    const w = new DataWatch();
    expect(w.check(10000, 0, false, [{ id: 'bow', lastData: 6000 }]).alarm).toEqual([]);
    expect(w.check(12000, 0, false, [{ id: 'bow', lastData: 6000 }]).alarm).toEqual(['bow']);
    // Paused (bow on a stand): silence is fine
    expect(w.check(60000, 0, true, [{ id: 'bow', lastData: 6000 }]).alarm).toEqual([]);
  });

  it('after a reconnect without data: restarts once at 10 s and warns at 30 s', () => {
    const w = new DataWatch();
    const s = { id: 'bow', lastData: 1000, backSince: 50000 };
    expect(w.check(55000, 0, true, [s])).toEqual({ restart: [], alarm: [] });
    expect(w.check(60000, 0, true, [s])).toEqual({ restart: ['bow'], alarm: [] });
    expect(w.check(75000, 0, true, [s])).toEqual({ restart: [], alarm: [] });
    expect(w.check(80000, 0, true, [s])).toEqual({ restart: [], alarm: ['bow'] });
    // Data came: all fine
    expect(w.check(141000, 0, true, [{ id: 'bow', lastData: 140500, backSince: undefined }])).toEqual({ restart: [], alarm: [] });
  });

  it('stays quiet after "Slå alarm fra" until the sensor sends again', () => {
    const w = new DataWatch();
    const s = { id: 'bow', lastData: 1000 };
    expect(w.check(10000, 0, false, [s]).alarm).toEqual(['bow']);
    w.dismiss('bow', 1000);
    expect(w.check(20000, 0, false, [s]).alarm).toEqual([]);
    // It sent, then went silent again: warns again
    expect(w.check(40000, 0, false, [{ id: 'bow', lastData: 30000 }]).alarm).toEqual(['bow']);
  });
});
