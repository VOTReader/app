/* A journal mark stays on its paragraph when the blocks around it move
   (v05-01, improvement sweep 2026-09-22 REPORT #4).

   JournalBlockView gave each paragraph the key journal:<entryId>:<position>,
   and every highlight, note, bookmark and link end on it was stored under that
   key. The editor changes positions in normal use - a photo or voice memo goes
   in above, a paragraph comes out, a block is dragged - so every later mark
   slid onto another paragraph without a word. The key is now the block's own
   id, which never changes: these cases insert, delete and reorder around a
   paragraph and need its key to hold. */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JournalBlockView } from './JournalViewerScreen.jsx';
import { blockPlainText, inlineLinkLabel } from '../../stores/journal-mark-rekey.js';

const A = { id: 'b_a', type: 'p', text: 'Grace to you.' };
const B = { id: 'b_b', type: 'p', text: 'Peace from God.' };
const H = { id: 'b_h', type: 'h2', text: 'Thanksgiving' };
const DIV = { id: 'b_d', type: 'divider' };

/** Each markable block's words -> the key its marks are stored under. */
function keysFor(blocks) {
  const { container, unmount } = render(
    <div>{blocks.map((b, i) => <JournalBlockView key={b.id} block={b} callbacks={{}} entryId="j_1" blockIndex={i} />)}</div>
  );
  const out = {};
  container.querySelectorAll('[data-hl-key]').forEach((el) => { out[el.textContent] = el.getAttribute('data-hl-key'); });
  unmount();
  return out;
}

describe('journal marks are keyed by block id, not position', () => {
  it("a paragraph's key is its block id", () => {
    expect(keysFor([A, B, H])).toEqual({
      'Grace to you.': 'journal:j_1:b_a',
      'Peace from God.': 'journal:j_1:b_b',
      Thanksgiving: 'journal:j_1:b_h',
    });
  });

  it('a block inserted above, one deleted, or a reorder leaves every key where it was', () => {
    const before = keysFor([A, B, H]);
    expect(keysFor([DIV, A, B, H])).toEqual(before);                       // a divider (or a photo) goes in at the top
    expect(keysFor([B, H])).toEqual({ 'Peace from God.': before['Peace from God.'], Thanksgiving: before.Thanksgiving });
    expect(keysFor([H, B, A])).toEqual(before);                            // dragged into a new order
  });

  it('a block without an id keeps the position key (no block is made without one)', () => {
    expect(keysFor([DIV, { type: 'p', text: 'Old.' }])).toEqual({ 'Old.': 'journal:j_1:1' });
  });

  // The boot re-key finds an old mark's block by its words, so it must read a paragraph exactly as this view
  // draws it - an inline link as the title it shows (refutation F4, 2026-09-24).
  it("the re-key reads a paragraph's words exactly as the view draws them, inline links included", () => {
    const G = /** @type {any} */ (globalThis);
    const saved = ['BookmarkStore', 'JournalStore', 'JournalHelpers', 'findEntryContext'].map((k) => [k, G[k]]);
    G.BookmarkStore = { get: (id) => (id === 'bk_1' ? { id, label: 'My place' } : null) };
    G.JournalStore = { get: (id) => (id === 'j_9' ? { id, title: 'Morning' } : null) };
    G.JournalHelpers = { entryDisplayTitle: (e) => e.title };
    G.findEntryContext = (id, kind) => (id === 'the-wide-path' && kind === 'letter' ? { title: 'The Wide Path' } : null);
    try {
      const block = {
        id: 'b_all', type: 'p',
        text: 'See **this**, _that_, {{ref:John 3:16}}, [[letter:wtlb/the-wide-path]], [[bookmark:bk_1]] and [[journal:j_9]].',
      };
      const { container, unmount } = render(<JournalBlockView block={block} callbacks={{}} entryId="j_1" blockIndex={0} />);
      const drawn = container.textContent;
      unmount();
      expect(drawn).toBe('See this, that, John 3:16, The Wide Path, My place and Morning.');
      expect(blockPlainText(block, inlineLinkLabel)).toBe(drawn);
    } finally {
      saved.forEach(([k, v]) => { if (v === undefined) delete G[k]; else G[k] = v; });
    }
  });
});
