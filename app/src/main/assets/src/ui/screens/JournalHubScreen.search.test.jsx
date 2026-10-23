/* W36 (sweep 2026-10-13): the journal hub's search and its card keyboard.
   ─────────────────────────────────────────────────────────────────
   (1) Search read only the title, the FIRST prose block's first 400
   characters and the tags, so a word in an entry's second paragraph (or
   deep in a long first one, or in a photo caption) never matched.
   (2) The options button sat INSIDE the card's role=button: Enter on it
   bubbled to the card's onKeyDown and opened the entry instead of the
   menu, and a role=button's children are presentational, so a screen
   reader lost the button. It is now a sibling of the open control. */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JournalHubScreen, JournalCardMenu } from './JournalHubScreen.jsx';
import { JournalHelpers } from '../../data/journal-helpers.js';

/** @type {any} */ (globalThis).JournalCardMenu = JournalCardMenu;

const LONG = 'In the beginning was the quiet hour. '.repeat(14); // ~520 chars

const ENTRIES = [
  {
    id: 'e1', title: 'Morning prayer', created: 1720000000000, updated: 1720000000000, tags: ['dawn'],
    blocks: [
      { id: 'b1', type: 'p', text: 'A short first paragraph.' },
      { id: 'b2', type: 'p', text: 'The **mustard** seed and {{ref:Matthew 13:31}} came back to me.' },
    ],
  },
  {
    id: 'e2', title: 'Evening', created: 1720000100000, updated: 1720000100000, tags: [],
    blocks: [
      { id: 'b3', type: 'p', text: LONG + 'Then the lighthouse keeper spoke.' },
      { id: 'b4', type: 'image', mediaId: 'm1', caption: 'Harbor at dusk' },
    ],
  },
];

function setupGlobals() {
  window.ScreenLayout = ({ children, navChildren }) => (
    <div>
      <div className="test-nav">{navChildren}</div>
      {children}
    </div>
  );
  window.LibraryNav = () => null;
  window.JournalStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: (id) => ENTRIES.find(e => e.id === id) || null,
    all: () => ENTRIES.slice(),
    togglePin: vi.fn(),
    remove: vi.fn(),
    associatedDataSummary: () => null,
    collectAllMediaIds: () => [],
  };
  window.JournalHelpers = JournalHelpers;
}

function type(container, q) {
  fireEvent.change(container.querySelector('.jrn-search'), { target: { value: q } });
}
function titles(container) {
  return Array.from(container.querySelectorAll('.jrn-card-title')).map(n => n.textContent);
}

beforeEach(() => { modalRegistry._reset(); setupGlobals(); });
afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.ScreenLayout;
  delete window.LibraryNav;
  delete window.JournalStore;
  delete window.JournalHelpers;
});

describe('JournalHubScreen search reads the whole entry (W36)', () => {
  it('finds a word in the second paragraph', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    type(container, 'mustard');
    expect(titles(container)).toEqual(['Morning prayer']);
  });

  it('finds a word past the first 400 characters, and a photo caption', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    type(container, 'lighthouse keeper');
    expect(titles(container)).toEqual(['Evening']);
    type(container, 'harbor');
    expect(titles(container)).toEqual(['Evening']);
  });

  it('matches the words a reader sees, not the markup: bold and scripture chips', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    type(container, 'the mustard seed and matthew 13:31');
    expect(titles(container)).toEqual(['Morning prayer']);
  });

  it('still matches title and tags, and shows No Matches for nothing', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    type(container, 'dawn');
    expect(titles(container)).toEqual(['Morning prayer']);
    type(container, 'evening');
    expect(titles(container)).toEqual(['Evening']);
    type(container, 'zzzz');
    expect(titles(container)).toEqual([]);
    expect(screen.getByText('No Matches')).toBeTruthy();
  });
});

describe('JournalHubScreen card keyboard (W36)', () => {
  it('Enter on the options button does not open the entry', () => {
    const onOpenEntry = vi.fn();
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={onOpenEntry} />);
    const btn = container.querySelector('.jrn-card-menu-btn');
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onOpenEntry).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(onOpenEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Entry options' })).toBeTruthy();
  });

  it('the options button is not nested inside the role=button open control', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    const btn = container.querySelector('.jrn-card-menu-btn');
    expect(btn.closest('[role="button"]')).toBeNull();
    expect(btn.closest('.jrn-card')).toBeTruthy();
  });

  it('Enter or Space on the card opens the entry; a click anywhere on the card does too', () => {
    const onOpenEntry = vi.fn();
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={onOpenEntry} />);
    const open = container.querySelector('.jrn-card [role="button"]');
    expect(open.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(open, { key: 'Enter' });
    expect(onOpenEntry).toHaveBeenLastCalledWith('e2');
    fireEvent.keyDown(open, { key: ' ' });
    expect(onOpenEntry).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector('.jrn-card'));
    expect(onOpenEntry).toHaveBeenCalledTimes(3);
  });
});

/* n118 / n189: an empty tab shows its how-to and no search or sort; a full tab names its search box. */
describe('JournalHubScreen empty state and search name', () => {
  it('no entries: no search box or sort, the how-to stays', () => {
    window.JournalStore.all = () => [];
    const { container } = render(<JournalHubScreen onBack={() => {}} onCreateEntry={() => {}} />);
    expect(container.querySelector('.jrn-search')).toBeNull();
    expect(container.querySelector('.notes-index-sort-btn')).toBeNull();
    expect(container.querySelector('.jrn-empty-title').textContent).toBe('No Entries Yet');
  });

  it('a full list names its search box', () => {
    render(<JournalHubScreen onBack={() => {}} onCreateEntry={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Search journal entries' })).toBeTruthy();
  });
});
