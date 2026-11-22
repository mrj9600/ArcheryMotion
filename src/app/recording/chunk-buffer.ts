import { SampleChunk } from '../data/models';
import { MotionSample } from '../sensors/sensor.model';

/** A chunk is written when it holds this many samples or spans this long. */
const MAX_SAMPLES = 1000;
const MAX_SPAN_MS = 2000;

const FIELDS = [
  ['acc', 3],
  ['gyro', 3],
  ['euler', 3],
  ['quat', 4],
] as const;

/**
 * Collects one sensor's samples and turns them into column-wise SampleChunks.
 * Fields a sensor never sends are left out of the chunk; gaps are NaN.
 */
export class ChunkBuffer {
  private samples: { t: number; s: MotionSample }[] = [];
  private seq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly sensorIndex: number,
  ) {}

  /** @param t ms relative to the session start. Returns a full chunk, if one is ready. */
  add(t: number, sample: MotionSample): SampleChunk | undefined {
    this.samples.push({ t, s: sample });
    const span = t - this.samples[0].t;
    return this.samples.length >= MAX_SAMPLES || span >= MAX_SPAN_MS ? this.flush() : undefined;
  }

  /** Returns what is buffered as a chunk (undefined if empty) and starts a new one. */
  flush(): SampleChunk | undefined {
    const list = this.samples;
    if (!list.length) return undefined;
    this.samples = [];
    const n = list.length;
    const chunk: SampleChunk = {
      sessionId: this.sessionId,
      sensorIndex: this.sensorIndex,
      seq: this.seq++,
      t: Float64Array.from(list, (x) => x.t),
    };
    for (const [field, size] of FIELDS) {
      if (!list.some((x) => x.s[field])) continue;
      const arr = new Float32Array(n * size).fill(NaN);
      list.forEach((x, i) => {
        const v = x.s[field];
        if (v) for (let k = 0; k < size; k++) arr[i * size + k] = v[k];
      });
      chunk[field] = arr;
    }
    if (list.some((x) => x.s.accMagnitude !== undefined)) {
      chunk.accMagnitude = Float32Array.from(list, (x) => x.s.accMagnitude ?? NaN);
    }
    return chunk;
  }
}
