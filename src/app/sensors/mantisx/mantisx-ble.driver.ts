import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MotionSample, MotionSensor, SensorDriver, SensorStatus } from '../sensor.model';
import { mantisEuler, parseMantisPacket } from './mantisx-protocol';

const SUFFIX = '-204d-616e-7469-732054656368';
const SERVICE = `6e400001${SUFFIX}`;
const DATA = `6e400003${SUFFIX}`;
const PACKET_CODE = `6e400005${SUFFIX}`;
const SAMPLE_MODE = `6e400006${SUFFIX}`;
const CALIBRATION = `6e40000a${SUFFIX}`;
const LOCATION = `6e40000d${SUFFIX}`;

const DEVICE_INFO = '0000180a-0000-1000-8000-00805f9b34fb';
const FIRMWARE_REVISION = '00002a26-0000-1000-8000-00805f9b34fb';

/** Plausible time between samples (ms); packet gaps outside this (lost packets) are ignored. */
const MIN_SAMPLE_MS = 1000 / 450;
const MAX_SAMPLE_MS = 1000 / 250;

/**
 * If packets arrive in sequence (no lost packets) but more than this behind the time the
 * samples would have had at the sensor's rate, they were held back, not lost (ms). Field
 * test 2026-11-24: nothing arrived for 114 s, then all 39 000 samples came within a
 * second; timed on arrival they were squeezed into that second.
 */
const BACKLOG_MS = 1000;

/**
 * MantisX sensor (e.g. "mantis674"). Sends pitch and roll computed in the sensor,
 * gyro x/z and the size of the dynamic acceleration at ~400 Hz. No yaw/heading.
 * Protocol: docs/mantisx-protocol.md.
 */
export class MantisXBleDriver implements SensorDriver {
  readonly kind = 'mantisx-ble';
  readonly label = 'MantisX';
  readonly bleFilters: BluetoothLEScanFilter[] = [{ namePrefix: 'mantis' }, { services: [SERVICE] }];
  readonly optionalServices: BluetoothServiceUUID[] = [SERVICE, DEVICE_INFO];

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
    const sensor = new MantisXBleSensor(device, service, await readHardwareVersion(server));
    await sensor.start();
    return sensor;
  }
}

/** Firmware revision (e.g. "04") decides the pitch range; default 4. */
async function readHardwareVersion(server: BluetoothRemoteGATTServer): Promise<number> {
  try {
    const info = await server.getPrimaryService(DEVICE_INFO);
    const char = await info.getCharacteristic(FIRMWARE_REVISION);
    const text = new TextDecoder().decode(await char.readValue());
    const n = parseInt(text, 10);
    return Number.isFinite(n) ? n : 4;
  } catch {
    return 4;
  }
}

class MantisXBleSensor implements MotionSensor {
  readonly kind = 'mantisx-ble';
  readonly id: string;
  readonly name: string;

  private readonly _status = signal<SensorStatus>('connecting');
  readonly status = this._status.asReadonly();
  private readonly _samples = new Subject<MotionSample>();
  readonly samples = this._samples.asObservable();

  private data?: BluetoothRemoteGATTCharacteristic;
  private lastPacket?: number;
  private lastCounter?: number;
  private lastSampleTime?: number;
  /** Running estimate of the time between samples (ms); measured ~340 Hz. */
  private sampleMs = 1000 / 340;

  constructor(
    private readonly device: BluetoothDevice,
    private readonly service: BluetoothRemoteGATTService,
    private readonly hardwareVersion: number,
  ) {
    this.id = device.id;
    this.name = device.name ?? 'MantisX';
  }

  /** Same start-up as the official app: calibration notify, 0d=02, 0a=01, 05=05, 06=04, data notify. */
  async start(): Promise<void> {
    this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
    const calibration = await this.service.getCharacteristic(CALIBRATION);
    try {
      await calibration.startNotifications();
    } catch {
      /* not essential */
    }
    await this.write(LOCATION, 0x02);
    await this.write(CALIBRATION, 0x01);
    await this.write(PACKET_CODE, 0x05);
    await this.write(SAMPLE_MODE, 0x04);
    this.data = await this.service.getCharacteristic(DATA);
    this.data.addEventListener('characteristicvaluechanged', this.onData);
    await this.data.startNotifications();
    this._status.set('connected');
  }

  async disconnect(): Promise<void> {
    try {
      await this.data?.stopNotifications();
    } catch {
      /* already gone */
    }
    this.device.gatt?.disconnect();
    this.onDisconnected();
  }

  private async write(uuid: string, value: number): Promise<void> {
    const char = await this.service.getCharacteristic(uuid);
    await char.writeValueWithResponse(new Uint8Array([value]));
  }

  private readonly onDisconnected = () => {
    this.data?.removeEventListener('characteristicvaluechanged', this.onData);
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this._status.set('disconnected');
  };

  private readonly onData = (ev: Event) => {
    const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (!v) return;
    const packet = parseMantisPacket(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), this.hardwareVersion);
    if (!packet) return;
    const arrival = performance.now();
    const n = packet.samples.length;
    const measured = this.lastPacket === undefined ? NaN : (arrival - this.lastPacket) / n;
    this.lastPacket = arrival;
    if (measured >= MIN_SAMPLE_MS && measured <= MAX_SAMPLE_MS) this.sampleMs += 0.05 * (measured - this.sampleMs);
    const time = packetEndTime(arrival, n, this.sampleMs, packet.counter, this.lastCounter, this.lastSampleTime);
    this.lastCounter = packet.counter;
    this.lastSampleTime = time;
    packet.samples.forEach((s, i) => {
      this._samples.next({
        time: time - (n - 1 - i) * this.sampleMs,
        euler: mantisEuler(s),
        gyro: [s.gyroX, 0, s.gyroZ],
        accMagnitude: s.accMagnitude,
      });
    });
  };
}

/**
 * Time of a packet's last sample. Normally the arrival time (the samples are spread back
 * from it). When the packet follows the previous one without a lost packet but arrives
 * long after the samples were measured (the phone held the notifications back, e.g. while
 * the page was in the background), the samples continue from the previous packet at the
 * sensor's rate instead.
 */
export function packetEndTime(
  arrival: number,
  n: number,
  sampleMs: number,
  counter: number,
  lastCounter: number | undefined,
  lastSampleTime: number | undefined,
): number {
  if (lastCounter === undefined || lastSampleTime === undefined) return arrival;
  const inSequence = counter === ((lastCounter + 1) & 0xff);
  const continued = lastSampleTime + n * sampleMs;
  if (inSequence && arrival - continued > BACKLOG_MS) return continued;
  return Math.max(arrival, lastSampleTime + 0.01);
}
