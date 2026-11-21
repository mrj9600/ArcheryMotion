import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, signal, WritableSignal } from '@angular/core';

/** Services we know about; Web Bluetooth only exposes services listed up front. */
const KNOWN_SERVICES: { uuid: string; name: string }[] = [
  { uuid: '6e400001-204d-616e-7469-732054656368', name: 'MantisX (Nordic UART-variant)' },
  { uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', name: 'Nordic UART Service' },
  // WitMotion really uses ...9a34fb (not the standard Bluetooth base ...9b34fb)
  { uuid: '0000ffe5-0000-1000-8000-00805f9a34fb', name: 'WitMotion' },
  { uuid: '0000180f-0000-1000-8000-00805f9b34fb', name: 'Battery' },
  { uuid: '0000180a-0000-1000-8000-00805f9b34fb', name: 'Device Information' },
  { uuid: '0000fe59-0000-1000-8000-00805f9b34fb', name: 'Nordic DFU (firmware) – SKRIV IKKE HERTIL' },
];

const MANTIS_SUFFIX = '204d-616e-7469-732054656368';
const EXTRA_KEY = 'ble-explorer.extra-services';
const MAX_LOG = 100_000;

interface CharView {
  uuid: string;
  /** Firmware-update service: writing here can brick the device. */
  dfu: boolean;
  serviceName: string;
  props: string[];
  char: BluetoothRemoteGATTCharacteristic;
  session: DeviceSession;
  notifying: WritableSignal<boolean>;
  packets: WritableSignal<number>;
  lastLength: WritableSignal<number>;
  writeHex: string;
}

interface DeviceSession {
  label: string;
  device: BluetoothDevice;
  connected: WritableSignal<boolean>;
  chars: WritableSignal<CharView[]>;
  kind: 'mantis' | 'wit' | 'other';
}

interface LogEntry {
  time: number;
  dev: string;
  dir: 'rx' | 'tx' | 'read' | 'info';
  char: string;
  bytes: Uint8Array;
  text?: string;
}

function shortUuid(uuid: string): string {
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9[ab]34fb$/i.exec(uuid);
  return m ? m[1] : uuid.slice(0, 8);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function toAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
}

function parseHex(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('Ulige antal hex-tegn');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** int16 little-endian values of a packet, for spotting sensor axes. */
function toInt16(bytes: Uint8Array, offset: number): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vals: number[] = [];
  for (let i = offset; i + 1 < bytes.length; i += 2) vals.push(view.getInt16(i, true));
  return vals.join(' ');
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generic BLE tool: connect to one or more devices, list characteristics, subscribe and
 * log raw packets from all of them in one shared, time-aligned log.
 */
@Component({
  selector: 'app-ble-explorer-page',
  imports: [DecimalPipe],
  templateUrl: './ble-explorer-page.html',
  styleUrl: './ble-explorer-page.scss',
})
export class BleExplorerPage implements OnDestroy {
  protected readonly known = KNOWN_SERVICES;
  protected readonly extraServices = signal(this.loadExtra());
  protected readonly sessions = signal<DeviceSession[]>([]);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly paused = signal(false);
  protected readonly format = signal<'hex' | 'int16' | 'int16odd'>('hex');
  protected readonly anyConnected = computed(() => this.sessions().some((s) => s.connected()));

  /** The log is kept outside signals (it can grow fast); logVersion triggers redraws. */
  private entries: LogEntry[] = [];
  private readonly logVersion = signal(0);
  private redrawPending = false;
  protected readonly logCount = computed(() => (this.logVersion(), this.entries.length));
  protected readonly visibleLog = computed(() => (this.logVersion(), this.entries.slice(-300).reverse()));

  private readonly charViews = new Map<BluetoothRemoteGATTCharacteristic, CharView>();
  private readonly startTime = performance.now();

  ngOnDestroy(): void {
    this.sessions().forEach((s) => s.device.gatt?.disconnect());
  }

  protected setExtra(value: string): void {
    this.extraServices.set(value);
    try {
      localStorage.setItem(EXTRA_KEY, value);
    } catch {
      /* storage unavailable */
    }
  }

  private loadExtra(): string {
    try {
      return localStorage.getItem(EXTRA_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private serviceList(): string[] {
    const extra = this.extraServices()
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [...KNOWN_SERVICES.map((s) => s.uuid), ...extra];
  }

  protected async connect(): Promise<void> {
    this.error.set(undefined);
    this.busy.set(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.serviceList(),
      });
      let session = this.sessions().find((s) => s.device.id === device.id);
      if (!session) {
        session = {
          label: device.name ?? device.id.slice(0, 6),
          device,
          connected: signal(false),
          chars: signal([]),
          kind: 'other',
        };
        const s = session;
        device.addEventListener('gattserverdisconnected', () => {
          s.connected.set(false);
          s.chars().forEach((c) => c.notifying.set(false));
          this.addLog(s.label, 'info', '', new Uint8Array(), 'Forbindelsen blev afbrudt');
        });
        this.sessions.update((list) => [...list, s]);
      }
      const server = await device.gatt!.connect();
      session.connected.set(true);
      this.addLog(session.label, 'info', '', new Uint8Array(), 'Forbundet');
      await this.discover(session, server);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected disconnect(session: DeviceSession): void {
    session.device.gatt?.disconnect();
  }

  protected remove(session: DeviceSession): void {
    session.device.gatt?.disconnect();
    this.sessions.update((list) => list.filter((s) => s !== session));
  }

  private async discover(session: DeviceSession, server: BluetoothRemoteGATTServer): Promise<void> {
    const views: CharView[] = [];
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const name = KNOWN_SERVICES.find((k) => k.uuid === service.uuid)?.name ?? `Ukendt service ${service.uuid}`;
      let chars: BluetoothRemoteGATTCharacteristic[] = [];
      try {
        chars = await service.getCharacteristics();
      } catch {
        continue;
      }
      for (const char of chars) {
        const p = char.properties;
        const props = [
          p.read && 'read',
          p.write && 'write',
          p.writeWithoutResponse && 'writeNoResp',
          p.notify && 'notify',
          p.indicate && 'indicate',
        ].filter((x): x is string => !!x);
        const view: CharView = {
          dfu: service.uuid.startsWith('0000fe59'),
          uuid: char.uuid,
          serviceName: name,
          props,
          char,
          session,
          notifying: signal(false),
          packets: signal(0),
          lastLength: signal(0),
          writeHex: '',
        };
        this.charViews.set(char, view);
        views.push(view);
      }
    }
    session.kind = views.some((c) => c.uuid.endsWith(MANTIS_SUFFIX))
      ? 'mantis'
      : views.some((c) => c.uuid.startsWith('0000ffe4'))
        ? 'wit'
        : 'other';
    session.chars.set(views);
    this.addLog(session.label, 'info', '', new Uint8Array(), `Fandt ${services.length} services og ${views.length} characteristics`);
  }

  private findChar(session: DeviceSession, prefix: string, suffix = ''): CharView | undefined {
    return session.chars().find((c) => c.uuid.startsWith(prefix) && c.uuid.endsWith(suffix));
  }

  /**
   * Replays the start-up sequence the official MantisX app sends (from an HCI snoop log):
   * notify 0a, write 0d=02, 0a=01, 05=05, 06=04, then notify on 03 (data).
   */
  protected async startMantis(session: DeviceSession): Promise<void> {
    this.error.set(undefined);
    const steps: [string, number][] = [
      ['6e40000d', 0x02],
      ['6e40000a', 0x01],
      ['6e400005', 0x05],
      ['6e400006', 0x04],
    ];
    try {
      const status = this.findChar(session, '6e40000a', MANTIS_SUFFIX);
      if (status && !status.notifying()) await this.toggleNotify(status);
      for (const [prefix, value] of steps) {
        const c = this.findChar(session, prefix, MANTIS_SUFFIX);
        if (!c) throw new Error(`Characteristic ${prefix} findes ikke`);
        const data = new Uint8Array([value]);
        await c.char.writeValueWithResponse(data);
        this.addLog(session.label, 'tx', c.uuid, data);
      }
      const dataChar = this.findChar(session, '6e400003', MANTIS_SUFFIX);
      if (dataChar && !dataChar.notifying()) await this.toggleNotify(dataChar);
      this.addLog(session.label, 'info', '', new Uint8Array(), 'MantisX-opstart sendt');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Sets a WitMotion sensor to 200 Hz output (not saved permanently) and starts notify on FFE4. */
  protected async startWit(session: DeviceSession): Promise<void> {
    this.error.set(undefined);
    try {
      const write = this.findChar(session, '0000ffe9');
      const notify = this.findChar(session, '0000ffe4');
      if (!write || !notify) throw new Error('WitMotion-characteristics FFE9/FFE4 findes ikke');
      for (const cmd of [
        [0xff, 0xaa, 0x69, 0x88, 0xb5], // unlock
        [0xff, 0xaa, 0x03, 0x0b, 0x00], // output rate 200 Hz
      ]) {
        const data = new Uint8Array(cmd);
        if (write.char.properties.writeWithoutResponse) await write.char.writeValueWithoutResponse(data);
        else await write.char.writeValueWithResponse(data);
        this.addLog(session.label, 'tx', write.uuid, data);
        await delay(100);
      }
      if (!notify.notifying()) await this.toggleNotify(notify);
      this.addLog(session.label, 'info', '', new Uint8Array(), 'WitMotion sat til 200 Hz');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Adds a note to the log, e.g. which way the sensors are being moved right now. */
  protected addMarker(text: string): void {
    const t = text.trim();
    if (!t) return;
    this.addLog('', 'info', '', new Uint8Array(), `MARKØR: ${t}`);
  }

  protected async toggleNotify(c: CharView): Promise<void> {
    try {
      if (c.notifying()) {
        await c.char.stopNotifications();
        c.char.removeEventListener('characteristicvaluechanged', this.onValue);
        c.notifying.set(false);
      } else {
        c.char.addEventListener('characteristicvaluechanged', this.onValue);
        await c.char.startNotifications();
        c.notifying.set(true);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async read(c: CharView): Promise<void> {
    try {
      const v = await c.char.readValue();
      this.addLog(c.session.label, 'read', c.uuid, new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async write(c: CharView, withResponse: boolean): Promise<void> {
    this.error.set(undefined);
    try {
      const data = parseHex(c.writeHex);
      if (withResponse) await c.char.writeValueWithResponse(data);
      else await c.char.writeValueWithoutResponse(data);
      this.addLog(c.session.label, 'tx', c.uuid, data);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  private readonly onValue = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const v = char.value;
    if (!v) return;
    const bytes = new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
    const view = this.charViews.get(char);
    view?.packets.update((n) => n + 1);
    view?.lastLength.set(bytes.length);
    if (!this.paused()) this.addLog(view?.session.label ?? '?', 'rx', char.uuid, bytes);
  };

  private addLog(dev: string, dir: LogEntry['dir'], char: string, bytes: Uint8Array, text?: string): void {
    this.entries.push({ time: (performance.now() - this.startTime) / 1000, dev, dir, char, bytes, text });
    if (this.entries.length > MAX_LOG) this.entries.splice(0, this.entries.length - MAX_LOG);
    if (!this.redrawPending) {
      this.redrawPending = true;
      setTimeout(() => {
        this.redrawPending = false;
        this.logVersion.update((n) => n + 1);
      }, 200);
    }
  }

  protected clearLog(): void {
    this.entries = [];
    this.logVersion.update((n) => n + 1);
    this.sessions().forEach((s) => s.chars().forEach((c) => c.packets.set(0)));
  }

  protected render(e: LogEntry): string {
    if (e.text) return e.text;
    const f = this.format();
    if (f === 'int16') return toInt16(e.bytes, 0);
    if (f === 'int16odd') return toInt16(e.bytes, 1);
    return toHex(e.bytes);
  }

  protected ascii(e: LogEntry): string {
    return e.text ? '' : toAscii(e.bytes);
  }

  protected short(uuid: string): string {
    return shortUuid(uuid);
  }

  /** Saves the whole log as a text file for analysis. */
  protected download(): void {
    const lines = this.entries.map(
      (e) => `${e.time.toFixed(3)}\t${e.dir}\t${e.char}\t${e.text ?? toHex(e.bytes)}\t${e.dev}`,
    );
    const name = this.sessions().map((s) => s.label).join('+') || 'ble';
    const blob = new Blob([`# ${name}\n# tid\tretning\tcharacteristic\tdata\tenhed\n${lines.join('\n')}\n`], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
