/* The journal→journal back stack outlived the flow that built it (sweep v046).
   ─────────────────────────────────────────────────────────────────
   Tapping a linked-entry card in entry A pushes {destId: B, fromId: A} onto
   window.__journalBackStack, and entry B then shows a "Back to A" pill whose
   tap (and the nav arrow, and hardware back) returns to A. Only that pop ever
   took the frame off again. So a reader who went A → B, then Home, then opened
   B again from the Journal hub still saw "Back to A", and the back arrow took
   them to A instead of the hub. The same stale frame won over the cross-screen
   pill when B was opened from Bookmarks / Notes / Links (navigateToLink; that
   half is pinned in hooks/use-navigate-to-link.test.js).

   Now opening (or editing) an entry from the Journal hub, and navigateToLink
   opening one from outside, drop the frames that lead INTO that entry. The hub
   does not clear on mount: another tab sitting on journal-home mounts it on a
   tab switch, and tab 1's B must keep "Back to A". Frames for other entries
   stay too: a reader who goes A -> B by card, then from B out to a Bible
   chapter and into entry C from the chapter's journal chip, comes back through
   the chapter to B and still sees "Back to A" (the first v046 fix emptied the
   whole stack there and lost that). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';
import { JournalHubScreen } from './JournalHubScreen.jsx';
import { useNavigateToLink } from '../../hooks/use-navigate-to-link.js';
import { navHandoff } from '../../utils/nav-handoff.js';

/** navigateToLink as app.jsx wires it, with spies for every setter. */
function openFromOutside(endpoint, over) {
  const p = {
    closeLinkSidebar: vi.fn(), pushFromLetter: vi.fn(),
    screen: 'bible-ch', bookId: 'genesis', chapterNum: 1, letterId: null,
    studyId: null, studyChapterId: null,
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(),
    setLetterId: vi.fn(), setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setSurpriseAnchor: vi.fn(), setJournalEntryId: vi.fn(),
    ...over,
  };
  const { result, unmount } = renderHook(() => useNavigateToLink(p));
  act(() => { result.current.navigateToLink(endpoint); });
  unmount();
  expect(p.setScreen).toHaveBeenCalledWith('journal-viewer');
}

const A = {
  id: 'eA', title: 'Entry A', created: 1720000000000, updated: 1720000000000, tags: [],
  blocks: [{ id: 'bA1', type: 'journal-card', entryId: 'eB' }],
};
const B = {
  id: 'eB', title: 'Entry B', created: 1720000100000, updated: 1720000100000, tags: [],
  blocks: [{ id: 'bB1', type: 'p', text: 'Second entry.' }],
};

function setupGlobals() {
  window.ScreenLayout = ({ children, navChildren }) => (
    <div>
      <div className="test-nav">{navChildren}</div>
      {children}
    </div>
  );
  // The nav arrow is the viewer's jrnGoBack, the same handler as the pill.
  window.LibraryNav = (opts) => <button type="button" className="test-nav-back" onClick={opts.onBack}>Nav back</button>;
  window.JournalStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: (id) => [A, B].find(e => e.id === id) || null,
    all: () => [A, B],
    associatedDataSummary: () => null,
    collectAllMediaIds: () => [],
  };
  window.JournalHelpers = {
    entryDisplayTitle: (e) => e.title,
    previewText: () => 'a short preview',
    attachmentSummary: () => [],
    shortDate: () => 'Jul 3',
    shortTime: () => '9:00 AM',
    longDate: () => 'July 3, 2024',
  };
}

/** Viewer A → tap its linked-entry card. Returns the onOpenJournalEntry spy. */
function tapCardInA() {
  const onOpenJournalEntry = vi.fn();
  const { container, unmount } = render(
    <JournalViewerScreen entryId="eA" onBack={() => {}} onOpenJournalEntry={onOpenJournalEntry} />
  );
  fireEvent.click(container.querySelector('.jrn-embed-journal'));
  expect(onOpenJournalEntry).toHaveBeenCalledWith('eB');
  unmount();
}

beforeEach(() => {
  modalRegistry._reset(); setupGlobals(); delete window.__journalBackStack;
  window.navHandoff = navHandoff; navHandoff._resetForTests();
});
afterEach(() => {
  cleanup();
  navHandoff._resetForTests();
  delete window.navHandoff;
  modalRegistry._reset();
  delete window.ScreenLayout;
  delete window.LibraryNav;
  delete window.JournalStore;
  delete window.JournalHelpers;
  delete window.__journalBackStack;
});

describe('JournalViewerScreen — journal→journal back stack (v046)', () => {
  it('control: B reached by the card tap shows Back to A, and the nav arrow returns to A', () => {
    tapCardInA();
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.getByRole('button', { name: 'Back to Entry A' })).toBeTruthy();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).toHaveBeenCalledWith('eA');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('B opened again from the Journal hub shows no Back to A, and the nav arrow goes to the hub', () => {
    tapCardInA();
    // The reader goes Home, then opens the Journal hub again and taps B.
    const onOpenEntry = vi.fn();
    const hub = render(<JournalHubScreen onBack={() => {}} onOpenEntry={onOpenEntry} />);
    fireEvent.click(hub.getByText('Entry B'));
    expect(onOpenEntry).toHaveBeenCalledWith('eB');
    hub.unmount();
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.queryByRole('button', { name: 'Back to Entry A' })).toBeNull();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a tab switch through the Journal hub keeps B on Back to A (the hub mounting clears nothing)', () => {
    tapCardInA();
    // Tab 2 sits on journal-home: switching to it mounts the hub, switching
    // back to tab 1 shows B again (journalEntryId is kept per tab, W40).
    const hub = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    hub.unmount();
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.getByRole('button', { name: 'Back to Entry A' })).toBeTruthy();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).toHaveBeenCalledWith('eA');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('B reopened from a bookmark (navigateToLink) shows no Back to A, and the nav arrow skips A', () => {
    tapCardInA();
    openFromOutside({ type: 'journal', entryId: 'eB' });
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.queryByRole('button', { name: 'Back to Entry A' })).toBeNull();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('A -> B by card, out to a chapter, into entry C from outside, back to B: B still shows Back to A', () => {
    tapCardInA();
    // In B: a {{ref:}} to the chapter, then the chapter's journal chip opens C.
    openFromOutside({ type: 'journal', entryId: 'eC' }, { screen: 'bible-ch' });
    // C's back pill -> the chapter, the chapter's back pill -> B.
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.getByRole('button', { name: 'Back to Entry A' })).toBeTruthy();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).toHaveBeenCalledWith('eA');
    expect(onBack).not.toHaveBeenCalled();
  });
});
