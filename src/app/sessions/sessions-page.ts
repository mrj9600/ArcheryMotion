import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Db } from '../data/db';
import { Archer, EquipmentSetup, Session } from '../data/models';
import { exportSession, saveFile } from '../recording/export';
import { Recorder } from '../recording/recorder.service';

interface Row {
  session: Session;
  archer?: Archer;
  setup?: EquipmentSetup;
}

@Component({
  selector: 'app-sessions-page',
  imports: [DatePipe],
  templateUrl: './sessions-page.html',
})
export class SessionsPage {
  private readonly db = inject(Db);
  private readonly recorder = inject(Recorder);

  readonly rows = signal<Row[]>([]);
  readonly busyId = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly storage = signal<string | undefined>(undefined);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [sessions, archers, setups] = await Promise.all([this.db.sessions(), this.db.db.archers.toArray(), this.db.db.setups.toArray()]);
    this.rows.set(
      sessions.map((session) => ({
        session,
        archer: archers.find((a) => a.id === session.archerId),
        setup: setups.find((s) => s.id === session.setupId),
      })),
    );
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage !== undefined) {
        this.storage.set(`${(est.usage / 1e6).toFixed(0)} MB brugt af ca. ${((est.quota ?? 0) / 1e9).toFixed(1)} GB`);
      }
    } catch {
      /* not available */
    }
  }

  isRecording(session: Session): boolean {
    return this.recorder.session()?.id === session.id;
  }

  duration(session: Session): string {
    if (!session.endedAt) return 'afbrudt';
    const min = Math.round((session.endedAt - session.startedAt) / 60000);
    return `${min} min`;
  }

  async export(row: Row): Promise<void> {
    this.busyId.set(row.session.id);
    this.error.set(undefined);
    try {
      const { blob, filename } = await exportSession(this.db, row.session);
      await saveFile(blob, filename);
    } catch (e) {
      this.error.set(`Eksport fejlede: ${e}`);
    } finally {
      this.busyId.set(undefined);
    }
  }

  async delete(row: Row): Promise<void> {
    const when = new Date(row.session.startedAt).toLocaleString('da-DK');
    if (!confirm(`Slet optagelsen fra ${when} med ${row.session.shotCount} skud? Det kan ikke fortrydes.`)) return;
    await this.db.deleteSession(row.session.id);
    await this.load();
  }
}
