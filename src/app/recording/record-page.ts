import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FOCUS_AREAS, FocusKey, SessionFocus, ShotRecord, TARGET_ELEVATIONS } from '../data/models';
import { Selection } from '../data/selection.service';
import { rememberedPlacement, rememberPlacement, SensorManager, SensorSlot } from '../sensors/sensor-manager.service';
import { placementsFor, SENSOR_PLACEMENTS, SENSOR_ROLES, SensorPlacement, SensorRole } from '../sensors/sensor.model';
import { HoldDrillPanel } from '../training/hold-drill-panel';
import { PlacementSketch } from '../sensors/placement-sketch';
import { PocketMode } from './pocket-mode';
import { HoldDrillRunner } from '../training/hold-drill.service';
import { Recorder } from './recorder.service';

@Component({
  selector: 'app-record-page',
  imports: [FormsModule, RouterLink, HoldDrillPanel, PlacementSketch, PocketMode],
  templateUrl: './record-page.html',
  styleUrl: './record-page.scss',
})
export class RecordPage implements OnDestroy {
  readonly manager = inject(SensorManager);
  readonly selection = inject(Selection);
  readonly recorder = inject(Recorder);
  readonly drill = inject(HoldDrillRunner);

  readonly roles = SENSOR_ROLES;
  readonly targets = TARGET_ELEVATIONS;
  readonly thresholds = [0.5, 1, 2, 3, 4, 6, 8];

  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly showAllDevices = signal(false);
  readonly place = signal('');
  /** What the next recording is: free shooting or the holding drill. */
  readonly mode = signal<'free' | 'hold'>(loadMode());
  readonly focusAreas = FOCUS_AREAS;
  /** Focus of the next free-shooting session (remembered between sessions). */
  readonly focusKey = signal<FocusKey | ''>(loadFocus().key);
  readonly focusText = signal(loadFocus().text);
  readonly focusHint = computed(() => FOCUS_AREAS.find((f) => f.value === this.focusKey())?.hint ?? '');
  /** Good/bad counts for the running session's focus. */
  readonly ratings = computed(() => {
    const shots = this.recorder.shots().filter((s) => !s.discarded);
    return { good: shots.filter((s) => s.selfRating === 'good').length, bad: shots.filter((s) => s.selfRating === 'bad').length };
  });

  /** Black, touch-locked screen while the phone is in a pocket (see PocketMode). */
  readonly pocket = signal(false);

  /** Dim status line in pocket mode. */
  readonly pocketStatus = computed(() => {
    const s = this.recorder.session();
    if (!s) return '';
    return `${this.recorder.paused() ? 'Pause' : 'Optager'} ${this.elapsed()} · ${s.shotCount} skud`;
  });

  /** Ticks every second (performance.now(), like the sample times) so the time and sensor states update. */
  private readonly now = signal(performance.now());
  private readonly timer = setInterval(() => this.now.set(performance.now()), 1000);

  /** Recorded time: the time since the start without the pauses, so it stands still during a pause. */
  readonly elapsed = computed(() => {
    const s = this.recorder.session();
    if (!s) return '';
    const total = this.recorder.sessionTime(this.now());
    const paused = (s.pauses ?? []).reduce((sum, p) => sum + Math.max(0, Math.min(p.end ?? total, total) - p.start), 0);
    const sec = Math.max(0, Math.floor((total - paused) / 1000));
    const m = Math.floor(sec / 60);
    return `${m}:${String(sec % 60).padStart(2, '0')}`;
  });

  /**
   * Seconds since a connected sensor last sent data, or 0 while data comes in. Connected
   * only means the phone has a Bluetooth connection; this shows whether data actually arrives.
   */
  silentSeconds(slot: SensorSlot): number {
    const last = slot.latest()?.time;
    if (slot.status() !== 'connected' || last === undefined) return 0;
    const s = Math.floor((this.now() - last) / 1000);
    return s >= 2 ? s : 0;
  }

  /** 'ok' (data comes in), 'silent' (connected, but no data) or 'bad' (no connection). */
  linkState(slot: SensorSlot): 'ok' | 'silent' | 'bad' {
    if (slot.status() !== 'connected') return 'bad';
    return !slot.latest() || this.silentSeconds(slot) ? 'silent' : 'ok';
  }

  /** E.g. "340 Hz", "Ingen data i 12 s", "Genforbinder…". */
  linkText(slot: SensorSlot): string {
    if (slot.status() === 'reconnecting') return 'Genforbinder…';
    if (slot.status() !== 'connected') return 'Afbrudt';
    if (!slot.latest()) return 'Venter på data';
    const silent = this.silentSeconds(slot);
    return silent ? `Ingen data i ${silent} s` : `${slot.rate()} Hz`;
  }

  readonly hasBowSensor = computed(() => this.manager.slots().some((s) => s.role() === 'bow'));

  /** Short name of a role for the compact status during recording, e.g. "Bue". */
  roleLabel(role: SensorRole): string {
    const label = this.roles.find((r) => r.value === role)?.label ?? role;
    return label.replace(/\s*\(.*\)/, '');
  }

  /** Where a sensor with this role goes on the archer. */
  roleHint(role: SensorRole): string | undefined {
    return this.roles.find((r) => r.value === role)?.hint;
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await this.manager.connectBle(this.showAllDevices());
    } catch (e) {
      const err = e as DOMException;
      if (err.name !== 'NotFoundError') this.error.set(err.message ?? String(e));
    } finally {
      this.busy.set(false);
    }
  }

  setRole(slot: SensorSlot, role: SensorRole): void {
    slot.role.set(role);
    slot.placement.set(rememberedPlacement(slot.sensor.name, role));
  }

  /**
   * Which hand an arm ends in for the chosen archer: a right-handed archer holds the bow in
   * the left hand, so the bow arm is the left arm.
   */
  handOf(role: SensorRole): 'left' | 'right' {
    const rightHanded = this.selection.archer()?.handedness !== 'left';
    const bowArmLeft = rightHanded;
    return (role === 'bowArm') === bowArmLeft ? 'left' : 'right';
  }

  /** The fixed places a sensor with this role can sit. */
  placements(role: SensorRole) {
    return placementsFor(role);
  }

  placementHint(placement: SensorPlacement | undefined): string | undefined {
    return SENSOR_PLACEMENTS.find((p) => p.value === placement)?.hint;
  }

  setPlacement(slot: SensorSlot, value: string): void {
    const placement = placementsFor(slot.role()).find((p) => p.value === value)?.value;
    slot.placement.set(placement);
    rememberPlacement(slot.sensor.name, slot.role(), placement);
  }

  /** Arm sensors whose placement has not been picked yet. */
  readonly missingPlacement = computed(() => this.manager.slots().filter((s) => placementsFor(s.role()).length && !s.placement()));

  setMode(mode: 'free' | 'hold'): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage not available */
    }
  }

  setDrillNumber(key: 'holdSeconds' | 'reps' | 'restSeconds', value: string): void {
    const n = Math.round(parseFloat(value));
    if (Number.isFinite(n) && n > 0) this.drill.setSettings({ [key]: n });
  }

  async start(): Promise<void> {
    const archerId = this.selection.archerId();
    if (!archerId) return;
    if (this.mode() === 'hold') {
      await this.drill.start(archerId, this.selection.setupId(), this.place());
      return;
    }
    await this.recorder.start(archerId, this.selection.setupId(), this.place());
    const focus = this.chosenFocus();
    const session = this.recorder.session();
    if (focus && session) {
      session.focus = focus;
      await this.recorder.saveSession();
    }
  }

  setFocus(key: FocusKey | ''): void {
    this.focusKey.set(key);
    this.saveFocus();
  }

  setFocusText(text: string): void {
    this.focusText.set(text);
    this.saveFocus();
  }

  private chosenFocus(): SessionFocus | undefined {
    const key = this.focusKey();
    if (!key) return undefined;
    if (key === 'other') {
      const text = this.focusText().trim();
      return text ? { key, label: text } : undefined;
    }
    return { key, label: FOCUS_AREAS.find((f) => f.value === key)!.label };
  }

  private saveFocus(): void {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify({ key: this.focusKey(), text: this.focusText() }));
    } catch {
      /* storage not available */
    }
  }

  async stop(): Promise<void> {
    if (confirm('Stop optagelsen?')) await this.recorder.stop();
  }

  async stopDrill(): Promise<void> {
    if (this.drill.phase() !== 'done' && !confirm('Stop øvelsen og optagelsen?')) return;
    this.drill.stop();
    await this.recorder.stop();
  }

  setDistance(value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    this.recorder.distance.set(Number.isFinite(n) ? n : undefined);
  }

  rate(shot: ShotRecord, rating: ShotRecord['selfRating']): void {
    void this.recorder.updateShot(shot, { selfRating: shot.selfRating === rating ? undefined : rating });
  }

  targetLabel(value: string | undefined): string {
    return this.targets.find((t) => t.value === value)?.label ?? '';
  }
}

const MODE_KEY = 'archery-motion.record-mode';
const FOCUS_KEY = 'archery-motion.focus';

function loadFocus(): { key: FocusKey | ''; text: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? '{}');
    const key = FOCUS_AREAS.some((f) => f.value === saved.key) ? (saved.key as FocusKey) : '';
    return { key, text: typeof saved.text === 'string' ? saved.text : '' };
  } catch {
    return { key: '', text: '' };
  }
}

function loadMode(): 'free' | 'hold' {
  try {
    return localStorage.getItem(MODE_KEY) === 'hold' ? 'hold' : 'free';
  } catch {
    return 'free';
  }
}
