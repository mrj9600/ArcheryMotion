import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FOCUS_AREAS, FocusKey, SessionFocus, ShotRecord, TARGET_ELEVATIONS } from '../data/models';
import { Selection } from '../data/selection.service';
import { rememberedPlacement, rememberPlacement, SensorManager, SensorSlot } from '../sensors/sensor-manager.service';
import { placementsFor, SENSOR_PLACEMENTS, SENSOR_ROLES, SensorPlacement, SensorRole } from '../sensors/sensor.model';
import { HoldDrillPanel } from '../training/hold-drill-panel';
import { HoldDrillRunner } from '../training/hold-drill.service';
import { Recorder } from './recorder.service';

@Component({
  selector: 'app-record-page',
  imports: [FormsModule, RouterLink, HoldDrillPanel],
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

  /** Ticks every second so the elapsed time updates. */
  private readonly now = signal(Date.now());
  private readonly timer = setInterval(() => this.now.set(Date.now()), 1000);

  readonly elapsed = computed(() => {
    const s = this.recorder.session();
    if (!s) return '';
    const sec = Math.max(0, Math.floor((this.now() - s.startedAt) / 1000));
    const m = Math.floor(sec / 60);
    return `${m}:${String(sec % 60).padStart(2, '0')}`;
  });

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
