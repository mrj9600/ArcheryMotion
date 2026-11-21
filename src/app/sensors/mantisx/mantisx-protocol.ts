import { Vec3 } from '../sensor.model';

/**
 * MantisX data packets (type 'H' = 76 bytes / 6 blocks, 'I' = 148 bytes / 12 blocks).
 * See docs/mantisx-protocol.md for how this was worked out.
 *
 * Each 12-byte block holds eight 12-bit fields (nibbles, big-endian):
 *   1-3: sample A (acceleration size, gyro x, gyro z)
 *   4-6: sample B (same)
 *   7:   pitch, 8: roll (shared by both samples)
 */

/** Acceleration scale: ±16 g over the 16-bit range. */
const ACC_SCALE = 16 / 32768;
/**
 * Gyro scale in deg/s per unit. The MantisX app uses 2000/32768, but compared with a
 * WitMotion sensor taped to it, 1000/32768 matches (see docs).
 */
export const MANTIS_GYRO_SCALE = 1000 / 32768;

export interface MantisSample {
  /** Size of the dynamic acceleration (gravity removed), g. */
  accMagnitude: number;
  /** Gyro around the sensor's x and z axes, deg/s. The y axis is not sent. */
  gyroX: number;
  gyroZ: number;
  /** Degrees. */
  pitch: number;
  roll: number;
}

export interface MantisPacket {
  counter: number;
  samples: MantisSample[];
  /** 0xff = no event, otherwise an event code from the sensor. */
  status: number;
}

/**
 * Expands a 12-bit "minifloat" to a 16-bit-range value:
 * 3-bit exponent, 9-bit signed mantissa with a hidden bit when the exponent > 0,
 * plus a half-step rounding offset.
 */
export function decodeMinifloat(v: number): number {
  let e = (v >> 9) & 0x7;
  let m = v & 0x1ff;
  if (m & 0x100) m -= 512;
  if (e > 0) {
    m = m ^ 0x100; // adds the hidden bit (keeps the sign for negative values)
    e -= 1;
  }
  let d = 256 >> (9 - e);
  if (d > 0) d -= 0.5;
  return m * (1 << e) + d;
}

/** Pitch range depends on hardware version: 180° for version ≥ 4, else 360°. */
function decodeAngles(v7: number, v8: number, hardwareVersion: number): { pitch: number; roll: number } {
  const range = hardwareVersion < 4 ? 360 : 180;
  let p = (v7 / 4095) * range;
  if (p > range / 2) p -= range;
  let r = (v8 / 4095) * 360;
  if (r > 180) r -= 360;
  return { pitch: -p, roll: r };
}

export function parseMantisPacket(bytes: Uint8Array, hardwareVersion = 4): MantisPacket | undefined {
  if (bytes.length !== 76 && bytes.length !== 148) return undefined;
  const type = String.fromCharCode(bytes[0]);
  if (type !== 'H' && type !== 'I') return undefined;
  const blocks = (bytes.length - 4) / 12;
  const samples: MantisSample[] = [];

  for (let b = 0; b < blocks; b++) {
    const o = 2 + b * 12;
    // Eight 12-bit fields from 4 groups of 3 bytes
    const f: number[] = [];
    for (let g = 0; g < 4; g++) {
      const b0 = bytes[o + g * 3];
      const b1 = bytes[o + g * 3 + 1];
      const b2 = bytes[o + g * 3 + 2];
      f.push((b0 << 4) | (b1 >> 4), ((b1 & 0x0f) << 8) | b2);
    }
    const { pitch, roll } = decodeAngles(f[6], f[7], hardwareVersion);
    for (let s = 0; s < 2; s++) {
      samples.push({
        accMagnitude: Math.abs(decodeMinifloat(f[s * 3])) * ACC_SCALE,
        gyroX: decodeMinifloat(f[s * 3 + 1]) * MANTIS_GYRO_SCALE,
        gyroZ: decodeMinifloat(f[s * 3 + 2]) * MANTIS_GYRO_SCALE,
        pitch,
        roll,
      });
    }
  }
  return { counter: bytes[1], samples, status: bytes[bytes.length - 1] };
}

/**
 * Sample as roll/pitch/yaw degrees for the generic MotionSample (yaw is unknown → 0).
 * The MantisX app's pitch sign is opposite of our Z-Y-X convention (confirmed by
 * tilting a real sensor), so it is negated here.
 */
export function mantisEuler(s: MantisSample): Vec3 {
  return [s.roll, -s.pitch, 0];
}
