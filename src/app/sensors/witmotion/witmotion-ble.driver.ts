import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MotionSample, MotionSensor, SensorDriver, SensorStatus } from '../sensor.model';

/**
 * WitMotion BLE sensors (WT901BLE, BWT901BLECL, WT9011DCL-BT5, ...).
 * Protocol: notifications on FFE4 carry 20-byte packets starting with 0x55.
 *   0x55 0x61: ax ay az gx gy gz roll pitch yaw (int16 LE)
 *   0x55 0x71: register read reply: regL regH + 8 x int16
 * Commands are written to FFE9 as FF AA <reg> <dataL> <dataH>.
 */
const SERVICE = '0000ffe5-0000-1000-8000-00805f9a34fb';
const NOTIFY_CHAR = '0000ffe4-0000-1000-8000-00805f9a34fb';
const WRITE_CHAR = '0000ffe9-0000-1000-8000-00805f9a34fb';

const PACKET_LEN = 20;
const REG_RATE = 0x03;
const REG_QUAT = 0x51;

/** Output rate (Hz) -> register value. */
const RATE_CODES: Record<number, number> = { 1: 0x03, 2: 0x04, 5: 0x05, 10: 0x06, 20: 0x07, 50: 0x08, 100: 0x09, 200: 0x0b };

export class WitMotionBleDriver implements SensorDriver {
  readonly kind = 'witmotion-ble';
  readonly label = 'WitMotion BLE';
  readonly bleFilters: BluetoothLEScanFilter[] = [{ namePrefix: 'WT' }, { services: [SERVICE] }];
  readonly optionalServices: BluetoothServiceUUID[] = [SERVICE];

  async supports(server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      await server.getPrimaryService(SERVICE);
      return true;
    } catch {
      return false;
    }
  }

  async connect(device: BluetoothDevice, server: BluetoothRemoteGATTServer): Promise<MotionSensor> {
    const service = await server.getPrimaryService(SERVICE);
    const notify = await service.getCharacteristic(NOTIFY_CHAR);
    const write = await service.getCharacteristic(WRITE_CHAR);
    const sensor = new WitMotionBleSensor(device, notify, write);
    await sensor.start();
    return sensor;
  }
}

class WitMotionBleSensor implements MotionSensor {
  readonly kind = 'witmotion-ble';
  readonly id: string;
  readonly name: string;
  readonly supportedRates = Object.keys(RATE_CODES).map(Number);

  private readonly _status = signal<SensorStatus>('connecting');
  readonly status = this._status.asReadonly();

  private readonly _samples = new Subject<MotionSample>();
  readonly samples = this._samples.asObservable();

  private buffer = new Uint8Array(0);
  private lastQuat?: MotionSample['quat'];

  constructor(
    private readonly device: BluetoothDevice,
    private readonly notify: BluetoothRemoteGATTCharacteristic,
    private readonly write: BluetoothRemoteGATTCharacteristic,
  ) {
    this.id = device.id;
    this.name = device.name ?? 'WitMotion';
  }

  async start(): Promise<void> {
    this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
    this.notify.addEventListener('characteristicvaluechanged', this.onNotify);
    await this.notify.startNotifications();
    this._status.set('connected');
  }

  async disconnect(): Promise<void> {
    try {
      await this.notify.stopNotifications();
    } catch {
      /* already gone */
    }
    this.device.gatt?.disconnect();
    this.onDisconnected();
  }

  async setRate(hz: number): Promise<void> {
    const code = RATE_CODES[hz];
    if (code === undefined) throw new Error(`Unsupported rate ${hz} Hz`);
    await this.command(0x69, 0x88, 0xb5); // unlock
    await this.command(REG_RATE, code, 0x00);
    await this.command(0x00, 0x00, 0x00); // save
  }

  /** Ask the sensor for its quaternion registers (reply arrives as a 0x71 packet). */
  async requestQuaternion(): Promise<void> {
    await this.command(0x27, REG_QUAT, 0x00);
  }

  private async command(reg: number, lo: number, hi: number): Promise<void> {
    const data = new Uint8Array([0xff, 0xaa, reg, lo, hi]);
    if (this.write.properties.writeWithoutResponse) {
      await this.write.writeValueWithoutResponse(data);
    } else {
      await this.write.writeValueWithResponse(data);
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  private readonly onDisconnected = () => {
    this.notify.removeEventListener('characteristicvaluechanged', this.onNotify);
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this._status.set('disconnected');
  };

  private readonly onNotify = (ev: Event) => {
    const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
    this.parse();
  };

  private parse(): void {
    let offset = 0;
    const buf = this.buffer;
    while (buf.length - offset >= PACKET_LEN) {
      if (buf[offset] !== 0x55) {
        offset++;
        continue;
      }
      const type = buf[offset + 1];
      const view = new DataView(buf.buffer, buf.byteOffset + offset, PACKET_LEN);
      if (type === 0x61) {
        this.emitMotion(view);
        offset += PACKET_LEN;
      } else if (type === 0x71) {
        this.handleRegisters(view);
        offset += PACKET_LEN;
      } else {
        offset++;
      }
    }
    this.buffer = buf.slice(offset);
  }

  private emitMotion(v: DataView): void {
    const s = (i: number) => v.getInt16(2 + i * 2, true) / 32768;
    this._samples.next({
      time: performance.now(),
      acc: [s(0) * 16, s(1) * 16, s(2) * 16],
      gyro: [s(3) * 2000, s(4) * 2000, s(5) * 2000],
      euler: [s(6) * 180, s(7) * 180, s(8) * 180],
      quat: this.lastQuat,
    });
  }

  private handleRegisters(v: DataView): void {
    const reg = v.getUint16(2, true);
    if (reg === REG_QUAT) {
      const q = (i: number) => v.getInt16(4 + i * 2, true) / 32768;
      // Sensor order is w, x, y, z
      this.lastQuat = [q(1), q(2), q(3), q(0)];
    }
  }
}
