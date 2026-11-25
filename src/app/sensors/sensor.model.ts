import { Signal } from '@angular/core';
import { Observable } from 'rxjs';

export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w], expressed in the sensor's own frame (Z up). */
export type Quat = [number, number, number, number];

/** One reading from a motion sensor. Units: acc in g, gyro in deg/s, euler in degrees. */
export interface MotionSample {
  /** performance.now() timestamp in ms when the sample was received. */
  time: number;
  acc?: Vec3;
  gyro?: Vec3;
  /** Roll (X), pitch (Y), yaw (Z) in degrees, Z-Y-X rotation order. */
  euler?: Vec3;
  quat?: Quat;
  /**
   * Size of the dynamic acceleration in g (gravity already removed), for sensors that do
   * not send an acceleration vector (e.g. MantisX). Used for release detection.
   */
  accMagnitude?: number;
}

export type SensorStatus = 'connecting' | 'connected' | 'disconnected';

export type SensorRole = 'bow' | 'head' | 'torso' | 'bowArm' | 'drawArm' | 'other';

/** `hint` says where the sensor goes, shown when the role is picked. */
export const SENSOR_ROLES: { value: SensorRole; label: string; hint?: string }[] = [
  { value: 'bow', label: 'Bue (greb)' },
  { value: 'head', label: 'Hoved' },
  { value: 'torso', label: 'Overkrop' },
  {
    value: 'bowArm',
    label: 'Buearm',
    hint: 'På underarmen, som et ur, et par cm over håndleddet mod albuen, på oversiden. Ikke på indersiden, hvor strengen og armbeskytteren er. Spænd den fast, så den ikke kan dreje rundt om armen.',
  },
  {
    value: 'drawArm',
    label: 'Trækarm',
    hint: 'På overarmen, 5–10 cm over albuen, på ydersiden (den side, der vender væk fra kroppen, når armen hænger ned). Ikke på forsiden, hvor underarmen klemmer ved fuldt træk. Spænd den fast med en strop, så den ikke kan flytte sig i ærmet.',
  },
  { value: 'other', label: 'Andet' },
];

/** A connected (or simulated) motion sensor, independent of brand. */
export interface MotionSensor {
  readonly id: string;
  readonly name: string;
  /** Driver kind, e.g. 'witmotion-ble' or 'simulated'. */
  readonly kind: string;
  readonly status: Signal<SensorStatus>;
  readonly samples: Observable<MotionSample>;
  /** Output rates (Hz) the sensor can be set to, if supported. */
  readonly supportedRates?: number[];
  setRate?(hz: number): Promise<void>;
  /** Gyro full scale (deg/s) the values are converted with, saved with the recording. */
  readonly gyroFullScale?: number;
  disconnect(): Promise<void>;
}

/** A driver knows how to recognise and talk to one family of BLE sensors. */
export interface SensorDriver {
  readonly kind: string;
  readonly label: string;
  /** Filters used in navigator.bluetooth.requestDevice. */
  readonly bleFilters: BluetoothLEScanFilter[];
  /** GATT services the driver needs access to. */
  readonly optionalServices: BluetoothServiceUUID[];
  /** Returns true if the connected GATT server looks like this driver's device. */
  supports(server: BluetoothRemoteGATTServer): Promise<boolean>;
  connect(device: BluetoothDevice, server: BluetoothRemoteGATTServer): Promise<MotionSensor>;
}
