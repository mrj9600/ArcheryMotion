import { Calibration } from '../sensors/orientation';
import { MotionSample, SensorRole } from '../sensors/sensor.model';

/** One sensor's data within a recorded shot. */
export interface RecordedSensor {
  name: string;
  kind: string;
  role: SensorRole;
  calibration?: Calibration;
  samples: MotionSample[];
}

export interface Shot {
  id: number;
  recordedAt: Date;
  /** performance.now() time of the release (ms). */
  releaseTime: number;
  trigger: 'auto' | 'manual';
  sensors: RecordedSensor[];
}
