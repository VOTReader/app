/* wait-notice — the one "Loading… / Couldn't open" toast for taps that wait (n141). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noteLoading, noteDone, noteGaveUp, WAIT_TOAST_ID } from './wait-notice.js';
import { _resetToasts } from './toast.js';

const toast = (id = WAIT_TOAST_ID) => document.getElementById(id);

beforeEach(() => { _resetToasts(); });

describe('wait-notice', () => {
  it('says it is loading, then goes when the wait ends', () => {
    noteLoading('Loading the letters…');
    expect(toast().textContent).toBe('Loading the letters…');
    expect(toast().classList.contains('show')).toBe(true);
    noteDone();
    expect(toast().classList.contains('show')).toBe(false);
  });

  it('a give-up replaces the loading line in the same toast, with no button unless asked', () => {
    noteLoading('Loading the Bible…');
    noteGaveUp('Couldn’t open John 3:16. Tap again.');
    expect(document.querySelectorAll('#' + WAIT_TOAST_ID)).toHaveLength(1);
    expect(toast().textContent).toBe('Couldn’t open John 3:16. Tap again.');
    expect(toast().querySelector('button')).toBeNull();
    expect(toast().classList.contains('vot-toast-action')).toBe(false);
  });

  it('a give-up with retry carries a button that hides the toast and tries again', () => {
    const retry = vi.fn();
    noteGaveUp('ASV didn’t load.', { id: 'vot-toast-x', retry });
    const btn = toast('vot-toast-x').querySelector('button');
    expect(btn.textContent).toBe('Try again');
    expect(toast('vot-toast-x').classList.contains('vot-toast-action')).toBe(true);
    btn.click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(toast('vot-toast-x').classList.contains('show')).toBe(false);
    // the next plain notice on that id takes no finger
    noteGaveUp('Still nothing.', { id: 'vot-toast-x' });
    expect(toast('vot-toast-x').classList.contains('vot-toast-action')).toBe(false);
  });

  it('takes a dynamic label as text, never markup', () => {
    noteGaveUp('<b>x</b> didn’t load.', { retry: () => {} });
    expect(toast().querySelector('b')).toBeNull();
    expect(toast().textContent).toContain('<b>x</b>');
  });
});
