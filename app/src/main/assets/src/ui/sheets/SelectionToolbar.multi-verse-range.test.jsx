/* sweep v32 / v31 (batch 2026-10-14): a multi-verse Highlight, Note or Remove acts on the words that
   were selected when the toolbar rose, and a note lands on that whole selection.
   ────────────────────────────────────────────────────────────────────────────
   v32: the single-verse path keeps the offsets it measured at raise time (selInfo.start/end), but the
   multi-verse branches of applyHighlight, handleNote and selectionGroups read window.getSelection()
   again when the button was pressed. A tap on the toolbar can collapse the selection (the toolbar
   expects it: onSelectionChange waits 150 ms "so toolbar tap can fire before hiding", and the remove
   takes a second tap on its confirm strip). With no range every block fell back to 0..its length, so
   the highlight or note covered the whole first and last verse, and Remove deleted every group in
   those verses, notes included, even ones the reader never selected.

   Real AnnotationStore + NoteStore over jsdom localStorage, a real Range stubbed into
   window.getSelection (as in SelectionToolbar.recolor-note.test.jsx). Each test raises the toolbar on
   the selection, then the "tap" collapses it before the button's click. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { AnnotationStore } from '../../stores/annotation-store.js';
import { NoteStore } from '../../stores/note-store.js';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

const V15 = 'That whosoever believeth in him should not perish, but have eternal life.';
const V16 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const V17 = 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.';
const K15 = 'bible:john:3:15', K16 = 'bible:john:3:16', K17 = 'bible:john:3:17';

let _origGetSelection;
const g = /** @type {any} */ (globalThis);
let onNoteRequest;

function chapter() {
  const wrap = document.createElement('div');
  wrap.className = 'verses-block';
  wrap.innerHTML = [[15, V15], [16, V16], [17, V17]].map(([n, t]) =>
    `<span id="v-${n}" class="verse"><span class="verse-num">${n}</span><span data-hl-key="bible:john:3:${n}">${t}</span> </span>`).join('');
  document.body.appendChild(wrap);
  return wrap;
}

/** @param {string} key */
const block = (key) => /** @type {HTMLElement} */ (document.querySelector('[data-hl-key="' + key + '"]'));
/** @param {Element} el */
const textOf = (el) => /** @type {Text} */ (document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null).nextNode());

/** Select `fromKey`'s text from `fromOff` to `toKey`'s text at `toOff`, and raise the toolbar on it. */
function selectAndRaise(fromKey, fromOff, toKey, toOff) {
  const a = textOf(block(fromKey)), b = textOf(block(toKey));
  const r = document.createRange();
  r.setStart(a, fromOff);
  r.setEnd(b, toOff);
  r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: false, rangeCount: 1, getRangeAt: () => r, removeAllRanges: () => {},
    toString: () => r.toString(), focusNode: r.endContainer, focusOffset: r.endOffset,
  });
  act(() => { block(fromKey).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 100 })); });
  expect(document.querySelector('.sel-toolbar')).not.toBeNull();
}

/** Tap a toolbar control the way a finger does on Android: the press lands, the native selection
    collapses (and says so), then the click fires.
    @param {Element | null | undefined} el */
function tapCollapsing(el) {
  expect(el).toBeTruthy();
  act(() => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: true, rangeCount: 0, getRangeAt: () => { throw new Error('IndexSizeError'); },
    removeAllRanges: () => {}, toString: () => '', focusNode: null, focusOffset: 0,
  });
  act(() => { document.dispatchEvent(new Event('selectionchange')); });
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

const button = (text) => [...document.querySelectorAll('.sel-toolbar button')].find((b) => b.textContent.trim() === text);

/** The [key, start, end] of every segment of `gid`, in store order. */
const spansOf = (gid) => AnnotationStore.getByGroup(gid).map((s) => [s.key, s.ann.start, s.ann.end]);

/** [key, start, end] rows in verse order. */
const byVerse = (rows) => [...rows].sort((x, y) => [K15, K16, K17].indexOf(x[0]) - [K15, K16, K17].indexOf(y[0]));

/** The one group on `key` that is not in `known`. */
const freshGroupOn = (key, known = []) => {
  const ids = [...new Set(AnnotationStore.get(key).map((h) => h.groupId))].filter((id) => !known.includes(id));
  expect(ids).toHaveLength(1);
  return ids[0];
};

let _n = 0;
beforeEach(() => {
  _origGetSelection = window.getSelection;
  localStorage.clear();
  AnnotationStore._resetForTests({ forceLoaded: true });
  NoteStore._resetForTests({ forceLoaded: true });
  g.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  g.AnnotationStore = AnnotationStore;
  g.HighlightStore = AnnotationStore;
  g.NoteStore = NoteStore;
  g.snapRangeToWords = (_t, s, e) => ({ start: s, end: e });
  g.snapSelectionRange = (_c, _t, s, e) => ({ start: s, end: e });
  g.hlId = () => 'hl_new_' + (++_n);
  g.ConfirmStrip = ConfirmStrip;   // the real strip: the test presses its Yes
  chapter();
  onNoteRequest = vi.fn();
  render(<SelectionToolbar onLinkRequest={() => {}} onNoteRequest={onNoteRequest} onBookmarkRequest={() => {}} />);
});

afterEach(() => {
  cleanup();
  window.getSelection = _origGetSelection;
  document.body.innerHTML = '';
  ['HL_COLORS', 'AnnotationStore', 'HighlightStore', 'NoteStore', 'snapRangeToWords', 'snapSelectionRange', 'hlId', 'ConfirmStrip']
    .forEach((k) => { delete g[k]; });
});

describe('SelectionToolbar — multi-verse actions use the selection the toolbar rose on (sweep v32)', () => {
  it('Highlight: John 3:15 "whosoever" to 3:17 "For God", the tap collapses the selection, the mark covers only those words', () => {
    selectAndRaise(K15, 5, K17, 7);
    tapCollapsing(document.querySelector('.sel-color-btn[data-color="yellow"]'));
    const gid = freshGroupOn(K15);
    expect(spansOf(gid)).toEqual([[K15, 5, V15.length], [K16, 0, V16.length], [K17, 0, 7]]);
  });

  it('Note: the new note covers only the selected words, not the whole first and last verse', () => {
    selectAndRaise(K15, 5, K17, 7);
    tapCollapsing(button('Note'));
    expect(onNoteRequest).toHaveBeenCalledTimes(1);
    const gid = onNoteRequest.mock.calls[0][0];
    expect(spansOf(gid)).toEqual([[K15, 5, V15.length], [K16, 0, V16.length], [K17, 0, 7]]);
    expect(NoteStore.get(gid).keys).toEqual([K15, K16, K17]);
  });

  it('Remove: a noted highlight in 3:15 OUTSIDE the selection survives ✕ → Yes, and the confirm does not count its note', () => {
    AnnotationStore.add(K15, { id: 'g_far', groupId: 'g_far', kind: 'highlight', color: 'pink', start: 0, end: 4, text: 'That', created: 900 });
    NoteStore.set('g_far', { color: 'pink', body: 'keep me', fullText: 'That', keys: [K15] });
    AnnotationStore.add(K16, { id: 'g_in', groupId: 'g_in', kind: 'highlight', color: 'yellow', start: 0, end: 7, text: 'For God', created: 1000 });
    selectAndRaise(K15, 20, K17, 7);
    tapCollapsing(document.querySelector('.sel-color-clear'));
    const yes = button('Yes, remove');
    expect(document.querySelector('.sel-toolbar').textContent).not.toMatch(/note/i);
    tapCollapsing(yes);
    expect(spansOf('g_in')).toEqual([]);
    expect(spansOf('g_far')).toEqual([[K15, 0, 4]]);
    expect(NoteStore.get('g_far')).not.toBeNull();
    expect(NoteStore.get('g_far').body).toBe('keep me');
  });
});

/** Tap a toolbar control with the selection left in place (a desktop click). @param {Element | null | undefined} el */
function tap(el) {
  expect(el).toBeTruthy();
  act(() => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

/* sweep v31: the multi-verse Note attached itself to the first note-less group that merely OVERLAPPED
   any touched verse, and then made no marks for the rest of the selection. The single-verse path only
   attaches to a group that COVERS the selection. So "highlight one word in 3:16, select 3:15-17, Note"
   filed the note on that one word: its quote and keys were the word's, and only the word carried it. */
describe('SelectionToolbar — a multi-verse note lands on the whole selection (sweep v31)', () => {
  const LOVED = V16.indexOf('loved');

  it('a one-word highlight in 3:16 does not take a 3:15-17 note: a new group spans the selection', () => {
    AnnotationStore.add(K16, { id: 'g_word', groupId: 'g_word', kind: 'highlight', color: 'yellow', start: LOVED, end: LOVED + 5, text: 'loved', created: 900 });
    selectAndRaise(K15, 5, K17, 7);
    tap(button('Note'));
    expect(onNoteRequest).toHaveBeenCalledTimes(1);
    const [gid, , fresh] = onNoteRequest.mock.calls[0];
    expect(gid).not.toBe('g_word');
    expect(fresh).toBe(true);
    // (Store order lists 3:16 first, its first mark being older: the quote's order is pinned below.)
    expect(byVerse(spansOf(gid))).toEqual([[K15, 5, V15.length], [K16, 0, V16.length], [K17, 0, 7]]);
    expect([...NoteStore.get(gid).keys].sort()).toEqual([K15, K16, K17]);
    // The word's highlight is left as it was, with no note of its own.
    expect(spansOf('g_word')).toEqual([[K16, LOVED, LOVED + 5]]);
    expect(NoteStore.get('g_word')).toBeNull();
  });

  it('a highlight over 3:15-16 only does not take a 3:15-17 note either', () => {
    AnnotationStore.add(K15, { id: 'g_two_a', groupId: 'g_two', kind: 'highlight', color: 'green', start: 0, end: V15.length, text: V15, created: 900 });
    AnnotationStore.add(K16, { id: 'g_two_b', groupId: 'g_two', kind: 'highlight', color: 'green', start: 0, end: V16.length, text: V16, created: 900 });
    selectAndRaise(K15, 5, K17, 7);
    tap(button('Note'));
    const [gid, , fresh] = onNoteRequest.mock.calls[0];
    expect(gid).not.toBe('g_two');
    expect(fresh).toBe(true);
    expect(spansOf(gid)).toEqual([[K15, 5, V15.length], [K16, 0, V16.length], [K17, 0, 7]]);
    expect(NoteStore.get('g_two')).toBeNull();
  });

  it('a note-less highlight that covers every selected word still takes the note, keeping its colour', () => {
    [[K15, V15], [K16, V16], [K17, V17]].forEach(([k, t], i) => AnnotationStore.add(k, {
      id: 'g_wide_' + i, groupId: 'g_wide', kind: 'underline', color: 'blue', start: 0, end: t.length, text: t, created: 900,
    }));
    selectAndRaise(K15, 5, K17, 7);
    tap(button('Note'));
    const [gid, , fresh] = onNoteRequest.mock.calls[0];
    expect(gid).toBe('g_wide');
    expect(fresh).toBe(false);
    expect(spansOf('g_wide')).toEqual([[K15, 0, V15.length], [K16, 0, V16.length], [K17, 0, V17.length]]);
    expect(NoteStore.get('g_wide')).toEqual(expect.objectContaining({ color: 'blue', keys: [K15, K16, K17] }));
    // No second group was made.
    expect([...new Set(AnnotationStore.get(K15).map((h) => h.groupId))]).toEqual(['g_wide']);
  });
});
