/**
 * Watches that the sensors keep sending data during a recording, so an archer with the
 * phone in the pocket hears it when shots would be lost (28 November 2026: after fetching
 * arrows the MantisX was connected again but sent nothing, and the next end was lost).
 *
 * Two cases are faults:
 * - The recording is not paused and a sensor has sent nothing for `silentMs`. While not
 *   paused a MantisX sends all the time (about 340 samples/s, also while the bow lies still
 *   before the automatic pause), so this never happens in a working recording.
 * - A sensor lost the connection and got it back, but has sent nothing since. While paused
 *   this may be a sleeping MantisX on a stand, so the app first connects it again by itself
 *   (`restartMs`) and warns if there is still nothing after `alarmMs`. That is short enough
 *   to come before the next end, so the alarm may also sound for a bow that is only
 *   standing still; "Slå alarm fra" silences it until the sensor sends again.
 */
export const DATA_WATCH = {
  silentMs: 5000,
  restartMs: 10000,
  /** 90 s was too long: by then the archer is shooting again (28 November 2026). */
  alarmMs: 30000,
};

export interface WatchedSensor {
  id: string;
  /** performance.now() of the newest sample, if any. */
  lastData?: number;
  /** When the connection first came back after the last sample (performance.now()), if it did. */
  backSince?: number;
}

export interface WatchResult {
  /** Sensors to connect again now. */
  restart: string[];
  /** Sensors that should sound the alarm. */
  alarm: string[];
}

export class DataWatch {
  /** Sensor id → last data time when the archer silenced the alarm. */
  private readonly dismissed = new Map<string, number | undefined>();
  /** Sensor id → backSince for which an automatic restart was made. */
  private readonly restarted = new Map<string, number>();

  constructor(private readonly limits = DATA_WATCH) {}

  check(now: number, started: number, paused: boolean, sensors: WatchedSensor[]): WatchResult {
    const restart: string[] = [];
    const alarm: string[] = [];
    for (const s of sensors) {
      const last = s.lastData ?? started;
      let fault = !paused && now - last > this.limits.silentMs;
      if (s.backSince !== undefined && (s.lastData === undefined || s.lastData < s.backSince)) {
        const waited = now - s.backSince;
        if (waited >= this.limits.restartMs && !this.restarted.has(s.id)) {
          this.restarted.set(s.id, s.backSince);
          restart.push(s.id);
        }
        if (waited >= this.limits.alarmMs) fault = true;
      } else {
        this.restarted.delete(s.id);
      }
      // Silenced until the sensor sends again
      if (this.dismissed.has(s.id)) {
        if (this.dismissed.get(s.id) === s.lastData) fault = false;
        else this.dismissed.delete(s.id);
      }
      if (fault) alarm.push(s.id);
    }
    return { restart, alarm };
  }

  /** The archer heard it: quiet for this sensor until it sends data again. */
  dismiss(id: string, lastData: number | undefined): void {
    this.dismissed.set(id, lastData);
  }
}
