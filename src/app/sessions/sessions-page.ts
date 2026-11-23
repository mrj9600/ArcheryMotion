import { BuildInfo, versionLabel } from '../build-info.model';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../data/db';
import { Archer, EquipmentSetup, Session, ShotRecord } from '../data/models';
import { importRecording } from '../recording/import';
import { canShareFile, download, exportSession, shareableFile, shareFile } from '../recording/export';
import { Recorder } from '../recording/recorder.service';

interface Row {
  session: Session;
  archer?: Archer;
  setup?: EquipmentSetup;
  /** How the session's focus went, by the archer's own rating of the shots. */
  ratings?: { good: number; bad: number; shots: number };
}

@Component({
  selector: 'app-sessions-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './sessions-page.html',
})
export class SessionsPage {
  private readonly db = inject(Db);
  private readonly recorder = inject(Recorder);

  readonly rows = signal<Row[]>([]);
  readonly busyId = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly storage = signal<string | undefined>(undefined);
  readonly importing = signal(false);
  readonly importMessage = signal<string | undefined>(undefined);
  /** A packed file waiting for a second tap to open the share sheet. */
  readonly ready = signal<{ id: string; file: File } | undefined>(undefined);

  readonly version = (app: BuildInfo) => versionLabel(app);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [sessions, archers, setups] = await Promise.all([this.db.sessions(), this.db.db.archers.toArray(), this.db.db.setups.toArray()]);
    this.rows.set(
      await Promise.all(
        sessions.map(async (session) => ({
          session,
          archer: archers.find((a) => a.id === session.archerId),
          setup: setups.find((s) => s.id === session.setupId),
          ratings: session.focus ? ratingsOf(await this.db.shots(session.id)) : undefined,
        })),
      ),
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
      const file = shareableFile(blob, filename);
      if (!canShareFile(file)) {
        download(blob, filename);
        return;
      }
      if ((await shareFile(file)) === 'needsTap') this.ready.set({ id: row.session.id, file });
    } catch (e) {
      this.error.set(`Eksport fejlede: ${e}`);
    } finally {
      this.busyId.set(undefined);
    }
  }

  /** Imports exported recordings (several at once); ones already here are skipped. */
  async importFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.importing.set(true);
    this.error.set(undefined);
    this.importMessage.set(undefined);
    let imported = 0;
    let existing = 0;
    const failed: string[] = [];
    for (const file of files) {
      try {
        const r = await importRecording(this.db, file);
        if (r.status === 'imported') imported++;
        else existing++;
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    const parts = [`${imported} optagelse${imported === 1 ? '' : 'r'} importeret`];
    if (existing) parts.push(`${existing} fandtes allerede`);
    this.importMessage.set(parts.join(', ') + '.');
    if (failed.length) this.error.set(`Kunne ikke importere ${failed.join('; ')}`);
    this.importing.set(false);
    await this.load();
  }

  /** Second tap: the file is packed, so the share sheet opens at once. */
  async share(): Promise<void> {
    const ready = this.ready();
    if (!ready) return;
    this.ready.set(undefined);
    try {
      await shareFile(ready.file);
    } catch (e) {
      this.error.set(`Deling fejlede: ${e}`);
    }
  }

  async delete(row: Row): Promise<void> {
    const when = new Date(row.session.startedAt).toLocaleString('da-DK');
    if (!confirm(`Slet optagelsen fra ${when} med ${row.session.shotCount} skud? Det kan ikke fortrydes.`)) return;
    await this.db.deleteSession(row.session.id);
    await this.load();
  }
}

function ratingsOf(shots: ShotRecord[]): Row['ratings'] {
  const real = shots.filter((s) => !s.discarded);
  return {
    good: real.filter((s) => s.selfRating === 'good').length,
    bad: real.filter((s) => s.selfRating === 'bad').length,
    shots: real.length,
  };
}
