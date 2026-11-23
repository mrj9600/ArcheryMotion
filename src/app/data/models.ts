import { SensorRole } from '../sensors/sensor.model';

export type BowType = 'recurve' | 'barebow' | 'compound' | 'longbow' | 'traditional';

export const BOW_TYPES: { value: BowType; label: string }[] = [
  { value: 'recurve', label: 'Recurve' },
  { value: 'barebow', label: 'Barebow' },
  { value: 'compound', label: 'Compound' },
  { value: 'longbow', label: 'Langbue' },
  { value: 'traditional', label: 'Traditionel' },
];

export type Handedness = 'right' | 'left';

export interface Archer {
  id: string;
  name: string;
  bowType: BowType;
  handedness: Handedness;
  createdAt: number;
}

/** One equipment configuration of an archer, e.g. "Barebow, 2 vægte forneden". */
export interface EquipmentSetup {
  id: string;
  archerId: string;
  name: string;
  bowType: BowType;
  riser?: string;
  limbs?: string;
  /** Pounds on the fingers. */
  drawWeight?: number;
  /** Inches. */
  drawLength?: number;
  /** Weights and stabilisers, and where they sit. */
  weights?: string;
  arrows?: string;
  tiller?: string;
  notes?: string;
  createdAt: number;
  archived?: boolean;
}

export type TargetElevation = 'up' | 'level' | 'down';

export const TARGET_ELEVATIONS: { value: TargetElevation; label: string }[] = [
  { value: 'up', label: 'Op' },
  { value: 'level', label: 'Lige' },
  { value: 'down', label: 'Ned' },
];

export type SelfRating = 'good' | 'bad';

/** A sensor as it was used during a session. */
export interface SessionSensor {
  /** Position in the session; sample chunks refer to it. */
  index: number;
  name: string;
  kind: string;
  role: SensorRole;
}

export interface Session {
  id: string;
  archerId: string;
  setupId?: string;
  /** Epoch ms. All times within the session are ms relative to this. */
  startedAt: number;
  endedAt?: number;
  place?: string;
  note?: string;
  sensors: SessionSensor[];
  shotCount: number;
  sampleCount: number;
  /** Set when the session was a training drill. */
  drill?: HoldDrill;
}

/** Holding drill (Holding SPT): hold full draw for a set time, a number of times. */
export interface HoldDrill {
  kind: 'hold';
  holdSeconds: number;
  reps: number;
  restSeconds: number;
  results: HoldRep[];
}

export interface HoldRep {
  number: number;
  /** Session time (ms) when full draw was detected, and when the hold ended. */
  start: number;
  end: number;
  heldMs: number;
  /** Time from start until form first broke down (= heldMs if it never did). */
  goodFormMs: number;
  /** Held at least the target time. */
  completed: boolean;
  /** How the start and end were found. */
  startedBy: 'auto' | 'manual';
  /** 'shot': the archer shot instead of letting down. */
  endedBy: 'auto' | 'manual' | 'shot';
  /** Mean sway (slow angular speed, deg/s) and tremor (fast part, deg/s) over the hold. */
  sway: number;
  tremor: number;
  /** Largest change of bow angle (roll/pitch) from the start of the hold, degrees. */
  drift?: number;
  /** Session times (ms) where the form began to break down. The warning sounded 2 s later. */
  warnings: number[];
  /** Sway and tremor for each whole second of the hold. */
  perSecond: { sway: number[]; tremor: number[] };
}

export interface ShotRecord {
  id: string;
  sessionId: string;
  /** Arrow number within the session, from 1. */
  number: number;
  /** ms relative to Session.startedAt. */
  releaseTime: number;
  trigger: 'auto' | 'manual';
  target?: TargetElevation;
  /** Metres. */
  distance?: number;
  /** Crawl or grip on the string (barebow), free text, e.g. "3 sting". */
  crawl?: string;
  selfRating?: SelfRating;
  note?: string;
  /** Marked as not a real shot (false trigger). */
  discarded?: boolean;
}

/**
 * A block of samples from one sensor. Arrays are column-wise; vectors are interleaved
 * (x0 y0 z0 x1 y1 z1 ...). Missing values are NaN.
 */
export interface SampleChunk {
  id?: number;
  sessionId: string;
  sensorIndex: number;
  seq: number;
  /** ms relative to Session.startedAt. */
  t: Float64Array;
  acc?: Float32Array;
  gyro?: Float32Array;
  euler?: Float32Array;
  quat?: Float32Array;
  accMagnitude?: Float32Array;
}
