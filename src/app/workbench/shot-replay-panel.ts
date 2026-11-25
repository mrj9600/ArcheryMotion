import { Component, computed, effect, input, OnDestroy, signal } from '@angular/core';
import { ReplayTrace, STEP_MS } from './shot-replay';

/** Half the width of a view in degrees at magnification 1. */
const VIEW_DEG = 20;

/** Phases of the trail, coloured like SCATT: the last second and last 0.2 s stand out. */
const PHASES: { key: string; from: number; to: number }[] = [
  { key: 'early', from: -Infinity, to: -1000 },
  { key: 'last', from: -1000, to: -200 },
  { key: 'final', from: -200, to: 0 },
  { key: 'after', from: 0, to: Infinity },
];

interface View {
  title: string;
  /** Degrees, 0 at the release. */
  up: Float32Array;
  right: Float32Array;
  cant?: Float32Array;
}

/**
 * Plays one shot back from the raise to the let-down: where the bow points (seen from
 * behind, the cant as the bow's tilt) and how each arm sensor moves, magnified so small
 * movements show. Other shots can be shown faintly on the same time to compare.
 */
@Component({
  selector: 'app-shot-replay',
  template: `
    @let tr = trace();
    <div class="controls">
      <button (click)="toggle()">{{ playing() ? 'Pause' : 'Afspil' }}</button>
      <label>
        Hastighed
        <select [value]="speed()" (change)="speed.set(+$any($event.target).value)">
          @for (s of speeds; track s) {
            <option [value]="s">{{ s === 1 ? 'normal' : s + '×' }}</option>
          }
        </select>
      </label>
      <label>
        Forstørrelse
        <select [value]="mag()" (change)="mag.set(+$any($event.target).value)">
          @for (m of mags; track m) {
            <option [value]="m">×{{ m }}</option>
          }
        </select>
      </label>
      <label class="check">
        <input type="checkbox" [checked]="showOthers()" (change)="showOthers.set($any($event.target).checked)" />
        Vis de andre skud
      </label>
    </div>
    <input class="scrub" type="range" [min]="tr.t[0]" [max]="tr.t[tr.t.length - 1]" [step]="step" [value]="time()" (input)="seek(+$any($event.target).value)" />
    <p class="clock">
      Skud {{ tr.number }}{{ tr.rating === 'good' ? ' 👍' : tr.rating === 'bad' ? ' 👎' : '' }} ·
      <strong>{{ timeLabel() }}</strong>
    </p>
    <div class="views">
      @for (v of views(); track v.title) {
        <figure>
          <figcaption>{{ v.title }}</figcaption>
          <svg viewBox="-100 -100 200 200" role="img" [attr.aria-label]="v.title">
            <line class="axis" x1="-100" y1="0" x2="100" y2="0" />
            <line class="axis" x1="0" y1="-100" x2="0" y2="100" />
            <text class="tick" x="96" y="-4" text-anchor="end">højre</text>
            <text class="tick" x="4" y="-92">op</text>
            <text class="tick" x="-96" y="96">{{ scaleLabel() }}</text>
            @if (showOthers()) {
              @for (o of others(); track o.shotId) {
                <polyline class="other" [attr.points]="otherPoints(o, v)" />
              }
            }
            @for (ph of phases; track ph.key) {
              <polyline [class]="'trail ' + ph.key" [attr.points]="points(v, ph.from, ph.to)" />
            }
            @let p = at(v);
            @if (v.cant) {
              <line class="bow" [attr.x1]="p.x - p.sin * 30" [attr.y1]="p.y + p.cos * 30" [attr.x2]="p.x + p.sin * 30" [attr.y2]="p.y - p.cos * 30" />
            }
            <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
          </svg>
          <p class="values">{{ valueLabel(v) }}</p>
        </figure>
      }
    </div>
    <p class="legend">
      <span class="sw early"></span> før det sidste sekund <span class="sw last"></span> sidste sekund
      <span class="sw final"></span> sidste 0,2 s <span class="sw after"></span> efter slippet
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .controls label {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 14px;
    }
    .scrub {
      width: 100%;
      margin: 10px 0 4px;
    }
    .clock {
      margin: 0 0 8px;
    }
    .views {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    figure {
      margin: 0;
    }
    figcaption {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    svg {
      width: 100%;
      max-width: 360px;
      aspect-ratio: 1;
      display: block;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .axis {
      stroke: var(--border);
      stroke-width: 0.6;
    }
    .tick {
      fill: var(--muted);
      font-size: 8px;
    }
    polyline {
      fill: none;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .other {
      stroke: var(--muted);
      stroke-width: 0.6;
      opacity: 0.35;
    }
    .trail {
      stroke-width: 1.4;
    }
    .early {
      stroke: var(--muted);
    }
    .last {
      stroke: var(--accent);
    }
    .final {
      stroke: var(--warn);
    }
    .after {
      stroke: var(--danger);
    }
    .bow {
      stroke: var(--text);
      stroke-width: 2;
    }
    .dot {
      fill: var(--text);
    }
    .values {
      font-size: 13px;
      margin: 4px 0 0;
      font-variant-numeric: tabular-nums;
    }
    .legend {
      font-size: 13px;
      color: var(--muted);
    }
    .sw {
      display: inline-block;
      width: 14px;
      height: 3px;
      margin: 0 4px 3px 10px;
      vertical-align: middle;
    }
    .sw.early {
      background: var(--muted);
    }
    .sw.last {
      background: var(--accent);
    }
    .sw.final {
      background: var(--warn);
    }
    .sw.after {
      background: var(--danger);
    }
  `,
})
export class ShotReplay implements OnDestroy {
  readonly trace = input.required<ReplayTrace>();
  /** Other shots of the recording, shown faintly. */
  readonly others = input<ReplayTrace[]>([]);

  readonly speeds = [1, 0.5, 0.25, 0.1];
  readonly mags = [1, 2, 5, 10, 20];
  readonly phases = PHASES;
  readonly step = STEP_MS;

  readonly time = signal(0);
  readonly playing = signal(false);
  readonly speed = signal(0.25);
  readonly mag = signal(5);
  readonly showOthers = signal(false);

  private frame?: number;
  private lastFrame?: number;

  constructor() {
    // A new shot starts from the raise
    effect(() => {
      const tr = this.trace();
      this.stop();
      this.time.set(tr.t[0]);
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  readonly views = computed<View[]>(() => {
    const tr = this.trace();
    return [
      { title: 'Buen set bagfra', up: tr.bow.up, right: tr.bow.right, cant: tr.bow.cant },
      ...tr.arms.map((a) => ({ title: a.label, up: a.up, right: a.right })),
    ];
  });

  /** Degrees per view unit (the view is ±100 units). */
  private readonly scale = computed(() => 100 / (VIEW_DEG / this.mag()));

  readonly scaleLabel = computed(() => {
    const half = VIEW_DEG / this.mag();
    return `±${half.toLocaleString('da-DK', { maximumFractionDigits: 1 })}°`;
  });

  readonly timeLabel = computed(() => {
    const t = this.time() / 1000;
    const s = Math.abs(t).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return t < 0 ? `${s} s før slippet` : t === 0 ? 'slippet' : `${s} s efter slippet`;
  });

  private index(t: number): number {
    const tr = this.trace();
    return Math.max(0, Math.min(tr.t.length - 1, Math.round((t - tr.t[0]) / STEP_MS)));
  }

  /** The trail of one phase up to the current time, as SVG points. */
  points(v: View, from: number, to: number): string {
    const tr = this.trace();
    const now = this.time();
    const k = this.scale();
    const parts: string[] = [];
    // Each phase starts at the last point of the one before, so the trail is unbroken
    const first = Math.max(0, this.index(Math.max(from, tr.t[0])) - (from > -Infinity ? 1 : 0));
    const last = this.index(Math.min(to, now));
    if (tr.t[first] > now) return '';
    for (let i = first; i <= last; i++) parts.push(`${(v.right[i] * k).toFixed(1)},${(-v.up[i] * k).toFixed(1)}`);
    return parts.join(' ');
  }

  /** Another shot's trail up to the same time before/after its release. */
  otherPoints(o: ReplayTrace, v: View): string {
    const tr = this.trace();
    const which = this.views().indexOf(v);
    const src = which === 0 ? o.bow : o.arms[which - 1];
    if (!src || o.shotId === tr.shotId) return '';
    const k = this.scale();
    const now = this.time();
    const parts: string[] = [];
    for (let i = 0; i < o.t.length && o.t[i] <= now; i++) parts.push(`${(src.right[i] * k).toFixed(1)},${(-src.up[i] * k).toFixed(1)}`);
    return parts.join(' ');
  }

  /** The current point and the bow's tilt. */
  at(v: View): { x: number; y: number; sin: number; cos: number } {
    const i = this.index(this.time());
    const k = this.scale();
    const cant = ((v.cant?.[i] ?? 0) * Math.PI) / 180;
    return { x: v.right[i] * k, y: -v.up[i] * k, sin: Math.sin(cant), cos: Math.cos(cant) };
  }

  valueLabel(v: View): string {
    const i = this.index(this.time());
    const f = (x: number) => Math.abs(x).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '°';
    const up = `${v.up[i] >= 0 ? 'op' : 'ned'} ${f(v.up[i])}`;
    const right = `${v.right[i] >= 0 ? 'højre' : 'venstre'} ${f(v.right[i])}`;
    const cant = v.cant ? ` · cant ${v.cant[i] >= 0 ? 'højre' : 'venstre'} ${f(v.cant[i])}` : '';
    return `${up} · ${right}${cant} (fra slippet)`;
  }

  seek(t: number): void {
    this.stop();
    this.time.set(t);
  }

  toggle(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    const tr = this.trace();
    if (this.time() >= tr.t[tr.t.length - 1]) this.time.set(tr.t[0]);
    this.playing.set(true);
    this.lastFrame = undefined;
    const tick = (now: number) => {
      const end = this.trace().t[this.trace().t.length - 1];
      if (this.lastFrame !== undefined) this.time.set(Math.min(end, this.time() + (now - this.lastFrame) * this.speed()));
      this.lastFrame = now;
      if (this.time() >= end) {
        this.stop();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.playing.set(false);
  }
}
