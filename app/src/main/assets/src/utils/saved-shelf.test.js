/* toggleSavedRecording — s09.3 (idea sweep 2026-10-22): the saved shelf keeps 100 recordings and the 101st pushed the
   oldest off with no word. A save that pushes one off now names it in a toast, with Undo. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { toggleSavedRecording, SAVED_CAP_TOAST_ID } from './saved-shelf.js';

const toastEl = () => document.getElementById(SAVED_CAP_TOAST_ID);
const shown = () => { const el = toastEl(); return el && el.classList.contains('show') ? el : null; };
const lib = ({ pushed = null, after = true } = {}) => ({
  maxSaved: 100,
  wouldEvict: vi.fn(() => pushed),
  toggleSaved: vi.fn(() => after),
  undoEviction: vi.fn(),
});
const NEW = { title: 'Letter 500', url: 'u500' };
const OLD = { title: 'Chosen by God', url: 'u1', savedAt: 1 };

afterEach(() => { const el = toastEl(); if (el) el.remove(); vi.useRealTimers(); });

describe('toggleSavedRecording (s09.3)', () => {
  it('a save that pushes the oldest off says which, with Undo', () => {
    const library = lib({ pushed: OLD });
    expect(toggleSavedRecording(library, NEW)).toBe(true);
    const el = shown();
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('Saved. Your saved list keeps 100, so \u201cChosen by God\u201d came off.Undo');
    /** @type {HTMLButtonElement} */ (el.querySelector('button.vot-undo-btn')).click();
    expect(library.undoEviction).toHaveBeenCalledWith(NEW, OLD);
    expect(shown()).toBeNull();
  });

  it('a save with room left, or an unsave, says nothing', () => {
    toggleSavedRecording(lib(), NEW);
    expect(shown()).toBeNull();
    toggleSavedRecording(lib({ pushed: OLD, after: false }), NEW);
    expect(shown()).toBeNull();
  });

  it('the title travels as text, never markup', () => {
    toggleSavedRecording(lib({ pushed: { title: '<img src=x onerror=alert(1)>', url: 'u2' } }), NEW);
    expect(shown().querySelector('img')).toBeNull();
  });

  // Seen on the S22: a Listen started a moment before showed the KJV switch toast, and the two sat on one spot.
  it('a toast already up steps aside, so the two never overlap', () => {
    const other = document.createElement('div');
    other.id = 'vot-toast-audio';
    other.className = 'vot-toast show';
    document.body.appendChild(other);
    toggleSavedRecording(lib({ pushed: OLD }), NEW);
    expect(other.classList.contains('show')).toBe(false);
    expect(shown()).not.toBeNull();
    other.remove();
  });

  it('no library: nothing saved, nothing shown', () => {
    expect(toggleSavedRecording(null, NEW)).toBe(false);
    expect(shown()).toBeNull();
  });
});
