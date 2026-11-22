import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ShotRecord, TARGET_ELEVATIONS } from '../data/models';
import { Selection } from '../data/selection.service';
import { SensorManager, SensorSlot } from '../sensors/sensor-manager.service';
import { SENSOR_ROLES, SensorRole } from '../sensors/sensor.model';
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
  readonly thresholds = [0.3, 0.5, 0.8, 1.2, 2];

  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly showAllDevices = signal(false);
  readonly place = signal('');
  /** What the next recording is: free shooting or the holding drill. */
  readonly mode = signal<'free' | 'hold'>(loadMode());

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
  }

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
    if (this.mode() === 'hold') await this.drill.start(archerId, this.selection.setupId(), this.place());
    else await this.recorder.start(archerId, this.selection.setupId(), this.place());
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

function loadMode(): 'free' | 'hold' {
  try {
    return localStorage.getItem(MODE_KEY) === 'hold' ? 'hold' : 'free';
  } catch {
    return 'free';
  }
}
