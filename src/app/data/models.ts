import { BuildInfo } from '../build-info.model';
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
  /**
   * Gyro full scale (deg/s) the sensor's values were converted with (MantisX: 2293.76).
   * Missing on MantisX recordings made before 24 November 2026, which used 1000; those
   * from 24–25 November say 2000. Both are corrected when opened (see correctGyroScale).
   */
  gyroFullScale?: number;
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
  /** What the archer trains in this session; the shots' self-rating is on this. */
  focus?: SessionFocus;
  /** Periods where no data was saved (bow put down, or the pause button). */
  pauses?: RecordingPause[];
  /** Periods where a sensor had lost the connection and the app was connecting again. */
  dropouts?: RecordingDropout[];
  /** The app version that made the recording (missing in recordings before it was saved). */
  app?: BuildInfo;
}

export interface RecordingDropout {
  /** The sensor (SessionSensor.index) and session times (ms); `end` missing if never back. */
  sensorIndex: number;
  start: number;
  end?: number;
}

export interface RecordingPause {
  /** Session times (ms). `end` is missing if the session ended while paused. */
  start: number;
  end?: number;
  by: 'auto' | 'manual';
}

/** Training focus of a session. `label` is the text shown (free text for 'other'). */
export interface SessionFocus {
  key: FocusKey;
  label: string;
}

export type FocusKey = 'release' | 'expansion' | 'cant' | 'bowArm' | 'anchor' | 'tempo' | 'slope' | 'other';

/** Focus areas, from the good form (docs/ideal-form.md). */
export const FOCUS_AREAS: { value: FocusKey; label: string; hint: string }[] = [
  { value: 'release', label: 'Slip og follow-through', hint: 'Strengen lige bag yderste fingerled. Fingrene holder kun krogen, resten af hånden er løs. Ved slippet skubber strengen fingrene til side, mens trækhånden går bagud langs halsen. Buehånden slapper af, buearmen bliver oppe' },
  { value: 'expansion', label: 'Ekspansion gennem slippet', hint: 'Trækalbuen fortsætter roligt bagud gennem slippet, ingen creep eller collapse' },
  { value: 'cant', label: 'Fast cant', hint: 'Buen hælder det samme fra anker til slip' },
  { value: 'bowArm', label: 'Buearm og bueskulder', hint: 'Løft armen, ikke skulderen. Hæv buen lidt over målet under trækket, og sænk den ned på målet' },
  { value: 'anchor', label: 'Anker', hint: 'Samme anker hver gang, trækalbuen på linje med pilen' },
  { value: 'tempo', label: 'Tempo', hint: 'Fra hold til slip på 1–3 s, samme rytme hver gang' },
  { value: 'slope', label: 'Op/ned ad bakke', hint: 'Bøj i hoften og behold T-formen' },
  { value: 'other', label: 'Andet', hint: '' },
];

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
  /** The archer's own verdict: did the session's focus succeed in this shot? */
  selfRating?: SelfRating;
  note?: string;
  /** Marked as not a real shot (false trigger). */
  discarded?: boolean;
  /** Which arrow was shot (its number or name), to spot an arrow that flies differently. */
  arrow?: string;
  /** Where the arrow hit. Not entered in the app yet; see ShotImpact. */
  impact?: ShotImpact;
}

/**
 * Where an arrow hit the target, so a shot's sensor data can be compared with the result
 * (later: "what you do when the arrow goes right"). The shot's releaseTime is the link to
 * the sensor data. All fields are optional, so a hit can be marked roughly or exactly.
 */
export interface ShotImpact {
  /**
   * Position relative to the point the archer aimed at (cm), as the archer sees the
   * target: x positive to the right, y positive up. With the distance this gives the
   * angle the arrow was off, which is what the sensors can be compared with.
   */
  x?: number;
  y?: number;
  /**
   * Position on the face as ArrowPlot (and MyTargets) store it: relative to the face
   * radius (1 = outer edge), x to the right, y down. Lets hits be imported from ArrowPlot.
   * Not the same as x/y above when the archer aims off the centre (gap or point-on aiming).
   */
  face?: { x: number; y: number };
  /** Zone index as in ArrowPlot: 0 = innermost, -1 = miss. */
  ring?: number;
  /** Rough direction when the exact position is not marked. */
  direction?: ImpactDirection;
  /** Score or zone as written down, e.g. "10", "X", "M", or a 3D zone like "11" or "kill". */
  score?: string;
  /** The arrow missed the target. */
  missed?: boolean;
  /** Size of the face or the animal's kill zone (cm), to judge how big a miss is. */
  targetSize?: number;
  /** Epoch ms when the impact was entered (often after walking to the target). */
  markedAt?: number;
}

export type ImpactDirection = 'center' | 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';

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
