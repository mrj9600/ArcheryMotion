import { packetEndTime } from './mantisx-ble.driver';
import { decodeMinifloat, parseMantisPacket } from './mantisx-protocol';

function hex(s: string): Uint8Array {
  return new Uint8Array(s.trim().split(/\s+/).map((b) => parseInt(b, 16)));
}

describe('MantisX protocol', () => {
  it('decodes 12-bit minifloats', () => {
    const cases: [number, number][] = [
      [0x000, 0],
      [0x001, 1],
      [0x1ff, -1],
      [0x2ff, 511],
      [0x3ff, -257],
      [0x5ed, -549.5],
      [0x7dd, -1162.5],
      [0x800, 2051.5],
      [0xfff, -16416.5],
    ];
    for (const [input, expected] of cases) expect(decodeMinifloat(input)).toBe(expected);
  });

  it('parses a real H packet (from a recorded log)', () => {
    const packet = parseMantisPacket(
      hex(`48 ca 07 fb 8a 26 a0 85 b7 d2 60 a4 fa 42 09 bb 70 23 70 96 b6 22 15 a2 fa 6e 07 3b 55 0e f2 04 b4 a0 ce a0
           fa a6 25 7b 40 0a 22 59 b3 70 8f 9e fa e8 26 8b 2f 08 12 58 b2 70 97 9d fb 35 23 db 20 0c 00 fa b1 90 eb 9c
           fb 8e ca 00`),
    )!;
    expect(packet.counter).toBe(0xca);
    expect(packet.samples.length).toBe(12);
    const [a, b] = packet.samples;
    // Reference values from an independent Python implementation, checked against a WitMotion gyro
    expect(a.accMagnitude).toBeCloseTo(0.0620, 4);
    expect(a.gyroX).toBeCloseTo(-364.78, 2);
    expect(a.gyroZ).toBeCloseTo(22.095, 3);
    expect(a.pitch).toBeCloseTo(64.0, 2);
    expect(a.roll).toBeCloseTo(-129.14, 2);
    expect(b.gyroX).toBeCloseTo(-377.47, 2);
    expect(b.gyroZ).toBeCloseTo(21.484, 3);
  });

  it('rejects other packet types and sizes', () => {
    expect(parseMantisPacket(new Uint8Array(20))).toBeUndefined();
    const wrongType = new Uint8Array(76);
    wrongType[0] = 0x41;
    expect(parseMantisPacket(wrongType)).toBeUndefined();
  });
});

describe('packetEndTime', () => {
  const ms = 1000 / 340;
  it('uses the arrival time while packets come in real time', () => {
    expect(packetEndTime(1010, 3, ms, 6, 5, 1001)).toBe(1010);
  });

  it('continues at the sensor rate when held-back packets arrive in a burst', () => {
    // Nothing for 114 s, then the packets that were measured meanwhile, in sequence
    let last = 1000;
    let counter = 5;
    for (let i = 0; i < 100; i++) {
      counter = (counter + 1) & 0xff;
      last = packetEndTime(115000 + i * 0.01, 3, ms, counter, (counter + 255) & 0xff, last);
    }
    expect(last).toBeCloseTo(1000 + 300 * ms, 3);
  });

  it('jumps to the arrival time after lost packets', () => {
    expect(packetEndTime(115000, 3, ms, 9, 5, 1000)).toBe(115000);
  });
});
