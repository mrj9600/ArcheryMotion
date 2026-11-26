import { Component, computed, effect, input, OnDestroy, signal } from '@angular/core';
import { ReplayCube } from './replay-cube';
import { armPose, cubePose, ReplayTrace, softEdge, STEP_MS } from './shot-replay';

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
  imports: [ReplayCube],
  template: `
    @let tr = trace();
    <div class="controls">
      <div class="segmented" role="group" aria-label="Visning">
        <button [class.on]="mode() === '3d'" (click)="mode.set('3d')">3D</button>
        <button [class.on]="mode() === '2d'" (click)="mode.set('2d')">2D</button>
      </div>
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
      @if (mode() === '3d') {
        <label>
          Drejning
          <select [value]="magTurn()" (change)="magTurn.set(+$any($event.target).value)">
            @for (m of turnMags; track m) {
              <option [value]="m">×{{ m }}</option>
            }
          </select>
        </label>
      }
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
    @if (mode() === '3d') {
      <div class="cubes">
        <figure>
          <figcaption>Buen set bagfra</figcaption>
          <app-replay-cube [trace]="tr" [index]="index()" [magMove]="mag()" [magTurn]="magTurn()" [others]="others()" [showOthers]="showOthers()" />
          <p class="values">{{ poseLabel() }}</p>
        </figure>
        @for (a of tr.arms; track a.label; let k = $index) {
          <figure>
            <figcaption>{{ a.label }}</figcaption>
            <app-replay-cube [trace]="tr" [arm]="k" [index]="index()" [magMove]="mag()" [magTurn]="magTurn()" [others]="others()" [showOthers]="showOthers()" />
            <p class="values">{{ armLabel(k) }}</p>
          </figure>
        }
      </div>
      <p class="legend">
        Kassen er buens håndsektion set bagfra: den lyse flade er toppen, den blå flade og pilen peger mod målet. Træk i billedet for at se fra en
        anden vinkel, knib eller rul for at zoome. Armens kasse ligger langs armen med den blå ende yderst og drejer om armens længderetning.
        Langt ude trykkes billedet sammen, så løftet og nedtagningen bliver i rummet; tallene er de rigtige.
        @if (split()) {
          Kassen flytter sig med buearmen (buearmen går) og drejer med det, buen gør i hånden: vrid til venstre/højre, toppen mod/væk fra dig og cant.
        } @else {
          Kassen flytter sig derhen, hvor buen peger, og drejer kun med cant. Vrid i hånden kan først skilles fra, når der er en sensor på buearmen.
        }
      </p>
    } @else {
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
    }
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
    .segmented {
      display: flex;
    }
    .segmented button {
      background: var(--border);
      color: var(--text);
      border-radius: 0;
      padding: 6px 14px;
    }
    .segmented button:first-child {
      border-radius: 6px 0 0 6px;
    }
    .segmented button:last-child {
      border-radius: 0 6px 6px 0;
    }
    .segmented button.on {
      background: var(--accent);
      color: var(--on-strong);
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
    .cubes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
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
  readonly mode = signal<'3d' | '2d'>('3d');
  readonly turnMags = [1, 2, 5, 10];
  readonly magTurn = signal(2);

  /** The current point of the trace. */
  readonly index = computed(() => this.indexAt(this.time()));

  /** True when the bow's turning in the hand is split from the bow arm's movement. */
  readonly split = computed(() => cubePose(this.trace(), 0).split);

  readonly poseLabel = computed(() => {
    const p = cubePose(this.trace(), this.index());
    const f = (x: number) => Math.abs(x).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '°';
    const move = `${p.split ? 'Buearmen' : 'Buen'}: ${p.up >= 0 ? 'op' : 'ned'} ${f(p.up)}, ${p.right >= 0 ? 'højre' : 'venstre'} ${f(p.right)}`;
    const turn = p.split
      ? ` · i hånden: vrid ${p.twist >= 0 ? 'højre' : 'venstre'} ${f(p.twist)}, toppen ${p.tip >= 0 ? 'mod dig' : 'væk fra dig'} ${f(p.tip)}`
      : '';
    return `${move}${turn} · cant ${p.cant >= 0 ? 'højre' : 'venstre'} ${f(p.cant)} (fra slippet)`;
  });

  armLabel(k: number): string {
    const arm = this.trace().arms[k];
    if (!arm) return '';
    const p = armPose(arm, this.index());
    const f = (x: number) => Math.abs(x).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '°';
    return `${p.up >= 0 ? 'op' : 'ned'} ${f(p.up)}, ${p.right >= 0 ? 'højre' : 'venstre'} ${f(p.right)} · drejet om armen ${p.cant >= 0 ? 'højre' : 'venstre'} ${f(p.cant)} (fra slippet)`;
  }

  /** A position in view units, squeezed so far movements stay in the view. */
  private xy(right: number, up: number): [number, number] {
    const k = this.scale();
    return [softEdge(right * k, 100), -softEdge(up * k, 100)];
  }

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

  private indexAt(t: number): number {
    const tr = this.trace();
    return Math.max(0, Math.min(tr.t.length - 1, Math.round((t - tr.t[0]) / STEP_MS)));
  }

  /** The trail of one phase up to the current time, as SVG points. */
  points(v: View, from: number, to: number): string {
    const tr = this.trace();
    const now = this.time();
    const parts: string[] = [];
    // Each phase starts at the last point of the one before, so the trail is unbroken
    const first = Math.max(0, this.indexAt(Math.max(from, tr.t[0])) - (from > -Infinity ? 1 : 0));
    const last = this.indexAt(Math.min(to, now));
    if (tr.t[first] > now) return '';
    for (let i = first; i <= last; i++) {
      const [x, y] = this.xy(v.right[i], v.up[i]);
      parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }

  /** Another shot's trail up to the same time before/after its release. */
  otherPoints(o: ReplayTrace, v: View): string {
    const tr = this.trace();
    const which = this.views().indexOf(v);
    const src = which === 0 ? o.bow : o.arms[which - 1];
    if (!src || o.shotId === tr.shotId) return '';
    const now = this.time();
    const parts: string[] = [];
    for (let i = 0; i < o.t.length && o.t[i] <= now; i++) {
      const [x, y] = this.xy(src.right[i], src.up[i]);
      parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }

  /** The current point and the bow's tilt. */
  at(v: View): { x: number; y: number; sin: number; cos: number } {
    const i = this.indexAt(this.time());
    const cant = ((v.cant?.[i] ?? 0) * Math.PI) / 180;
    const [x, y] = this.xy(v.right[i], v.up[i]);
    return { x, y, sin: Math.sin(cant), cos: Math.cos(cant) };
  }

  valueLabel(v: View): string {
    const i = this.indexAt(this.time());
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
