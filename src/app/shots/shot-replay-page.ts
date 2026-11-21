import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Vector3 } from 'three';
import { BOW_SPACING, MotionScene, ScenePose, TrailMode } from '../scene/motion-scene';
import { analyzeShot, BowTrack, DISPLACEMENT_WINDOW, indexAt } from './shot-analysis';
import { ShotRecorder } from './shot-recorder.service';
import { Shot } from './shot.model';
import { PHASES, TRACE_HZ } from './shot-phases';
import { ChartBand, ChartSeries, TimeChart } from './time-chart';

/** Categorical slots 1-3 (dark steps), validated on the panel surface. */
const COLORS = ['#3987e5', '#d95926', '#199e70'];

@Component({
  selector: 'app-shot-replay-page',
  imports: [MotionScene, TimeChart, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './shot-replay-page.html',
  styleUrl: './shot-replay-page.scss',
})
export class ShotReplayPage implements OnDestroy {
  protected readonly recorder = inject(ShotRecorder);
  private readonly scene = viewChild(MotionScene);

  protected readonly selectedId = signal<number | undefined>(undefined);
  protected readonly shot = computed<Shot | undefined>(() => {
    const shots = this.recorder.shots();
    return shots.find((s) => s.id === this.selectedId()) ?? shots[0];
  });
  protected readonly analysis = computed(() => {
    const shot = this.shot();
    return shot ? analyzeShot(shot) : undefined;
  });

  protected readonly time = signal(-0.5);
  protected readonly playing = signal(false);
  protected readonly speed = signal(0.25);
  protected readonly scale = signal(5);
  protected readonly trailMode = signal<TrailMode>('grip');
  protected readonly speeds = [0.05, 0.1, 0.25, 0.5, 1];
  protected readonly scales = [1, 2, 5, 10];

  protected readonly displacementDomain = DISPLACEMENT_WINDOW;
  protected readonly angleDomain = computed<[number, number]>(() => {
    const r = this.analysis()?.range ?? [-1, 1];
    return [r[0], Math.min(r[1], 1.5)];
  });

  protected readonly phaseInfo = PHASES;
  protected readonly phases = computed(() => this.analysis()?.bow?.phases);
  protected readonly score = computed(() => this.phases()?.score);

  /** Phase spans as shaded bands in the angle charts. */
  protected readonly phaseBands = computed<ChartBand[]>(() =>
    (this.phases()?.spans ?? []).map((s) => {
      const p = PHASES.find((x) => x.id === s.phase)!;
      return { start: s.start, end: s.end, color: p.color, label: p.label };
    }),
  );

  /** Phase at the current playback time, for the 3D overlay. */
  protected readonly currentPhase = computed(() => {
    const t = this.time();
    const span = this.phases()?.spans.find((s) => t >= s.start && t < s.end);
    return span ? PHASES.find((p) => p.id === span.phase)?.label : undefined;
  });

  /** Aiming speed (°/s) during the score window, per axis. */
  protected readonly speedSeries = computed<ChartSeries[]>(() => {
    const trace = this.analysis()?.bow?.trace;
    const score = this.score();
    if (!trace || !score) return [];
    const speed = (v: (number | undefined)[]) =>
      v.map((x, i) => (i === 0 || x === undefined || v[i - 1] === undefined ? undefined : Math.abs(x - v[i - 1]!) * TRACE_HZ));
    const series: ChartSeries[] = [{ name: 'Op/ned', color: COLORS[0], times: trace.times, values: speed(trace.vertical) }];
    if (score.horizontal) series.push({ name: 'Højre/venstre', color: COLORS[1], times: trace.times, values: speed(trace.horizontal) });
    return series;
  });

  protected readonly scoreDomain = computed<[number, number]>(() => [this.score()?.window[0] ?? -3, 0]);

  /** Score loss per half second, scaled for the bar list. */
  protected readonly lossBars = computed(() => {
    const segs = this.score()?.segments ?? [];
    const max = Math.max(...segs.map((s) => s.loss), 0.001);
    return segs.map((s) => ({ ...s, width: (s.loss / max) * 100 }));
  });

  /** Score of the other bow sensors, for comparison. */
  protected readonly otherBowScores = computed(() => {
    const a = this.analysis();
    if (!a) return [];
    return a.bows.filter((b) => b !== a.bow).map((b) => ({ name: b.name, score: b.phases?.score?.stability }));
  });

  /** Stability per recorded shot, for the shot list. */
  protected readonly shotScores = computed(
    () => new Map(this.recorder.shots().map((s) => [s.id, analyzeShot(s).bow?.phases?.score?.stability])),
  );

  protected readonly displacementSeries = computed<ChartSeries[]>(() => {
    const d = this.analysis()?.bow?.displacement ?? [];
    return [
      { name: 'Frem', color: COLORS[0], values: d.map((x) => x?.forward) },
      { name: 'Op', color: COLORS[1], values: d.map((x) => x?.up) },
      { name: 'Højre', color: COLORS[2], values: d.map((x) => x?.right) },
    ];
  });

  /** With more than one bow sensor: one chart per angle, one line per sensor (color = sensor). */
  protected readonly comparisonCharts = computed(() => {
    const bows = this.analysis()?.bows ?? [];
    if (bows.length < 2) return [];
    const make = (title: string, pick: (a: BowTrack['angles'][number]) => number) => ({
      title,
      series: bows.map((b, i) => ({
        name: b.name,
        color: COLORS[i % COLORS.length],
        times: b.times,
        values: b.angles.map(pick),
      })) as ChartSeries[],
    });
    return [
      make('Kant i forhold til slippet', (a) => a.cant),
      make('Op/ned i forhold til slippet', (a) => a.vertical),
      make('Højre/venstre i forhold til slippet', (a) => a.horizontal),
    ];
  });

  /** Which bow sensor is drawn where in 3D. */
  protected readonly bowPlacement = computed(() =>
    (this.analysis()?.bows ?? []).map((b, i) => ({ name: b.name, place: i === 0 ? 'midt' : `${i * 35} cm til højre` })),
  );

  protected readonly angleSeries = computed<ChartSeries[]>(() => {
    const a = this.analysis()?.bow?.angles ?? [];
    return [
      { name: 'Op/ned', color: COLORS[0], values: a.map((x) => x.vertical) },
      { name: 'Kant', color: COLORS[1], values: a.map((x) => x.cant) },
      { name: 'Højre/venstre', color: COLORS[2], values: a.map((x) => x.horizontal) },
    ];
  });

  /** Values at the current playback time, for the read-out. */
  protected readonly current = computed(() => {
    const bow = this.analysis()?.bow;
    if (!bow) return undefined;
    const i = indexAt(bow.times, this.time());
    return { angles: bow.angles[i], displacement: bow.displacement[i] };
  });

  protected readonly poses = (): ScenePose[] => {
    const analysis = this.analysis();
    if (!analysis) return [];
    const t = this.time();
    return analysis.tracks.map((track) => {
      const i = indexAt(track.times, t);
      const pose: ScenePose = { key: track, role: track.role, quaternion: track.quats[i] };
      const offset = new Vector3();
      const bowIndex = analysis.bows.indexOf(track as BowTrack);
      if (bowIndex > 0) offset.x += BOW_SPACING * bowIndex;
      if (track === analysis.bow) {
        const d = this.displacementAt(i, t);
        if (d) offset.add(new Vector3(d.right, d.up, -d.forward).multiplyScalar(this.scale() / 100));
      }
      pose.offset = offset;
      return pose;
    });
  };

  private frame = 0;
  private lastFrame = 0;

  constructor() {
    // New shot selected: rewind
    effect(() => {
      this.shot();
      this.playing.set(false);
      this.seek(-0.5);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
  }

  /** Displacement at sample i; holds the last estimate after the window, zero before it. */
  private displacementAt(i: number, t: number) {
    const bow = this.analysis()?.bow;
    if (!bow) return undefined;
    if (bow.displacement[i]) return bow.displacement[i];
    if (t < DISPLACEMENT_WINDOW[0]) return { forward: 0, up: 0, right: 0 };
    for (let k = i; k >= 0; k--) if (bow.displacement[k]) return bow.displacement[k];
    return undefined;
  }

  protected select(shot: Shot): void {
    this.selectedId.set(shot.id);
  }

  protected seek(t: number): void {
    this.time.set(t);
    this.scene()?.clearTrail();
  }

  protected togglePlay(): void {
    if (this.playing()) {
      this.playing.set(false);
      cancelAnimationFrame(this.frame);
      return;
    }
    const range = this.analysis()?.range;
    if (!range) return;
    if (this.time() >= range[1] - 0.01) this.seek(Math.max(range[0], -0.5));
    this.playing.set(true);
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      const next = this.time() + dt * this.speed();
      if (next >= range[1]) {
        this.time.set(range[1]);
        this.playing.set(false);
        return;
      }
      this.time.set(next);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  protected onScrub(value: string): void {
    this.playing.set(false);
    cancelAnimationFrame(this.frame);
    this.seek(Number(value));
  }

  protected setTrailMode(mode: TrailMode): void {
    this.trailMode.set(mode);
    this.scene()?.clearTrail();
  }

  protected setScale(value: string): void {
    this.scale.set(Number(value));
    this.scene()?.clearTrail();
  }

  protected resetView(): void {
    this.scene()?.resetView();
  }
}
