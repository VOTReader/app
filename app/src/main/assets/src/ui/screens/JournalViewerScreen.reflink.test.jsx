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
import { render, cleanup } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';

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
