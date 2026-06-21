/* ScriptureSheet — portal + missing-verse fallback contract.
   ─────────────────────────────────────────────────────────
   Two regressions are guarded here, both reported on the Matthew Study Bible:

   1. BLANK / OFF-SCREEN SHEET. The sheet is position:fixed. When it lived inside
      the reading screen's `.pager-track`, a page-swipe settle put a transient
      `transform` on that track; a transformed ancestor becomes the containing
      block for fixed descendants, so the sheet's `bottom:0` resolved to the
      bottom of the tall scrolled track and dropped off-screen — the backdrop
      greyed the screen but no sheet appeared. The fix portals the sheet to
      <body>, so it can NEVER be a descendant of a transformed `.pager-track`.

   2. EMPTY SHEET. The sheet used to render its whole body only when the verse
      text was present (`activeRef && verseText`), so a ref with no MATTHEW_NKJV
      entry opened a content-less sheet. The fix renders a fallback message
      instead, mirroring the FootnoteSheet / inline-ref sheets. */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { ScriptureSheet } from './ScriptureSheet.jsx';

beforeEach(() => {
  // ScriptureSheet reads these as free-var globals (window-attached in prod).
  /** @type {any} */ (globalThis).ReactDOM = ReactDOM;
  /** @type {any} */ (globalThis).MATTHEW_NKJV = { 'John 3:16': 'For God so loved the world…' };
  /** @type {any} */ (globalThis).ScriptureVerseText = ({ text }) => <span data-testid="verse">{text}</span>;
});
afterEach(() => { cleanup(); });

const Sheet = /** @type {any} */ (ScriptureSheet);

it('portals the sheet OUT of a transformed .pager-track to <body>', () => {
  const { container } = render(
    <div className="pager-track" style={{ transform: 'translateX(0px)' }}>
      <Sheet activeRef={{ ref: '3:16', cite: 'John 3:16' }} onClose={() => {}} />
    </div>,
  );
  const track = container.querySelector('.pager-track');
  // The fix: the fixed sheet must NOT be a descendant of the transformed track.
  expect(track.querySelector('.fn-sheet')).toBeNull();
  expect(track.querySelector('.fn-sheet-backdrop')).toBeNull();
  // It still exists in the document — portaled onto <body>.
  expect(document.body.querySelector('.fn-sheet')).not.toBeNull();
});

it('renders the verse text when the cite is in MATTHEW_NKJV', () => {
  render(<Sheet activeRef={{ ref: '3:16', cite: 'John 3:16' }} onClose={() => {}} />);
  const verse = document.querySelector('[data-testid="verse"]');
  expect(verse).not.toBeNull();
  expect(verse.textContent).toContain('For God so loved');
});

it('shows a fallback (never a blank sheet) when the verse is missing', () => {
  render(<Sheet activeRef={{ ref: '9:99', cite: 'John 9:99' }} onClose={() => {}} />);
  // Still shows the cite + a graceful message, not an empty content block.
  expect(document.body.textContent).toContain('John 9:99');
  expect(document.body.textContent).toContain('Verse text not available in app data');
  expect(document.querySelector('[data-testid="verse"]')).toBeNull();
});

it('fires onClose when the backdrop is tapped', () => {
  const onClose = vi.fn();
  render(<Sheet activeRef={{ ref: '3:16', cite: 'John 3:16' }} onClose={onClose} />);
  document.querySelector('.fn-sheet-backdrop')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('removes the portaled sheet from <body> on unmount (no leak)', () => {
  const { unmount } = render(<Sheet activeRef={{ ref: '3:16', cite: 'John 3:16' }} onClose={() => {}} />);
  expect(document.body.querySelector('.fn-sheet')).not.toBeNull();
  unmount();
  expect(document.body.querySelector('.fn-sheet')).toBeNull();
});
