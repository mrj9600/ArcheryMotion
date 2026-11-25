import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MotionSample, MotionSensor, SensorDriver, SensorStatus } from '../sensor.model';
import { MANTIS_GYRO_FULL_SCALE, mantisEuler, parseMantisPacket } from './mantisx-protocol';

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
 * How long (ms of arrival time) packets that are behind are watched before deciding whether
 * they are a held-back burst or the sensor sending in real time again after a silence.
 */
const BURST_JUDGE_MS = 50;

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
  readonly gyroFullScale = MANTIS_GYRO_FULL_SCALE;
  readonly id: string;
  readonly name: string;

  private readonly _status = signal<SensorStatus>('connecting');
  readonly status = this._status.asReadonly();
  private readonly _samples = new Subject<MotionSample>();
  readonly samples = this._samples.asObservable();

  private data?: BluetoothRemoteGATTCharacteristic;
  private lastPacket?: number;
  private readonly clock = new PacketClock();
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
    const time = this.clock.endTime(arrival, n, this.sampleMs, packet.counter);
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
 * Gives each packet the time of its last sample. Normally that is the arrival time (the
 * samples are spread back from it).
 *
 * When a packet follows the previous one without a lost packet but arrives long after its
 * samples would have been measured at the sensor's rate, there are two possibilities:
 * - The phone held the notifications back (e.g. the page was in the background) and now
 *   delivers them in a burst, much faster than real time. The samples then continue from the
 *   previous packet at the sensor's rate.
 * - The sensor itself was silent (it stops sending while it lies still) and now sends in real
 *   time again with the next counter. The samples then belong at the arrival time.
 *   Continuing here put the whole rest of a recording 1–15 s too early (club evenings
 *   24–25 November 2026), so the bow and the other sensors no longer lined up.
 * The two are told apart by how fast the lag shrinks over the first BURST_JUDGE_MS.
 */
export class PacketClock {
  private lastCounter?: number;
  private lastTime?: number;
  /** Arrival time and lag when the packets started arriving behind. */
  private behind?: { arrival: number; lag: number; burst: boolean };

  endTime(arrival: number, n: number, sampleMs: number, counter: number): number {
    const time = this.decide(arrival, n, sampleMs, counter);
    this.lastCounter = counter;
    this.lastTime = time;
    return time;
  }

  private decide(arrival: number, n: number, sampleMs: number, counter: number): number {
    if (this.lastCounter === undefined || this.lastTime === undefined) return arrival;
    const inSequence = counter === ((this.lastCounter + 1) & 0xff);
    const continued = this.lastTime + n * sampleMs;
    const lag = arrival - continued;
    if (inSequence && lag > BACKLOG_MS) {
      if (!this.behind) {
        this.behind = { arrival, lag, burst: false };
        return continued;
      }
      if (this.behind.burst) return continued;
      const judged = arrival - this.behind.arrival;
      if (judged < BURST_JUDGE_MS) return continued;
      // A burst catches up many times faster than real time; real time keeps the lag
      if (this.behind.lag - lag > judged) {
        this.behind.burst = true;
        return continued;
      }
    }
    this.behind = undefined;
    return Math.max(arrival, this.lastTime + 0.01);
  }
}
