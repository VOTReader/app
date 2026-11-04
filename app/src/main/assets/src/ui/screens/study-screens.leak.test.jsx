// @ts-nocheck — free-var globals stubbed per test (bundle-d/-g screen contract)
/* Leak gate for the PERSONAL STUDY screens (leak hunt, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Library, Notes, Bookmarks, Highlights, Links, Progress, History and the
   Journal (hub, viewer, editor), each mounted and unmounted 20 times in jsdom,
   with the sheet or menu one tap opens left open at the unmount where there is
   one. Every listener, timer, frame, observer, store subscription, channel,
   database connection and object URL a mount starts must be gone after its
   unmount (ui/leak/leak-harness.js). Stubs mirror study-screens.axe.test.jsx. */

import { describe, it, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { installLeakHarness, expectNoLeaks } from '../leak/leak-harness.js';

import { LibraryScreen } from './LibraryScreen.jsx';
import { NotesIndexScreen } from './NotesIndexScreen.jsx';
import { BookmarksScreen } from './BookmarksScreen.jsx';
import { HighlightsScreen } from './HighlightsScreen.jsx';
import { LinksScreen } from './LinksScreen.jsx';
import { MyProgressScreen } from './MyProgressScreen.jsx';
import { HistoryScreen } from './HistoryScreen.jsx';
import { JournalHubScreen, JournalCardMenu } from './JournalHubScreen.jsx';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalViewerScreen, JournalBlockView, JournalImageBlock, JournalAudioBlock } from './JournalViewerScreen.jsx';
import { NoteRow } from '../components/NoteRow.jsx';
import { HistoryEntryCard } from '../components/HistoryEntryCard.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { ExpandableText } from '../../components/ExpandableText.jsx';
import { JournalInsertSheet } from '../sheets/JournalInsertSheet.jsx';

import { DEFAULT_LIBRARY_ORDER } from '../../stores/library-order-store.js';
import { JournalStore as RealJournalStore } from '../../stores/journal-store.js';
import { JournalHelpers as RealJournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { noteSourceSegments } from '../../utils/note-source.js';
import { _bookmarkSourceLabel } from '../../utils/bookmark-source.js';
import { tallyGroup, countReadFor, mostAnnotatedSources, bookItemsFor, READ_VERSION_ID } from '../../utils/progress-stats.js';
import { countItemWords, readingMinutes } from '../../utils/word-count.js';
import { timeAgo } from '../../utils/dates.js';
import { onIdle } from '../../utils/on-idle.js';
import { readingChipWpm, readingMinChip } from '../components/ReadingMinChip.jsx';

// The code under test imports these; a stub installed as a global wins, else the real module (bridge-imports).
vi.mock('../../data/journal-helpers.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalHelpers() { return 'JournalHelpers' in globalThis ? globalThis.JournalHelpers : real.JournalHelpers; } }; });
vi.mock('../../stores/journal-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStore() { return 'JournalStore' in globalThis ? globalThis.JournalStore : real.JournalStore; } }; });
vi.mock('../../stores/journal-stats-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStatsStore() { return 'JournalStatsStore' in globalThis ? globalThis.JournalStatsStore : real.JournalStatsStore; } }; });
vi.mock('../../stores/journal-index-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalIndexStore() { return 'JournalIndexStore' in globalThis ? globalThis.JournalIndexStore : real.JournalIndexStore; } }; });
vi.mock('../../stores/bookmark-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get BookmarkStore() { return 'BookmarkStore' in globalThis ? globalThis.BookmarkStore : real.BookmarkStore; } }; });
vi.mock('../../stores/note-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get NoteStore() { return 'NoteStore' in globalThis ? globalThis.NoteStore : real.NoteStore; } }; });
vi.mock('../../stores/notebook-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get NotebookStore() { return 'NotebookStore' in globalThis ? globalThis.NotebookStore : real.NotebookStore; } }; });
vi.mock('../../utils/storage-health.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get StorageHealth() { return 'StorageHealth' in globalThis ? globalThis.StorageHealth : real.StorageHealth; } }; });

/* ── one ledger of installed globals, cleared after every test ───────── */
const installed = new Set();
const put = (k, v) => { installed.add(k); globalThis[k] = v; };
// ExpandableText's module installs these on import; the tests own them from here.
delete window.JrnExpandable;
delete window.ExpandableText;

beforeEach(() => {
  modalRegistry._reset();
  localStorage.clear();
  document.documentElement.lang = 'en';
  put('ScreenLayout', ({ children, navChildren }) => <div>{navChildren}<main>{children}</main></div>);
  put('LibraryNav', (opts) => <>{(opts && opts.leftExtras) || null}{(opts && opts.rightExtras) || null}</>);
  put('ConfirmStrip', ConfirmStrip);
  put('JrnExpandable', ExpandableText);
  put('relativeDate', () => '2d ago');
});

afterEach(() => {
  if (harness) { harness.restore(); harness = null; }
  cleanup();
  modalRegistry._reset();
  installed.forEach((k) => { delete globalThis[k]; });
  installed.clear();
  delete window.__journalBackStack;
  delete window.__screenBack;
});

const noop = () => {};
/** A store stub whose subscribe really adds and removes, so the harness counts what stays subscribed. */
const mkStore = (over = {}) => { const l = new Set(); return { subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; }, getVersion: () => 1, ...over }; };
let harness = null;
/** Mount → (interact) → unmount, 20 times; nothing it started may outlive it. Installed after the test's globals. */
const leakFree = (label, mount, interact) => {
  harness = harness || installLeakHarness();
  return expectNoLeaks(harness, mount, { label, interact, cycles: 20 });
};
const navProps = { onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop };


describe('leaks — Library', () => {
  it('populated', async () => {
    put('NoteStore', mkStore({ all: () => ({}), count: () => 3 }));
    put('LinkStore', mkStore({ all: () => new Array(2).fill({}) }));
    put('BookmarkStore', mkStore({ all: () => ({}), count: () => 4 }));
    put('JournalStore', mkStore({ all: () => ({}), count: () => 5 }));
    put('AnnotationStore', mkStore({ all: () => ({}) }));
    put('ReadingStatsStore', mkStore({ get: () => ({}) }));
    put('ReadingStreakStore', mkStore({ get: () => ({}) }));
    put('JournalStatsStore', mkStore({ get: () => ({}) }));
    put('AudioLibraryStore', mkStore({ saved: () => [], getPlays: () => 0 }));
    put('LibraryOrderStore', { get: () => [...DEFAULT_LIBRARY_ORDER], set: noop, ...mkStore(), getVersion: () => 0 });
    put('createPressDrag', createPressDrag);
    await leakFree('LibraryScreen', () => render(
      <LibraryScreen {...navProps} onOpenNotes={noop} onOpenLinks={noop} onOpenBookmarks={noop} onOpenJournal={noop}
        onOpenHighlights={noop} onOpenProgress={noop} onOpenAudio={noop} onOpenScriptureWeb={noop}
        totalReadCount={12} historyEnabled />,
    ));
  });
});

describe('leaks — Notes', () => {
  const NOTES = [
    { groupId: 'g1', color: 'yellow', body: 'The covenant of peace', fullText: 'my anchor text', keys: ['bible:genesis:1:1'], created: 1, updated: 6, notebookIds: ['nb1'] },
    { groupId: 'g2', color: 'green', body: 'A different thought '.repeat(12), fullText: 'an everlasting covenant', keys: ['bible:psalms:23:1'], created: 2, updated: 5, notebookIds: [] },
  ];
  const NBS = [{ id: 'nb1', name: 'Faith', color: 'blue' }];
  const setup = () => {
    put('noteSourceLabel', () => 'Genesis 1:1');
    put('noteSourceSegments', noteSourceSegments);
    put('noteSourceNav', () => null);
    put('normalizeExcerptDisplay', normalizeExcerptDisplay);
    put('NoteRow', NoteRow);
    put('HL_COLORS', ['yellow', 'green', 'blue']);
    put('NoteStore', mkStore({ list: () => NOTES, get: (id) => NOTES.find((n) => n.groupId === id) || null }));
    put('NotebookStore', mkStore({ list: () => NBS, get: (id) => NBS.find((nb) => nb.id === id) || null, setColor: noop, rename: noop, remove: noop, add: noop }));
  };
  const show = () => render(<NotesIndexScreen {...navProps} onOpenNote={noop} onNavigateToSource={noop} historyEnabled />);
  it('all notes', async () => {
    setup();
    await leakFree('NotesIndexScreen', show, () => { fireEvent.click(screen.getByRole('button', { name: 'All Notes' })); });
  });
  it('a notebook drilled into, its rename field open', async () => {
    setup();
    await leakFree('NotesIndexScreen notebook', show, () => {
      fireEvent.click(screen.getByRole('button', { name: 'Notebooks' }));
      fireEvent.click(screen.getByText('Faith').closest('button'));
      fireEvent.click(screen.getByText('Rename'));
    });
  });
});

describe('leaks — Bookmarks, Highlights, Links', () => {
  it('Bookmarks, its options sheet open', async () => {
    const BKS = [{ id: 'b1', hlKey: 'bible:psalms:23', label: 'The shepherd', text: 'The Lord is my shepherd', created: 100, updated: 100 }];
    put('_bookTitle', (id) => id);
    put('_bookmarkSourceLabel', _bookmarkSourceLabel);
    put('BookmarkStore', mkStore({ all: () => BKS.slice(), remove: noop, update: noop, get: (id) => BKS.find((b) => b.id === id) }));
    await leakFree('BookmarksScreen', () => render(<BookmarksScreen {...navProps} onHome={noop} onNavigateToSource={noop} />),
      () => { fireEvent.click(screen.getAllByRole('button', { name: 'Bookmark options' })[0]); });
  });
  it('Highlights', async () => {
    put('normalizeExcerptDisplay', normalizeExcerptDisplay);
    put('_bookmarkSourceLabel', (k) => k);
    put('AnnotationStore', mkStore({ all: () => ({ 'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100, updated: 100 }] }) }));
    await leakFree('HighlightsScreen', () => render(<HighlightsScreen {...navProps} onNavigateToSource={noop} />));
  });
  it('Links, its options sheet open', async () => {
    const ep = (id, label) => ({ type: 'letter', key: 'letter:' + id + ':0', letterId: id, label, text: 'Words of ' + label });
    put('LinkStore', mkStore({ all: () => [{ id: 'l1', created: 1, source: ep('a', 'Letter A'), target: ep('b', 'Letter B') }], remove: noop }));
    put('findEntryContext', () => ({ kind: 'letter', title: 'x' }));
    put('_allBooks', () => ({}));
    put('_matthew', () => null);
    await leakFree('LinksScreen', () => render(<LinksScreen {...navProps} onHome={noop} onNavigateToSource={noop} />),
      () => { fireEvent.click(screen.getAllByRole('button', { name: 'Link options' })[0]); });
  });
});

describe('leaks — Progress and History', () => {
  it('Progress', async () => {
    put('onIdle', onIdle);
    put('NoteStore', mkStore({ count: () => 3 }));
    put('LinkStore', mkStore({ all: () => [{}] }));
    put('BookmarkStore', mkStore({ count: () => 2 }));
    put('JournalStore', mkStore({ count: () => 4 }));
    put('JournalStatsStore', mkStore({ get: () => ({ currentStreak: 2 }) }));
    put('ReadingStreakStore', mkStore({ get: () => ({ currentStreak: 3 }), recomputeFromLoad: noop }));
    put('AnnotationStore', mkStore({ all: () => ({}) }));
    put('buildProgressGroups', () => [{ id: 'nt', label: 'New Testament', genres: [{ label: 'Gospels', books: [{ id: 'mark', label: 'Mark', total: 16 }] }] }]);
    put('tallyGroup', tallyGroup);
    put('countReadFor', countReadFor);
    put('mostAnnotatedSources', mostAnnotatedSources);
    put('BIBLE_BOOK_LIST', [{ id: 'psalms', title: 'Psalms' }]);
    put('ReadingStatsStore', mkStore({ get: () => ({ totalWordsRead: 4200 }), measuredWpm: () => 210, wordsForDays: (n) => Array.from({ length: n }, (_, i) => ({ date: '2026-10-' + String(i + 10), words: i * 40 })) }));
    await leakFree('MyProgressScreen', () => render(
      <MyProgressScreen {...navProps} settings={{ markAsRead: true }} readItems={{ mark: { 1: true } }} historyCount={7} historyEnabled onStartReading={noop} />,
    ));
  });
  it('History, searched', async () => {
    put('HistoryEntryCard', HistoryEntryCard);
    put('timeAgo', timeAgo);
    put('WEEKDAY_NAMES', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    put('MONTH_NAMES', ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
    put('MONTH_ABBR', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    put('COL_BY_INDEX_SC', new Map([['vol-one-idx', { label: 'Volume One', readKey: 'volume-one' }]]));
    put('countItemWords', countItemWords);
    put('readingMinutes', readingMinutes);
    put('bookItemsFor', bookItemsFor);
    put('READ_VERSION_ID', READ_VERSION_ID);
    put('readingChipWpm', readingChipWpm);
    put('readingMinChip', readingMinChip);
    put('BOOKS', {});
    put('LETTERS_V1', []);
    put('studyAbbrev', (_s, f) => f || '');
    const now = Date.now();
    const H = [
      { type: 'chapter', key: 'ch:psalms:23', bookId: 'psalms', bookTitle: 'Psalms', chapterNum: 23, ts: now - 5 * 60000 },
      { type: 'chapter', key: 'ch:john:3', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: now - 400 * 86400000 },
    ];
    await leakFree('HistoryScreen', () => render(<HistoryScreen history={H} {...navProps} onSelect={noop} onPruneDay={noop} onHome={noop} />),
      (r) => { fireEvent.change(r.container.querySelector('input.notes-index-search'), { target: { value: 'psalm' } }); });
  });
});

const ENTRIES = [
  { id: 'e1', title: 'Morning prayer', pinned: true, created: 1720000000000, updated: 1720000600000, tags: ['dawn'],
    blocks: [
      { id: 'b1', type: 'p', text: 'A first paragraph with {{ref:Psalms 23:1}}.' },
      { id: 'b3', type: 'quote', text: 'The Lord is my shepherd', cite: 'Psalm 23' },
      { id: 'b5', type: 'chapter-card', bookId: 'psalms', chapter: 23 },
      { id: 'b8', type: 'image', mediaId: 'm1', caption: 'Harbor at dusk' },
    ] },
  { id: 'e2', title: 'Evening', created: 1720000100000, updated: 1720000100000, tags: [], blocks: [{ id: 'c1', type: 'p', text: 'Evening thoughts.' }] },
];
function journalGlobals(entries = ENTRIES) {
  put('JournalStore', mkStore({
    get: (id) => entries.find((e) => e.id === id) || null, all: () => entries.slice(),
    togglePin: vi.fn(), remove: vi.fn(), associatedDataSummary: () => null, collectAllMediaIds: () => [], isReady: () => true,
  }));
  put('JournalHelpers', { ...RealJournalHelpers, resolveChapterCard: () => ({ eyebrow: 'Bible', title: 'Psalms 23' }), resolveNotebookCard: () => ({ eyebrow: 'Notebook', title: 'Faith' }) });
  put('JournalCardMenu', JournalCardMenu);
  put('JournalBlockView', JournalBlockView);
  put('JournalImageBlock', JournalImageBlock);
  put('JournalAudioBlock', JournalAudioBlock);
}

describe('leaks — Journal', () => {
  it('the hub, a card menu open', async () => {
    journalGlobals();
    put('JournalMediaStore', { unclaimed: () => Promise.resolve([]), delete: noop });
    await leakFree('JournalHubScreen', () => render(<JournalHubScreen {...navProps} onOpenEntry={noop} onCreateEntry={noop} />),
      () => { fireEvent.click(screen.getAllByRole('button', { name: 'Entry options' })[0]); });
  });
  it('the viewer, its options menu open', async () => {
    journalGlobals();
    await leakFree('JournalViewerScreen', () => render(<JournalViewerScreen {...navProps} entryId="e1" onEdit={noop} onNavigateToLink={noop} onOpenJournalEntry={noop} onOpenNotebook={noop} />),
      () => { fireEvent.click(screen.getByRole('button', { name: 'Entry options' })); });
  });
  it('the editor, typed into (its save debounce pending at the unmount)', async () => {
    RealJournalStore._resetForTests({ forceLoaded: true });
    put('JournalStore', RealJournalStore);
    put('JournalHelpers', { ...RealJournalHelpers, resolveChapterCard: () => ({ eyebrow: 'Bible', title: 'Psalms 23' }), resolveNotebookCard: () => ({ eyebrow: 'Notebook', title: 'Faith' }) });
    put('createPressDrag', createPressDrag);
    put('JournalMediaStore', { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn(), objectUrl: () => Promise.resolve(null), get: () => Promise.resolve(null) });
    put('showToast', noop);
    put('StorageHealth', { onWriteFailure: noop });
    put('JournalBlockView', JournalBlockView);
    put('JournalImageBlock', JournalImageBlock);
    put('JournalAudioBlock', JournalAudioBlock);
    put('JournalInsertSheet', JournalInsertSheet);
    put('JournalRecordingSheet', () => null);
    put('BookmarkStore', mkStore({ all: () => [] }));
    put('NoteStore', mkStore({ list: () => [] }));
    put('NotebookStore', mkStore({ list: () => [] }));
    const entry = RealJournalStore.add({ title: 'Morning', blocks: [RealJournalHelpers.newBlock('p', { text: 'First' })] });
    // jsdom has no IndexedDB, so every save here fails and the store retries on its own clock (5 s, then 10 s, ...).
    // That retry is the store's, once per app, not the editor's: the warm-up arms it, and when the 20 cycles outlast
    // 5 s (a loaded machine, 2026-11-04) it fired mid-count and re-armed, read as the editor leaking a timeout.
    const retryDelays = RealJournalStore._backgroundRetryDelays;
    RealJournalStore._backgroundRetryDelays = [];
    let n = 0;
    try {
      await leakFree('JournalEditorScreen', () => render(<JournalEditorScreen {...navProps} entryId={entry.id} />),
        () => { fireEvent.change(screen.getByRole('textbox', { name: 'Entry title' }), { target: { value: 'Morning ' + (++n) } }); });
    } finally { RealJournalStore._backgroundRetryDelays = retryDelays; }
  });
});
