/* A quote block over 240 characters drew raw markup and lost its marks (sweep v047).
   ─────────────────────────────────────────────────────────────────
   A short quote renders through jrnRenderInline inside its annotation
   container (data-hl-key / data-hl-dom). A long one went to JrnExpandable
   with neither, and ExpandableText printed the raw string: **bold** and
   {{ref:John 3:16}} showed as literal markers, the ref chip could not be
   tapped, and with no data-hl-key a highlight or note on the quote never
   painted (or one made while it was short vanished once it grew).

   The long quote now draws through the same inline renderer inside the same
   annotation container. Its collapse is visual (a line clamp), so the
   container always holds the whole quote and Show more / Show less never
   rewrites the text the annotation layer has wrapped in marks. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { JournalBlockView } from './JournalViewerScreen.jsx';
import { blockPlainText, inlineLinkLabel } from '../../stores/journal-mark-rekey.js';
import '../../components/ExpandableText.jsx';   // installs window.JrnExpandable, as bundle-b does

const LONG = 'For **God** so loved the world, as {{ref:John 3:16}} says, that the words run on and on '
  + 'well past the point where the viewer folds a long quote away behind its Show more control, '
  + 'and on further still, so that the quote is plainly longer than two hundred and forty characters.';
const QUOTE = { id: 'b_q', type: 'quote', text: LONG, cite: 'A reader' };

/** jsdom has no layout: make the body report that the clamp hides text. */
function withClampedLayout(fn) {
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 200; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 120; } });
  try { return fn(); } finally {
    if (sh) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', sh); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch); else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
}

afterEach(() => {
  cleanup();
  delete (/** @type {any} */ (globalThis).parseRefStr);
});

describe('JournalBlockView — a quote over 240 characters (v047)', () => {
  it('draws inline markup and a tappable ref chip, never the raw markers', () => {
    expect(LONG.length).toBeGreaterThan(240);
    const onScriptureRef = vi.fn();
    const { container } = render(
      <JournalBlockView block={QUOTE} callbacks={{ onScriptureRef }} entryId="j_1" blockIndex={0} />
    );
    expect(container.textContent).not.toMatch(/\*\*|\{\{ref:/);
    expect(container.querySelector('strong').textContent).toBe('God');
    const chip = container.querySelector('.jrn-inline-ref');
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    expect(onScriptureRef).toHaveBeenCalledWith('John 3:16');
  });

  it('keeps its annotation container, holding the whole quote exactly as the re-key reads it', () => {
    const { container } = render(<JournalBlockView block={QUOTE} callbacks={{}} entryId="j_1" blockIndex={0} />);
    const hl = container.querySelector('[data-hl-key="journal:j_1:b_q"]');
    expect(hl).toBeTruthy();
    expect(hl.hasAttribute('data-hl-dom')).toBe(true);
    expect(hl.textContent).toBe(blockPlainText(QUOTE, inlineLinkLabel));
    expect(hl.querySelector('button')).toBeNull();   // the toggle is no part of the marked text
  });

  it('Show more / Show less never rewrites the marked text', () => {
    withClampedLayout(() => {
      const { container } = render(<JournalBlockView block={QUOTE} callbacks={{}} entryId="j_1" blockIndex={0} />);
      const hl = container.querySelector('[data-hl-key="journal:j_1:b_q"]');
      const firstText = hl.firstChild;
      const before = hl.textContent;
      const btn = container.querySelector('.jrn-expand-toggle');
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-hl-key="journal:j_1:b_q"]')).toBe(hl);
      expect(hl.firstChild).toBe(firstText);
      expect(hl.textContent).toBe(before);
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(hl.textContent).toBe(before);
    });
  });

  it('a short quote is unchanged: inline markup in the annotation container', () => {
    const SHORT = { id: 'b_s', type: 'quote', text: 'Grace to **you**.' };
    const { container } = render(<JournalBlockView block={SHORT} callbacks={{}} entryId="j_1" blockIndex={1} />);
    const hl = container.querySelector('[data-hl-key="journal:j_1:b_s"]');
    expect(hl.textContent).toBe('Grace to you.');
    expect(container.querySelector('.jrn-expand-toggle')).toBeNull();
  });
});
