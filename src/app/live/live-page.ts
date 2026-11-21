import { DecimalPipe } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOW_SPACING, MotionScene, ScenePose } from '../scene/motion-scene';
import { ShotRecorder } from '../shots/shot-recorder.service';
import { Vector3 } from 'three';
import { calibrated, sampleToQuaternion, SENSOR_AXES, SensorAxis, TARE_POSES, TarePose } from '../sensors/orientation';
import { SENSOR_ROLES, SensorRole } from '../sensors/sensor.model';
import { SensorManager, SensorSlot } from '../sensors/sensor-manager.service';

@Component({
  selector: 'app-live-page',
  imports: [MotionScene, DecimalPipe, RouterLink],
  templateUrl: './live-page.html',
  styleUrl: './live-page.scss',
})
export class LivePage {
  protected readonly manager = inject(SensorManager);
  protected readonly recorder = inject(ShotRecorder);
  protected readonly thresholds = [0.3, 0.5, 0.8, 1.5, 3];
  protected readonly roles = SENSOR_ROLES;
  protected readonly axes = SENSOR_AXES;
  protected readonly tarePoses = TARE_POSES;
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly showTrail = signal(true);
  protected readonly showAllDevices = signal(false);
  private readonly scene = viewChild(MotionScene);

  /** Live poses for the 3D view, evaluated every animation frame. */
  protected readonly livePoses = (): ScenePose[] => {
    let bowIndex = 0;
    return this.manager.slots().map((slot) => {
      const sample = slot.latest();
      const q = sample && sampleToQuaternion(sample);
      const role = slot.role();
      // Extra bow sensors are drawn beside the first one so they don't overlap
      const offset = role === 'bow' ? new Vector3(BOW_SPACING * bowIndex++, 0, 0) : undefined;
      return {
        key: slot,
        role,
        quaternion: q && slot.calibration ? calibrated(q, slot.calibration) : q,
        offset,
      };
    });
  };

  protected async connect(): Promise<void> {
    this.error.set(undefined);
    this.busy.set(true);
    try {
      const slot = await this.manager.connectBle(this.showAllDevices());
      setTimeout(() => this.manager.tare(slot), 500);
    } catch (e) {
      // User closing the device picker is not an error worth showing
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected addSimulated(): void {
    const slot = this.manager.addSimulated();
    setTimeout(() => this.manager.tare(slot), 300);
  }

  protected setForwardAxis(slot: SensorSlot, value: string): void {
    this.manager.setForwardAxis(slot, value as SensorAxis);
    this.scene()?.clearTrail();
  }

  protected setBowTarePose(value: string): void {
    this.manager.setBowTarePose(value as TarePose);
    this.scene()?.clearTrail();
  }

  protected setRole(slot: SensorSlot, value: string): void {
    slot.role.set(value as SensorRole);
    this.manager.recalibrate(slot);
  }

  protected async setRate(slot: SensorSlot, value: string): Promise<void> {
    try {
      await slot.sensor.setRate?.(Number(value));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected tare(slot: SensorSlot): void {
    this.manager.tare(slot);
    this.scene()?.resetView();
    this.scene()?.clearTrail();
  }

  protected tareAll(): void {
    this.manager.tareAll();
    this.scene()?.resetView();
    this.scene()?.clearTrail();
  }

  protected clearTrail(): void {
    this.scene()?.clearTrail();
  }
}
