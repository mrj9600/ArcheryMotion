import { Injectable, computed, signal } from '@angular/core';
import { Recording } from '../recording/recording-file';
import { HOLD_LIMITS, HoldLimits } from '../training/hold-detector';
import { RELEASE_G } from '../recording/release-detector';
import { SENSOR_ROLES } from '../sensors/sensor.model';
import { Channel, channelsOf, detectHolds, detectReleases } from './analysis';
import { Marker, Span } from './signal-plot';

export interface SensorView {
  index: number;
  name: string;
  role: string;
  t: Float64Array;
  channels: Channel[];
}

/** How far a detected release may be from a recorded shot and still count as the same (ms). */
const MATCH_MS = 400;

/**
 * State of the analysis workbench. Kept in a service so the loaded recording survives
 * navigating to other pages.
 */
@Injectable({ providedIn: 'root' })
export class Workbench {
  readonly recording = signal<Recording | undefined>(undefined);
  readonly source = signal('');

  /** Visible time range (ms since session start). */
  readonly range = signal<[number, number]>([0, 1]);
  /** Shown plots, as "sensorIndex:channelKey". */
  readonly shown = signal<Set<string>>(new Set());
  /** Sensor the detection runs on. */
  readonly detectSensor = signal(0);

  readonly threshold = signal(RELEASE_G);
  readonly limits = signal<HoldLimits>({ ...HOLD_LIMITS });

  readonly sensors = computed<SensorView[]>(() => {
    const rec = this.recording();
    if (!rec) return [];
    return rec.sensors.map((data, index) => {
      const info = rec.header.session.sensors[index];
      return {
        index,
        name: info?.name ?? `Sensor ${index + 1}`,
        role: SENSOR_ROLES.find((r) => r.value === info?.role)?.label ?? '',
        t: data.t,
        channels: channelsOf(data),
      };
    });
  });

  /** Whole recording. */
  readonly fullRange = computed<[number, number]>(() => {
    let end = 1000;
    for (const s of this.sensors()) if (s.t.length) end = Math.max(end, s.t[s.t.length - 1]);
    return [0, end];
  });

  readonly shots = computed(() => this.recording()?.header.shots.slice().sort((a, b) => a.releaseTime - b.releaseTime) ?? []);
  readonly drill = computed(() => this.recording()?.header.session.drill);

  readonly releases = computed(() => {
    const data = this.recording()?.sensors[this.detectSensor()];
    return data ? detectReleases(data, this.threshold()) : [];
  });

  readonly holds = computed(() => {
    const data = this.recording()?.sensors[this.detectSensor()];
    return data ? detectHolds(data, this.limits(), this.threshold()) : [];
  });

  /** Recorded shots compared with the releases found now. */
  readonly shotMatches = computed(() => {
    const releases = this.releases();
    return this.shots().map((shot) => ({
      shot,
      found: releases.some((r) => Math.abs(r - shot.releaseTime) <= MATCH_MS),
    }));
  });

  /** Releases found now that are not recorded shots. */
  readonly extraReleases = computed(() => {
    const shots = this.shots();
    return this.releases().filter((r) => !shots.some((s) => Math.abs(r - s.releaseTime) <= MATCH_MS));
  });

  readonly markers = computed<Marker[]>(() => [
    ...this.shots()
      .filter((s) => !s.discarded)
      .map((s) => ({ time: s.releaseTime, kind: 'shot' as const })),
    ...this.releases().map((time) => ({ time, kind: 'release' as const })),
    ...(this.drill()?.results.flatMap((r) => r.warnings.map((time) => ({ time, kind: 'warning' as const }))) ?? []),
  ]);

  readonly spans = computed<Span[]>(() => [
    ...(this.recording()?.header.session.dropouts ?? []).map((d) => ({ start: d.start, end: d.end ?? this.fullRange()[1], kind: 'lost' as const })),
    ...(this.recording()?.header.session.pauses ?? []).map((p) => ({ start: p.start, end: p.end ?? this.fullRange()[1], kind: 'pause' as const })),
    ...(this.drill()?.results.map((r) => ({ start: r.start, end: r.end, kind: 'hold' as const })) ?? []),
    ...this.holds().map((h) => ({ start: h.start, end: h.end ?? h.start + h.heldMs, kind: 'detected' as const })),
  ]);

  open(recording: Recording, source: string): void {
    this.recording.set(recording);
    this.source.set(source);
    const bow = recording.header.session.sensors.findIndex((s) => s.role === 'bow');
    this.detectSensor.set(Math.max(0, bow));
    const shown = new Set<string>();
    this.sensors().forEach((s) => {
      for (const c of s.channels) if (c.key === 'gyro' || c.key === 'euler') shown.add(`${s.index}:${c.key}`);
    });
    this.shown.set(shown);
    this.range.set(this.fullRange());
  }

  toggleShown(key: string): void {
    const next = new Set(this.shown());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.shown.set(next);
  }

  /** Sets the visible range, kept inside the recording and at least 50 ms wide. */
  setRange([t0, t1]: [number, number]): void {
    const [f0, f1] = this.fullRange();
    const width = Math.min(Math.max(50, t1 - t0), f1 - f0);
    let start = Math.max(f0, Math.min(t0, f1 - width));
    if (!Number.isFinite(start)) start = f0;
    this.range.set([start, start + width]);
  }

  /** Shows `width` ms with `time` in the middle (or the whole recording). */
  show(time: number, width: number): void {
    this.setRange([time - width / 2, time + width / 2]);
  }

  setWidth(width: number | 'all'): void {
    if (width === 'all') this.range.set(this.fullRange());
    else {
      const [t0, t1] = this.range();
      this.show((t0 + t1) / 2, width);
    }
  }

  pan(fraction: number): void {
    const [t0, t1] = this.range();
    const d = (t1 - t0) * fraction;
    this.setRange([t0 + d, t1 + d]);
  }

  setLimit(key: keyof HoldLimits, value: number): void {
    if (Number.isFinite(value) && value > 0) this.limits.update((l) => ({ ...l, [key]: value }));
  }

  resetDetection(): void {
    this.threshold.set(RELEASE_G);
    this.limits.set({ ...HOLD_LIMITS });
  }
}
