import { Injectable, signal } from '@angular/core';
import { SensorSlot } from '../sensors/sensor-manager.service';
import { MotionSample, SENSOR_PLACEMENTS, SENSOR_ROLES } from '../sensors/sensor.model';
import { ArmAxes, findArmAxes, pairReleases } from '../workbench/arm-motion';
import { bowMotion } from '../workbench/bow-motion';
import { buildReplay, ReplayTrace } from '../workbench/shot-replay';
import { SensorData } from './recording-file';

type V3 = [number, number, number];

/** How much of each sensor's data is kept (ms): enough for the set-up before a shot. */
const KEEP_MS = 25000;
/** Samples kept per sensor (25 s at 200 Hz, with room to spare). */
const RING_SIZE = 6000;
/** The live view shows this much (ms) up to now. */
export const LIVE_WINDOW_MS = 3000;
/** After a release, wait this long (ms) for the arm's jolt before looking for its axes. */
const AFTER_RELEASE_MS = 700;

/** The latest samples of one sensor, oldest first when read. */
export class SampleRing {
  private readonly t = new Float64Array(RING_SIZE);
  private readonly acc = new Float32Array(3 * RING_SIZE);
  private readonly gyro = new Float32Array(3 * RING_SIZE);
  private readonly euler = new Float32Array(3 * RING_SIZE);
  private readonly mag = new Float32Array(RING_SIZE);
  private readonly has = { acc: false, gyro: false, euler: false, accMagnitude: false };
  private next = 0;
  private count = 0;

  push(time: number, s: MotionSample): void {
    const k = this.next;
    this.t[k] = time;
    const put = (into: Float32Array, v: readonly number[] | undefined, key: keyof SampleRing['has']) => {
      into[3 * k] = v ? v[0] : NaN;
      into[3 * k + 1] = v ? v[1] : NaN;
      into[3 * k + 2] = v ? v[2] : NaN;
      if (v) this.has[key] = true;
    };
    put(this.acc, s.acc, 'acc');
    put(this.gyro, s.gyro, 'gyro');
    put(this.euler, s.euler, 'euler');
    this.mag[k] = s.accMagnitude ?? NaN;
    if (s.accMagnitude !== undefined) this.has.accMagnitude = true;
    this.next = (k + 1) % RING_SIZE;
    this.count = Math.min(RING_SIZE, this.count + 1);
  }

  /** Time of the newest sample. */
  get last(): number | undefined {
    return this.count ? this.t[(this.next - 1 + RING_SIZE) % RING_SIZE] : undefined;
  }

  /** The samples from `from` (ms) on, as continuous arrays. */
  data(from = -Infinity): SensorData {
    const start = (this.next - this.count + RING_SIZE) % RING_SIZE;
    let skip = 0;
    while (skip < this.count && this.t[(start + skip) % RING_SIZE] < from) skip++;
    const n = this.count - skip;
    const out: SensorData = { t: new Float64Array(n) };
    if (this.has.acc) out.acc = new Float32Array(3 * n);
    if (this.has.gyro) out.gyro = new Float32Array(3 * n);
    if (this.has.euler) out.euler = new Float32Array(3 * n);
    if (this.has.accMagnitude) out.accMagnitude = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = (start + skip + i) % RING_SIZE;
      out.t[i] = this.t[k];
      for (let c = 0; c < 3; c++) {
        if (out.acc) out.acc[3 * i + c] = this.acc[3 * k + c];
        if (out.gyro) out.gyro[3 * i + c] = this.gyro[3 * k + c];
        if (out.euler) out.euler[3 * i + c] = this.euler[3 * k + c];
      }
      if (out.accMagnitude) out.accMagnitude[i] = this.mag[k];
    }
    return out;
  }
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Puts the axes found from several shots together (as findArmAxes does for a recording). */
export function combineAxes(list: ArmAxes[]): ArmAxes | undefined {
  if (!list.length) return undefined;
  const sum = (pick: (a: ArmAxes) => V3) => norm(list.reduce<V3>((s, a) => [s[0] + pick(a)[0], s[1] + pick(a)[1], s[2] + pick(a)[2]], [0, 0, 0]));
  const up = sum((a) => a.up);
  const r = sum((a) => a.raise);
  const d = r[0] * up[0] + r[1] * up[1] + r[2] * up[2];
  const raise = norm([r[0] - d * up[0], r[1] - d * up[1], r[2] - d * up[2]]);
  const angle = (a: V3) => (Math.acos(Math.max(-1, Math.min(1, a[0] * raise[0] + a[1] * raise[1] + a[2] * raise[2]))) * 180) / Math.PI;
  return { up, raise, shots: list.reduce((s, a) => s + a.shots, 0), spread: Math.max(...list.map((a) => angle(a.raise))) };
}

/** Subtracts the mean, so the view's middle is where the sensor has been lately. */
function centre(v: Float32Array): void {
  let s = 0;
  for (const x of v) s += x;
  const m = s / (v.length || 1);
  for (let i = 0; i < v.length; i++) v[i] -= m;
}

export interface LiveArm {
  label: string;
  role: string;
  data: SensorData;
  axes?: ArmAxes;
}

/**
 * The last few seconds as a trace for the 3D view, ending now. Each sensor's movement is
 * shown around where it has been in the window (the middle of the view), the bow's cant as
 * it is. Arms without axes are left out.
 */
export function liveTrace(bow: SensorData, bowKind: string, arms: LiveArm[], now: number, windowMs = LIVE_WINDOW_MS): ReplayTrace | undefined {
  const motion = bowMotion(bow, bowKind);
  if (!motion || bow.t.length < 2) return undefined;
  const trace = buildReplay({
    shot: { id: 'live', number: 0, releaseTime: now },
    span: [now - windowMs, now],
    bow,
    motion,
    arms: arms.filter((a) => a.axes).map((a) => ({ label: a.label, role: a.role, data: a.data, axes: a.axes!, release: now })),
  });
  if (!trace) return undefined;
  centre(trace.bow.up);
  centre(trace.bow.right);
  for (const a of trace.arms) {
    centre(a.up);
    centre(a.right);
    centre(a.roll);
  }
  return trace;
}

const axesKey = (slot: SensorSlot) => `archerymotion.armaxes.${slot.sensor.name}.${slot.placement() ?? slot.role()}`;

/**
 * Keeps the last seconds of every sensor during a recording, so the movement can be shown
 * live. An arm sensor's directions are found after each shot (as in the analysis); until the
 * first shot of the day, the ones found last time for the same sensor and placement are used.
 */
@Injectable({ providedIn: 'root' })
export class LiveMotion {
  private readonly rings = new Map<SensorSlot, SampleRing>();
  private readonly found = new Map<SensorSlot, ArmAxes[]>();
  private bowSlot?: SensorSlot;
  /** Bumped when an arm's axes change. */
  readonly axesVersion = signal(0);

  reset(): void {
    this.rings.clear();
    this.found.clear();
    this.bowSlot = undefined;
    this.axesVersion.update((v) => v + 1);
  }

  add(slot: SensorSlot, time: number, sample: MotionSample, mainBow: boolean): void {
    let ring = this.rings.get(slot);
    if (!ring) this.rings.set(slot, (ring = new SampleRing()));
    ring.push(time, sample);
    if (mainBow) this.bowSlot = slot;
  }

  /** After a release (session time), look for the arms' directions in this shot. */
  shot(releaseTime: number): void {
    setTimeout(() => this.findAxes(releaseTime), AFTER_RELEASE_MS);
  }

  private findAxes(releaseTime: number): void {
    const bowSlot = this.bowSlot;
    const bowRing = bowSlot && this.rings.get(bowSlot);
    if (!bowRing) return;
    const bow = bowRing.data(releaseTime - KEEP_MS);
    const shots = [{ id: 'live', releaseTime }];
    for (const [slot, ring] of this.rings) {
      if (slot === bowSlot || !isArm(slot)) continue;
      const arm = ring.data(releaseTime - KEEP_MS);
      const axes = findArmAxes(bow, arm, shots, pairReleases(bow, arm, shots, false));
      if (!axes) continue;
      const list = [...(this.found.get(slot) ?? []), axes];
      this.found.set(slot, list);
      try {
        localStorage.setItem(axesKey(slot), JSON.stringify(combineAxes(list)));
      } catch {
        // Not remembered; found again next time
      }
      this.axesVersion.update((v) => v + 1);
    }
  }

  /** An arm's axes: found today, or remembered from last time. */
  axes(slot: SensorSlot): { axes: ArmAxes; today: boolean } | undefined {
    const today = combineAxes(this.found.get(slot) ?? []);
    if (today) return { axes: today, today: true };
    try {
      const saved = localStorage.getItem(axesKey(slot));
      if (saved) return { axes: JSON.parse(saved) as ArmAxes, today: false };
    } catch {
      // Nothing remembered
    }
    return undefined;
  }

  /** The live trace now, and the arm sensors shown or still waiting. */
  view(slots: SensorSlot[]): { trace?: ReplayTrace; arms: { slot: SensorSlot; label: string; today?: boolean }[]; bowKind?: string } {
    const bowSlot = this.bowSlot;
    const bowRing = bowSlot && this.rings.get(bowSlot);
    const now = bowRing?.last;
    const arms = slots.filter((s) => s !== bowSlot && isArm(s)).map((slot) => ({ slot, label: labelOf(slot), today: this.axes(slot)?.today }));
    if (!bowSlot || !bowRing || now === undefined) return { arms };
    const from = now - LIVE_WINDOW_MS - 500;
    const live: LiveArm[] = arms
      .filter((a) => this.rings.has(a.slot))
      .map((a) => ({ label: a.label, role: a.slot.role(), data: this.rings.get(a.slot)!.data(from), axes: this.axes(a.slot)?.axes }));
    return { trace: liveTrace(bowRing.data(from), bowSlot.sensor.kind, live, now), arms, bowKind: bowSlot.sensor.kind };
  }
}

function isArm(slot: SensorSlot): boolean {
  return slot.role() === 'bowArm' || slot.role() === 'drawArm';
}

function labelOf(slot: SensorSlot): string {
  const role = SENSOR_ROLES.find((r) => r.value === slot.role())?.label ?? '';
  const place = SENSOR_PLACEMENTS.find((p) => p.value === slot.placement())?.label;
  return [role, place?.toLowerCase()].filter(Boolean).join(', ');
}
