/* NoteDefaultStore — last-used note style+color default. */
import 'fake-indexeddb/auto'; // the stores' real IDB write path, so no 'IndexedDB is not available' write failures (console-clean)
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

/* get() — partial or unparseable stored records fall back per field. */
describe('NoteDefaultStore — get() fallbacks', () => {
  it('returns the default shape when the stored value parses to null', () => {
    localStorage.setItem('vot-note-default', 'null');
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });

  it('fills in missing fields from a partial stored record', () => {
    /** @type {any} */ (NoteDefaultStore)._cache = {};
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
    /** @type {any} */ (NoteDefaultStore)._cache = { style: 'squiggle' };
    expect(NoteDefaultStore.get()).toEqual({ style: 'squiggle', color: 'blank' });
    /** @type {any} */ (NoteDefaultStore)._cache = { color: 'green' };
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'green' });
  });
});

/* set() while pending — deferred, queued, visible in the overlay. */
describe('NoteDefaultStore — deferred set() while pending', () => {
  it('queues the write and shows it in the overlay without touching the real cache', () => {
    NoteDefaultStore._resetForTests();
    expect(NoteDefaultStore.getState()).toBe('pending');
    NoteDefaultStore.set('squiggle', 'green');
    expect(NoteDefaultStore.get()).toEqual({ style: 'squiggle', color: 'green' });
    expect(/** @type {any} */ (NoteDefaultStore)._cache).toBe(null);
    expect(/** @type {any} */ (NoteDefaultStore)._queue.length).toBe(1);
  });
});

/* replaceAll() — the backup-import seam, routes through set() so a
   hand-edited backup lands normalized. */
describe('NoteDefaultStore — replaceAll()', () => {
  it('replaces with a full record, normalizing blank to yellow for non-highlight styles', () => {
    NoteDefaultStore.replaceAll({ style: 'squiggle', color: 'blank' });
    expect(NoteDefaultStore.get()).toEqual({ style: 'squiggle', color: 'yellow' });
  });

  it('falls back to the default for null data', () => {
    NoteDefaultStore.replaceAll(null);
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });

  it('falls back to the default for non-object data', () => {
    NoteDefaultStore.replaceAll('not-an-object');
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'blank' });
  });
});
