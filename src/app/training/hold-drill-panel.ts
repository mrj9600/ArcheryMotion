import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import { HoldRep } from '../data/models';
import { HoldDrillRunner } from './hold-drill.service';

/** Live view of the holding drill: timer, stability, warnings and results. */
@Component({
  selector: 'app-hold-drill-panel',
  imports: [DecimalPipe],
  templateUrl: './hold-drill-panel.html',
  styleUrl: './hold-drill-panel.scss',
})
export class HoldDrillPanel {
  readonly drill = inject(HoldDrillRunner);
  readonly stopped = output<void>();

  readonly target = computed(() => this.drill.settings().holdSeconds * 1000);
  readonly progress = computed(() => Math.min(1, this.drill.held() / this.target()));
  readonly last = computed(() => this.drill.results().at(-1));
  /** Live stability meter: 0–46 deg/s mapped to 0–1. */
  readonly meter = computed(() => Math.min(1, this.drill.speed() / 46));
  readonly meterLevel = computed(() => {
    const v = this.drill.speed();
    return v < 4 ? 'ok' : v < 8 ? 'warn' : 'bad';
  });

  seconds(ms: number): string {
    return (ms / 1000).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  clock(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Bars for the sway of each second, scaled to the largest value of the rep. */
  bars(rep: HoldRep): { x: number; h: number; bad: boolean }[] {
    const values = rep.perSecond.sway;
    const max = Math.max(4, ...values);
    const firstBad = rep.warnings.length ? Math.round(rep.goodFormMs / 1000) : Infinity;
    return values.map((v, i) => ({ x: i, h: (v / max) * 40, bad: i >= firstBad }));
  }
}
