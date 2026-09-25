/* v05-02 — the imperative paint path re-anchors a mark the way the React path does.
   ─────────────────────────────────────────────────────────────────────
   HighlightableText runs resolveAnchor (renderer/anchor-resolve.js) before it
   paints; applyDOMHighlights only clamped the stored offsets. So in the blocks the
   DOM path paints (letters, WTLB, journal text), editing journal text in front of
   a mark, or a corpus correction, moved the mark onto other words. The DOM path
   now re-finds the stored text in a chrome-aware view of the container - the same
   view SelectionToolbar's hlDisplayText records (footnote digits and icon glyphs
   left out, a line break between blocks) - and keeps the clamped offsets when the
   text is nowhere (a mark is never dropped on this path). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyDOMHighlights } from './annotation-engine.jsx';

const ann = (o) => ({ id: o.id, groupId: o.id, kind: 'highlight', color: 'yellow', start: o.start, end: o.end, created: 1, text: o.text || '' });

/** The words a mark paints, footnote digits left out (what the reader sees marked). */
function painted(c, id) {
  return [...c.querySelectorAll('mark[data-hl-id="' + id + '"]')]
    .filter((m) => !m.closest('.fn-ref'))
    .map((m) => m.textContent).join('|');
}

describe('applyDOMHighlights re-anchors onto the text on screen (v05-02)', () => {
  let store;
  beforeEach(() => {
    store = {};
    window.AnnotationStore = { get: (k) => store[k] || [] };
    window.NoteStore = { get: () => null };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.AnnotationStore;
    delete window.NoteStore;
  });
  const setup = (html) => {
    document.body.innerHTML = '<div data-hl-key="k" data-hl-dom>' + html + '</div>';
    return document.querySelector('[data-hl-key="k"]');
  };

  it('text typed in front of a mark does not move it onto other words', () => {
    // Marked when the block read "Be strong and of good courage." (0-9 = "Be strong").
    store.k = [ann({ id: 'a', start: 0, end: 9, text: 'Be strong' })];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('Be strong');
    expect(c.textContent).toBe('Today I read Joshua. Be strong and of good courage.');
  });

  it('unchanged text keeps the stored offsets, a footnote digit inside the mark included', () => {
    // textContent "The Lord1 is my shepherd": "Lord1 is my" = 4-15; the stored text leaves the digit out.
    store.k = [ann({ id: 'a', start: 4, end: 15, text: 'Lord is my' })];
    const c = setup('<p>The Lord<sup class="fn-ref">1</sup> is my shepherd</p>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('Lord| is my');
  });

  it('a mark across a footnote moves with its words', () => {
    store.k = [ann({ id: 'a', start: 4, end: 15, text: 'Lord is my' })];
    const c = setup('<p>Now the Lord<sup class="fn-ref">1</sup> is my shepherd</p>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('Lord| is my');
  });

  it('a mark across two poem lines moves with its words (the stored text has the line break)', () => {
    // Marked in "<div>line one</div><div>line two</div>": textContent "line oneline two", "one"+"line" = 5-12.
    store.k = [ann({ id: 'a', start: 5, end: 12, text: 'one\nline' })];
    const c = setup('<div>A first line</div><div>line one</div><div>line two</div>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('one|line');
  });

  it('text that is nowhere any more keeps the clamped offsets - the mark is never dropped', () => {
    store.k = [ann({ id: 'a', start: 0, end: 5, text: 'Vanished words' })];
    const c = setup('<p>Hello world</p>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('Hello');
  });

  it('a record with no stored text (pre-text backups) paints its offsets as before', () => {
    store.k = [ann({ id: 'a', start: 6, end: 11 })];
    const c = setup('<p>Hello world</p>');
    applyDOMHighlights();
    expect(painted(c, 'a')).toBe('world');
  });
});
