/* sr14 (sweep batch 2026-10-14 #0): re-colouring a passage that carries a note
   must never delete the note.
   ────────────────────────────────────────────────────────────────────────────
   applyHighlight's recolour flow removed every group whose range exactly
   matched the new selection and called NoteStore.remove(gid) on each, and notes
   are keyed by groupId, so "note on John 3:16, select John 3:16 (or 3:15-17),
   tap a colour" emptied My Notes of it without a word.

   The contract locked here:
     - a noted group whose marks ARE the new selection takes the new colour and
       style in place (the mark's own recolour chip does the same), so its id and
       its note survive and no second mark is stacked on it;
     - a noted group that only partly matches (a wider selection, or a note that
       runs past it) stays as it is, and the new mark, made after it, paints over
       it while the note's icon stays;
     - an unnoted exact match is still replaced, as before.

   Real AnnotationStore + NoteStore over jsdom localStorage (no store mocks), a
   real Range stubbed into window.getSelection as in SelectionToolbar.test.jsx. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { AnnotationStore } from '../../stores/annotation-store.js';
import { NoteStore } from '../../stores/note-store.js';

const V15 = 'That whosoever believeth in him should not perish, but have eternal life.';
const V16 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const V17 = 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.';
const K15 = 'bible:john:3:15', K16 = 'bible:john:3:16', K17 = 'bible:john:3:17';

let _origGetSelection;
const g = /** @type {any} */ (globalThis);

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

/** Select from the start of `fromKey`'s text to the end of `toKey`'s. */
function selectBlocks(fromKey, toKey) {
  const a = textOf(block(fromKey)), b = textOf(block(toKey));
  const r = document.createRange();
  r.setStart(a, 0);
  r.setEnd(b, b.length);
  r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: false, rangeCount: 1, getRangeAt: () => r, removeAllRanges: () => {},
    toString: () => r.toString(), focusNode: r.endContainer, focusOffset: r.endOffset,
  });
  return r;
}

/** Raise the toolbar on the current selection, then tap a style (optional) and a colour. */
async function tapColour(color, style) {
  const target = block(K16);
  act(() => { target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); });
  await act(async () => {
    target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 80, clientY: 5 }));
    await new Promise((r) => setTimeout(r, 250));
  });
  if (style) {
    const s = document.querySelector('.sel-style-btn-' + style);
    expect(s).not.toBeNull();
    act(() => { s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  }
  const btn = document.querySelector('.sel-color-btn[data-color="' + color + '"]');
  expect(btn).not.toBeNull();
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

/** A note as handleNote leaves it: a mark group (blank highlight by default) plus its NoteStore record.
    @param {string} gid @param {[string, number, number, string][]} segs @param {string} body
    @param {{ kind?: 'highlight' | 'underline' | 'squiggle', color?: string }} [style] */
function noteOn(gid, segs, body, { kind = 'highlight', color = 'blank' } = {}) {
  segs.forEach(([key, start, end, text], i) => AnnotationStore.add(key, {
    id: gid + '_' + i, groupId: gid, kind, color, start, end, text, created: 1000,
  }));
  NoteStore.set(gid, { color, body, fullText: segs.map((s) => s[3]).join(' … '), keys: segs.map((s) => s[0]) });
}

/** The groupIds marked on a key. */
const groupsOn = (key) => [...new Set(AnnotationStore.get(key).map((h) => h.groupId))];

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
  chapter();
  render(<SelectionToolbar onLinkRequest={() => {}} onNoteRequest={() => {}} onBookmarkRequest={() => {}} />);
});

afterEach(() => {
  cleanup();
  window.getSelection = _origGetSelection;
  document.body.innerHTML = '';
  ['HL_COLORS', 'AnnotationStore', 'HighlightStore', 'NoteStore', 'snapRangeToWords', 'snapSelectionRange', 'hlId']
    .forEach((k) => { delete g[k]; });
});

describe('SelectionToolbar — a recolour keeps the note (sr14)', () => {
  it('note on John 3:16, select John 3:16, tap yellow: the note stays, its mark turns yellow, no second mark', async () => {
    noteOn('g_note', [[K16, 0, V16.length, V16]], 'God so loved the world');
    selectBlocks(K16, K16);
    await tapColour('yellow');
    const note = NoteStore.get('g_note');
    expect(note).not.toBeNull();
    expect(note.body).toBe('God so loved the world');
    expect(note.color).toBe('yellow');
    expect(groupsOn(K16)).toEqual(['g_note']);
    const seg = AnnotationStore.getByGroup('g_note')[0].ann;
    expect([seg.kind, seg.color, seg.start, seg.end]).toEqual(['highlight', 'yellow', 0, V16.length]);
  });

  it('the style tapped with the colour applies to the noted mark too (underline, green)', async () => {
    noteOn('g_note', [[K16, 0, V16.length, V16]], 'begotten', { kind: 'highlight', color: 'yellow' });
    selectBlocks(K16, K16);
    await tapColour('green', 'underline');
    expect(NoteStore.get('g_note').body).toBe('begotten');
    const seg = AnnotationStore.getByGroup('g_note')[0].ann;
    expect([seg.kind, seg.color]).toEqual(['underline', 'green']);
    expect(groupsOn(K16)).toEqual(['g_note']);
  });

  it('note on John 3:16, select John 3:15-17, tap yellow: the note and its mark stay, the new mark spans all three', async () => {
    noteOn('g_note', [[K16, 0, V16.length, V16]], 'God so loved the world');
    selectBlocks(K15, K17);
    await tapColour('yellow');
    expect(NoteStore.get('g_note').body).toBe('God so loved the world');
    expect(AnnotationStore.getByGroup('g_note').map((s) => [s.key, s.ann.start, s.ann.end]))
      .toEqual([[K16, 0, V16.length]]);
    const fresh = groupsOn(K15);
    expect(fresh).toHaveLength(1);
    const segs = AnnotationStore.getByGroup(fresh[0]);
    expect(segs.map((s) => s.key).sort()).toEqual([K15, K16, K17]);
    expect(segs.every((s) => s.ann.color === 'yellow')).toBe(true);
    // Made after the note's mark, so it is the one that paints in John 3:16.
    const in16 = segs.find((s) => s.key === K16);
    expect(in16.ann.created).toBeGreaterThan(AnnotationStore.getByGroup('g_note')[0].ann.created);
  });

  it('a note on John 3:15-17 recoloured by selecting John 3:15-17 again changes colour in place', async () => {
    noteOn('g_note', [[K15, 0, V15.length, V15], [K16, 0, V16.length, V16], [K17, 0, V17.length, V17]], 'the gospel');
    selectBlocks(K15, K17);
    await tapColour('blue');
    expect(NoteStore.get('g_note').body).toBe('the gospel');
    expect(NoteStore.get('g_note').color).toBe('blue');
    expect(AnnotationStore.getByGroup('g_note').map((s) => s.ann.color)).toEqual(['blue', 'blue', 'blue']);
    [K15, K16, K17].forEach((k) => expect(groupsOn(k)).toEqual(['g_note']));
  });

  it('a note on John 3:16-17, select John 3:16 alone, tap pink: the note keeps both verses', async () => {
    noteOn('g_note', [[K16, 0, V16.length, V16], [K17, 0, V17.length, V17]], 'two verses', { color: 'yellow' });
    selectBlocks(K16, K16);
    await tapColour('pink');
    expect(NoteStore.get('g_note').body).toBe('two verses');
    expect(AnnotationStore.getByGroup('g_note').map((s) => [s.key, s.ann.color])).toEqual([[K16, 'yellow'], [K17, 'yellow']]);
    const fresh = groupsOn(K16).filter((id) => id !== 'g_note');
    expect(fresh).toHaveLength(1);
    expect(AnnotationStore.getByGroup(fresh[0]).map((s) => [s.key, s.ann.color])).toEqual([[K16, 'pink']]);
  });

  it('an unnoted mark is still replaced by the recolour, as before', async () => {
    AnnotationStore.add(K16, { id: 'g_plain', groupId: 'g_plain', kind: 'highlight', color: 'yellow', start: 0, end: V16.length, text: V16, created: 1000 });
    selectBlocks(K16, K16);
    await tapColour('green');
    expect(AnnotationStore.getByGroup('g_plain')).toEqual([]);
    const marks = AnnotationStore.get(K16);
    expect(marks).toHaveLength(1);
    expect([marks[0].color, marks[0].start, marks[0].end]).toEqual(['green', 0, V16.length]);
  });

  it('a noted and an unnoted mark on the same words: the plain one goes, the note takes the colour', async () => {
    AnnotationStore.add(K16, { id: 'g_plain', groupId: 'g_plain', kind: 'highlight', color: 'orange', start: 0, end: V16.length, text: V16, created: 900 });
    noteOn('g_note', [[K16, 0, V16.length, V16]], 'kept');
    selectBlocks(K16, K16);
    await tapColour('yellow');
    expect(NoteStore.get('g_note').body).toBe('kept');
    expect(groupsOn(K16)).toEqual(['g_note']);
    expect(AnnotationStore.getByGroup('g_note')[0].ann.color).toBe('yellow');
  });
});
