import { Injectable, signal, WritableSignal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { MotionSample, MotionSensor, SensorDriver, SensorRole } from './sensor.model';
import { SimulatedSensor } from './simulated/simulated-sensor';
import { MantisXBleDriver } from './mantisx/mantisx-ble.driver';
import { WitMotionBleDriver } from './witmotion/witmotion-ble.driver';

/** A sensor as used by the app: the sensor plus its role and live state. */
export interface SensorSlot {
  sensor: MotionSensor;
  role: WritableSignal<SensorRole>;
  latest: WritableSignal<MotionSample | undefined>;
  /** Measured samples per second. */
  rate: WritableSignal<number>;
  subscription: Subscription;
}

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

  private add(sensor: MotionSensor): SensorSlot {
    const taken = new Set(this.slots().map((s) => s.role()));
    const role: SensorRole = !taken.has('bow') ? 'bow' : !taken.has('drawArm') ? 'drawArm' : 'other';

    let count = 0;
    let windowStart = performance.now();
    const slot: SensorSlot = {
      sensor,
      role: signal(role),
      latest: signal(undefined),
      rate: signal(0),
      subscription: sensor.samples.subscribe((sample) => {
        slot.latest.set(sample);
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
