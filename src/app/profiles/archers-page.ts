import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Db, newId } from '../data/db';
import { Archer, BOW_TYPES, EquipmentSetup } from '../data/models';
import { Selection } from '../data/selection.service';

@Component({
  selector: 'app-archers-page',
  imports: [FormsModule],
  templateUrl: './archers-page.html',
  styleUrl: './archers-page.scss',
})
export class ArchersPage {
  private readonly db = inject(Db);
  readonly selection = inject(Selection);
  readonly bowTypes = BOW_TYPES;

  /** Archer or setup being edited (a copy), or undefined. */
  readonly editArcher = signal<Archer | undefined>(undefined);
  readonly editSetup = signal<EquipmentSetup | undefined>(undefined);

  bowTypeLabel(value: string): string {
    return BOW_TYPES.find((b) => b.value === value)?.label ?? value;
  }

  isSavedArcher(archer: Archer): boolean {
    return this.selection.archers().some((a) => a.id === archer.id);
  }

  isSavedSetup(setup: EquipmentSetup): boolean {
    return this.selection.setups().some((s) => s.id === setup.id);
  }

  newArcher(): void {
    this.editArcher.set({ id: newId(), name: '', bowType: 'barebow', handedness: 'right', createdAt: Date.now() });
  }

  async saveArcher(archer: Archer): Promise<void> {
    if (!archer.name.trim()) return;
    await this.db.saveArcher({ ...archer, name: archer.name.trim() });
    this.editArcher.set(undefined);
    await this.selection.refresh();
    if (!this.selection.archerId()) await this.selection.selectArcher(archer.id);
  }

  async deleteArcher(archer: Archer): Promise<void> {
    if (!confirm(`Slet ${archer.name} med alt udstyr og alle optagelser? Det kan ikke fortrydes.`)) return;
    await this.db.deleteArcher(archer.id);
    this.editArcher.set(undefined);
    await this.selection.refresh();
  }

  newSetup(): void {
    const archer = this.selection.archer();
    if (!archer) return;
    this.editSetup.set({ id: newId(), archerId: archer.id, name: '', bowType: archer.bowType, createdAt: Date.now() });
  }

  copySetup(setup: EquipmentSetup): void {
    this.editSetup.set({ ...setup, id: newId(), name: `${setup.name} (kopi)`, createdAt: Date.now() });
  }

  async saveSetup(setup: EquipmentSetup): Promise<void> {
    if (!setup.name.trim()) return;
    await this.db.saveSetup({ ...setup, name: setup.name.trim() });
    this.editSetup.set(undefined);
    await this.selection.selectArcher(setup.archerId);
    if (!this.selection.setupId()) this.selection.setupId.set(setup.id);
  }

  /** Setups used in recordings are archived rather than deleted, so old sessions keep their equipment. */
  async archiveSetup(setup: EquipmentSetup): Promise<void> {
    if (!confirm(`Skjul udstyret "${setup.name}"? Gamle optagelser beholder det.`)) return;
    await this.db.saveSetup({ ...setup, archived: true });
    this.editSetup.set(undefined);
    await this.selection.selectArcher(setup.archerId);
  }
}
