// @ts-nocheck
/* listen-from: a text selection becomes a LISTEN FROM HERE call (listening item 7, 2026-09-22).
   The selection toolbar asks listenFromTarget(selection) whether to offer the action (the selection starts in
   a block the live reading pane's unit owns, and that unit has a recording), and listenFromSelection(selection)
   to act: the block's data-hl-key and the selection start's offset in the block's textContent (the domain the
   rows and the paint use) go to window.__votListenFrom.start. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listenFromTarget, listenFromSelection } from './listen-from.js';

let body;
const selectAt = (node, offset) => {
  const sel = document.getSelection();
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStart(node, offset);
  r.setEnd(node, Math.min(node.length || 0, offset + 4));
  sel.addRange(r);
  return sel;
};

beforeEach(() => {
  body = document.createElement('div');
  body.innerHTML = '<p data-hl-key="letter:x:0">First block.</p><p data-hl-key="letter:x:1">Second <em>block</em> text here.</p><p>No key.</p>';
  document.body.appendChild(body);
  globalThis.__votListenFrom = { has: vi.fn((k) => k.startsWith('letter:x:')), start: vi.fn(() => true) };
});
afterEach(() => {
  body.remove();
  delete globalThis.__votListenFrom;
  document.getSelection().removeAllRanges();
});

describe('listenFromTarget / listenFromSelection', () => {
  it('names the block and the offset of the selection start in its text', () => {
    const em = body.querySelector('em').firstChild;              // "block" inside block 1, after "Second "
    const t = listenFromTarget(selectAt(em, 2));
    expect(t).toEqual({ hlKey: 'letter:x:1', offset: 'Second '.length + 2 });
  });

  it('offers nothing outside a keyed block, or when the pane does not own the block, or with no pane', () => {
    expect(listenFromTarget(selectAt(body.querySelectorAll('p')[2].firstChild, 1))).toBe(null);
    globalThis.__votListenFrom.has.mockReturnValue(false);
    expect(listenFromTarget(selectAt(body.querySelector('p').firstChild, 1))).toBe(null);
    delete globalThis.__votListenFrom;
    expect(listenFromTarget(selectAt(body.querySelector('p').firstChild, 1))).toBe(null);
  });

  it('acts through the pane: start(hlKey, offset)', () => {
    expect(listenFromSelection(selectAt(body.querySelector('p').firstChild, 6))).toBe(true);
    expect(globalThis.__votListenFrom.start).toHaveBeenCalledWith('letter:x:0', 6);
  });
});
