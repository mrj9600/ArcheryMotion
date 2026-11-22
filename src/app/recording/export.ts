import { Db } from '../data/db';
import { Session } from '../data/models';
import { encodeRecording, joinChunks, Recording, RecordingMeta, SensorData } from './recording-file';

/** Collects a stored session: metadata and each sensor's samples as continuous arrays. */
export async function loadSession(db: Db, session: Session): Promise<{ meta: RecordingMeta; sensors: SensorData[] }> {
  const [shots, archer, setup] = await Promise.all([
    db.shots(session.id),
    db.db.archers.get(session.archerId),
    session.setupId ? db.db.setups.get(session.setupId) : undefined,
  ]);
  const sensors = await Promise.all(session.sensors.map(async (s) => joinChunks(await db.chunks(session.id, s.index))));
  return { meta: { session, archer, setup, shots }, sensors };
}

/** The same structure as a decoded export file, for a stored session. */
export async function loadStoredRecording(db: Db, session: Session): Promise<Recording> {
  const { meta, sensors } = await loadSession(db, session);
  return { header: { format: 'archery-motion-recording', version: 1, exportedAt: Date.now(), ...meta, streams: [] }, sensors };
}

/** Builds the export file for a stored session. */
export async function exportSession(db: Db, session: Session): Promise<{ blob: Blob; filename: string }> {
  const { meta, sensors } = await loadSession(db, session);
  const archer = meta.archer;
  const blob = await encodeRecording(meta, sensors);
  const d = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const who = (archer?.name ?? 'skytte').replace(/[^\p{L}\p{N}]+/gu, '-');
  return { blob, filename: `archerymotion_${who}_${stamp}.amrec` };
}

/** Shares the file (Android share sheet) or falls back to a download. */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
