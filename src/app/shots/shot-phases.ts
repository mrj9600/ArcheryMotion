/**
 * Splits a shot into phases and computes a stability score from the aim trace.
 * The principle follows the MantisX Archery app (see docs/mantisx-protocol.md);
 * the implementation is our own.
 *
 * The aim trace is the bow's horizontal and vertical aiming angle (degrees), resampled
 * to a fixed rate and measured relative to where the bow pointed at the release.
 */

export type ShotPhase = 'setup' | 'draw' | 'target' | 'hold' | 'after';

export const PHASES: { id: ShotPhase; label: string; color: string }[] = [
  { id: 'setup', label: 'Opsætning', color: '#3987e5' },
  { id: 'draw', label: 'Træk ned', color: '#d95926' },
  { id: 'target', label: 'Sigte', color: '#199e70' },
  { id: 'hold', label: 'Hold', color: '#c98500' },
  { id: 'after', label: 'Efter slip', color: '#9085e9' },
];

/** Aim trace sample rate used for phases and score (steps are compared at this rate). */
export const TRACE_HZ = 100;

const HOLD_RADIUS = 2; // degrees from the release point
const TARGET_RADIUS = 5;
const DRAW_SEARCH_BELOW = 30; // the search for the highest point stops this far below the release point
const START_BELOW = -25; // the shot starts where the bow pointed further down than this
const SCORE_WINDOW = 3; // seconds before release used for the score
const STEP_LIMIT = 0.1; // degrees per step

export interface AimTrace {
  /** Seconds relative to release, evenly spaced at TRACE_HZ. */
  times: number[];
  /** Degrees relative to the release point (undefined if unknown, e.g. no heading). */
  horizontal: (number | undefined)[];
  vertical: number[];
  /** Absolute elevation of the bow in degrees (0 = level), used to find the start. */
  elevation: number[];
}

export interface PhaseSpan {
  phase: ShotPhase;
  /** Seconds relative to release. */
  start: number;
  end: number;
}

/** One aiming step that counted towards the score. */
export interface ScoreStep {
  /** Seconds relative to release. */
  time: number;
  axis: 'vertical' | 'horizontal';
  /** Step size in degrees (between two trace samples, 1/TRACE_HZ apart). */
  size: number;
  /** 0 at the start of the score window, 1 at release. */
  weight: number;
  /** Sign of the movement: up/right positive. */
  direction: number;
}

export interface AxisScore {
  score: number;
  /** Weighted mean step of the counted steps, as an aiming speed in °/s. */
  meanSpeed: number;
  /** Steps that counted (the largest 25 %). */
  steps: ScoreStep[];
}

export interface ShotScore {
  /** 0-100; mean of the axis scores that could be computed. */
  stability: number;
  vertical?: AxisScore;
  horizontal?: AxisScore;
  /** Seconds relative to release that the score covers. */
  window: [number, number];
  /** Score loss per half second before release (sum over axes), oldest first. */
  segments: { start: number; end: number; loss: number }[];
  /** Plain-language reasons, most important first. */
  reasons: string[];
}

export interface PhaseResult {
  spans: PhaseSpan[];
  durations: Record<ShotPhase, number>;
  score?: ShotScore;
}

/** Resamples (times, values) to TRACE_HZ by taking the nearest sample. */
export function resample<T>(times: number[], values: T[], from: number, to: number): { times: number[]; values: T[] } {
  const out: T[] = [];
  const outTimes: number[] = [];
  let j = 0;
  for (let t = Math.ceil(from * TRACE_HZ) / TRACE_HZ; t <= to + 1e-9; t += 1 / TRACE_HZ) {
    while (j + 1 < times.length && Math.abs(times[j + 1] - t) <= Math.abs(times[j] - t)) j++;
    outTimes.push(Math.round(t * TRACE_HZ) / TRACE_HZ);
    out.push(values[j]);
  }
  return { times: outTimes, values: out };
}

function distance(trace: AimTrace, i: number): number {
  const h = trace.horizontal[i] ?? 0;
  return Math.hypot(h, trace.vertical[i]);
}

export function findPhases(trace: AimTrace): PhaseResult {
  const n = trace.times.length;
  const release = trace.times.findIndex((t) => t >= 0);
  const empty: Record<ShotPhase, number> = { setup: 0, draw: 0, target: 0, hold: 0, after: 0 };
  if (release <= 0) return { spans: [], durations: empty };

  // Walk back from the release: hold (within 2°), then target (within 5°)
  let holdStart = release;
  while (holdStart > 0 && distance(trace, holdStart - 1) < HOLD_RADIUS) holdStart--;
  let targetStart = holdStart;
  while (targetStart > 0 && distance(trace, targetStart - 1) < TARGET_RADIUS) targetStart--;

  // Draw: from the highest point before the target phase down to the 5° boundary
  let drawStart = targetStart;
  let highest = -Infinity;
  for (let i = targetStart - 1; i >= 0; i--) {
    const y = trace.vertical[i];
    if (y < -DRAW_SEARCH_BELOW) break;
    if (y > highest) {
      highest = y;
      drawStart = i;
    }
  }

  // Setup: back to where the bow pointed clearly down (or the start of the recording)
  let setupStart = 0;
  for (let i = drawStart - 1; i >= 0; i--) {
    if (trace.elevation[i] < START_BELOW) {
      setupStart = i + 1;
      break;
    }
  }

  const t = (i: number) => trace.times[Math.min(Math.max(i, 0), n - 1)];
  const spans: PhaseSpan[] = [
    { phase: 'setup' as const, start: t(setupStart), end: t(drawStart) },
    { phase: 'draw' as const, start: t(drawStart), end: t(targetStart) },
    { phase: 'target' as const, start: t(targetStart), end: t(holdStart) },
    { phase: 'hold' as const, start: t(holdStart), end: 0 },
    { phase: 'after' as const, start: 0, end: t(n - 1) },
  ].filter((s) => s.end > s.start);

  const durations = { ...empty };
  for (const s of spans) durations[s.phase] = s.end - s.start;

  return { spans, durations, score: stabilityScore(trace, holdStart, release) };
}

/**
 * Stability for one axis: the larger aiming steps during the hold, weighted towards
 * the release. 100 = perfectly still; ~0.01° per step (1 °/s) gives about 88.
 */
export function axisScore(
  values: number[],
  times: number[],
  start: number,
  release: number,
  axis: ScoreStep['axis'],
): AxisScore | undefined {
  const from = Math.max(start, release - SCORE_WINDOW * TRACE_HZ);
  if (release - from < 2) return undefined;

  let limit = STEP_LIMIT;
  let steps: ScoreStep[] = [];
  for (let attempt = 0; attempt <= 10 && steps.length === 0; attempt++, limit *= 2) {
    for (let i = Math.max(from, 1); i < release; i++) {
      const delta = values[i] - values[i - 1];
      const size = Math.abs(delta);
      if (size < limit) {
        steps.push({ time: times[i], axis, size, weight: (i - from) / (release - from), direction: Math.sign(delta) });
      }
    }
  }
  if (!steps.length) return undefined;

  steps.sort((a, b) => a.size - b.size);
  if (steps.length > 10) steps = steps.slice(Math.floor(steps.length * 0.75));
  const weighted = steps.reduce((sum, s) => sum + s.size * s.weight, 0) / steps.length;

  const raw = 100 - 1200 * weighted;
  return { score: raw < 10 ? (raw + 50) / 6 : raw, meanSpeed: weighted * TRACE_HZ, steps };
}

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

function stabilityScore(trace: AimTrace, holdStart: number, release: number): ShotScore | undefined {
  const { times } = trace;
  const vertical = axisScore(trace.vertical, times, holdStart, release, 'vertical');
  const h = trace.horizontal;
  const horizontal = h.every((v) => v !== undefined)
    ? axisScore(h as number[], times, holdStart, release, 'horizontal')
    : undefined;
  const parts = [vertical, horizontal].filter((s): s is AxisScore => !!s && s.score > 0);
  if (!parts.length) return undefined;
  const stability = parts.reduce((a, b) => a + b.score, 0) / parts.length;

  const from = Math.max(holdStart, release - SCORE_WINDOW * TRACE_HZ);
  const window: [number, number] = [times[from], 0];

  // Where the score was lost: each step costs 1200 * size * weight / steps / axes
  const segments: ShotScore['segments'] = [];
  for (let s = Math.floor(window[0] * 2) / 2; s < 0; s += 0.5) segments.push({ start: s, end: s + 0.5, loss: 0 });
  for (const axis of parts) {
    for (const st of axis.steps) {
      const seg = segments.find((g) => st.time >= g.start && st.time < g.end);
      if (seg) seg.loss += (1200 * st.size * st.weight) / axis.steps.length / parts.length;
    }
  }

  return { stability, vertical, horizontal, window, segments, reasons: explain(stability, vertical, horizontal, window, segments) };
}

function explain(
  stability: number,
  vertical: AxisScore | undefined,
  horizontal: AxisScore | undefined,
  window: [number, number],
  segments: ShotScore['segments'],
): string[] {
  const reasons: string[] = [];
  const holdLength = -window[0];

  if (vertical && horizontal) {
    const diff = vertical.score - horizontal.score;
    if (Math.abs(diff) >= 3) {
      const worse = diff < 0 ? 'op/ned' : 'højre/venstre';
      const better = diff < 0 ? 'højre/venstre' : 'op/ned';
      reasons.push(
        `Mest uro i ${worse} (${fmt(Math.min(vertical.score, horizontal.score), 0)}) end i ${better} (${fmt(Math.max(vertical.score, horizontal.score), 0)}).`,
      );
    } else {
      reasons.push('Uroen er nogenlunde lige stor op/ned og højre/venstre.');
    }
  } else if (vertical && !horizontal) {
    reasons.push('Kun op/ned indgår (sensoren kender ikke højre/venstre).');
  }

  const total = segments.reduce((a, s) => a + s.loss, 0);
  if (total > 0.5 && segments.length > 1) {
    const last = segments[segments.length - 1];
    const lastShare = last.loss / total;
    const worst = segments.reduce((a, b) => (b.loss > a.loss ? b : a));
    if (lastShare > 0.5) {
      reasons.push(`${fmt(lastShare * 100, 0)} % af tabet ligger det sidste halve sekund før slip – roen holder ikke helt til slippet.`);
    } else if (worst !== last) {
      reasons.push(`Mest uro ${fmt(-worst.end)}–${fmt(-worst.start)} s før slip; den sidste del var roligere.`);
    }
  }

  const all = [...(vertical?.steps ?? []), ...(horizontal?.steps ?? [])];
  const biggest = all.reduce<ScoreStep | undefined>((a, b) => (!a || b.size * b.weight > a.size * a.weight ? b : a), undefined);
  if (biggest) {
    const dir =
      biggest.axis === 'vertical' ? (biggest.direction > 0 ? 'op' : 'ned') : biggest.direction > 0 ? 'til højre' : 'til venstre';
    reasons.push(`Største enkeltbevægelse: ${fmt(biggest.size * TRACE_HZ)} °/s ${dir}, ${fmt(-biggest.time, 2)} s før slip.`);
  }

  if (holdLength < 1) {
    reasons.push(`Holdet var kort (${fmt(holdLength)} s), så scoren bygger på få målinger.`);
  }
  if (stability >= 90) reasons.push('Meget roligt hold.');
  return reasons;
}
