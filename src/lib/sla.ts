/**
 * Pure SLA helpers · no React, no DOM, no clock reads.
 *
 * Bucketing thresholds (matches new_features_plan.md #2.3):
 *   <  50% of SLA window elapsed  → on_track
 *   50·80%                        → approaching
 *   80·100%                       → at_risk
 *   > 100%                        → breached
 *
 * Callers pass `now` and `dateRejected` explicitly so the same function
 * is trivially testable and can be reused inside a render loop driven by
 * a `now: Date` state in the page-level ticker.
 */

export type SlaState = 'on_track' | 'approaching' | 'at_risk' | 'breached';

export interface SlaStatus {
  state: SlaState;
  /** Milliseconds remaining until breach. Negative once breached. */
  remainingMs: number;
  /** Elapsed / window · clamped at 0 lower bound, NOT clamped on upper end. */
  percentElapsed: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Compute the SLA bucket and remaining time for a single exception.
 *
 * @param dateRejected ISO 8601 (or any Date-parseable) timestamp of when the
 *   exception was created.
 * @param now Reference "now" · typically the page-level ticker state so all
 *   cards re-render in lockstep on the 60s tick.
 * @param windowHours SLA window for this rejection type, in hours.
 */
export function computeSlaStatus(
  dateRejected: string | Date,
  now: Date,
  windowHours: number,
): SlaStatus {
  const created =
    dateRejected instanceof Date
      ? dateRejected
      : new Date(dateRejected);

  const windowMs = Math.max(0, windowHours) * HOUR_MS;
  // Guard against a zero-window misconfiguration so we never divide by zero.
  // Treat zero-window as "instant breach if any time has elapsed".
  if (windowMs === 0) {
    const elapsedMs = now.getTime() - created.getTime();
    return {
      state: elapsedMs > 0 ? 'breached' : 'at_risk',
      remainingMs: -elapsedMs,
      percentElapsed: elapsedMs > 0 ? 1 : 0,
    };
  }

  const elapsedMs = now.getTime() - created.getTime();
  const remainingMs = windowMs - elapsedMs;
  const percentElapsed = Math.max(0, elapsedMs / windowMs);

  let state: SlaState;
  if (percentElapsed > 1) state = 'breached';
  else if (percentElapsed > 0.8) state = 'at_risk';
  else if (percentElapsed >= 0.5) state = 'approaching';
  else state = 'on_track';

  return { state, remainingMs, percentElapsed };
}

/**
 * Format a remaining-ms value as a short human-readable countdown.
 *
 * Positive values → "3h 12m" (no leading zeros).
 * Negative values → "1h 5m" (caller is expected to wrap with "BREACHED … ago").
 * Sub-minute values → "<1m".
 */
export function formatSlaCountdown(remainingMs: number): string {
  const abs = Math.abs(remainingMs);
  const totalMinutes = Math.floor(abs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0 && minutes === 0) return '<1m';
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
