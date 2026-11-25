import { Component, input } from '@angular/core';
import { SensorPlacement } from './sensor.model';

/**
 * Small drawing of where a sensor sits on the archer, shown with the placement's text.
 * Roughly to scale: a forearm of about 25 cm, an upper arm of about 30 cm.
 */
@Component({
  selector: 'app-placement-sketch',
  template: `
    @switch (placement()) {
      @case ('drawUpperArm') {
        <svg viewBox="0 0 260 250" role="img" aria-label="Trækarmen hænger ned, set fra ydersiden. Sensoren sidder på overarmen 5 cm over albuen.">
          <text x="130" y="14" class="label" text-anchor="middle">Trækarmen set fra ydersiden</text>
          <!-- shoulder, upper arm, elbow, forearm -->
          <path class="body" d="M80 52 Q82 26 110 24 Q138 26 140 52 L132 160 Q130 172 124 176 L122 236 Q110 244 98 236 L96 176 Q90 172 88 160 Z" />
          <text x="150" y="40" class="label">skulder</text>
          <line class="guide" x1="80" y1="168" x2="140" y2="168" />
          <text x="150" y="172" class="label">albue</text>
          <text x="150" y="234" class="label">underarm</text>
          <!-- strap and sensor 5 cm above the elbow -->
          <line class="strap" x1="89" y1="139" x2="131" y2="139" />
          <line class="strap" x1="89" y1="153" x2="131" y2="153" />
          <rect class="sensor" x="99" y="135" width="22" height="22" rx="3" />
          <!-- 5 cm -->
          <path class="dim" d="M58 146 L58 168 M53 146 L63 146 M53 168 L63 168" />
          <text x="50" y="161" class="label strong" text-anchor="end">5 cm</text>
        </svg>
      }
      @default {
        <svg viewBox="24 2 300 130" role="img" aria-label="Underarmen set fra siden med håndryggen opad. Sensoren sidder på oversiden 5 cm fra urets plads mod albuen.">
          <text x="165" y="14" class="label" text-anchor="middle">{{ placement() === 'drawForearm' ? 'Trækarmen' : 'Buearmen' }} set fra siden, håndryggen opad</text>
          <!-- hand (left) and forearm to the elbow (right) -->
          <path class="body" d="M118 58 L300 50 Q316 66 300 98 L118 86 Q86 90 52 82 Q34 78 36 70 Q38 62 56 60 Q88 54 118 58 Z" />
          <text x="40" y="100" class="label">hånd</text>
          <text x="300" y="116" class="label" text-anchor="middle">albue</text>
          <!-- watch -->
          <rect class="watch" x="112" y="56" width="10" height="32" rx="2" />
          <text x="117" y="104" class="label" text-anchor="middle">ur</text>
          <!-- strap and sensor 5 cm toward the elbow, on the top -->
          <line class="strap" x1="146" y1="57" x2="146" y2="87" />
          <line class="strap" x1="164" y1="56" x2="164" y2="86" />
          <rect class="sensor" x="143" y="45" width="24" height="12" rx="3" />
          <!-- 5 cm -->
          <path class="dim" d="M117 30 L155 30 M117 25 L117 35 M155 25 L155 35" />
          <text x="136" y="26" class="label strong" text-anchor="middle">5 cm</text>
          <text x="210" y="44" class="label">oversiden</text>
          <text x="200" y="128" class="label small" text-anchor="middle">{{ placement() === 'bowForearm' ? 'Ikke indersiden: der er strengen og armbeskytteren' : 'Ikke indersiden' }}</text>
        </svg>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 340px;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .body {
      fill: var(--panel);
      stroke: var(--muted);
      stroke-width: 1.5;
    }
    .guide {
      stroke: var(--muted);
      stroke-dasharray: 3 3;
    }
    .watch {
      fill: none;
      stroke: var(--muted);
      stroke-width: 1.5;
      stroke-dasharray: 3 2;
    }
    .strap {
      stroke: var(--accent);
      stroke-width: 2;
      opacity: 0.6;
    }
    .sensor {
      fill: var(--accent);
    }
    .dim {
      stroke: var(--text);
      stroke-width: 1.2;
      fill: none;
    }
    .label {
      fill: var(--muted);
      font-size: 12px;
    }
    .label.strong {
      fill: var(--text);
      font-weight: 600;
    }
    .label.small {
      font-size: 11px;
    }
  `,
})
export class PlacementSketch {
  readonly placement = input.required<SensorPlacement>();
}
