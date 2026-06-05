/* JRNL-3 — downsampleWave bounds the stored voice-memo waveform.
   The amplitude poll accumulates ~3750 floats over a 5-min clip, but only ~48
   bars render; storing the full array inflated every journal autosave + export.
   These pin the max-pool downsample (peaks survive; result is a fixed size). */
import { describe, it, expect } from 'vitest';
import { downsampleWave } from './JournalRecordingSheet.jsx';

describe('downsampleWave (JRNL-3)', () => {
  it('returns arrays at/under the bucket count unchanged', () => {
    expect(downsampleWave([0.1, 0.2, 0.3], 48)).toEqual([0.1, 0.2, 0.3]);
  });

  it('max-pools a large array down to `buckets` bars, preserving peaks', () => {
    // A 1.0 peak at the start of every 8-wide window; 384 / 48 = 8 per bucket.
    const arr = Array.from({ length: 384 }, (_, i) => (i % 8 === 0 ? 1 : 0.1));
    const out = downsampleWave(arr, 48);
    expect(out.length).toBe(48);
    expect(out.every((v) => v === 1)).toBe(true);   // each bucket's peak survives
  });

  it('downsamples the real 5-min poll size (3750 → 48)', () => {
    const arr = Array.from({ length: 3750 }, () => 0.5);
    expect(downsampleWave(arr, 48).length).toBe(48);
  });

  it('null → null, [] → []', () => {
    expect(downsampleWave(null, 48)).toBeNull();
    expect(downsampleWave([], 48)).toEqual([]);
  });
});
