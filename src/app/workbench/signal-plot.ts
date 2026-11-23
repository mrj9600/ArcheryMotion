import { Component, ElementRef, OnDestroy, afterNextRender, effect, input, output, viewChild } from '@angular/core';
import { Channel, TEXT_COLOR, indexAt } from './analysis';

export interface Marker {
  time: number;
  kind: 'shot' | 'release' | 'warning';
}

export interface Span {
  start: number;
  end: number;
  kind: 'hold' | 'detected' | 'window' | 'pause' | 'lost';
}

const PAD = { left: 46, right: 8, top: 6, bottom: 18 };
const TICK_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
/** A longer time between two samples is a gap (pause or lost connection), not drawn (ms). */
const GAP_MS = 500;

const MARKER_COLORS: Record<Marker['kind'], string> = { shot: '#e5463d', release: '#2b9fd8', warning: '#d69e2e' };

/**
 * Time-series plot on a canvas. Many samples per pixel are drawn as min/max columns, so
 * whole sessions draw fast. Drag to pan, wheel or pinch to zoom, click to pick a time.
 */
@Component({
  selector: 'app-signal-plot',
  template: `
    @if (showLegend()) {
      <div class="legend">
        <strong>{{ channel().label }}</strong>
        <span class="muted">{{ channel().unit }}</span>
        @for (s of channel().series; track s.label) {
          <span class="item" [class.off]="hidden.has(s.label)" (click)="toggle(s.label)">
            <i [style.background]="s.color === text ? 'currentColor' : s.color"></i>{{ s.label }}
          </span>
        }
      </div>
    }
    <canvas
      #canvas
      [style.height.px]="height()"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="up($event)"
      (wheel)="wheel($event)"
    ></canvas>
  `,
  styles: `
    :host {
      display: block;
    }
    canvas {
      display: block;
      width: 100%;
      touch-action: none;
      cursor: grab;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: center;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .item {
      cursor: pointer;
      user-select: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .item.off {
      opacity: 0.35;
    }
    i {
      display: inline-block;
      width: 12px;
      height: 3px;
      border-radius: 2px;
    }
  `,
})
export class SignalPlot implements OnDestroy {
  readonly channel = input.required<Channel>();
  readonly t = input.required<Float64Array>();
  /** Visible time range (ms). */
  readonly range = input.required<[number, number]>();
  readonly markers = input<Marker[]>([]);
  readonly spans = input<Span[]>([]);
  readonly height = input(140);
  readonly showLegend = input(true);

  /** A time was clicked. */
  readonly picked = output<number>();
  /** Requested new visible range (pan or zoom). */
  readonly rangeChange = output<[number, number]>();

  readonly text = TEXT_COLOR;
  readonly hidden = new Set<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private resize?: ResizeObserver;
  private pointers = new Map<number, number>();
  private dragStart?: { x: number; range: [number, number]; moved: boolean };
  private pinchStart?: { dist: number; range: [number, number]; center: number };

  constructor() {
    effect(() => {
      this.channel();
      this.t();
      this.range();
      this.markers();
      this.spans();
      this.height();
      this.draw();
    });
    afterNextRender(() => {
      this.resize = new ResizeObserver(() => this.draw());
      this.resize.observe(this.canvas().nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
  }

  toggle(label: string): void {
    if (this.hidden.has(label)) this.hidden.delete(label);
    else this.hidden.add(label);
    this.draw();
  }

  down(e: PointerEvent): void {
    const el = this.canvas().nativeElement;
    el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, e.offsetX);
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.offsetX, range: this.range(), moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.dragStart = undefined;
      this.pinchStart = { dist: Math.abs(a - b) || 1, range: this.range(), center: this.timeAt((a + b) / 2) };
    }
  }

  move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, e.offsetX);
    const [t0, t1] = this.range();
    if (this.pinchStart && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const factor = this.pinchStart.dist / (Math.abs(a - b) || 1);
      this.zoomAround(this.pinchStart.range, this.pinchStart.center, factor);
    } else if (this.dragStart) {
      const dx = e.offsetX - this.dragStart.x;
      if (Math.abs(dx) > 3) this.dragStart.moved = true;
      if (!this.dragStart.moved) return;
      const dt = (-dx / this.plotWidth()) * (t1 - t0);
      const [s0, s1] = this.dragStart.range;
      this.rangeChange.emit([s0 + dt, s1 + dt]);
    }
  }

  up(e: PointerEvent): void {
    if (this.dragStart && !this.dragStart.moved && this.pointers.size === 1) this.picked.emit(this.timeAt(e.offsetX));
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = undefined;
    if (this.pointers.size === 0) this.dragStart = undefined;
  }

  wheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomAround(this.range(), this.timeAt(e.offsetX), Math.exp(e.deltaY * 0.0015));
  }

  private zoomAround(range: [number, number], center: number, factor: number): void {
    const [t0, t1] = range;
    const width = Math.max(50, (t1 - t0) * factor);
    const f = (center - t0) / (t1 - t0);
    this.rangeChange.emit([center - f * width, center + (1 - f) * width]);
  }

  private plotWidth(): number {
    return Math.max(1, this.canvas().nativeElement.clientWidth - PAD.left - PAD.right);
  }

  private timeAt(x: number): number {
    const [t0, t1] = this.range();
    return t0 + ((x - PAD.left) / this.plotWidth()) * (t1 - t0);
  }

  private draw(): void {
    const canvas = this.canvas?.()?.nativeElement;
    if (!canvas) return;
    const cssW = canvas.clientWidth;
    const cssH = this.height();
    if (!cssW) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const style = getComputedStyle(canvas);
    const textColor = style.color;
    const gridColor = style.getPropertyValue('--border').trim() || '#888';
    const w = cssW - PAD.left - PAD.right;
    const h = cssH - PAD.top - PAD.bottom;
    const [t0, t1] = this.range();
    const t = this.t();
    const x = (time: number) => PAD.left + ((time - t0) / (t1 - t0)) * w;

    // Visible samples, plus one on each side so lines reach the edges
    const i0 = Math.max(0, indexAt(t, t0) - 1);
    const i1 = Math.min(t.length, indexAt(t, t1) + 1);
    const series = this.channel().series.filter((s) => !this.hidden.has(s.label));

    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (let i = i0; i < i1; i++) {
        const v = s.values[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min)) {
      min = -1;
      max = 1;
    }
    if (max - min < 1e-6) {
      min -= 1;
      max += 1;
    }
    const padY = (max - min) * 0.06;
    min -= padY;
    max += padY;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * h;

    // Spans (holds, detected holds, the window shown in the main plots)
    for (const span of this.spans()) {
      const a = Math.max(PAD.left, x(span.start));
      const b = Math.min(PAD.left + w, x(span.end));
      if (b <= a) continue;
      if (span.kind === 'window') {
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(a, PAD.top, b - a, h);
      } else if (span.kind === 'pause' || span.kind === 'lost') {
        ctx.fillStyle = span.kind === 'pause' ? 'rgba(128, 128, 128, 0.22)' : 'rgba(229, 62, 62, 0.16)';
        ctx.fillRect(a, PAD.top, b - a, h);
      } else {
        ctx.fillStyle = span.kind === 'hold' ? 'rgba(62, 224, 143, 0.18)' : 'rgba(43, 159, 216, 0.16)';
        const top = span.kind === 'hold' ? PAD.top : PAD.top + h * 0.85;
        ctx.fillRect(a, top, b - a, span.kind === 'hold' ? h : h * 0.15);
      }
    }

    // Grid and axes
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(min, max, Math.max(2, Math.floor(h / 30)))) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.globalAlpha = v === 0 ? 0.9 : 0.4;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yy);
      ctx.lineTo(PAD.left + w, yy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(formatNumber(v), PAD.left - 4, yy);
    }
    const span = (t1 - t0) / 1000;
    const step = TICK_STEPS.find((s) => span / s <= w / 70) ?? 600;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = Math.ceil(t0 / 1000 / step) * step; s * 1000 <= t1; s += step) {
      const xx = Math.round(x(s * 1000)) + 0.5;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(xx, PAD.top);
      ctx.lineTo(xx, PAD.top + h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(formatSeconds(s, step), xx, PAD.top + h + 3);
    }

    // Curves: min/max per pixel column when samples are denser than pixels
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, w, h);
    ctx.clip();
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    for (const s of series) {
      ctx.strokeStyle = s.color === TEXT_COLOR ? textColor : s.color;
      ctx.beginPath();
      let col = NaN;
      let first = 0;
      let last = 0;
      let lo = 0;
      let hi = 0;
      let started = false;
      const flush = () => {
        if (Number.isNaN(col)) return;
        if (!started) {
          ctx.moveTo(col, y(first));
          started = true;
        } else ctx.lineTo(col, y(first));
        if (lo !== hi) {
          ctx.lineTo(col, y(lo));
          ctx.lineTo(col, y(hi));
        }
        ctx.lineTo(col, y(last));
      };
      for (let i = i0; i < i1; i++) {
        // Do not draw a line across a pause in the recording
        if (i > i0 && t[i] - t[i - 1] > GAP_MS) {
          flush();
          col = NaN;
          started = false;
        }
        const v = s.values[i];
        if (Number.isNaN(v)) continue;
        const c = Math.round(x(t[i]) * 2) / 2;
        if (c !== col) {
          flush();
          col = c;
          first = lo = hi = last = v;
        } else {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          last = v;
        }
      }
      flush();
      ctx.stroke();
    }

    // Markers
    for (const m of this.markers()) {
      const xx = x(m.time);
      if (xx < PAD.left || xx > PAD.left + w) continue;
      ctx.strokeStyle = MARKER_COLORS[m.kind];
      ctx.lineWidth = m.kind === 'shot' ? 2 : 1.5;
      ctx.setLineDash(m.kind === 'release' ? [5, 4] : m.kind === 'warning' ? [2, 3] : []);
      ctx.beginPath();
      ctx.moveTo(xx, PAD.top);
      ctx.lineTo(xx, PAD.top + h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function niceTicks(min: number, max: number, count: number): number[] {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return out;
}

function formatNumber(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
}

function formatSeconds(s: number, step: number): string {
  if (step >= 1 && s >= 60) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`;
  }
  return s.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0).replace('.', ',');
}
