/* W2.5 — formatBytes tests. Pure unit tests; no DOM, no async. */

import { describe, it, expect } from 'vitest';
import { formatBytes } from './format-bytes.js';

describe('formatBytes', () => {
  it('formats bytes under 1 KB as plain bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB scale with one decimal place', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1023)).toBe('1023.0 KB');
  });

  it('formats MB scale with one decimal place', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 47)).toBe('47.0 MB');
    expect(formatBytes(1024 * 1024 * 1023)).toBe('1023.0 MB');
  });

  it('formats GB scale with one decimal place', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.4)).toBe('2.4 GB');
  });

  it('formats TB scale with one decimal place', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 3.7)).toBe('3.7 TB');
  });

  it('returns "?" for null / undefined / negative / NaN / non-number inputs', () => {
    expect(formatBytes(null)).toBe('?');
    expect(formatBytes(undefined)).toBe('?');
    expect(formatBytes(-1)).toBe('?');
    expect(formatBytes(NaN)).toBe('?');
    expect(formatBytes(Infinity)).toBe('?');
    expect(formatBytes(/** @type {any} */ ('not a number'))).toBe('?');
  });
});
