import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Db } from '../data/db';
import { Session, TARGET_ELEVATIONS } from '../data/models';
import { loadStoredRecording } from '../recording/export';
import { decodeRecording } from '../recording/recording-file';
import { HoldLimits } from '../training/hold-detector';
import { formatTime } from './analysis';
import { SignalPlot } from './signal-plot';
import { Workbench } from './workbench.service';

/** Visible widths to jump between (ms). */
const WIDTHS: { label: string; value: number | 'all' }[] = [
  { label: 'Alt', value: 'all' },
  { label: '60 s', value: 60000 },
  { label: '20 s', value: 20000 },
  { label: '6 s', value: 6000 },
  { label: '2 s', value: 2000 },
  { label: '0,5 s', value: 500 },
];

/**
 * Analysis workbench: open a recording (stored on this device or an .amrec file), see
 * every sensor's signals on one time axis, jump to shots and holds, and run the release
 * and hold detection again with other limits to see what they catch.
 */
@Component({
  selector: 'app-workbench-page',
  imports: [FormsModule, DatePipe, DecimalPipe, SignalPlot],
  templateUrl: './workbench-page.html',
  styleUrl: './workbench-page.scss',
})
export class WorkbenchPage {
  private readonly db = inject(Db);
  readonly wb = inject(Workbench);

  /** Session id from the route (?session=…), opened when given. */
  readonly session = input<string>();

  readonly widths = WIDTHS;
  readonly thresholds = [0.5, 1, 2, 3, 4, 6, 8];
  readonly targets = TARGET_ELEVATIONS;
  readonly stored = signal<Session[]>([]);
  readonly pickedId = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);

  readonly limitFields: { key: keyof HoldLimits; label: string }[] = [
    { key: 'move', label: 'Bevægelse før hold (°/s)' },
    { key: 'still', label: 'Roligt under (°/s)' },
    { key: 'end', label: 'Slut over (°/s)' },
    { key: 'settleMs', label: 'Roligt i (ms)' },
    { key: 'poseTolerance', label: 'Samme stilling (±°)' },
  ];

  readonly header = computed(() => this.wb.recording()?.header);
  /** The detection sensor's angular speed, for the overview. */
  readonly overview = computed(() => {
    const s = this.wb.sensors()[this.wb.detectSensor()] ?? this.wb.sensors()[0];
    const ch = s?.channels.find((c) => c.key === 'gyro') ?? s?.channels[0];
    if (!s || !ch) return undefined;
    const mag = ch.series.find((x) => x.label === '|ω|' || x.label === '|a|') ?? ch.series[0];
    return { t: s.t, channel: { ...ch, series: [mag] } };
  });
  readonly overviewSpans = computed(() => [...this.wb.spans(), { start: this.wb.range()[0], end: this.wb.range()[1], kind: 'window' as const }]);
  readonly found = computed(() => this.wb.shotMatches().filter((m) => m.found && !m.shot.discarded).length);
  readonly realShots = computed(() => this.wb.shots().filter((s) => !s.discarded).length);

  constructor() {
    void this.loadStored();
  }

  async loadStored(): Promise<void> {
    const sessions = await this.db.sessions();
    this.stored.set(sessions);
    const wanted = this.session();
    if (wanted && this.wb.recording()?.header.session.id !== wanted) {
      const s = sessions.find((x) => x.id === wanted);
      if (s) await this.openStored(s);
    }
    this.pickedId.set(wanted ?? sessions[0]?.id);
  }

  async openPicked(): Promise<void> {
    const s = this.stored().find((x) => x.id === this.pickedId());
    if (s) await this.openStored(s);
  }

  async openStored(session: Session): Promise<void> {
    await this.run(async () => {
      const rec = await loadStoredRecording(this.db, session);
      this.wb.open(rec, 'Gemt på enheden');
    });
  }

  async openFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.run(async () => this.wb.open(await decodeRecording(file), file.name));
    (event.target as HTMLInputElement).value = '';
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await task();
    } catch (e) {
      this.error.set(`Kunne ikke åbne optagelsen: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Shows a shot: 4 s before the release (aiming) to 2 s after (follow-through). */
  showShot(time: number): void {
    this.wb.setRange([time - 4000, time + 2000]);
  }

  showHold(start: number, end: number): void {
    const pad = Math.max(1000, (end - start) * 0.1);
    this.wb.setRange([start - pad, end + pad]);
  }

  sessionLabel(s: Session): string {
    const d = new Date(s.startedAt).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
    return `${d}, ${s.drill ? 'holdeøvelse' : `${s.shotCount} skud`}`;
  }

  time(ms: number): string {
    return formatTime(ms);
  }

  seconds(ms: number): string {
    return (ms / 1000).toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  targetLabel(value: string | undefined): string {
    return this.targets.find((t) => t.value === value)?.label ?? '';
  }

  setLimit(key: keyof HoldLimits, value: string): void {
    this.wb.setLimit(key, parseFloat(String(value).replace(',', '.')));
  }
}
