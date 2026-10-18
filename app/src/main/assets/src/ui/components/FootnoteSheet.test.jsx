/* FootnoteSheet — portal contract.
   ─────────────────────────────────
   The volumes / WTLB footnote sheet is position:fixed and was rendered inside the
   reading screen's `.pager-track`. A page-swipe settle puts a transient transform
   on that track, which becomes the containing block for fixed descendants and
   drops the sheet off-screen (see ScriptureSheet for the full rationale). The fix
   portals it to <body>. FootnoteSheet already had a graceful missing-verse
   message; this guards the portal relocation. */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
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

it('is an accessible modal while open and becomes inert during its close transition', () => {
  const { rerender } = render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Footnote 1' })).toBeTruthy();
  expect(document.activeElement.closest('.fn-sheet')).not.toBeNull();

  rerender(<Sheet num={null} fn={null} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.querySelector('.fn-sheet').hasAttribute('inert')).toBe(true);
  expect(document.querySelector('.fn-sheet').getAttribute('aria-hidden')).toBe('true');
  expect(document.querySelector('.fn-sheet-backdrop').classList.contains('open')).toBe(false);
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

/* Companion rail (2026-08-03): on wide viewports the sheet is a NON-modal
   side panel — complementary role, no aria-modal, no backdrop. The trap +
   dialog semantics below the threshold are covered by the tests above. */
it('rail mode drops modality: complementary role, no aria-modal, no backdrop', () => {
  const listeners = new Set();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    addEventListener: (_t, cb) => listeners.add(cb),
    removeEventListener: (_t, cb) => listeners.delete(cb),
  })));
  try {
    render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
    const panel = document.querySelector('.fn-sheet');
    expect(panel.classList.contains('rail')).toBe(true);
    expect(panel.getAttribute('role')).toBe('complementary');
    expect(panel.getAttribute('aria-modal')).toBeNull();
    expect(panel.getAttribute('aria-live')).toBe('polite');
    expect(panel.getAttribute('aria-atomic')).toBe('true');
    expect(document.querySelector('.fn-sheet-backdrop')).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it('rail live region exists BEFORE content opens (closed panel keeps aria-live)', () => {
  // A live region announces only mutations to an ALREADY-EXISTING region —
  // creating aria-live in the same paint as the content it should announce
  // is silent on most screen readers. Closed rail panel: live attrs present,
  // content suppressed via aria-hidden/inert.
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })));
  try {
    render(<Sheet num={null} fn={null} nkjv={{}} footnotes={{}} onClose={() => {}} />);
    const panel = document.querySelector('.fn-sheet');
    expect(panel.classList.contains('open')).toBe(false);
    expect(panel.getAttribute('aria-live')).toBe('polite');
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  } finally { vi.unstubAllGlobals(); }
});

/* Sweep low (mw10): the docked rail panel takes no focus and traps nothing, but closing it from inside
   (its ‹ Close) made it inert with focus inside, so focus fell to <body>. */
it('rail: closing the panel from inside returns focus to what opened it', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })));
  const opener = document.body.appendChild(document.createElement('button'));
  try {
    opener.focus();
    const { rerender } = render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
    expect(document.activeElement).toBe(opener);   // non-modal: opening does not take focus
    /** @type {HTMLElement} */ (document.querySelector('.fn-sheet button')).focus();
    rerender(<Sheet num={null} fn={null} nkjv={{}} footnotes={{}} onClose={() => {}} />);
    expect(document.activeElement).toBe(opener);
  } finally { opener.remove(); vi.unstubAllGlobals(); }
});

it('rail: focus the reader moved elsewhere is left where it is when the panel closes', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })));
  const opener = document.body.appendChild(document.createElement('button'));
  const other = document.body.appendChild(document.createElement('button'));
  try {
    opener.focus();
    const { rerender } = render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
    /** @type {HTMLElement} */ (document.querySelector('.fn-sheet button')).focus();
    other.focus();
    rerender(<Sheet num={null} fn={null} nkjv={{}} footnotes={{}} onClose={() => {}} />);
    expect(document.activeElement).toBe(other);
  } finally { opener.remove(); other.remove(); vi.unstubAllGlobals(); }
});

/* The Scripture Web's door (the navigation stream, w3): a scripture footnote offers "Show in
   Scripture Web" beside Go to Scripture when the routes have a door (window.__openScriptureWeb,
   screen-routes.jsx); the sheet closes and the web opens on the footnote's verse, or its chapter.
   The reference is read by the app's own parser (search/ref-parser.js). */
describe('the Scripture Web door', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    // @ts-ignore -- a classic script: it sets window.VotSearchData
    await import('../../../search-data.js');
  });
  afterAll(() => { window.VotSearchData = prevData; });
  afterEach(() => { delete /** @type {any} */ (window).__openScriptureWeb; });
  const webBtn = () => /** @type {HTMLButtonElement | null} */ (document.querySelector('.fn-sheet [data-door="web"]'));

  it('opens the web on the footnote\'s verse and closes the sheet', () => {
    const open = vi.fn(() => true);
    /** @type {any} */ (window).__openScriptureWeb = open;
    const onClose = vi.fn();
    render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={onClose} />);
    const btn = webBtn();
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Show in Scripture Web');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
    expect(open).toHaveBeenLastCalledWith({ verse: { bookId: 'isaiah', chapter: 13, verse: 11 } });
  });

  it('a chapter footnote opens its chapter; a translation tag and a compound tail are read past', () => {
    const open = vi.fn(() => true);
    /** @type {any} */ (window).__openScriptureWeb = open;
    const ch = { type: 'scripture', ref: '1 Kings 22' };
    render(<Sheet num={1} fn={ch} nkjv={{}} footnotes={{ '1': ch }} onClose={() => {}} />);
    webBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).toHaveBeenLastCalledWith({ book: '1kings', chapter: 22 });
    cleanup();
    const tagged = { type: 'scripture', ref: 'John 14:6 (CJB); Acts 4:12' };
    render(<Sheet num={1} fn={tagged} nkjv={{}} footnotes={{ '1': tagged }} onClose={() => {}} />);
    webBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).toHaveBeenLastCalledWith({ verse: { bookId: 'john', chapter: 14, verse: 6 } });
  });

  it('no door without the routes, and none on a note that is not scripture', () => {
    render(<Sheet num={1} fn={fn} nkjv={{}} footnotes={{ '1': fn }} onClose={() => {}} />);
    expect(webBtn()).toBeNull();
    cleanup();
    /** @type {any} */ (window).__openScriptureWeb = vi.fn(() => true);
    const note = { type: 'note', text: 'A note' };
    render(<Sheet num={1} fn={note} nkjv={{}} footnotes={{ '1': note }} onClose={() => {}} />);
    expect(webBtn()).toBeNull();
  });
});
