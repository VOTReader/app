/* Journal {{ref:}} scripture links — retry lifecycle (2026-07-30, review).
   ─────────────────────────────────────────────────────────────────────
   Tapping a {{ref:Book C:V}} link navigates to the verse, but findBook needs
   the LAZY Bible corpus, which this route doesn't preload. So a tap that can't
   resolve yet fires __loadBibleCorpus and retries on a 250ms interval, up to
   40 times (10 seconds).

   The bug: that interval was held in a local var and cleared only on success
   or on the 40th try — never on unmount, never on a newer tap. Leaving the
   entry mid-retry therefore still fired onNavigateToLink when the corpus
   landed, yanking the reader to the verse they had walked away from.

   The retry id now lives in a ref: a newer tap replaces it, and an unmount
   effect cancels it. GoToRefButton already used this shape. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';
import { parseRefStr, splitCompoundRef } from '../../data/scripture-resolution.js';

const ENTRY = {
  id: 'e1', title: 'Morning Reflection',
  created: 1720000000000, updated: 1720000000000,
  tags: [],
  blocks: [{ type: 'p', text: 'Remember {{ref:John 3:16}} today.' }],
};

/** findBook resolves only once the corpus "loads" — flip `loaded.value`. */
function setupGlobals(loaded) {
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.JournalStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: (id) => (id === ENTRY.id ? ENTRY : null),
    all: () => [ENTRY],
    associatedDataSummary: () => null,
  };
  window.JournalHelpers = {
    entryDisplayTitle: (e) => e.title,
    previewText: () => '',
    attachmentSummary: () => [],
    shortDate: () => 'Jul 3',
    shortTime: () => '9:00 AM',
    longDate: () => 'July 3, 2024',
  };
  /** @type {any} */ (globalThis).parseRefStr = (s) => {
    const m = /^(\D+)\s+(\d+):(\d+)$/.exec(String(s).trim());
    return m ? { rawBook: m[1].trim(), chapter: Number(m[2]), verse: Number(m[3]) } : null;
  };
  /** @type {any} */ (globalThis).findBook = () => (loaded.value ? 'john' : null);
  window.__loadBibleCorpus = vi.fn();
}

/** The one gold {{ref:}} span rendered by the entry above. */
function refLink(container) {
  const el = container.querySelector('.jrn-inline-ref');
  expect(el).toBeTruthy();
  return el;
}

beforeEach(() => { vi.useFakeTimers(); });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.ScreenLayout;
  delete window.LibraryNav;
  delete window.JournalStore;
  delete window.JournalHelpers;
  delete window.__loadBibleCorpus;
  delete (/** @type {any} */ (globalThis).parseRefStr);
  delete (/** @type {any} */ (globalThis).splitCompoundRef);
  delete (/** @type {any} */ (globalThis).findBook);
});

describe('JournalViewerScreen — {{ref:}} retry does not outlive the screen', () => {
  it('tap → unmount → corpus arrives: does NOT navigate (RED pre-fix: yanked the reader)', () => {
    const loaded = { value: false };            // corpus still loading at tap time
    setupGlobals(loaded);
    const onNavigateToLink = vi.fn();
    const { container, unmount } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );

    refLink(container).click();
    expect(onNavigateToLink).not.toHaveBeenCalled();   // unresolvable → retry armed
    expect(window.__loadBibleCorpus).toHaveBeenCalled();

    unmount();                                        // reader leaves the entry
    loaded.value = true;                              // corpus lands afterwards
    vi.advanceTimersByTime(10000);                    // the full 40-try window

    expect(onNavigateToLink).not.toHaveBeenCalled();
  });

  it('still navigates when the corpus arrives while the screen is OPEN (retry not broken)', () => {
    const loaded = { value: false };
    setupGlobals(loaded);
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );

    refLink(container).click();
    loaded.value = true;
    vi.advanceTimersByTime(250);

    expect(onNavigateToLink).toHaveBeenCalledTimes(1);
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 });
  });

  it('exposes the scripture ref as a keyboard-operable link', () => {
    const loaded = { value: true };
    setupGlobals(loaded);
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );

    const link = refLink(container);
    expect(link.getAttribute('role')).toBe('link');
    expect(link.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(link, { key: 'Enter' });

    expect(onNavigateToLink).toHaveBeenCalledTimes(1);
  });

  it('a resolved retry stops ticking (no repeat navigation for the rest of the window)', () => {
    const loaded = { value: false };
    setupGlobals(loaded);
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );

    refLink(container).click();
    loaded.value = true;
    vi.advanceTimersByTime(10000);

    expect(onNavigateToLink).toHaveBeenCalledTimes(1);
  });

  it('a second tap replaces the pending retry — one navigation, not two', () => {
    const loaded = { value: false };
    setupGlobals(loaded);
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );

    refLink(container).click();
    refLink(container).click();      // impatient second tap while the first is pending
    loaded.value = true;
    vi.advanceTimersByTime(10000);

    expect(onNavigateToLink).toHaveBeenCalledTimes(1);
  });
});

/* Compound {{ref:}} chips — the live dead tap.
   ────────────────────────────────────────────
   the-blessed.js ships {{ref:Isaiah 40:13; Romans 11:34}}. The handler called
   parseRefStr on the WHOLE string, which returns null for a compound, and the
   `if (!p) return true` branch made the gold chip a completely silent no-op.
   Each part is now its own tap target carrying its own single ref.

   HARD CONSTRAINT: the block's visible text must stay CHARACTER-IDENTICAL.
   Journal blocks are annotatable (`journal:<entryId>:<blockIdx>` hlKeys) and
   highlight offsets walk this DOM — one extra or missing character shifts every
   existing annotation on the block. */
describe('JournalViewerScreen — a compound {{ref:}} chip splits into per-part taps', () => {
  /** Real splitter + real parser; findBook resolves every book once "loaded". */
  function setupCompound(text) {
    const entry = { ...ENTRY, blocks: [{ type: 'p', text }] };
    window.ScreenLayout = ({ children }) => <div>{children}</div>;
    window.LibraryNav = () => null;
    window.JournalStore = {
      subscribe: () => () => {}, getVersion: () => 1,
      get: (id) => (id === entry.id ? entry : null),
      all: () => [entry], associatedDataSummary: () => null,
    };
    window.JournalHelpers = {
      entryDisplayTitle: (e) => e.title, previewText: () => '', attachmentSummary: () => [],
      shortDate: () => 'Jul 3', shortTime: () => '9:00 AM', longDate: () => 'July 3, 2024',
    };
    /** @type {any} */ (globalThis).parseRefStr = parseRefStr;
    /** @type {any} */ (globalThis).splitCompoundRef = splitCompoundRef;
    /** @type {any} */ (globalThis).findBook = (raw) =>
      String(raw).toLowerCase().replace(/\s+/g, '');
    window.__loadBibleCorpus = vi.fn();
    const onNavigateToLink = vi.fn();
    const r = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />,
    );
    return { ...r, onNavigateToLink };
  }

  /** The paragraph the block renders into — the annotation-offset surface. */
  const para = (container) => container.querySelector('.jrn-inline-ref').closest('p, div');

  it('renders one tap target per part and each navigates its OWN ref', () => {
    const { container, onNavigateToLink } = setupCompound('See {{ref:Isaiah 40:13; Romans 11:34}} here.');
    const chips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.jrn-inline-ref')]);
    expect(chips.map(c => c.textContent)).toEqual(['Isaiah 40:13', 'Romans 11:34']);

    chips[1].click();     // used to be a completely silent no-op
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'romans', chapter: 11, verse: 34 });
    chips[0].click();
    expect(onNavigateToLink.mock.calls[1][0]).toEqual({ type: 'bible', bookId: 'isaiah', chapter: 40, verse: 13 });
  });

  it('the visible text is character-identical to the un-split render', () => {
    const source = 'See {{ref:Isaiah 40:13; Romans 11:34}} here.';
    const { container } = setupCompound(source);
    expect(para(container).textContent).toBe('See Isaiah 40:13; Romans 11:34 here.');
  });

  it('a book-implied continuation keeps the source label, not the expanded ref', () => {
    // Text shows "11:31" exactly as authored; the TAP carries "Daniel 11:31".
    const { container, onNavigateToLink } = setupCompound('Read {{ref:Daniel 9:27; 11:31}} again.');
    const chips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.jrn-inline-ref')]);
    expect(chips.map(c => c.textContent)).toEqual(['Daniel 9:27', '11:31']);
    expect(para(container).textContent).toBe('Read Daniel 9:27; 11:31 again.');
    chips[1].click();
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'daniel', chapter: 11, verse: 31 });
  });

  it('a comma verse list gets its own tap target, text still identical', () => {
    const { container, onNavigateToLink } = setupCompound('{{ref:Matthew 5:3-4, 7}}');
    const chips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.jrn-inline-ref')]);
    expect(chips.map(c => c.textContent)).toEqual(['Matthew 5:3-4', '7']);
    expect(para(container).textContent).toBe('Matthew 5:3-4, 7');
    chips[1].click();     // verse 7 was silently discarded by parseRefStr
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'matthew', chapter: 5, verse: 7 });
  });

  it('an unparseable chunk stays PLAIN text — the parseable parts still tap', () => {
    const { container } = setupCompound('{{ref:see the gloss; Isaiah 12:2}}');
    const chips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.jrn-inline-ref')]);
    expect(chips.map(c => c.textContent)).toEqual(['Isaiah 12:2']);
    expect(para(container).textContent).toBe('see the gloss; Isaiah 12:2');
  });

  it('a plain single ref still renders exactly one chip (no regression)', () => {
    const { container, onNavigateToLink } = setupCompound('Remember {{ref:John 3:16}} today.');
    const chips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.jrn-inline-ref')]);
    expect(chips.map(c => c.textContent)).toEqual(['John 3:16']);
    expect(para(container).textContent).toBe('Remember John 3:16 today.');
    chips[0].click();
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'john', chapter: 3, verse: 16 });
  });
});
