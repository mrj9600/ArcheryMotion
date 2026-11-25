import { Component, input, OnDestroy, OnInit, output, signal } from '@angular/core';

/** How long the ring must be held to leave pocket mode (ms). */
const HOLD_MS = 2000;

/**
 * Pocket mode: a black screen that ignores touches, so the phone can lie in a pocket while
 * it records. The screen stays on (the recording keeps the wake lock), because a web app
 * stops getting sensor data when the phone is locked. Black uses little power on most
 * phone screens. Leave it by holding the ring for 2 s.
 */
@Component({
  selector: 'app-pocket-mode',
  template: `
    <div class="pocket" (contextmenu)="$event.preventDefault()">
      <p class="state">{{ status() }}</p>
      <button
        class="ring"
        [class.holding]="holding()"
        (pointerdown)="start($event)"
        (pointerup)="cancel()"
        (pointercancel)="cancel()"
        (pointerleave)="cancel()"
        aria-label="Hold i 2 sekunder for at låse op"
      >
        <span>Hold</span>
      </button>
      <p class="help">Hold fingeren på ringen i 2 sekunder for at låse op.<br />Tryk ikke på tænd/sluk-knappen: så stopper optagelsen med at få data.</p>
    </div>
  `,
  styles: `
    .pocket {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .state,
    .help {
      color: #555;
      margin: 0;
      text-align: center;
      font-size: 14px;
      padding: 0 24px;
    }
    .ring {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 3px solid #444;
      background: #000;
      color: #666;
      font-size: 16px;
      position: relative;
      padding: 0;
    }
    .ring::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 3px solid #2f855a;
      clip-path: inset(100% 0 0 0);
    }
    .ring.holding::after {
      clip-path: inset(0 0 0 0);
      transition: clip-path ${HOLD_MS}ms linear;
    }
  `,
})
export class PocketMode implements OnInit, OnDestroy {
  /** Shown dimly, e.g. "Optager · 12 skud". */
  readonly status = input('');
  readonly unlocked = output<void>();

  readonly holding = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    // Full screen hides the phone's own bars; not all browsers allow it
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  ngOnDestroy(): void {
    this.cancel();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }

  start(event: PointerEvent): void {
    event.preventDefault();
    this.cancel();
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.holding.set(false);
      this.unlocked.emit();
    }, HOLD_MS);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.holding.set(false);
  }
}
