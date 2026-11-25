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
      @case ('drawHand') {
        <svg viewBox="0 0 330 150" role="img" aria-label="Trækhånden set fra håndryggen. Sensoren sidder midt på håndryggen mellem knoerne og håndleddet, med remmen over håndfladen.">
          <text x="165" y="14" class="label" text-anchor="middle">Trækhånden set fra håndryggen</text>
          <!-- Drawn for a right hand (fingers to the left); a left hand is the mirror image. -->
          <g [attr.transform]="hand() === 'left' ? 'translate(330 0) scale(-1 1)' : null">
            <path class="body" d="M200 52 L300 46 L300 98 L200 92 Z" />
            <path class="body" d="M200 52 Q150 40 96 44 L96 100 Q150 104 200 92 Z" />
            <rect class="body" x="38" y="45" width="62" height="12" rx="6" />
            <rect class="body" x="28" y="59" width="72" height="12" rx="6" />
            <rect class="body" x="32" y="73" width="68" height="12" rx="6" />
            <rect class="body" x="46" y="87" width="54" height="11" rx="5.5" />
            <path class="body" d="M172 96 Q152 122 122 126 Q112 126 114 118 Q134 112 148 97 Z" />
            <line class="guide" x1="98" y1="40" x2="98" y2="104" />
            <line class="guide" x1="200" y1="44" x2="200" y2="100" />
            <line class="strap" x1="134" y1="43" x2="134" y2="103" />
            <line class="strap" x1="162" y1="44" x2="162" y2="102" />
            <rect class="sensor" x="128" y="58" width="40" height="28" rx="4" />
          </g>
          <text [attr.x]="mx(98)" y="34" class="label" text-anchor="middle">knoer</text>
          <text [attr.x]="mx(148)" y="34" class="label strong" text-anchor="middle">sensor</text>
          <text [attr.x]="mx(200)" y="34" class="label" text-anchor="middle">håndled</text>
          <text [attr.x]="mx(262)" y="120" class="label" text-anchor="middle">{{ hand() === 'left' ? 'venstre hånd' : 'højre hånd' }}</text>
          <text x="165" y="144" class="label small" text-anchor="middle">Remmen over håndfladen, ikke over fingrene eller håndleddet</text>
        </svg>
      }
      @default {
        <svg viewBox="0 0 330 150" role="img" aria-label="Underarmen set ovenfra, som når man kigger på sit ur. Sensoren sidder på samme side som urskiven, lige bag den mod albuen.">
          <text x="165" y="14" class="label" text-anchor="middle">{{ placement() === 'drawForearm' ? 'Trækarmen' : 'Buearmen' }}, som når du kigger på dit ur</text>
          <!-- Drawn for a right hand (hand on the left); a left hand is the mirror image. -->
          <g [attr.transform]="hand() === 'left' ? 'translate(330 0) scale(-1 1)' : null">
            <!-- forearm from the wrist to the elbow, seen from the watch side -->
            <path class="body" d="M112 50 L296 40 Q318 70 296 100 L112 90 Z" />
            <!-- back of the hand, fingers and thumb -->
            <path class="body" d="M112 50 Q80 44 56 46 L56 94 Q80 96 112 90 Z" />
            <rect class="body" x="22" y="47" width="36" height="9" rx="4.5" />
            <rect class="body" x="16" y="58" width="42" height="9" rx="4.5" />
            <rect class="body" x="18" y="69" width="40" height="9" rx="4.5" />
            <rect class="body" x="26" y="80" width="32" height="9" rx="4.5" />
            <path class="body" d="M92 92 Q78 108 60 112 Q52 112 54 106 Q66 100 76 92 Z" />
            <!-- watch strap, sensor right behind the face toward the elbow, its strap, arrow -->
            <rect class="watch" x="114" y="48" width="18" height="44" rx="3" />
            <line class="strap" x1="150" y1="49" x2="150" y2="91" />
            <line class="strap" x1="178" y1="47" x2="178" y2="91" />
            <rect class="sensor" x="144" y="56" width="40" height="28" rx="4" />
            <path class="dim" d="M200 70 L250 70 M244 65 L250 70 L244 75" />
          </g>
          <!-- the watch face is never mirrored -->
          <g [attr.transform]="'translate(' + mx(123) + ' 70)'">
            <circle class="face" r="14" />
            <path class="hands" d="M0 0 L0 -9 M0 0 L7 2" />
          </g>
          <text [attr.x]="mx(40)" y="132" class="label" text-anchor="middle">{{ hand() === 'left' ? 'venstre hånd' : 'højre hånd' }}</text>
          <text [attr.x]="mx(296)" y="122" class="label" text-anchor="middle">albue</text>
          <text [attr.x]="mx(123)" y="112" class="label" text-anchor="middle">urskive</text>
          <text [attr.x]="mx(164)" y="112" class="label strong" text-anchor="middle">sensor</text>
          <text [attr.x]="mx(225)" y="62" class="label" text-anchor="middle">mod albuen</text>
          <text x="165" y="144" class="label small" text-anchor="middle">{{ placement() === 'bowForearm' ? 'Ikke på indersiden: der er strengen og armbeskytteren' : 'Ikke på indersiden' }}</text>
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
    .face {
      fill: var(--bg);
      stroke: var(--muted);
      stroke-width: 1.5;
    }
    .hands {
      stroke: var(--muted);
      stroke-width: 1.5;
      stroke-linecap: round;
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
  /** Which hand the arm ends in (from the archer's handedness); the forearm drawing is mirrored for the left. */
  readonly hand = input<'left' | 'right'>('right');

  /** x of a label in the forearm drawing, mirrored with the drawing for a left hand. */
  mx(x: number): number {
    return this.hand() === 'left' ? 330 - x : x;
  }
}
