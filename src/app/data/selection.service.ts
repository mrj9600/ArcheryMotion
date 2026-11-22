import { Injectable, effect, inject, signal } from '@angular/core';
import { Db } from './db';
import { Archer, EquipmentSetup } from './models';

const STORAGE_KEY = 'archery-motion.selection';

function load(): { archerId?: string; setupId?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** The archer and equipment currently in use, remembered between visits. */
@Injectable({ providedIn: 'root' })
export class Selection {
  private readonly db = inject(Db);

  readonly archers = signal<Archer[]>([]);
  readonly setups = signal<EquipmentSetup[]>([]);
  readonly archerId = signal<string | undefined>(load().archerId);
  readonly setupId = signal<string | undefined>(load().setupId);

  constructor() {
    effect(() => {
      const value = { archerId: this.archerId(), setupId: this.setupId() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* storage blocked */
      }
    });
    void this.refresh();
  }

  archer(): Archer | undefined {
    return this.archers().find((a) => a.id === this.archerId());
  }

  setup(): EquipmentSetup | undefined {
    return this.setups().find((s) => s.id === this.setupId());
  }

  async selectArcher(id: string | undefined): Promise<void> {
    if (id !== this.archerId()) this.setupId.set(undefined);
    this.archerId.set(id);
    await this.refreshSetups();
  }

  /** Reloads archers and setups from the database and drops selections that no longer exist. */
  async refresh(): Promise<void> {
    const archers = await this.db.archers();
    this.archers.set(archers);
    if (!archers.some((a) => a.id === this.archerId())) this.archerId.set(archers[0]?.id);
    await this.refreshSetups();
  }

  private async refreshSetups(): Promise<void> {
    const id = this.archerId();
    const setups = id ? (await this.db.setups(id)).filter((s) => !s.archived) : [];
    this.setups.set(setups);
    if (!setups.some((s) => s.id === this.setupId())) this.setupId.set(setups[0]?.id);
  }
}
