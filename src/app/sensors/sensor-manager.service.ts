import { Injectable, signal, WritableSignal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { Calibration, createCalibration, sampleToQuaternion, SensorAxis, TarePose } from './orientation';
import { MotionSample, MotionSensor, SensorDriver, SensorRole } from './sensor.model';
import { SimulatedSensor } from './simulated/simulated-sensor';
import { MantisXBleDriver } from './mantisx/mantisx-ble.driver';
import { WitMotionBleDriver } from './witmotion/witmotion-ble.driver';

/** A sensor as used by the app: the sensor plus role, calibration and live state. */
export interface SensorSlot {
  sensor: MotionSensor;
  role: WritableSignal<SensorRole>;
  latest: WritableSignal<MotionSample | undefined>;
  /** Measured samples per second. */
  rate: WritableSignal<number>;
  /** Which sensor axis points towards the target (for the bow; used to find the aiming direction). */
  forwardAxis: WritableSignal<SensorAxis>;
  /** Set at "Nulstil" (tare); the 3D model's rest pose maps to this orientation. */
  calibration?: Calibration;
  /** The last HISTORY_MS of samples, oldest first (used for shot recording). */
  history: MotionSample[];
  subscription: Subscription;
}

/** How much sample history each sensor keeps. */
export const HISTORY_MS = 12000;

@Injectable({ providedIn: 'root' })
export class SensorManager {
  /** Add new sensor brands here. */
  readonly drivers: SensorDriver[] = [new WitMotionBleDriver(), new MantisXBleDriver()];

  readonly slots = signal<SensorSlot[]>([]);
  /** Every sample from every sensor, after it has been added to the slot's history. */
  readonly sampleEvents = new Subject<{ slot: SensorSlot; sample: MotionSample }>();
  /** How the bow is held at "Nulstil". Other sensors are always tared upright. */
  readonly bowTarePose = signal<TarePose>('upright');

  readonly bluetoothAvailable = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  /** @param showAll list every BLE device in the picker, not only known sensor types. */
  async connectBle(showAll = false): Promise<SensorSlot> {
    if (!this.bluetoothAvailable) {
      throw new Error('Web Bluetooth er ikke tilgængelig i denne browser (brug Chrome/Edge over https eller localhost).');
    }
    const optionalServices = this.drivers.flatMap((d) => d.optionalServices);
    const device = await navigator.bluetooth.requestDevice(
      showAll
        ? { acceptAllDevices: true, optionalServices }
        : { filters: this.drivers.flatMap((d) => d.bleFilters), optionalServices },
    );
    const server = await device.gatt!.connect();
    for (const driver of this.drivers) {
      if (await driver.supports(server)) {
        const sensor = await driver.connect(device, server);
        return this.add(sensor);
      }
    }
    server.disconnect();
    throw new Error(`Ukendt sensortype: ${device.name ?? device.id}`);
  }

  addSimulated(): SensorSlot {
    return this.add(new SimulatedSensor());
  }

  async remove(slot: SensorSlot): Promise<void> {
    slot.subscription.unsubscribe();
    await slot.sensor.disconnect();
    this.slots.update((list) => list.filter((s) => s !== slot));
  }

  /** Captures the current orientation as the reference (rest) pose. */
  tare(slot: SensorSlot): void {
    const sample = slot.latest();
    const q = sample && sampleToQuaternion(sample);
    slot.calibration = q ? createCalibration(q, slot.forwardAxis(), this.tarePoseFor(slot)) : undefined;
  }

  setForwardAxis(slot: SensorSlot, axis: SensorAxis): void {
    slot.forwardAxis.set(axis);
    this.recalibrate(slot);
  }

  setBowTarePose(pose: TarePose): void {
    this.bowTarePose.set(pose);
    this.slots().forEach((s) => this.recalibrate(s));
  }

  private tarePoseFor(slot: SensorSlot): TarePose {
    return slot.role() === 'bow' ? this.bowTarePose() : 'upright';
  }

  /** Rebuilds the calibration from the stored tare orientation after a setting changed. */
  recalibrate(slot: SensorSlot): void {
    if (slot.calibration) {
      slot.calibration = createCalibration(slot.calibration.reference, slot.forwardAxis(), this.tarePoseFor(slot));
    }
  }

  tareAll(): void {
    this.slots().forEach((s) => this.tare(s));
  }

  private add(sensor: MotionSensor): SensorSlot {
    const taken = new Set(this.slots().map((s) => s.role()));
    const role: SensorRole = !taken.has('bow') ? 'bow' : !taken.has('head') ? 'head' : 'other';

    let count = 0;
    let windowStart = performance.now();
    const slot: SensorSlot = {
      sensor,
      role: signal(role),
      forwardAxis: signal<SensorAxis>('+X'),
      latest: signal(undefined),
      rate: signal(0),
      history: [],
      subscription: sensor.samples.subscribe((sample) => {
        slot.latest.set(sample);
        slot.history.push(sample);
        const cutoff = sample.time - HISTORY_MS;
        let drop = 0;
        while (drop < slot.history.length && slot.history[drop].time < cutoff) drop++;
        if (drop > 50) slot.history.splice(0, drop);
        this.sampleEvents.next({ slot, sample });
        count++;
        const elapsed = sample.time - windowStart;
        if (elapsed >= 1000) {
          slot.rate.set(Math.round((count * 1000) / elapsed));
          count = 0;
          windowStart = sample.time;
        }
      }),
    };
    this.slots.update((list) => [...list, slot]);
    return slot;
  }
}
