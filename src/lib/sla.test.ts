import { describe, it, expect } from 'vitest';
import { computeSlaStatus, formatSlaCountdown } from './sla';

const HOUR_MS = 60 * 60 * 1000;

// Anchor "rejected at" for all relative-time tests. Using a deterministic ISO
// string so this suite is timezone-independent.
const REJECTED = '2026-02-20T00:00:00.000Z';
const rejectedMs = new Date(REJECTED).getTime();

function at(offsetHours: number): Date {
  return new Date(rejectedMs + offsetHours * HOUR_MS);
}

describe('computeSlaStatus', () => {
  it('on_track at <50% of the window', () => {
    // 10h elapsed out of a 48h window = ~20%
    const status = computeSlaStatus(REJECTED, at(10), 48);
    expect(status.state).toBe('on_track');
    expect(status.percentElapsed).toBeCloseTo(10 / 48, 5);
    expect(status.remainingMs).toBe(38 * HOUR_MS);
  });

  it('approaching at exactly 50% of the window', () => {
    const status = computeSlaStatus(REJECTED, at(24), 48);
    expect(status.state).toBe('approaching');
    expect(status.percentElapsed).toBeCloseTo(0.5, 5);
    expect(status.remainingMs).toBe(24 * HOUR_MS);
  });

  it('approaching when between 50% and 80% (e.g. 65%)', () => {
    // 65% of 48h = 31.2h
    const status = computeSlaStatus(REJECTED, at(31.2), 48);
    expect(status.state).toBe('approaching');
  });

  it('approaching at exactly 80% (boundary belongs to approaching, not at_risk)', () => {
    const status = computeSlaStatus(REJECTED, at(38.4), 48);
    // 80% exactly: > 0.5, not > 0.8 · so approaching
    expect(status.state).toBe('approaching');
    expect(status.percentElapsed).toBeCloseTo(0.8, 5);
  });

  it('at_risk just past 80% (e.g. 90%)', () => {
    const status = computeSlaStatus(REJECTED, at(43.2), 48);
    expect(status.state).toBe('at_risk');
    expect(status.percentElapsed).toBeCloseTo(0.9, 5);
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('at_risk at exactly 100% (boundary belongs to at_risk, not breached)', () => {
    const status = computeSlaStatus(REJECTED, at(48), 48);
    // 100% exactly: not > 1 · so at_risk (remainingMs is zero)
    expect(status.state).toBe('at_risk');
    expect(status.remainingMs).toBe(0);
  });

  it('breached past 100%, with negative remainingMs', () => {
    const status = computeSlaStatus(REJECTED, at(60), 48);
    expect(status.state).toBe('breached');
    expect(status.remainingMs).toBe(-12 * HOUR_MS);
    expect(status.percentElapsed).toBeCloseTo(60 / 48, 5);
  });

  it('clamps negative elapsed time to 0% (clock skew defence)', () => {
    // "Rejected" 5h in the future relative to now.
    const status = computeSlaStatus(REJECTED, at(-5), 48);
    expect(status.state).toBe('on_track');
    expect(status.percentElapsed).toBe(0);
    expect(status.remainingMs).toBe(53 * HOUR_MS);
  });

  it('zero-hour window treats any elapsed time as a breach', () => {
    const status = computeSlaStatus(REJECTED, at(0.5), 0);
    expect(status.state).toBe('breached');
    expect(status.remainingMs).toBeLessThan(0);
  });

  it('accepts a Date instance for dateRejected', () => {
    const status = computeSlaStatus(new Date(REJECTED), at(10), 48);
    expect(status.state).toBe('on_track');
  });
});

describe('formatSlaCountdown', () => {
  it('formats hours and minutes', () => {
    expect(formatSlaCountdown(3 * HOUR_MS + 12 * 60_000)).toBe('3h 12m');
  });

  it('formats whole hours without trailing 0m', () => {
    expect(formatSlaCountdown(2 * HOUR_MS)).toBe('2h');
  });

  it('formats sub-hour values as minutes only', () => {
    expect(formatSlaCountdown(45 * 60_000)).toBe('45m');
  });

  it('formats sub-minute values as <1m', () => {
    expect(formatSlaCountdown(30_000)).toBe('<1m');
    expect(formatSlaCountdown(0)).toBe('<1m');
  });

  it('treats the magnitude the same on either side of zero (caller wraps "ago"/"remaining")', () => {
    expect(formatSlaCountdown(-(1 * HOUR_MS + 5 * 60_000))).toBe('1h 5m');
    expect(formatSlaCountdown(1 * HOUR_MS + 5 * 60_000)).toBe('1h 5m');
  });
});
