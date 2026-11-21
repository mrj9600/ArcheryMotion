import { Injectable, inject, signal } from '@angular/core';
import { SensorManager } from '../sensors/sensor-manager.service';
import { Shot } from './shot.model';

/** Time kept before / after the release (ms). */
export const PRE_RELEASE_MS = 10000;
export const POST_RELEASE_MS = 1500;
/** Minimum time between two automatically detected shots (ms). */
const COOLDOWN_MS = 3000;

export type RecorderState = 'idle' | 'armed' | 'capturing';

/** Time constant of the running mean the release is detected against (s). */
const BASELINE_TAU = 0.3;

/**
 * Watches the bow sensor and records a window of all sensors around the release.
 * While aiming, the measured acceleration is almost constant (gravity in the sensor
 * frame). The release is the first sample whose acceleration vector differs from the
 * running mean by more than the threshold, which catches a jolt in any direction.
 */
@Injectable({ providedIn: 'root' })
export class ShotRecorder {
  private readonly manager = inject(SensorManager);

  readonly armed = signal(false);
  /** Release threshold in g. */
  readonly threshold = signal(0.5);
  readonly state = signal<RecorderState>('idle');
  readonly shots = signal<Shot[]>([]);

  private nextId = 1;
  private lastRelease = -Infinity;
  private baseline?: { acc: [number, number, number]; time: number };

  constructor() {
    this.manager.sampleEvents.subscribe(({ slot, sample }) => {
      if (slot.role() !== 'bow') return;
      if (!sample.acc) {
        // Sensors with gravity-free acceleration size only: compare it directly
        if (
          sample.accMagnitude !== undefined &&
          this.state() === 'armed' &&
          sample.accMagnitude > this.threshold() &&
          sample.time - this.lastRelease > COOLDOWN_MS
        ) {
          this.capture(sample.time, 'auto');
        }
        return;
      }
      const acc = sample.acc;
      const base = this.baseline;
      if (!base || sample.time - base.time > 1000) {
        this.baseline = { acc: [...acc], time: sample.time };
        return;
      }
      const deviation = Math.hypot(acc[0] - base.acc[0], acc[1] - base.acc[1], acc[2] - base.acc[2]);
      if (this.state() === 'armed' && deviation > this.threshold() && sample.time - this.lastRelease > COOLDOWN_MS) {
        this.capture(sample.time, 'auto');
      }
      const alpha = 1 - Math.exp(-(sample.time - base.time) / 1000 / BASELINE_TAU);
      for (let i = 0; i < 3; i++) base.acc[i] += alpha * (acc[i] - base.acc[i]);
      base.time = sample.time;
    });
  }

  setArmed(armed: boolean): void {
    this.armed.set(armed);
    if (this.state() !== 'capturing') this.state.set(armed ? 'armed' : 'idle');
  }

  /** Marks "now" as the release, e.g. for testing without a real shot. */
  triggerNow(): void {
    if (this.state() !== 'capturing') this.capture(performance.now(), 'manual');
  }

  remove(shot: Shot): void {
    this.shots.update((list) => list.filter((s) => s !== shot));
  }

  private capture(releaseTime: number, trigger: Shot['trigger']): void {
    this.state.set('capturing');
    this.lastRelease = releaseTime;
    setTimeout(() => {
      const from = releaseTime - PRE_RELEASE_MS;
      const to = releaseTime + POST_RELEASE_MS;
      const shot: Shot = {
        id: this.nextId++,
        recordedAt: new Date(),
        releaseTime,
        trigger,
        sensors: this.manager.slots().map((slot) => ({
          name: slot.sensor.name,
          kind: slot.sensor.kind,
          role: slot.role(),
          calibration: slot.calibration,
          samples: slot.history.filter((s) => s.time >= from && s.time <= to),
        })),
      };
      this.shots.update((list) => [shot, ...list]);
      this.state.set(this.armed() ? 'armed' : 'idle');
    }, POST_RELEASE_MS + 100);
  }
}
