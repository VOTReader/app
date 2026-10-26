/* FootnoteSheet — portal contract.
   ─────────────────────────────────
   The volumes / WTLB footnote sheet is position:fixed and was rendered inside the
   reading screen's `.pager-track`. A page-swipe settle puts a transient transform
   on that track, which becomes the containing block for fixed descendants and
   drops the sheet off-screen (see ScriptureSheet for the full rationale). The fix
   portals it to <body>. FootnoteSheet already had a graceful missing-verse
   message; this guards the portal relocation. */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FootnoteSheet } from './FootnoteSheet.jsx';
import { InAppLinkButton } from './InAppLinkButton.jsx';

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

  // Corbin, 2026-10-24: "Romans 6:23, Ezekiel 18:4, Ezekiel 18:20" opened only the first
  it('a footnote citing several passages: one door, a button for each passage', () => {
    const open = vi.fn(() => true);
    /** @type {any} */ (window).__openScriptureWeb = open;
    /** @type {any} */ (globalThis).splitCompoundRef = (s) => s.split(/,\s*/).map((ref, index) => ({ ref, index }));
    try {
      const many = { type: 'scripture', ref: 'Romans 6:23, Ezekiel 18:4, Ezekiel 18:20' };
      const onClose = vi.fn();
      render(<Sheet num={1} fn={many} nkjv={{}} footnotes={{ '1': many }} onClose={onClose} />);
      expect(document.querySelectorAll('.fn-sheet [data-door="web"]'), 'one door').toHaveLength(1);
      const refs = [...document.querySelectorAll('.fn-sheet .fn-web-ref')];
      expect(refs.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Show Romans 6:23 in Scripture Web', 'Show Ezekiel 18:4 in Scripture Web', 'Show Ezekiel 18:20 in Scripture Web',
      ]);
      refs[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onClose).toHaveBeenCalled();
      expect(open).toHaveBeenLastCalledWith({ verse: { bookId: 'ezekiel', chapter: 18, verse: 20 } });
    } finally {
      delete /** @type {any} */ (globalThis).splitCompoundRef;
    }
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

/* share-fn (Corbin 2026-10-25, Volume Seven "Proclaim The Name of The Lord", footnote 2:
   "we need to make these followable with good UX, links/refs inside footnotes"). The note
   quotes "Death and Deliverance" with its own [A] [B] and, at its end, the lines they name. */
describe('a note footnote: markers, references and the source letter are followable (share-fn)', () => {
  const g = /** @type {any} */ (globalThis);
  const DD = '\u201CYet now I command all people everywhere to repent in sincerity and in truth.[A] Yet now I command all who have ears to hear, to call upon His name.[B] Says The Lord.\u201D (From \u201CDeath and Deliverance\u201D)\n\nA. Acts 17:30 \u2014 \u201CTruly, these times of ignorance God overlooked,\u201D\nB. Zephaniah 3:9 \u2014 \u201CFor then I will restore to the peoples a pure language,\u201D';
  const note = { type: 'note', text: DD };
  const fns = { '1': { type: 'scripture', ref: 'Matthew 10:8' }, '2': note };
  beforeEach(() => {
    g.InAppLinkButton = InAppLinkButton;
    g.VOT_LETTER_REGISTRY = new Map([['Volume Three::Death and Deliverance', {}], ['Answers Only God Can Give::Regarding True Repentance', {}]]);
    g.lookupVersesFromBooks = (ref) => (ref === 'Acts 17:30' ? 'Truly, these times of ignorance God overlooked' : null);
  });
  afterEach(() => { delete g.VOT_LETTER_REGISTRY; delete g.__loadAnswersCorpus; delete g.InAppLinkButton; });
  const click = (el) => fireEvent.click(el);
  const byText = (sel, t) => [...document.querySelectorAll(sel)].find((el) => el.textContent === t);

  it('keeps every word, and sets each lettered note on its own line', () => {
    render(<Sheet num="2" fn={note} nkjv={{}} footnotes={fns} onClose={() => {}} />);
    const body = document.querySelector('.fn-sheet .fn-note');
    expect(body.textContent).toBe(DD.replace(/\n/g, ''));
    expect([...body.querySelectorAll('.fn-note-line')].map((l) => l.textContent.slice(0, 13))).toEqual(['A. Acts 17:30', 'B. Zephaniah ']);
  });

  it('[A] lights its line; the line\'s label lights the marker again', () => {
    render(<Sheet num="2" fn={note} nkjv={{}} footnotes={fns} onClose={() => {}} />);
    click(byText('.fn-note-mark', '[A]'));
    const line = document.querySelector('[data-fn-line="A"]');
    expect(line.classList.contains('fn-note-lit')).toBe(true);
    expect(document.activeElement).toBe(line);
    click(byText('.fn-note-label', 'A.'));
    expect(document.querySelector('[data-fn-mark="A"]').classList.contains('fn-note-lit')).toBe(true);
  });

  it('a reference opens its verse in the sheet, and Back returns to the footnote', () => {
    render(<Sheet num="2" fn={note} nkjv={{}} footnotes={fns} onClose={() => {}} />);
    click(byText('.fn-note-ref', 'Acts 17:30'));
    expect(document.querySelector('.fn-sheet .fn-note')).toBeNull();
    expect(document.querySelector('.fn-sheet .fn-sheet-ref').textContent).toBe('Acts 17:30');
    expect(document.querySelector('.fn-sheet .fn-sheet-verse').textContent).toContain('Truly, these times');
    click(document.querySelector('.fn-sheet-back'));
    expect(document.querySelector('.fn-sheet .fn-note')).not.toBeNull();
  });

  it('the source letter opens that letter in the app, on the passage the note quotes', () => {
    const onInAppLink = vi.fn();
    render(<Sheet num="2" fn={note} nkjv={{}} footnotes={fns} onClose={() => {}} onInAppLink={onInAppLink} />);
    click(byText('.fn-note-letter', '\u201CDeath and Deliverance\u201D'));
    expect(onInAppLink).toHaveBeenCalledWith({ collection: 'Volume Three', letterTitle: 'Death and Deliverance',
      excerpt: 'Yet now I command all people everywhere to repent in sincerity and in truth. Yet now I command all who have ears to hear, to call upon His name. Says The Lord.' });
  });

  it('a source letter the app does not have stays plain text', () => {
    g.VOT_LETTER_REGISTRY = new Map();
    render(<Sheet num="2" fn={note} nkjv={{}} footnotes={fns} onClose={() => {}} onInAppLink={vi.fn()} />);
    expect(document.querySelector('.fn-note-letter')).toBeNull();
    expect(document.querySelector('.fn-sheet .fn-note').textContent).toContain('(From \u201CDeath and Deliverance\u201D)');
  });

  it('a web link to an Answers topic opens it in the app, fetching Answers first when it is not loaded', async () => {
    const onInAppLink = vi.fn();
    const web = { type: 'note', text: 'See: "Regarding True Repentance"', url: 'https://answersonlygodcangive.com/Regarding_True_Repentance' };
    render(<Sheet num="1" fn={web} nkjv={{}} footnotes={{ '1': web }} onClose={() => {}} onInAppLink={onInAppLink} />);
    click(document.querySelector('.fn-sheet-link-btn'));
    expect(onInAppLink).toHaveBeenCalledWith({ collection: 'Answers Only God Can Give', letterTitle: 'Regarding True Repentance' });
    expect(document.querySelector('.fn-sheet a.fn-link').textContent).toBe('Open external link');
    cleanup(); onInAppLink.mockClear();
    g.VOT_LETTER_REGISTRY = new Map();
    g.__loadAnswersCorpus = () => { g.VOT_LETTER_REGISTRY = new Map([['Answers Only God Can Give::Regarding True Repentance', {}]]); return Promise.resolve(); };
    render(<Sheet num="1" fn={web} nkjv={{}} footnotes={{ '1': web }} onClose={() => {}} onInAppLink={onInAppLink} />);
    click(document.querySelector('.fn-sheet-link-btn'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onInAppLink).toHaveBeenCalledWith({ collection: 'Answers Only God Can Give', letterTitle: 'Regarding True Repentance' });
  });
});
