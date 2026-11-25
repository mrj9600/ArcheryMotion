import { Archer, EquipmentSetup, SampleChunk, Session, ShotRecord } from '../data/models';
import { MANTIS_GYRO_FULL_SCALE, MANTIS_OLD_GYRO_FULL_SCALE } from '../sensors/mantisx/mantisx-protocol';

/**
 * Export format for one session (see docs/optagelsesformat.md). The whole file is gzip
 * compressed. Inside: the magic line "AMREC1\n", a uint32 (little endian) with the
 * length of a UTF-8 JSON header, the header, and then the raw little-endian arrays
 * the header's streams point to.
 */
const MAGIC = 'AMREC1\n';

export type StreamField = 'acc' | 'gyro' | 'euler' | 'quat' | 'accMagnitude';
const FIELD_SIZES: Record<StreamField, number> = { acc: 3, gyro: 3, euler: 3, quat: 4, accMagnitude: 1 };

export interface StreamInfo {
  sensorIndex: number;
  /** 't' is the time column (float64); the others are float32. */
  field: 't' | StreamField;
  type: 'f64' | 'f32';
  /** Values per sample. */
  components: number;
  /** Byte offset from the start of the data section, and length in bytes. */
  offset: number;
  byteLength: number;
}

export interface RecordingHeader {
  format: 'archery-motion-recording';
  version: 1;
  exportedAt: number;
  session: Session;
  archer?: Archer;
  setup?: EquipmentSetup;
  shots: ShotRecord[];
  streams: StreamInfo[];
}

export interface SensorData {
  t: Float64Array;
  acc?: Float32Array;
  gyro?: Float32Array;
  euler?: Float32Array;
  quat?: Float32Array;
  accMagnitude?: Float32Array;
}

export interface Recording {
  header: RecordingHeader;
  /** By sensor index. */
  sensors: SensorData[];
}

/** Joins one sensor's chunks (in order) into continuous arrays. Missing fields become NaN. */
export function joinChunks(chunks: SampleChunk[]): SensorData {
  const n = chunks.reduce((sum, c) => sum + c.t.length, 0);
  const data: SensorData = { t: new Float64Array(n) };
  let at = 0;
  for (const c of chunks) {
    data.t.set(c.t, at);
    at += c.t.length;
  }
  for (const field of Object.keys(FIELD_SIZES) as StreamField[]) {
    if (!chunks.some((c) => c[field])) continue;
    const size = FIELD_SIZES[field];
    const arr = new Float32Array(n * size).fill(NaN);
    let pos = 0;
    for (const c of chunks) {
      const src = c[field];
      if (src) arr.set(src, pos * size);
      pos += c.t.length;
    }
    data[field] = arr;
  }
  return data;
}

export type RecordingMeta = Omit<RecordingHeader, 'format' | 'version' | 'streams' | 'exportedAt'>;

export async function encodeRecording(meta: RecordingMeta, sensors: SensorData[]): Promise<Blob> {
  const raw = new Blob([packRecording(meta, sensors) as BlobPart]);
  return new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

export async function decodeRecording(file: Blob): Promise<Recording> {
  const buf = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return unpackRecording(new Uint8Array(buf));
}

/** The uncompressed file contents. */
export function packRecording(meta: RecordingMeta, sensors: SensorData[]): Uint8Array {
  const streams: StreamInfo[] = [];
  const parts: ArrayBufferView[] = [];
  let offset = 0;
  sensors.forEach((data, sensorIndex) => {
    const fields: ['t' | StreamField, Float64Array | Float32Array | undefined][] = [
      ['t', data.t],
      ...(Object.keys(FIELD_SIZES) as StreamField[]).map((f) => [f, data[f]] as [StreamField, Float32Array | undefined]),
    ];
    for (const [field, arr] of fields) {
      if (!arr) continue;
      streams.push({
        sensorIndex,
        field,
        type: field === 't' ? 'f64' : 'f32',
        components: field === 't' ? 1 : FIELD_SIZES[field],
        offset,
        byteLength: arr.byteLength,
      });
      parts.push(arr);
      offset += arr.byteLength;
    }
  });
  const header: RecordingHeader = { format: 'archery-motion-recording', version: 1, exportedAt: Date.now(), ...meta, streams };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const magic = new TextEncoder().encode(MAGIC);
  const out = new Uint8Array(magic.length + 4 + json.length + offset);
  out.set(magic, 0);
  new DataView(out.buffer).setUint32(magic.length, json.length, true);
  out.set(json, magic.length + 4);
  let at = magic.length + 4 + json.length;
  for (const p of parts) {
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at);
    at += p.byteLength;
  }
  return out;
}

export function unpackRecording(bytes: Uint8Array): Recording {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error('Ikke en ArcheryMotion-optagelse');
  const headerLength = new DataView(buf).getUint32(MAGIC.length, true);
  const headerStart = MAGIC.length + 4;
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(headerStart, headerStart + headerLength))) as RecordingHeader;
  const dataStart = headerStart + headerLength;
  const sensors: SensorData[] = [];
  for (const s of header.streams) {
    // Copy so the typed array is aligned regardless of the header length
    const slice = buf.slice(dataStart + s.offset, dataStart + s.offset + s.byteLength);
    const arr = s.type === 'f64' ? new Float64Array(slice) : new Float32Array(slice);
    const data = (sensors[s.sensorIndex] ??= { t: new Float64Array(0) });
    if (s.field === 't') data.t = arr as Float64Array;
    else data[s.field] = arr as Float32Array;
  }
  return correctGyroScale({ header, sensors });
}

/**
 * Older MantisX recordings converted the gyro with a smaller full scale: 1000 deg/s
 * before 24 November 2026 (no `gyroFullScale` saved), then 2000. This scales them up to
 * the current scale (in place) and marks the sensor as corrected; the drill's sway and
 * tremor were measured on the same values and are scaled too.
 */
export function correctGyroScale(rec: Recording): Recording {
  const session = rec.header.session;
  for (const info of session.sensors) {
    if (info.kind !== 'mantisx-ble' || info.gyroFullScale === MANTIS_GYRO_FULL_SCALE) continue;
    const factor = MANTIS_GYRO_FULL_SCALE / (info.gyroFullScale ?? MANTIS_OLD_GYRO_FULL_SCALE);
    const gyro = rec.sensors[info.index]?.gyro;
    if (gyro) for (let i = 0; i < gyro.length; i++) gyro[i] *= factor;
    info.gyroFullScale = MANTIS_GYRO_FULL_SCALE;
    const bow = session.sensors.find((s) => s.role === 'bow') ?? session.sensors[0];
    if (session.drill && bow === info) {
      for (const r of session.drill.results) {
        r.sway *= factor;
        r.tremor *= factor;
        r.perSecond.sway = r.perSecond.sway.map((v) => v * factor);
        r.perSecond.tremor = r.perSecond.tremor.map((v) => v * factor);
      }
    }
  }
  return rec;
}
