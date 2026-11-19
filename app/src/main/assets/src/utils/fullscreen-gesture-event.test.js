/* fullscreen-gesture-event — the double-tap constants shared by bundle-b
   (use-fullscreen-gesture) and bundle-d (ReadAlongHighlight) through a DOM
   event on document, so the two copies agree. Pins the values both sides read. */
import { describe, it, expect } from 'vitest';
import { DOUBLE_TAP_MS, MAX_TAP_DISTANCE_PX, FULLSCREEN_GESTURE_EVENT } from './fullscreen-gesture-event.js';

describe('fullscreen gesture constants', () => {
  it('two taps within 420 ms are one double-tap', () => {
    expect(DOUBLE_TAP_MS).toBe(420);
  });

  it('the second tap must land within 32 px of the first', () => {
    expect(MAX_TAP_DISTANCE_PX).toBe(32);
  });

  it('fires vot-fullscreen-gesture on document', () => {
    expect(FULLSCREEN_GESTURE_EVENT).toBe('vot-fullscreen-gesture');
  });

  it('the window is wider than the distance, and the types are pinned', () => {
    expect(typeof DOUBLE_TAP_MS).toBe('number');
    expect(typeof MAX_TAP_DISTANCE_PX).toBe('number');
    expect(typeof FULLSCREEN_GESTURE_EVENT).toBe('string');
    expect(DOUBLE_TAP_MS).toBeGreaterThan(MAX_TAP_DISTANCE_PX);
  });
});
