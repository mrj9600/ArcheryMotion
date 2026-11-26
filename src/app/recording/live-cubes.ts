import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { SensorManager } from '../sensors/sensor-manager.service';
import { ReplayCube } from '../workbench/replay-cube';
import { armPose, cubePose, ReplayTrace } from '../workbench/shot-replay';
import { LiveMotion } from './live-motion';

/** Redraws per second: smooth enough to follow, light enough for a phone that also records. */
const FPS = 15;

const f = (x: number) => Math.abs(x).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '°';

/**
 * The bow and the arm sensors as 3D boxes while recording: the last 3 seconds, with the
 * middle of each view where that sensor has been in those seconds.
 */
@Component({
  selector: 'app-live-cubes',
  imports: [ReplayCube],
  template: `
    <section class="card live">
      <div class="head">
        <h2>Live</h2>
        <label>
          Forstørrelse
          <select [value]="mag()" (change)="mag.set(+$any($event.target).value)">
            @for (m of mags; track m) {
              <option [value]="m" [selected]="m === mag()">×{{ m }}</option>
            }
          </select>
        </label>
      </div>
      @let v = view();
      @if (v.trace; as tr) {
        <div class="cubes">
          <figure>
            <figcaption>Buen set bagfra</figcaption>
            <app-replay-cube [trace]="tr" [index]="tr.t.length - 1" [magMove]="mag()" [magTurn]="2" />
            <p class="values">{{ bowLabel(tr) }}</p>
          </figure>
          @for (a of v.arms; track a.label) {
            @let k = armIndex(tr, a.label);
            <figure>
              <figcaption>{{ a.label }}</figcaption>
              @if (k >= 0) {
                <app-replay-cube [trace]="tr" [arm]="k" [index]="tr.t.length - 1" [magMove]="mag()" [magTurn]="2" />
                <p class="values">{{ armLabel(tr, k) }}</p>
                @if (!a.today) {
                  <p class="note">Armens retning er fra sidste gang. Den findes igen ved første skud i dag.</p>
                }
              } @else {
                <p class="note">Armens retning findes ved første skud (løft buen fra en opsætning, og skyd).</p>
              }
            </figure>
          }
        </div>
        <p class="legend">
          Midten af hvert billede er der, hvor sensoren har været de sidste 3 sekunder, så det viser bevægelsen, ikke hvor du sigter.
          Orange er de sidste 0,2 s, blå det sidste sekund. Cant er buens egen hældning.
        </p>
      } @else {
        <p class="note">{{ v.bowKind && v.bowKind !== 'mantisx-ble' ? 'Live-visningen kræver en MantisX på buen.' : 'Venter på data fra buen…' }}</p>
      }
    </section>
  `,
  styles: `
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .head h2 {
      margin: 0;
    }
    label {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 14px;
    }
    .cubes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }
    figure {
      margin: 0;
    }
    figcaption {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .values {
      font-size: 13px;
      margin: 4px 0 0;
      font-variant-numeric: tabular-nums;
    }
    .note,
    .legend {
      font-size: 13px;
      color: var(--muted);
    }
  `,
})
export class LiveCubes implements OnDestroy {
  private readonly live = inject(LiveMotion);
  private readonly manager = inject(SensorManager);

  readonly mags = [1, 2, 5, 10, 20];
  readonly mag = signal(5);

  private readonly tick = signal(0);
  private readonly timer = setInterval(() => this.tick.update((n) => n + 1), 1000 / FPS);

  readonly view = computed(() => {
    this.tick();
    this.live.axesVersion();
    return this.live.view(this.manager.slots());
  });

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  armIndex(tr: ReplayTrace, label: string): number {
    return tr.arms.findIndex((a) => a.label === label);
  }

  bowLabel(tr: ReplayTrace): string {
    const p = cubePose(tr, tr.t.length - 1);
    return `cant ${p.cant >= 0 ? 'højre' : 'venstre'} ${f(p.cant)}`;
  }

  armLabel(tr: ReplayTrace, k: number): string {
    const p = armPose(tr.arms[k], tr.t.length - 1);
    return `${p.up >= 0 ? 'op' : 'ned'} ${f(p.up)}, ${p.right >= 0 ? 'højre' : 'venstre'} ${f(p.right)} fra midten`;
  }
}
