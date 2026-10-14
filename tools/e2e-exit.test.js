/**
 * exitAfterThrow (W76, sweep 2026-10-13): the exit code of an e2e walk that
 * threw. e2e-study-audio set exit 1 for a real regression (no manifest row),
 * threw to stop the walk, and its catch rewrote every code but 2 into 2,
 * "could not be driven", so the regression read as a harness fault.
 * e2e-restore-top's catch did the same to a throw after a real FAIL.
 */
import { describe, it, expect } from 'vitest';
import { exitAfterThrow } from './e2e-exit.mjs';

describe('exitAfterThrow', () => {
  it('keeps a code the walk set before throwing', () => {
    expect(exitAfterThrow(1, 1)).toBe(1);
    expect(exitAfterThrow(2, 1)).toBe(2);
  });

  it('keeps a regression already found as the finding (1), not a harness fault', () => {
    expect(exitAfterThrow(0, 2)).toBe(1);
  });

  it('calls a throw with nothing found yet a walk that could not be driven (2)', () => {
    expect(exitAfterThrow(0, 0)).toBe(2);
  });
});
