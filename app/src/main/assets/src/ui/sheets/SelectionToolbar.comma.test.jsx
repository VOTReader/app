// @ts-nocheck
/* Half-baked 14: a selection that is only punctuation (a comma) grows to the nearest word before the bar opens, so a
   colour tap marks that word instead of closing the bar over nothing. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { nearestWordRange, hasWordChar } from './selection-word.js';

beforeEach(() => {
  globalThis.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  globalThis.HighlightStore = { get: () => [] };
  globalThis.AnnotationStore = { get: () => [], add: vi.fn(), removeGroup: vi.fn() };
  globalThis.NoteStore = { get: () => null };
  globalThis.BookmarkStore = { add: vi.fn() };
  globalThis.snapSelectionRange = (_container, _text, start, end) => ({ start, end });
  globalThis.snapRangeToWords = (_text, start, end) => ({ start, end });
  globalThis.hlId = () => 'comma-id';
  window.__showAnnChip = vi.fn();
  window.__openNote = vi.fn();
  Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 100, right: 60, bottom: 120, width: 50, height: 20 });
});

afterEach(() => {
  cleanup();
  for (const k of ['HL_COLORS', 'HighlightStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore', 'snapSelectionRange', 'snapRangeToWords', 'hlId']) delete globalThis[k];
  delete window.__showAnnChip;
  delete window.__openNote;
  delete Range.prototype.getBoundingClientRect;
  window.getSelection().removeAllRanges();
});

const para = (text) => {
  const p = document.createElement('p');
  p.dataset.hlKey = 'comma:p';
  p.textContent = text;
  document.body.appendChild(p);
  return p;
};
const select = (node, a, b) => {
  const r = document.createRange();
  r.setStart(node, a); r.setEnd(node, b);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
};

describe('nearestWordRange', () => {
  it('takes the word the comma follows, and leaves a selection that has a word alone', () => {
    const p = para('and you, many of you');
    const t = p.firstChild;
    const r = document.createRange(); r.setStart(t, 7); r.setEnd(t, 8);   // the comma
    expect(r.toString()).toBe(',');
    expect(hasWordChar(r.toString())).toBe(false);
    expect(nearestWordRange(r).toString()).toBe('you');
    const w = document.createRange(); w.setStart(t, 9); w.setEnd(t, 13);
    expect(nearestWordRange(w)).toBeNull();
  });

  it('takes the next word when nothing comes before, keeps an apostrophe inside a word, and gives up with no word at all', () => {
    const lead = para(", Lord's own");
    const r = document.createRange(); r.setStart(lead.firstChild, 0); r.setEnd(lead.firstChild, 1);
    expect(nearestWordRange(r).toString()).toBe("Lord's");
    const none = para('... ,,');
    const n = document.createRange(); n.setStart(none.firstChild, 0); n.setEnd(none.firstChild, 3);
    expect(nearestWordRange(n)).toBeNull();
  });
});

describe('SelectionToolbar over a lone comma', () => {
  it('opens over the word before it, so Link (and a colour) get that word', () => {
    const p = para('and you, many of you');
    select(p.firstChild, 7, 8);
    const onLinkRequest = vi.fn();
    render(<SelectionToolbar onLinkRequest={onLinkRequest} />);
    fireEvent.contextMenu(p, { clientX: 20, clientY: 100 });
    expect(window.getSelection().toString()).toBe('you');
    fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Link'));
    expect(onLinkRequest).toHaveBeenCalledWith(expect.objectContaining({ hlKey: 'comma:p', start: 4, end: 7 }));
  });
});
