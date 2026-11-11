// @ts-nocheck -- installs bare-global store fakes on globalThis, as the app bridge does.
/* AnnotationHint — the first-run tip, as a row of the reader's More menu (W2d, mock v2 r-letter).
   Shown only to a reader with zero highlights, notes and bookmarks who has not set the durable
   flag; a tap sets the flag and closes the menu. Stores are bare globals; in-memory fakes here. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { AnnotationHintItem } from './AnnotationHint.jsx';
import * as TS from '../../utils/tour-steps.js';

function makeStore(extra) {
  let version = 1;
  const subs = new Set();
  return {
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    getVersion() { return version; },
    bump() { version++; subs.forEach((cb) => cb()); },
    ...extra,
  };
}

let ann, notes, marks, flag;
beforeEach(() => {
  let annAll = {}, noteN = 0, markN = 0, set = false;
  ann = makeStore({ all: () => annAll, _put(v) { annAll = v; this.bump(); } });
  notes = makeStore({ count: () => noteN, _n(n) { noteN = n; this.bump(); } });
  marks = makeStore({ count: () => markN, _n(n) { markN = n; this.bump(); } });
  flag = makeStore({ is: () => set, set() { set = true; this.bump(); } });
  globalThis.AnnotationStore = ann;
  globalThis.NoteStore = notes;
  globalThis.BookmarkStore = marks;
  globalThis.AnnHintDismissedFlagStore = flag;
  globalThis.TourController = { highlightWords: () => TS.HIGHLIGHT_GESTURE_WORDS };
});
afterEach(() => {
  cleanup();
  delete globalThis.AnnotationStore; delete globalThis.NoteStore; delete globalThis.BookmarkStore;
  delete globalThis.AnnHintDismissedFlagStore; delete globalThis.TourController;
});

const row = () => document.querySelector('.more-menu-hint');

describe('AnnotationHintItem', () => {
  it('says the tour\'s own words to a reader with nothing marked', () => {
    render(<AnnotationHintItem onDone={() => {}} />);
    expect(row()).toBeTruthy();
    expect(row().getAttribute('role')).toBe('menuitem');
    expect(screen.getByText(TS.HIGHLIGHT_GESTURE_WORDS)).toBeTruthy();
    expect(row().textContent).toContain('Got it');
  });

  it('is never drawn over the text: it is a menu row, not a fixed pill', () => {
    render(<AnnotationHintItem onDone={() => {}} />);
    expect(document.querySelector('.ann-hint-pill')).toBeNull();
  });

  it('a tap sets the durable flag and closes the menu', () => {
    const done = vi.fn();
    render(<AnnotationHintItem onDone={done} />);
    fireEvent.click(row());
    expect(flag.is()).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(row()).toBeNull();
  });

  it('goes the moment a first highlight, note or bookmark lands', () => {
    for (const add of [() => ann._put({ 'letter:x:0': [{}] }), () => notes._n(1), () => marks._n(1)]) {
      cleanup();
      ann._put({}); notes._n(0); marks._n(0);
      render(<AnnotationHintItem onDone={() => {}} />);
      expect(row()).toBeTruthy();
      act(() => add());
      expect(row()).toBeNull();
    }
  });

  it('stays away once the flag is set (a dismissal, or the first long-press)', () => {
    flag.set();
    render(<AnnotationHintItem onDone={() => {}} />);
    expect(row()).toBeNull();
  });

  it('a host without the stores never shows it', () => {
    delete globalThis.AnnotationStore;
    render(<AnnotationHintItem onDone={() => {}} />);
    expect(row()).toBeNull();
  });
});
