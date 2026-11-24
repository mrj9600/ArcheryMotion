import { Session } from '../data/models';
import { MotionSample } from '../sensors/sensor.model';
import { ChunkBuffer } from './chunk-buffer';
import { joinChunks, packRecording, unpackRecording } from './recording-file';
import { ReleaseDetector } from './release-detector';

function sample(time: number, acc: [number, number, number] = [0, 0, 1]): MotionSample {
  return { time, acc, gyro: [1, 2, 3], euler: [4, 5, 6] };
}

describe('ChunkBuffer', () => {
  it('writes a chunk every 2 seconds and keeps the columns aligned', () => {
    const buf = new ChunkBuffer('s', 0);
    const chunks = [];
    for (let i = 0; i <= 500; i++) {
      const c = buf.add(i * 10, sample(i * 10));
      if (c) chunks.push(c);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0].t.length).toBe(201);
    expect(chunks[0].seq).toBe(0);
    expect(chunks[1].seq).toBe(1);
    expect(chunks[0].gyro!.length).toBe(201 * 3);
    expect(chunks[0].quat).toBeUndefined();
    expect(Array.from(chunks[0].euler!.slice(0, 3))).toEqual([4, 5, 6]);
  });

  it('fills fields a sample lacks with NaN', () => {
    const buf = new ChunkBuffer('s', 1);
    buf.add(0, { time: 0, accMagnitude: 0.2 });
    buf.add(1, { time: 1, gyro: [1, 1, 1] });
    const c = buf.flush()!;
    expect(c.accMagnitude![0]).toBeCloseTo(0.2);
    expect(Number.isNaN(c.accMagnitude![1])).toBe(true);
    expect(Number.isNaN(c.gyro![0])).toBe(true);
    expect(c.gyro![3]).toBe(1);
    expect(buf.flush()).toBeUndefined();
  });
});

describe('ReleaseDetector', () => {
  it('finds a jolt and ignores the next one within the cooldown', () => {
    const d = new ReleaseDetector(0.5);
    const hits: number[] = [];
    for (let t = 0; t < 8000; t += 5) {
      const jolt = t === 2000 || t === 3000 || t === 6000;
      if (d.feed(sample(t, jolt ? [2, 0, 1] : [0, 0, 1]))) hits.push(t);
    }
    expect(hits).toEqual([2000, 6000]);
  });

  it('uses the acceleration size for sensors without a vector', () => {
    const d = new ReleaseDetector(0.5);
    expect(d.feed({ time: 0, accMagnitude: 0.1 })).toBe(false);
    expect(d.feed({ time: 10, accMagnitude: 1.5 })).toBe(true);
  });
});

describe('recording file', () => {
  it('survives a round trip', () => {
    const buf = new ChunkBuffer('s', 0);
    const chunks = [];
    for (let i = 0; i < 450; i++) {
      const c = buf.add(i * 5, sample(i * 5));
      if (c) chunks.push(c);
    }
    chunks.push(buf.flush()!);
    const data = joinChunks(chunks);
    expect(data.t.length).toBe(450);

    const session: Session = {
      id: 's',
      archerId: 'a',
      startedAt: 1000,
      sensors: [{ index: 0, name: 'WT', kind: 'witmotion-ble', role: 'bow' }],
      shotCount: 1,
      sampleCount: 450,
    };
    const shots = [{ id: 'x', sessionId: 's', number: 1, releaseTime: 1200, trigger: 'auto' as const, target: 'up' as const }];
    // An odd header length would misalign the arrays if they were read in place
    const bytes = packRecording({ session: { ...session, note: 'æøå x' }, shots }, [data]);
    const rec = unpackRecording(bytes);

    expect(rec.header.session.note).toBe('æøå x');
    expect(rec.header.shots[0].target).toBe('up');
    expect(Array.from(rec.sensors[0].t)).toEqual(Array.from(data.t));
    expect(Array.from(rec.sensors[0].gyro!)).toEqual(Array.from(data.gyro!));
    expect(rec.sensors[0].quat).toBeUndefined();
  });

  it('doubles the gyro of MantisX recordings made with the old scale, once', () => {
    const data = { t: Float64Array.from([0, 3]), gyro: Float32Array.from([1, 0, -2, 3, 0, 4]) };
    const session: Session = {
      id: 's',
      archerId: 'a',
      startedAt: 1000,
      sensors: [{ index: 0, name: 'mantis', kind: 'mantisx-ble', role: 'bow' }],
      shotCount: 0,
      sampleCount: 2,
    };
    const old = unpackRecording(packRecording({ session, shots: [] }, [data]));
    expect(Array.from(old.sensors[0].gyro!)).toEqual([2, 0, -4, 6, 0, 8]);
    expect(old.header.session.sensors[0].gyroFullScale).toBe(2000);
    // Saved again (now marked as corrected), it is not doubled a second time
    const again = unpackRecording(packRecording({ session: old.header.session, shots: [] }, old.sensors));
    expect(Array.from(again.sensors[0].gyro!)).toEqual([2, 0, -4, 6, 0, 8]);
  });
});

describe('splitSensor', () => {
  it('splits continuous arrays into chunks that join back to the same data', async () => {
    const { splitSensor } = await import('./import');
    const n = 2500;
    const data = {
      t: Float64Array.from({ length: n }, (_, i) => i * 3),
      gyro: Float32Array.from({ length: n * 3 }, (_, i) => i),
      accMagnitude: Float32Array.from({ length: n }, (_, i) => i / 10),
    };
    const chunks = splitSensor('s', 2, data);
    expect(chunks.map((c) => c.t.length)).toEqual([1000, 1000, 500]);
    expect(chunks.map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(chunks[1].sensorIndex).toBe(2);
    const back = joinChunks(chunks);
    expect(Array.from(back.t)).toEqual(Array.from(data.t));
    expect(Array.from(back.gyro!)).toEqual(Array.from(data.gyro));
    expect(back.euler).toBeUndefined();
  });
});
