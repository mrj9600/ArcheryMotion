import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SensorManager } from './sensor-manager.service';
import { MotionSample, MotionSensor, SensorDriver } from './sensor.model';

/** A BLE device that can be taken out of range and brought back. */
class FakeDevice extends EventTarget {
  id = 'dev1';
  name = 'fake';
  inRange = true;
  attempts = 0;
  gatt = {
    connected: false,
    connect: async () => {
      this.attempts++;
      if (!this.inRange) throw new Error('NetworkError');
      this.gatt.connected = true;
      return this.gatt;
    },
    disconnect: () => {
      this.gatt.connected = false;
    },
  };
  drop(): void {
    this.gatt.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
}

function fakeSensor(): MotionSensor & { samples$: Subject<MotionSample> } {
  const samples$ = new Subject<MotionSample>();
  return { id: 'dev1', name: 'fake', kind: 'fake', status: signal('connected'), samples: samples$, samples$, disconnect: async () => undefined };
}

describe('SensorManager reconnect', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps trying after the connection drops and uses the same slot when back', async () => {
    vi.useFakeTimers();
    const device = new FakeDevice();
    const sensors: ReturnType<typeof fakeSensor>[] = [];
    const driver: SensorDriver = {
      kind: 'fake',
      label: 'Fake',
      bleFilters: [],
      optionalServices: [],
      supports: async () => true,
      connect: async () => {
        const s = fakeSensor();
        sensors.push(s);
        return s;
      },
    };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device }, configurable: true });
    const manager = TestBed.inject(SensorManager);
    (manager as { drivers: SensorDriver[] }).drivers = [driver];
    (manager as { bluetoothAvailable: boolean }).bluetoothAvailable = true;

    const slot = await manager.connectBle();
    const seen: MotionSample[] = [];
    manager.sampleEvents.subscribe((e) => {
      expect(e.slot).toBe(slot);
      seen.push(e.sample);
    });
    sensors[0].samples$.next({ time: 1 });

    device.inRange = false;
    device.drop();
    expect(slot.status()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(20000);
    expect(device.attempts).toBeGreaterThan(5);
    expect(slot.status()).toBe('reconnecting');

    device.inRange = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(slot.status()).toBe('connected');
    expect(sensors.length).toBe(2);
    expect(slot.sensor).toBe(sensors[1]);
    sensors[0].samples$.next({ time: 2 }); // the old sensor is no longer listened to
    sensors[1].samples$.next({ time: 3 });
    expect(seen.map((s) => s.time)).toEqual([1, 3]);

    // Removing it stops the attempts
    await manager.remove(slot);
    device.inRange = false;
    device.drop();
    const before = device.attempts;
    await vi.advanceTimersByTimeAsync(10000);
    expect(device.attempts).toBe(before);
  });
});
