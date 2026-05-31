/* NoteDefaultStore — last-used note style+color default. */
import { describe, it, expect, beforeEach } from 'vitest';
import { NoteDefaultStore } from './note-default-store.js';

beforeEach(() => {
  localStorage.clear();
  // forceLoaded so set()/get() act directly (no pending-state deferral) and
  // the cache resets to the cold-start default before each test.
  NoteDefaultStore._resetForTests({ forceLoaded: true });
});

describe('NoteDefaultStore', () => {
  it('cold-start default is a blank highlight (no visual overhead)', () => {
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });

  it('round-trips a style + color', () => {
    NoteDefaultStore.set('squiggle', 'green');
    expect(NoteDefaultStore.get()).toEqual({ style: 'squiggle', color: 'green' });
  });

  it('keeps blank for the highlight style', () => {
    NoteDefaultStore.set('highlight', 'blank');
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });

  it('promotes a blank color to yellow for non-highlight styles', () => {
    // squiggle/underline are always a visible color — blank is highlight-only.
    NoteDefaultStore.set('squiggle', 'blank');
    expect(NoteDefaultStore.get()).toEqual({ style: 'squiggle', color: 'yellow' });
    NoteDefaultStore.set('underline', 'blank');
    expect(NoteDefaultStore.get()).toEqual({ style: 'underline', color: 'yellow' });
  });

  it('falls back to highlight/blank when set with empty args', () => {
    NoteDefaultStore.set('', '');
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });
});
