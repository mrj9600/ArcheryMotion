import { Injectable, signal, WritableSignal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { MotionSample, MotionSensor, SensorDriver, SensorRole } from './sensor.model';
import { SimulatedSensor } from './simulated/simulated-sensor';
import { MantisXBleDriver } from './mantisx/mantisx-ble.driver';
import { WitMotionBleDriver } from './witmotion/witmotion-ble.driver';

/**
 * 'reconnecting': the connection was lost (e.g. the archer walked away from the bow) and
 * the app keeps trying to connect again. 'disconnected': removed, or not a BLE sensor.
 */
export type SlotStatus = 'connected' | 'reconnecting' | 'disconnected';

/** A sensor as used by the app: the sensor plus its role and live state. */
export interface SensorSlot {
  /** Replaced by a new sensor object when the connection is made again. */
  sensor: MotionSensor;
  status: WritableSignal<SlotStatus>;
  role: WritableSignal<SensorRole>;
  latest: WritableSignal<MotionSample | undefined>;
  /** Measured samples per second. */
  rate: WritableSignal<number>;
  subscription: Subscription;
}

/** Wait between reconnect attempts (ms); grows from the first to the last value. */
const RETRY_MS = [500, 1000, 2000, 3000];

@Injectable({ providedIn: 'root' })
export class SensorManager {
  /** Add new sensor brands here. */
  readonly drivers: SensorDriver[] = [new WitMotionBleDriver(), new MantisXBleDriver()];

  readonly slots = signal<SensorSlot[]>([]);
  /** Every sample from every sensor. */
  readonly sampleEvents = new Subject<{ slot: SensorSlot; sample: MotionSample }>();

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
    const existing = this.slots().find((s) => s.sensor.id === device.id);
    if (existing) return existing;
    const server = await device.gatt!.connect();
    for (const driver of this.drivers) {
      if (await driver.supports(server)) {
        const slot = this.add(await driver.connect(device, server));
        // The connection drops when the phone and the bow get too far apart: keep trying
        device.addEventListener('gattserverdisconnected', () => {
          if (slot.status() === 'connected' && this.slots().includes(slot)) void this.reconnect(slot, device, driver);
        });
        return slot;
      }
    }
    server.disconnect();
    throw new Error(`Ukendt sensortype: ${device.name ?? device.id}`);
  }

  addSimulated(): SensorSlot {
    return this.add(new SimulatedSensor());
  }

  async remove(slot: SensorSlot): Promise<void> {
    slot.status.set('disconnected'); // stops reconnecting
    this.slots.update((list) => list.filter((s) => s !== slot));
    slot.subscription.unsubscribe();
    await slot.sensor.disconnect();
  }

  /** Tries to connect again until it works or the sensor is removed. */
  private async reconnect(slot: SensorSlot, device: BluetoothDevice, driver: SensorDriver): Promise<void> {
    slot.status.set('reconnecting');
    slot.rate.set(0);
    for (let attempt = 0; this.active(slot); attempt++) {
      try {
        // Fails (after a while) as long as the sensor is out of range
        const server = await device.gatt!.connect();
        if (!this.active(slot)) {
          server.disconnect();
          return;
        }
        const sensor = await driver.connect(device, server);
        slot.subscription.unsubscribe();
        slot.sensor = sensor;
        slot.subscription = this.listen(slot);
        slot.status.set('connected');
        return;
      } catch {
        if (device.gatt?.connected) device.gatt.disconnect();
        await new Promise((r) => setTimeout(r, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]));
      }
    }
  }

  private active(slot: SensorSlot): boolean {
    return slot.status() === 'reconnecting' && this.slots().includes(slot);
  }

  private add(sensor: MotionSensor): SensorSlot {
    const taken = new Set(this.slots().map((s) => s.role()));
    const role: SensorRole = !taken.has('bow') ? 'bow' : !taken.has('drawArm') ? 'drawArm' : 'other';
    const slot: SensorSlot = {
      sensor,
      status: signal('connected'),
      role: signal(role),
      latest: signal(undefined),
      rate: signal(0),
      subscription: Subscription.EMPTY,
    };
    slot.subscription = this.listen(slot);
    this.slots.update((list) => [...list, slot]);
    return slot;
  }

  /** Passes the slot's samples on and measures its rate. */
  private listen(slot: SensorSlot): Subscription {
    let count = 0;
    let windowStart = performance.now();
    return slot.sensor.samples.subscribe((sample) => {
      slot.latest.set(sample);
      this.sampleEvents.next({ slot, sample });
      count++;
      const elapsed = sample.time - windowStart;
      if (elapsed >= 1000) {
        slot.rate.set(Math.round((count * 1000) / elapsed));
        count = 0;
        windowStart = sample.time;
      }
    });
  }
}
