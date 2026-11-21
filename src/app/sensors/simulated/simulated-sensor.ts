import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { MotionSample, MotionSensor, SensorStatus, Vec3 } from '../sensor.model';

let counter = 0;

const DEG = MathUtils.DEG2RAD;
const G = 9.81;
const CYCLE = 12; // seconds per shot cycle
const RELEASE_AT = 9; // release time within the cycle

/** 0→1 with zero slope at both ends. */
function smoothstep(x: number): number {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
}

/**
 * Bow elevation (degrees, up positive) through one shot cycle: pointing down, raised
 * above the target, drawn down onto it, held, released and lowered again.
 */
function elevation(c: number): number {
  if (c < 1.5) return -40;
  if (c < 3.5) return -40 + 55 * smoothstep((c - 1.5) / 2);
  if (c < 5) return 15 - 15 * smoothstep((c - 3.5) / 1.5);
  if (c < RELEASE_AT + 1.2) return 0;
  return -40 * smoothstep((c - RELEASE_AT - 1.2) / 1.8);
}

/** Aiming sway amplitude: settles during the hold. */
function swayAmplitude(c: number): number {
  if (c < 5) return 0.5;
  return Math.max(0.25, 2 - (c - 5) * 0.45);
}

/** Smooth step response starting with zero velocity: 1 - e^(-s)(1+s), s = t/τ. */
function step(t: number, tau: number): number {
  if (t <= 0) return 0;
  const s = t / tau;
  return 1 - Math.exp(-s) * (1 + s);
}

/** Fades from 1 to 0 between t0 and t1 (back to aiming for the next arrow). */
function fadeOut(t: number, t0: number, t1: number): number {
  if (t <= t0) return 1;
  if (t >= t1) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * (t - t0)) / (t1 - t0)));
}

function noise(amount: number): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * amount;
}

/**
 * A fake sensor for developing without hardware. The sensor is mounted with +X towards
 * the target and Z up (WitMotion frame). Every 12 seconds it goes through a whole shot:
 * bow pointing down, raised above the target, drawn down onto it, held with settling
 * sway, released (jumps forward, drops, tips forward in the sling) and lowered again.
 * Accelerations are physically consistent with the motion (gravity included), so the
 * shot analysis can be tried without real shots.
 */
export class SimulatedSensor implements MotionSensor {
  readonly kind = 'simulated';
  readonly id = `sim-${++counter}`;
  readonly name = `Simuleret ${counter}`;
  readonly supportedRates = [10, 50, 100, 200];

  private readonly _status = signal<SensorStatus>('connected');
  readonly status = this._status.asReadonly();
  private readonly _samples = new Subject<MotionSample>();
  readonly samples = this._samples.asObservable();

  private timer?: ReturnType<typeof setInterval>;
  private readonly start = performance.now();
  // Start in the hold phase so the automatic tare right after adding catches an aiming pose
  private readonly phase = 5.5 + Math.random() * 1.5;
  private prevT?: number;
  private prevVel = new Vector3();

  constructor(rate = 100) {
    this.run(rate);
  }

  async setRate(hz: number): Promise<void> {
    this.run(hz);
  }

  async disconnect(): Promise<void> {
    clearInterval(this.timer);
    this._status.set('disconnected');
  }

  private run(hz: number): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000 / hz);
  }

  /** Bow position in the sensor's world frame (X forward, Y left, Z up), metres. */
  private position(t: number): Vector3 {
    const dt = (t % CYCLE) - RELEASE_AT;
    const fade = fadeOut(dt, 1.2, 2);
    const vibration = dt > 0 ? 0.0001 * Math.exp(-dt / 0.06) * Math.sin(2 * Math.PI * 35 * dt) : 0;
    return new Vector3(
      (0.06 * step(dt, 0.05) + vibration) * fade, // jumps forward, with a short vibration
      0.01 * step(dt, 0.08) * fade, // slightly left
      -0.025 * step(dt, 0.12) * fade, // drops
    );
  }

  /** Roll, pitch, yaw in degrees. */
  private angles(t: number): Vec3 {
    const c = t % CYCLE;
    const dt = c - RELEASE_AT;
    const amp = swayAmplitude(c);
    const sway = (f1: number, f2: number) => (Math.sin(t * f1) * 0.7 + Math.sin(t * f2) * 0.3) * amp;
    const shot = step(dt, 0.15) * fadeOut(dt, 1.2, 2);
    return [
      sway(0.7, 4.1) * 0.5 + 3 * shot, // cant
      -elevation(c) + sway(2.1, 5.3) + 25 * shot, // pitch: positive Y rotation tips the front down
      sway(1.7, 6.2) + 4 * shot, // yaw
    ];
  }

  private tick(): void {
    const now = performance.now();
    const t = (now - this.start) / 1000 + this.phase;
    const h = 0.002;

    // Mean acceleration since the previous sample, like a real sensor's low-pass filter:
    // this keeps the area under the curve (= change in velocity) correct even across the
    // abrupt release.
    const vel = this.position(t + h).sub(this.position(t - h)).divideScalar(2 * h);
    const acc =
      this.prevT !== undefined && t > this.prevT
        ? vel.clone().sub(this.prevVel).divideScalar(t - this.prevT)
        : new Vector3();
    this.prevT = t;
    this.prevVel = vel;

    const euler = this.angles(t);
    const q = new Quaternion().setFromEuler(new Euler(euler[0] * DEG, euler[1] * DEG, euler[2] * DEG, 'ZYX'));

    // Accelerometer measures (a - g) in the body frame; with Z up that is a + (0,0,g)
    const specific = acc.divideScalar(G).add(new Vector3(0, 0, 1));
    const body = specific.applyQuaternion(q.clone().invert());

    const prev = this.angles(t - h);
    const gyro = euler.map((v, i) => (v - prev[i]) / h) as Vec3;

    this._samples.next({
      time: now,
      acc: [body.x + noise(0.004), body.y + noise(0.004), body.z + noise(0.004)],
      gyro,
      // Angle noise like a real WitMotion lying still (~0.05 °/s between samples)
      euler: [euler[0] + noise(0.0005), euler[1] + noise(0.0005), euler[2] + noise(0.0005)],
    });
  }
}
