/* update-hold (ds2): the app-update reload waits while a note, a voice memo or a backup is open. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { holdUpdateReload, updateHolds, remountHolds, whenUpdateUnheld, _resetForTests } from './update-hold.js';

beforeEach(() => _resetForTests());

describe('the update hold', () => {
  it('names what holds it, and runs the waiters only when the LAST hold lets go', () => {
    const fn = vi.fn();
    whenUpdateUnheld(fn);
    expect(fn).toHaveBeenCalledTimes(1);              // nothing held: at once
    const releaseNote = holdUpdateReload('note');
    const releaseMemo = holdUpdateReload('recording');
    expect(updateHolds()).toEqual(['note', 'recording']);
    whenUpdateUnheld(fn);
    releaseNote();
    expect(fn).toHaveBeenCalledTimes(1);
    releaseNote();                                    // twice is harmless: it does not free the memo's hold
    expect(updateHolds()).toEqual(['recording']);
    releaseMemo();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(updateHolds()).toEqual([]);
    releaseMemo();
    expect(fn).toHaveBeenCalledTimes(2);              // a waiter runs once
  });

  // id-datasafe 80: the journal editor holds the late-load remount, never the update reload.
  it('a remountOnly hold stops the remount but not the reload', () => {
    const fn = vi.fn();
    const releaseJournal = holdUpdateReload('journal', { remountOnly: true });
    expect(updateHolds()).toEqual([]);
    expect(remountHolds()).toEqual(['journal']);
    whenUpdateUnheld(fn);
    expect(fn).toHaveBeenCalledTimes(1);              // the reload is not held by it
    const releaseNote = holdUpdateReload('note');
    expect(remountHolds()).toEqual(['journal', 'note']);
    whenUpdateUnheld(fn);
    releaseJournal();
    expect(fn).toHaveBeenCalledTimes(1);              // the note still holds the reload
    releaseNote();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(remountHolds()).toEqual([]);
  });

  it('a waiter that throws does not stop the next', () => {
    const release = holdUpdateReload('backup');
    const after = vi.fn();
    whenUpdateUnheld(() => { throw new Error('x'); });
    whenUpdateUnheld(after);
    release();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
