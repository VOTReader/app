/* us1: the usage-statistics wire format the app sends and the Worker validates. */
import { describe, it, expect } from 'vitest';
import { validateBatch, isoWeek, USAGE_LIMITS } from './usage-schema.js';

const TODAY = '2026-09-25';
const good = (over = {}) => ({
  v: 1, id: '00000000-0000-4000-8000-000000000001', day: TODAY, plat: 'pwa', ver: 'v1.0.2-abc', cv: 'c61', rate: 1,
  act: { d: 1, w: 0, m: 0, first: 0, iw: '2026-W39' },
  c: { 'open|letter:v1:12': 2, 'search|': 3 },
  ...over,
});

describe('validateBatch', () => {
  it('accepts a well-formed batch and normalizes it', () => {
    const r = validateBatch(good(), TODAY);
    expect(r.ok).toBe(true);
    expect(r.batch.c).toEqual({ 'open|letter:v1:12': 2, 'search|': 3 });
    expect(validateBatch(good({ act: null, ver: undefined }), TODAY).batch).toMatchObject({ act: null, ver: '' });
  });

  it('refuses what is not in the format: unknown events, free-text keys, bad ids, platforms and flags', () => {
    const bad = [
      good({ v: 2 }), good({ id: 'not-a-uuid' }), good({ plat: 'ios' }), good({ day: '25/09/2026' }),
      good({ c: { 'keystroke|x': 1 } }), good({ c: { 'search|what the reader typed': 1 } }),
      good({ c: { 'open|x': -1 } }), good({ c: { 'open|x': 'many' } }), good({ c: [] }),
      good({ act: { d: 2, w: 0, m: 0, first: 0, iw: '2026-W39' } }), good({ act: { d: 1, w: 0, m: 0, first: 0, iw: 'W39' } }),
      good({ rate: 0 }), good({ ver: 'x'.repeat(41) }), null, [], 'text',
    ];
    for (const b of bad) expect(validateBatch(b, TODAY).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });

  it('refuses a day outside the window a queued batch can honestly be from', () => {
    expect(validateBatch(good({ day: '2026-08-21' }), TODAY).ok).toBe(true); // 35 days back
    expect(validateBatch(good({ day: '2026-08-20' }), TODAY).ok).toBe(false);
    expect(validateBatch(good({ day: '2026-09-26' }), TODAY).ok).toBe(true); // a device a timezone ahead
    expect(validateBatch(good({ day: '2026-09-28' }), TODAY).ok).toBe(false);
  });

  it('clamps each counter to its ceiling and caps the number of keys', () => {
    expect(validateBatch(good({ c: { 'listen_s|x': 1e9, 'open|y': 2.6 } }), TODAY).batch.c).toEqual({ 'listen_s|x': 86400, 'open|y': 3 });
    const many = Object.fromEntries(Array.from({ length: USAGE_LIMITS.maxKeys + 1 }, (_, i) => [`open|k${i}`, 1]));
    expect(validateBatch(good({ c: many }), TODAY).ok).toBe(false);
  });
});

describe('isoWeek', () => {
  it('numbers weeks from Monday, across year ends', () => {
    expect(isoWeek(new Date(2026, 8, 21))).toBe('2026-W39'); // Monday
    expect(isoWeek(new Date(2026, 8, 27))).toBe('2026-W39'); // Sunday, same week
    expect(isoWeek(new Date(2026, 8, 28))).toBe('2026-W40');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53'); // a Friday in the last week of 2026
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01'); // a Thursday
  });
});
