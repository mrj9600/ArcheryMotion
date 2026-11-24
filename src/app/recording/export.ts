import { Db } from '../data/db';
import { Session } from '../data/models';
import { correctGyroScale, encodeRecording, joinChunks, Recording, RecordingMeta, SensorData } from './recording-file';

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
  // Copy the session so the stored one keeps saying how its values were saved
  const copy = structuredClone(meta.session);
  return correctGyroScale({ header: { format: 'archery-motion-recording', version: 1, exportedAt: Date.now(), ...meta, session: copy, streams: [] }, sensors });
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

/**
 * The file as it is shared. Android's share sheet only takes some file types (images,
 * PDF, text, ...), so the .amrec file is shared as ".amrec.txt"; the contents are the same,
 * and Analyse opens both.
 */
export function shareableFile(blob: Blob, filename: string): File {
  return new File([blob], `${filename}.txt`, { type: 'text/plain' });
}

export function canShareFile(file: File): boolean {
  return !!navigator.canShare?.({ files: [file] });
}

/**
 * Opens the share sheet. 'needsTap' means the browser wants a fresh tap first (packing
 * the file took too long after the tap on Eksportér).
 */
export async function shareFile(file: File): Promise<'shared' | 'cancelled' | 'needsTap'> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needsTap';
    throw e;
  }
}

/** Saves the file to Downloads. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
