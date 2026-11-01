// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* The leaks the 2026-11-01 hunt fixed in components, each held by the harness
   (ui/leak/leak-harness.js): mounted, driven to the state that started the thing,
   unmounted at once, 20 times. Each test failed on the code before its fix. The
   hooks' own fixes are pinned in their test files (use-reading-dwell,
   use-dom-annotation-sync). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { installLeakHarness, expectNoLeaks } from './leak-harness.js';
import { FootnoteNoteText } from '../components/FootnoteNoteText.jsx';
import { SelectionToolbar } from '../sheets/SelectionToolbar.jsx';

const g = globalThis;
const noop = () => {};
let h;
let set = [];
const stub = (obj) => { for (const k of Object.keys(obj)) { g[k] = obj[k]; set.push(k); } };
afterEach(() => {
  if (h) { h.restore(); h = null; }
  for (const k of set) delete g[k];
  set = [];
  document.body.innerHTML = '';
});

describe('FootnoteNoteText', () => {
  // A marker's tap lights its note line for 1.4 s; the un-light timer outlived the sheet.
  it('a marker tapped just before the sheet closes leaves no flash timer behind', async () => {
    h = installLeakHarness();
    const TEXT = 'The words of the note[A] go here.\n\nA. The lettered note itself.';
    await expectNoLeaks(h, () => render(<FootnoteNoteText text={TEXT} />), {
      label: 'FootnoteNoteText',
      interact: () => { const m = document.querySelector('.fn-note-mark'); expect(m).toBeTruthy(); fireEvent.click(m); },
    });
  });
});

describe('SelectionToolbar', () => {
  beforeEach(() => {
    stub({
      HL_COLORS: ['yellow', 'green', 'blue'],
      HighlightStore: { get: () => [] },
      AnnotationStore: { get: () => [], getByGroup: () => [], add: noop, removeGroup: noop, convertGroup: noop },
      NoteStore: { get: () => null, set: noop, remove: noop },
      BookmarkStore: { add: noop },
      snapRangeToWords: (_t, s, e) => ({ start: s, end: e }),
      snapSelectionRange: (_c, _t, s, e) => ({ start: s, end: e }),
      hlId: () => 'hl_test',
    });
  });

  // A selection changed with the pointer up (a handle drag, Shift+arrow) arms a 350 ms settle
  // debounce that re-arms itself while a handle is held. The toolbar's cleanup did not clear it.
  it('a selection adjusted just before the toolbar unmounts leaves no settle timer behind', async () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'bible:test:1:1');
    p.textContent = 'The Revelation of Jesus Christ';
    document.body.appendChild(p);
    const range = document.createRange();
    range.setStart(p.firstChild, 0); range.setEnd(p.firstChild, 14);
    range.getBoundingClientRect = () => ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    const orig = window.getSelection;
    window.getSelection = () => ({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges: noop,
      toString: () => range.toString(), focusNode: range.endContainer, focusOffset: range.endOffset,
    });
    h = installLeakHarness();
    try {
      await expectNoLeaks(h, () => render(<SelectionToolbar onLinkRequest={noop} onNoteRequest={noop} onBookmarkRequest={noop} />), {
        label: 'SelectionToolbar',
        interact: () => { document.dispatchEvent(new Event('selectionchange')); },
        unmountAt: 'interact',
      });
    } finally {
      window.getSelection = orig;
    }
  });
});
