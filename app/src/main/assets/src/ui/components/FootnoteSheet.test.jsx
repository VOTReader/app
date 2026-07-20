/* FootnoteSheet — portal contract.
   ─────────────────────────────────
   The volumes / WTLB footnote sheet is position:fixed and was rendered inside the
   reading screen's `.pager-track`. A page-swipe settle puts a transient transform
   on that track, which becomes the containing block for fixed descendants and
   drops the sheet off-screen (see ScriptureSheet for the full rationale). The fix
   portals it to <body>. FootnoteSheet already had a graceful missing-verse
   message; this guards the portal relocation. */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FootnoteSheet } from './FootnoteSheet.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).ReactDOM = ReactDOM;
  /** @type {any} */ (globalThis).ScriptureVerseText = ({ text }) => <span>{text}</span>;
  /** @type {any} */ (globalThis).lookupVersesFromBooks = () => null;
});
afterEach(() => {
  cleanup();
  delete (/** @type {any} */ (globalThis)).GoToRefButton;
});

const Sheet = /** @type {any} */ (FootnoteSheet);
const fn = { type: 'scripture', ref: 'Isaiah 13:11' };

it('portals the footnote sheet OUT of a transformed .pager-track to <body>', () => {
  const { container } = render(
    <div className="pager-track" style={{ transform: 'translateX(0px)' }}>
      <Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />
    </div>,
  );
  const track = container.querySelector('.pager-track');
  expect(track.querySelector('.fn-sheet')).toBeNull();
  expect(document.body.querySelector('.fn-sheet')).not.toBeNull();
});

it('shows the missing-verse message instead of a blank sheet', () => {
  render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
  expect(document.body.textContent).toContain('Isaiah 13:11');
  expect(document.body.textContent.toLowerCase()).toContain("isn’t available".toLowerCase());
});

/* The 2026-07-19 owner report: a chapter-only footnote ("1 Kings 22") must
   render real verse content through the BOOKS fallback — the letter's nkjv
   dict deliberately has no entry (dicts never embed whole chapters). */
it('renders chapter content via the BOOKS fallback when the nkjv dict has no entry', () => {
  /** @type {any} */ (globalThis).lookupVersesFromBooks = (ref) =>
    ref === '1 Kings 22' ? '1. And they continued three years without war between Syria and Israel. 2. Then it came to pass…' : null;
  const chFn = { type: 'scripture', ref: '1 Kings 22' };
  render(<Sheet num={1} fn={chFn} nkjv={{}} footnotes={{ '1': chFn }} onClose={() => {}} />);
  expect(document.body.querySelector('.fn-sheet-verse')).not.toBeNull();
  expect(document.body.textContent).toContain('three years without war');
  expect(document.body.textContent.toLowerCase()).not.toContain("isn’t available".toLowerCase());
});

/* "Go to Scripture" — a scripture footnote gets the jump-to-verse action when
   the host wires onGoToRef; the sheet passes the ref through and the action
   is absent when the host has no navigation to offer. */
it('renders the Go-to-Scripture action for a scripture footnote when onGoToRef is wired', () => {
  /** @type {any} */ (globalThis).GoToRefButton = ({ refStr, onGo }) => (
    <button data-testid="goto" onClick={() => onGo({ type: 'bible', bookId: 'isaiah', chapter: 13, verse: 11 })}>{refStr}</button>
  );
  const onGoToRef = vi.fn();
  render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} onGoToRef={onGoToRef} />);
  const btn = document.querySelector('[data-testid="goto"]');
  expect(btn).not.toBeNull();
  expect(btn.textContent).toBe('Isaiah 13:11'); // the fn's own ref threads through
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onGoToRef).toHaveBeenCalledWith({ type: 'bible', bookId: 'isaiah', chapter: 13, verse: 11 });
});

it('omits the Go-to-Scripture action when no onGoToRef handler is provided', () => {
  /** @type {any} */ (globalThis).GoToRefButton = () => <button data-testid="goto" />;
  render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
  expect(document.querySelector('[data-testid="goto"]')).toBeNull();
});
