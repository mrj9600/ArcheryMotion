import { Db } from '../data/db';
import { SampleChunk } from '../data/models';
import { decodeRecording, SensorData, StreamField } from './recording-file';

/** Samples per stored chunk for imported data (the recorder uses up to 1000). */
const CHUNK_SAMPLES = 1000;

const FIELD_SIZES: Record<StreamField, number> = { acc: 3, gyro: 3, euler: 3, quat: 4, accMagnitude: 1 };

/** Splits one sensor's continuous arrays into stored chunks (the reverse of joinChunks). */
export function splitSensor(sessionId: string, sensorIndex: number, data: SensorData, size = CHUNK_SAMPLES): SampleChunk[] {
  const chunks: SampleChunk[] = [];
  const n = data.t.length;
  for (let from = 0, seq = 0; from < n; from += size, seq++) {
    const to = Math.min(n, from + size);
    const chunk: SampleChunk = { sessionId, sensorIndex, seq, t: data.t.slice(from, to) };
    for (const field of Object.keys(FIELD_SIZES) as StreamField[]) {
      const arr = data[field];
      if (arr) chunk[field] = arr.slice(from * FIELD_SIZES[field], to * FIELD_SIZES[field]);
    }
    chunks.push(chunk);
  }
  return chunks;
}

export type ImportResult = { status: 'imported' | 'exists'; startedAt: number; archer?: string };

/**
 * Stores an exported recording (.amrec or .amrec.txt) so it shows under Optagelser like
 * one recorded here. The archer and equipment come along if they are not here already;
 * existing ones are not changed. A session that is already here is skipped.
 */
export async function importRecording(db: Db, file: Blob): Promise<ImportResult> {
  const { header, sensors } = await decodeRecording(file);
  if (header.format !== 'archery-motion-recording') throw new Error('Ikke en ArcheryMotion-optagelse');
  const session = header.session;
  const result: ImportResult = { status: 'imported', startedAt: session.startedAt, archer: header.archer?.name };
  const d = db.db;
  await d.transaction('rw', [d.archers, d.setups, d.sessions, d.shots, d.chunks], async () => {
    if (await d.sessions.get(session.id)) {
      result.status = 'exists';
      return;
    }
    if (header.archer && !(await d.archers.get(header.archer.id))) await d.archers.put(header.archer);
    if (header.setup && !(await d.setups.get(header.setup.id))) await d.setups.put(header.setup);
    await d.shots.bulkPut(header.shots);
    for (const [index, data] of sensors.entries()) {
      if (data) await d.chunks.bulkAdd(splitSensor(session.id, index, data));
    }
    await d.sessions.put(session);
  });
  return result;
}
