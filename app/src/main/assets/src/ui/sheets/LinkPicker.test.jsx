/* LinkPicker — SHEETS-UX 2026-07-12 redesign lock-down.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the source-context strip ("Linking from …") in link mode and
   its absence in card/excerpt journal mode; (2) the removal of the old
   red-×-beside-green-✓ header pair; (3) the success strip + separated Undo
   (removes the link, keeps the picker open); (4) close now KEEPS a created
   link instead of silently removing it (the app-consistent dismiss). Reads
   bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { LinkPicker } from './LinkPicker.jsx';

function stubGlobals() {
  window.RecentNavStore = { list: () => [], add: vi.fn() };
  window.searchNavIndex = () => [];
  window.navItemToEndpoint = (item) => ({ type: 'bible', key: 'k', label: item.label });
  window.LinkStore = { remove: vi.fn(), all: () => [] };
  window.buildSourceEndpoint = () => ({ key: 's', label: 'src' });
  window.persistLink = vi.fn(() => ({ id: 'lnk1', target: { label: 'Genesis 1:1' } }));
  window.COL_NAV_ICON = new Map();
  window.buildNavTree = () => ({ bibleBooks: [], matthewChapters: [], collections: [], studies: [] });
  window.contentDocToNavItem = () => null;
}

afterEach(() => {
  cleanup();
  ['RecentNavStore', 'searchNavIndex', 'navItemToEndpoint', 'LinkStore', 'buildSourceEndpoint',
    'persistLink', 'COL_NAV_ICON', 'buildNavTree', 'contentDocToNavItem', 'VotSearchMini'].forEach(k => delete window[k]);
});

const baseProps = {
  sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16',
  sourceStart: undefined, sourceEnd: undefined, sourceText: '',
  onClose: () => {}, onRequestRefine: () => {},
  lastCreatedLink: null, onLinkCreated: () => {}, mode: null, onPickTarget: null,
};

describe('LinkPicker dialog semantics', () => {
  it('is a labelled modal with focus contained inside the picker', () => {
    stubGlobals();
    render(<LinkPicker {...baseProps} />);
    const dialog = screen.getByRole('dialog', { name: 'Create a Link' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe('LinkPicker source context', () => {
  it('link mode shows the "Linking from" source strip', () => {
    stubGlobals();
    const { container } = render(<LinkPicker {...baseProps} />);
    expect(container.querySelector('.navpick-context')).toBeTruthy();
    expect(screen.getByText('Linking from')).toBeTruthy();
    expect(screen.getByText('John 3:16')).toBeTruthy();
  });

  it('card/excerpt journal mode (no source) shows NO context strip', () => {
    stubGlobals();
    const { container } = render(
      <LinkPicker {...baseProps} sourceKey={null} sourceLabel={null} mode="card" onPickTarget={() => {}} />
    );
    expect(container.querySelector('.navpick-context')).toBeNull();
  });
});

describe('LinkPicker header no longer pairs a destructive × with a confirm ✓', () => {
  it('renders neither the red undo-× nor the green ✓ in the header', () => {
    stubGlobals();
    const { container } = render(<LinkPicker {...baseProps} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    expect(container.querySelector('.navpick-close-undo')).toBeNull();
    expect(container.querySelector('.navpick-confirm-green')).toBeNull();
    // a single neutral close remains
    expect(container.querySelector('.navpick-close')).toBeTruthy();
  });
});

describe('LinkPicker success strip + Undo', () => {
  it('shows the success strip with the created target label', () => {
    stubGlobals();
    render(<LinkPicker {...baseProps} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    expect(screen.getByText(/Link created · Genesis 1:1/)).toBeTruthy();
  });

  it('Undo removes the link + clears state but does NOT close the picker', () => {
    stubGlobals();
    const onClose = vi.fn();
    const onLinkCreated = vi.fn();
    render(<LinkPicker {...baseProps} onClose={onClose} onLinkCreated={onLinkCreated} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo this link' }));
    expect(window.LinkStore.remove).toHaveBeenCalledWith('lnk1');
    expect(onLinkCreated).toHaveBeenCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('LinkPicker close keeps the created link', () => {
  it('the close × calls onClose WITHOUT removing the last link (app-consistent dismiss)', () => {
    stubGlobals();
    const onClose = vi.fn();
    render(<LinkPicker {...baseProps} onClose={onClose} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    // The close is aria-labelled "Done" once a link exists.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
    expect(window.LinkStore.remove).not.toHaveBeenCalled();
  });
});

/* ── SESSION-2 overhaul (UX-BATCH-2026-07-12): tabs, Browse, Recent, text ── */

describe('LinkPicker mode tabs', () => {
  it('renders Search / Browse / Recent with Search active by default', () => {
    stubGlobals();
    const { container } = render(<LinkPicker {...baseProps} />);
    const tabs = [...container.querySelectorAll('.navpick-tab')];
    expect(tabs.map(t => t.textContent)).toEqual(['Search', 'Browse', 'Recent']);
    expect(tabs[0].className).toContain('active');
    expect(container.querySelector('.navpick-search-input')).toBeTruthy();
  });
});

describe('LinkPicker Browse mode', () => {
  it('walks Bible → book → chapter grid and requests VERSE refinement on a chapter', () => {
    stubGlobals();
    const ch = (n) => ({ kind: 'bible-chapter', bookId: 'genesis', chapter: n, label: 'Genesis ' + n, category: 'Old Testament', title: 'Genesis' });
    window.buildNavTree = () => ({
      bibleBooks: [{ bookId: 'genesis', title: 'Genesis', category: 'Old Testament', chapters: [ch(1), ch(2)] }],
      matthewChapters: [],
      collections: [{ label: 'Volume One', entries: [{ kind: 'letter', letterId: 'l1', label: 'First Letter', category: 'Volume One', collection: 'Volume One' }] }],
      studies: [],
    });
    const onRequestRefine = vi.fn();
    const { container } = render(<LinkPicker {...baseProps} onRequestRefine={onRequestRefine} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
    // Roots: the app's own sections
    expect(screen.getByText('The Holy Bible')).toBeTruthy();
    expect(screen.getByText('Volume One')).toBeTruthy();
    fireEvent.click(screen.getByText('The Holy Bible'));
    expect(screen.getByText('Genesis')).toBeTruthy();
    fireEvent.click(screen.getByText('Genesis'));
    const grid = container.querySelector('.navpick-ch-grid');
    expect(grid).toBeTruthy();
    expect([...grid.querySelectorAll('.navpick-ch-btn')].map(b => b.textContent)).toEqual(['1', '2']);
    fireEvent.click(grid.querySelectorAll('.navpick-ch-btn')[0]);
    expect(onRequestRefine).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verse' }));
    // Breadcrumb back pops one level (grid → book list)
    fireEvent.click(container.querySelector('.navpick-crumb-back'));
    expect(screen.getByText('Genesis')).toBeTruthy();
  });
});

describe('LinkPicker Recent mode — the link network', () => {
  it('lists recent links as From ⇄ To chips; tapping an endpoint reuses it as the target', () => {
    stubGlobals();
    window.LinkStore.all = () => [{
      id: 'L1', created: 5,
      source: { key: 'bible:john:3:16', label: 'John 3:16', type: 'bible' },
      target: { key: 'letter:l1:0', label: 'First Letter', type: 'letter' },
    }];
    const onLinkCreated = vi.fn();
    const { container } = render(<LinkPicker {...baseProps} onLinkCreated={onLinkCreated} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recent' }));
    const chipLabels = [...container.querySelectorAll('.navpick-link-ep-label')].map(e => e.textContent);
    expect(chipLabels).toEqual(['John 3:16', 'First Letter']);
    const chips = [...container.querySelectorAll('.navpick-link-endpoint')];
    fireEvent.click(chips[1]); // the To chip
    expect(window.persistLink).toHaveBeenCalledWith(
      expect.objectContaining({ key: 's' }),
      expect.objectContaining({ key: 'letter:l1:0', label: 'First Letter' }),
    );
    expect(onLinkCreated).toHaveBeenCalled();
  });

  it('shows an honest empty state before any links exist', () => {
    stubGlobals();
    render(<LinkPicker {...baseProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recent' }));
    expect(screen.getByText('No links yet')).toBeTruthy();
  });
});

describe('LinkPicker search scope toggle (Titles & refs / Full text)', () => {
  function stubEngine() {
    window.navItemToEndpoint = (item) => ({ type: 'bible', key: 'k', label: item.label, verse: item.verse || null });
    window.contentDocToNavItem = (doc) => ({
      kind: 'bible-chapter', bookId: doc.bookId, chapter: doc.chapterNum, verse: doc.verseNum,
      label: doc.ref, category: 'New Testament', title: doc.ref,
    });
    window.VotSearchMini = {
      init: vi.fn(async () => true),
      getState: () => ({ ready: true }),
      snippet: (text) => text.slice(0, 40),
      search: vi.fn(async () => ({
        parsedTerms: ['loved'],
        results: [{ score: 9, doc: { kind: 'verse', volumeId: 'bible', bookId: 'john', chapterNum: 3, verseNum: 16, ref: 'John 3:16', text: 'For God so loved the world…' } }],
      })),
    };
  }

  it('defaults to Titles & refs — the engine is NOT queried and no text group renders', async () => {
    vi.useFakeTimers();
    stubGlobals();
    stubEngine();
    const { container } = render(<LinkPicker {...baseProps} />);
    try {
      const scopes = [...container.querySelectorAll('.navpick-scope-btn')];
      expect(scopes.map(b => b.textContent)).toEqual(['Titles & refs', 'Full text']);
      expect(scopes[0].className).toContain('active');
      fireEvent.change(container.querySelector('.navpick-search-input'), { target: { value: 'god so loved' } });
      await act(async () => { vi.advanceTimersByTime(600); });
      await act(async () => { await Promise.resolve(); });
      expect(window.VotSearchMini.search).not.toHaveBeenCalled();
      expect(screen.queryByText('In the text')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the no-titles-match empty state offers a one-tap jump to Full text', async () => {
    vi.useFakeTimers();
    stubGlobals(); // searchNavIndex → [] : no title matches
    stubEngine();
    const { container } = render(<LinkPicker {...baseProps} />);
    try {
      fireEvent.change(container.querySelector('.navpick-search-input'), { target: { value: 'god so loved' } });
      expect(screen.getByText('No titles match')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Search the full text instead' }));
      expect([...container.querySelectorAll('.navpick-scope-btn')][1].className).toContain('active');
      await act(async () => { vi.advanceTimersByTime(300); });
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('In the text')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Full text scope renders engine hits with snippets and creates directly from a verse hit', async () => {
    vi.useFakeTimers();
    stubGlobals();
    stubEngine();
    const { container } = render(<LinkPicker {...baseProps} />);
    try {
      fireEvent.click(screen.getByRole('radio', { name: 'Full text' }));
      fireEvent.change(container.querySelector('.navpick-search-input'), { target: { value: 'god so loved' } });
      await act(async () => { vi.advanceTimersByTime(300); });
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('In the text')).toBeTruthy();
      const hitRow = [...container.querySelectorAll('.navpick-row')]
        .find(r => r.querySelector('.navpick-row-label')?.textContent === 'John 3:16');
      expect(hitRow).toBeTruthy();
      expect(hitRow.querySelector('.navpick-row-snippet').textContent).toContain('For God so loved');
      fireEvent.click(hitRow);
      // Verse-precise hit → direct create, no refinement step.
      expect(window.persistLink).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
