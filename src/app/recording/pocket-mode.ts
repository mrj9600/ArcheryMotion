import { Component, input, OnDestroy, OnInit, output, signal } from '@angular/core';

/** How long the ring must be held to leave pocket mode (ms). */
const HOLD_MS = 1500;
/** Circumference of the progress circle (r = 56: 2π·56 ≈ 352), written out so the styles stay static. */
const RING = 352;

/**
 * Pocket mode: a black screen that ignores touches, so the phone can lie in a pocket while
 * it records. The screen stays on (the recording keeps the wake lock), because a web app
 * stops getting sensor data when the phone is locked. Black uses little power on most
 * phone screens. Leave it by holding the ring for 1.5 s.
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
        aria-label="Hold i 1,5 sekund for at låse op"
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r="56" />
          <circle class="fill" cx="60" cy="60" r="56" />
        </svg>
        <span>Hold</span>
      </button>
      <p class="help">Hold fingeren på ringen i 1,5 sekund for at låse op.<br />Tryk ikke på tænd/sluk-knappen: så stopper optagelsen med at få data, indtil du låser op.</p>
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
      border: none;
      background: #000;
      color: #666;
      font-size: 16px;
      position: relative;
      padding: 0;
    }
    .ring svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      /* Starts at the top and fills clockwise, like a clock hand */
      transform: rotate(-90deg);
    }
    .ring circle {
      fill: none;
      stroke-width: 4;
    }
    .track {
      stroke: #444;
    }
    .fill {
      stroke: #2f855a;
      stroke-dasharray: ${RING};
      stroke-dashoffset: ${RING};
    }
    .ring.holding .fill {
      stroke-dashoffset: 0;
      transition: stroke-dashoffset ${HOLD_MS}ms linear;
    }
  `,
})
export class PocketMode implements OnInit, OnDestroy {
  /** Shown dimly, e.g. "Optager · 12 skud". */
  readonly status = input('');
  readonly unlocked = output<void>();
  /** The phone was locked (screen off) for this many ms; pocket mode is left right away. */
  readonly wasLocked = output<number>();

  readonly holding = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private hiddenAt?: number;

  /**
   * The side button locks the phone (a page cannot stop that), and the archer usually
   * presses it to get out. So coming back from a locked screen leaves pocket mode at once.
   */
  private readonly onVisibility = () => {
    if (document.hidden) {
      this.hiddenAt = performance.now();
      return;
    }
    if (this.hiddenAt === undefined) return;
    const ms = performance.now() - this.hiddenAt;
    this.hiddenAt = undefined;
    this.wasLocked.emit(ms);
    this.unlocked.emit();
  };

  ngOnInit(): void {
    // Full screen hides the phone's own bars; not all browsers allow it
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.cancel();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }

  start(event: PointerEvent): void {
    event.preventDefault();
    this.cancel();
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.holding.set(false);
      navigator.vibrate?.(60);
      this.unlocked.emit();
    }, HOLD_MS);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.holding.set(false);
  }
}
