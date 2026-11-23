/** The version of the app, filled in when the deploy workflow builds it. */
export interface BuildInfo {
  /** Number of commits; 0 for a local development build. */
  build: number;
  /** Short git commit hash. */
  commit: string;
  /** Commit date (ISO). */
  date: string;
}

/** e.g. "27 (e185277)", or "udvikling" for a local build. */
export function versionLabel(info: BuildInfo | undefined): string {
  if (!info) return 'ukendt';
  if (!info.build) return 'udvikling';
  return `${info.build} (${info.commit})`;
}
