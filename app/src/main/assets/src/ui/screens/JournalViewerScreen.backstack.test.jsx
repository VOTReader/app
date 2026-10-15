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

   The stack now holds only a chain of card taps: the Journal hub clears it on
   mount, and navigateToLink clears it when it opens an entry from outside. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';
import { JournalHubScreen } from './JournalHubScreen.jsx';

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

beforeEach(() => { modalRegistry._reset(); setupGlobals(); delete window.__journalBackStack; });
afterEach(() => {
  cleanup();
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
    // The reader goes Home, then opens the Journal hub again.
    const hub = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    hub.unmount();
    const onBack = vi.fn();
    const onOpenJournalEntry = vi.fn();
    render(<JournalViewerScreen entryId="eB" onBack={onBack} onOpenJournalEntry={onOpenJournalEntry} />);
    expect(screen.queryByRole('button', { name: 'Back to Entry A' })).toBeNull();
    fireEvent.click(screen.getByText('Nav back'));
    expect(onOpenJournalEntry).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
