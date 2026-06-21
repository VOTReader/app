/* FootnoteSheet — portal contract.
   ─────────────────────────────────
   The volumes / WTLB footnote sheet is position:fixed and was rendered inside the
   reading screen's `.pager-track`. A page-swipe settle puts a transient transform
   on that track, which becomes the containing block for fixed descendants and
   drops the sheet off-screen (see ScriptureSheet for the full rationale). The fix
   portals it to <body>. FootnoteSheet already had a graceful missing-verse
   message; this guards the portal relocation. */

import { it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FootnoteSheet } from './FootnoteSheet.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).ReactDOM = ReactDOM;
  /** @type {any} */ (globalThis).ScriptureVerseText = ({ text }) => <span>{text}</span>;
  /** @type {any} */ (globalThis).lookupVersesFromBooks = () => null;
});
afterEach(() => { cleanup(); });

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
