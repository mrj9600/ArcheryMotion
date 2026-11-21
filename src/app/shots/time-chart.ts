import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, afterNextRender, computed, input, output, signal } from '@angular/core';

export interface ChartSeries {
  name: string;
  /** Categorical color for the line only; text never uses it. */
  color: string;
  values: (number | undefined)[];
  /** Time axis for this series; defaults to the chart's `times`. */
  times?: number[];
}

/** A shaded time span behind the lines (e.g. a shot phase). */
export interface ChartBand {
  start: number;
  end: number;
  color: string;
  label: string;
}

/** Index of the time closest to t (times sorted ascending). */
function nearest(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
}

const M = { top: 10, right: 92, bottom: 24, left: 40 };
const HEIGHT = 190;

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

function ticks(min: number, max: number, target: number): number[] {
  const step = niceStep(max - min || 1, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Line chart over time (s, relative to release) with a playback cursor and hover read-out. */
@Component({
  selector: 'app-time-chart',
  imports: [DecimalPipe],
  templateUrl: './time-chart.html',
  styleUrl: './time-chart.scss',
})
export class TimeChart implements OnDestroy {
  readonly title = input.required<string>();
  readonly unit = input.required<string>();
  readonly times = input<number[]>([]);
  readonly series = input.required<ChartSeries[]>();
  readonly domain = input.required<[number, number]>();
  readonly cursor = input<number>(0);
  readonly bands = input<ChartBand[]>([]);
  readonly seek = output<number>();

  protected readonly width = signal(600);
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly hover = signal<number | undefined>(undefined);
  private resizeObserver?: ResizeObserver;

  constructor(private readonly host: ElementRef<HTMLElement>) {
    afterNextRender(() => {
      this.resizeObserver = new ResizeObserver(() => this.width.set(Math.max(240, this.host.nativeElement.clientWidth)));
      this.resizeObserver.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** Per series: its time axis and the indices of samples inside the time domain. */
  private readonly visible = computed(() => {
    const [t0, t1] = this.domain();
    return this.series().map((s) => {
      const times = s.times ?? this.times();
      const idx: number[] = [];
      times.forEach((t, i) => {
        if (t >= t0 && t <= t1) idx.push(i);
      });
      return { times, idx };
    });
  });

  protected readonly yDomain = computed<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    this.series().forEach((s, k) => {
      for (const i of this.visible()[k].idx) {
        const v = s.values[i];
        if (v === undefined || Number.isNaN(v)) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    });
    if (!Number.isFinite(lo)) return [-1, 1];
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const pad = (hi - lo || 1) * 0.08;
    return [lo - pad, hi + pad];
  });

  /** Bands clipped to the domain, with pixel positions. */
  protected readonly visibleBands = computed(() => {
    this.width();
    const [t0, t1] = this.domain();
    return this.bands()
      .filter((b) => b.end > t0 && b.start < t1)
      .map((b) => {
        const x1 = this.x(Math.max(b.start, t0));
        const x2 = this.x(Math.min(b.end, t1));
        return { ...b, x: x1, w: x2 - x1, showLabel: x2 - x1 > b.label.length * 6 + 6 };
      });
  });

  protected x(t: number): number {
    const [t0, t1] = this.domain();
    return M.left + ((t - t0) / (t1 - t0)) * (this.width() - M.left - M.right);
  }

  protected y(v: number): number {
    const [lo, hi] = this.yDomain();
    return M.top + (1 - (v - lo) / (hi - lo)) * (HEIGHT - M.top - M.bottom);
  }

  protected readonly xTicks = computed(() => ticks(this.domain()[0], this.domain()[1], Math.max(3, this.width() / 90)));
  protected readonly yTicks = computed(() => ticks(this.yDomain()[0], this.yDomain()[1], 4));

  protected readonly paths = computed(() => {
    this.width();
    return this.series().map((s, k) => {
      const { times, idx } = this.visible()[k];
      let d = '';
      let pen = false;
      for (const i of idx) {
        const v = s.values[i];
        if (v === undefined || Number.isNaN(v)) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${this.x(times[i]).toFixed(1)},${this.y(v).toFixed(1)}`;
        pen = true;
      }
      return { color: s.color, d };
    });
  });

  /** Direct labels at the last visible value of each line, nudged apart to avoid overlap. */
  protected readonly endLabels = computed(() => {
    this.width();
    const labels = this.series()
      .map((s, k) => {
        const { idx } = this.visible()[k];
        for (let j = idx.length - 1; j >= 0; j--) {
          const v = s.values[idx[j]];
          if (v !== undefined && !Number.isNaN(v)) return { name: s.name, y: this.y(v) };
        }
        return undefined;
      })
      .filter((l): l is { name: string; y: number } => !!l)
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
    return labels;
  });

  protected readonly hoverInfo = computed(() => {
    const t = this.hover();
    if (t === undefined) return undefined;
    const rows = this.series().map((s, k) => {
      const { times } = this.visible()[k];
      const value = times.length ? s.values[nearest(times, t)] : undefined;
      return { name: s.name, color: s.color, value: value === undefined || Number.isNaN(value) ? undefined : value };
    });
    return { t, x: this.x(t), rows };
  });

  private timeAt(ev: PointerEvent): number {
    const rect = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const [t0, t1] = this.domain();
    const frac = (px - M.left) / (this.width() - M.left - M.right);
    return Math.min(t1, Math.max(t0, t0 + frac * (t1 - t0)));
  }

  protected onMove(ev: PointerEvent): void {
    this.hover.set(this.timeAt(ev));
    if (ev.buttons === 1) this.seek.emit(this.timeAt(ev));
  }

  protected onDown(ev: PointerEvent): void {
    this.seek.emit(this.timeAt(ev));
  }
}
