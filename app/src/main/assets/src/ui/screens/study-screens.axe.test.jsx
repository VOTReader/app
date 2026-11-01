// @ts-nocheck — free-var globals stubbed per test (bundle-d/-g screen contract)
/* axe over the PERSONAL STUDY screens (a11y pass, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Library, Notes, Bookmarks, Highlights, Links, Progress, History and the
   Journal (hub, editor, viewer) each render here in a populated state (and an
   empty one where it is cheap), plus the sheets and menus one tap opens, and
   axe must find nothing serious or critical. The stubs copy each screen's own
   tests; the rows, cards and sheets are the REAL components.

   jsdom has no layout, so colour contrast and target size are not measured
   here (axe-run.js says where they are). The pass's non-visual fixes that axe
   cannot see in jsdom (a toggle's pressed state, a radio group's checked
   swatch, an unnamed field) are pinned by name at the end of each block. */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act, screen, within } from '@testing-library/react';
import { seriousViolations } from '../a11y/axe-run.js';

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
import { LinkCard } from '../components/LinkCard.jsx';
import { ClearProgressRow } from '../components/ClearProgressRow.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { ExpandableText } from '../../components/ExpandableText.jsx';
import { NotebookPickerSheet } from '../sheets/NotebookPickerSheet.jsx';
import { JournalInsertSheet } from '../sheets/JournalInsertSheet.jsx';
import { JournalInboundSheet } from '../sheets/JournalInboundSheet.jsx';
import { JournalRecordingSheet } from '../sheets/JournalRecordingSheet.jsx';

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
  cleanup();
  modalRegistry._reset();
  installed.forEach((k) => { delete globalThis[k]; });
  installed.clear();
  delete window.__journalBackStack;
  delete window.__screenBack;
});

const noop = () => {};
const mkStore = (over = {}) => ({ subscribe: () => () => {}, getVersion: () => 1, ...over });
const navProps = { onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop };

/* ═══ Library ═══════════════════════════════════════════════════════ */
describe('axe — Library', () => {
  function setup(counts) {
    put('NoteStore', mkStore({ all: () => ({}), count: () => counts.notes }));
    put('LinkStore', mkStore({ all: () => new Array(counts.links).fill({}) }));
    put('BookmarkStore', mkStore({ all: () => ({}), count: () => counts.bookmarks }));
    put('JournalStore', mkStore({ all: () => ({}), count: () => counts.journal }));
    put('AnnotationStore', mkStore({ all: () => ({}) }));
    put('ReadingStatsStore', mkStore({ get: () => ({}) }));
    put('ReadingStreakStore', mkStore({ get: () => ({}) }));
    put('JournalStatsStore', mkStore({ get: () => ({}) }));
    put('AudioLibraryStore', mkStore({ saved: () => [], getPlays: () => 0 }));
    put('LibraryOrderStore', { get: () => [...DEFAULT_LIBRARY_ORDER], set: noop, subscribe: () => () => {}, getVersion: () => 0 });
    put('createPressDrag', createPressDrag);
  }
  const show = () => render(
    <LibraryScreen {...navProps} onOpenNotes={noop} onOpenLinks={noop} onOpenBookmarks={noop} onOpenJournal={noop}
      onOpenHighlights={noop} onOpenProgress={noop} onOpenAudio={noop} onOpenScriptureWeb={noop}
      totalReadCount={12} historyEnabled />,
  );

  it('populated', async () => {
    setup({ notes: 3, links: 2, bookmarks: 4, journal: 5 });
    const { container } = show();
    expect(container.querySelectorAll('.library-tile').length).toBeGreaterThan(3);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('empty', async () => {
    setup({ notes: 0, links: 0, bookmarks: 0, journal: 0 });
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });
});

/* ═══ Notes ═════════════════════════════════════════════════════════ */
describe('axe — Notes', () => {
  const SRC = { 'bible:genesis:1:1': 'Genesis 1:1', 'bible:psalms:23:1': 'Psalms 23:1', 'letter:grafted-in:0': 'Grafted In' };
  const NOTES = [
    { groupId: 'g1', color: 'yellow', body: 'The covenant of peace', fullText: 'my anchor text', keys: ['bible:genesis:1:1'], created: 1, updated: 6, notebookIds: ['nb1', 'nb2'] },
    { groupId: 'g2', color: 'green', body: 'A different thought '.repeat(12), fullText: 'an everlasting covenant with them', keys: ['bible:psalms:23:1'], created: 2, updated: 5, notebookIds: [] },
    { groupId: 'g3', color: 'pink', body: 'Unrelated musing', fullText: 'plain words', keys: ['letter:grafted-in:0'], created: 3, updated: 4, notebookIds: ['nb1'] },
  ];
  const NBS = [{ id: 'nb1', name: 'Faith', color: 'blue' }, { id: 'nb2', name: 'Prayer' }];
  function setup(notes = NOTES) {
    put('noteSourceLabel', (n) => SRC[(n.keys || [])[0]] || 'Note');
    put('noteSourceSegments', noteSourceSegments);
    put('noteSourceNav', () => null);
    put('normalizeExcerptDisplay', normalizeExcerptDisplay);
    put('NoteRow', NoteRow);
    put('HL_COLORS', ['yellow', 'green', 'blue']);
    put('NoteStore', mkStore({ list: () => notes, get: (id) => notes.find((n) => n.groupId === id) || null }));
    put('NotebookStore', mkStore({ list: () => NBS, get: (id) => NBS.find((nb) => nb.id === id) || null, setColor: noop, rename: noop, remove: noop, add: noop }));
  }
  const show = () => render(<NotesIndexScreen {...navProps} onOpenNote={noop} onNavigateToSource={noop} historyEnabled />);
  const tab = (name) => screen.getByRole('button', { name });

  it('notebooks tab, a new-notebook form open', async () => {
    setup();
    const { container } = show();
    fireEvent.click(tab('Notebooks'));
    fireEvent.click(screen.getByText('New notebook'));
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('all-notes tab (real NoteRows)', async () => {
    setup();
    const { container } = show();
    fireEvent.click(tab('All Notes'));
    expect(container.querySelectorAll('.note-row').length).toBe(3);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('drilled into a notebook: rename field, colour picker', async () => {
    setup();
    const { container } = show();
    fireEvent.click(tab('Notebooks'));
    fireEvent.click(screen.getByText('Faith').closest('button'));
    fireEvent.click(screen.getByText('Color'));
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getByText('Rename'));
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('empty', async () => {
    setup([]);
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('the tabs say which is pressed; the colour swatches are radios; the fields are named', () => {
    setup();
    show();
    fireEvent.click(tab('All Notes'));
    expect(tab('All Notes').getAttribute('aria-pressed')).toBe('true');
    expect(tab('Notebooks').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tab('Notebooks'));
    expect(tab('Notebooks').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('New notebook'));
    expect(screen.getByRole('textbox', { name: 'Notebook name' })).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Faith').closest('button'));
    const color = screen.getByRole('button', { name: 'Color' });
    expect(color.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(color);
    expect(color.getAttribute('aria-expanded')).toBe('true');
    const group = screen.getByRole('radiogroup', { name: 'Notebook color' });
    const radios = [...group.querySelectorAll('[role="radio"]')];
    expect(radios.length).toBe(4);
    expect(screen.getByRole('radio', { name: 'blue' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Default gold' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByText('Rename'));
    expect(screen.getByRole('textbox', { name: 'Notebook name' })).toBeTruthy();
  });
});

/* ═══ Notebook picker sheet ═════════════════════════════════════════ */
describe('axe — NotebookPickerSheet', () => {
  it('a note in one of two notebooks', async () => {
    const nbs = [{ id: 'nb1', name: 'Psalms Study' }, { id: 'nb2', name: 'Prayers' }];
    put('NoteStore', mkStore({ get: () => ({ groupId: 'g1', notebookIds: ['nb1'] }), toggleNotebook: noop }));
    put('NotebookStore', mkStore({ list: () => nbs, get: (id) => nbs.find((n) => n.id === id), add: noop, remove: noop }));
    render(<NotebookPickerSheet groupId="g1" onClose={noop} />);
    expect(await seriousViolations(document.body)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'New notebook name' })).toBeTruthy();
  });
});

/* ═══ Bookmarks ═════════════════════════════════════════════════════ */
describe('axe — Bookmarks', () => {
  const BKS = [
    { id: 'b1', hlKey: 'bible:psalms:23', label: 'The shepherd', text: 'The Lord is my shepherd', created: 100, updated: 100 },
    { id: 'b2', hlKey: 'bible:john:3', label: 'Born again', thought: 'A short thought.', created: 200, updated: 200 },
  ];
  function setup(list) {
    put('_bookTitle', (id) => id.charAt(0).toUpperCase() + id.slice(1));
    put('_bookmarkSourceLabel', _bookmarkSourceLabel);
    put('BookmarkStore', mkStore({ all: () => list.slice(), remove: noop, update: noop, get: (id) => list.find((b) => b.id === id) }));
  }
  const show = () => render(<BookmarksScreen {...navProps} onHome={noop} onNavigateToSource={noop} />);

  it('populated, then its options sheet', async () => {
    setup(BKS);
    const { container } = show();
    expect(container.querySelectorAll('.bkm-row').length).toBe(2);
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bookmark options' })[0]);
    expect(screen.getByRole('dialog', { name: 'Bookmark actions' })).toBeTruthy();
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it('empty', async () => {
    setup([]);
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });

  /* KNOWN, NOT FIXED (needs a visual change): .bkm-row-content is a role=button div, and a long
     thought's Show more button (and the label field while editing) sits inside it, a control
     inside a control. Fixing it means restructuring the row (NoteRow's full-row .note-row-open
     shape), which moves what is drawn, so this pins the one finding until that lands: when the
     row is fixed this fails, and the expectation becomes []. */
  it('KNOWN: a long thought nests its Show more inside the row button (nested-interactive)', async () => {
    setup([{ id: 'b2', hlKey: 'bible:john:3', label: 'Born again', thought: 'A long thought about it. '.repeat(10), created: 200, updated: 200 }]);
    const { container } = show();
    const v = await seriousViolations(container);
    expect(v.length).toBe(1);
    expect(v[0]).toMatch(/^serious nested-interactive: .*\.bkm-row-content/);
  });
});

/* ═══ Highlights ════════════════════════════════════════════════════ */
describe('axe — Highlights', () => {
  function setup(marks) {
    put('normalizeExcerptDisplay', normalizeExcerptDisplay);
    put('_bookmarkSourceLabel', (k) => k);
    put('AnnotationStore', mkStore({ all: () => marks }));
  }
  const show = () => render(<HighlightsScreen {...navProps} onNavigateToSource={noop} />);

  it('populated', async () => {
    setup({
      'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100, updated: 100 }],
      'bible:john:3:16': [{ id: 'a2', groupId: 'g2', kind: 'underline', color: 'blue', text: 'For God so loved the world', created: 200, updated: 200 }],
      'bible:john:1:1': [{ id: 'a3', groupId: 'g3', kind: 'squiggle', color: 'pink', text: 'In the beginning', created: 300, updated: 300 }],
    });
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('empty', async () => {
    setup({});
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });
});

/* ═══ Links ═════════════════════════════════════════════════════════ */
describe('axe — Links', () => {
  const ep = (id, label) => ({ type: 'letter', key: 'letter:' + id + ':0', letterId: id, label, text: 'Words of ' + label });
  function setup(links) {
    put('LinkStore', mkStore({ all: () => links, remove: noop }));
    put('findEntryContext', () => ({ kind: 'letter', title: 'x' }));
    put('_allBooks', () => ({}));
    put('_matthew', () => null);
  }
  const show = () => render(<LinksScreen {...navProps} onHome={noop} onNavigateToSource={noop} />);

  it('populated, then its options sheet', async () => {
    setup([
      { id: 'l1', created: 1, source: ep('the-wide-path', 'The Wide Path'), target: ep('the-seventh-day', 'The Seventh Day') },
      { id: 'l2', created: 2, source: ep('a', 'Letter A'), target: ep('b', 'Letter B') },
    ]);
    const { container } = show();
    expect(container.querySelectorAll('.link-row').length).toBe(2);
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Link options' })[0]);
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it('empty', async () => {
    setup([]);
    const { container } = show();
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('axe — LinkCard', () => {
  it('a long linked passage, its Show more announces its state', async () => {
    put('resolveVerseText', () => '');
    put('bookCategory', () => 'Gospels');
    put('LinkStore', { remove: noop });
    const target = { key: 'bible:john:3:16', type: 'bible', bookId: 'john', verse: 16, label: 'John 3:16', text: 'For God so loved the world. '.repeat(8) };
    const { container } = render(
      <LinkCard lnk={{ id: 'l1', created: 1, source: { key: 'letter:one', label: 'Letter One' }, target }} hlKey="letter:one" onNavigate={noop} />,
    );
    expect(await seriousViolations(container)).toEqual([]);
    const more = screen.getByRole('button', { name: 'Show more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });
});

/* ═══ Progress ══════════════════════════════════════════════════════ */
describe('axe — Progress', () => {
  const GROUP = { id: 'nt', label: 'New Testament', genres: [{ label: 'Gospels', books: [{ id: 'mark', label: 'Mark', total: 16 }] }] };
  function setup(o) {
    put('onIdle', onIdle);
    put('NoteStore', mkStore({ count: () => o.notes || 0 }));
    put('LinkStore', mkStore({ all: () => new Array(o.links || 0).fill({}) }));
    put('BookmarkStore', mkStore({ count: () => o.bookmarks || 0 }));
    put('JournalStore', mkStore({ count: () => o.journal || 0 }));
    put('JournalStatsStore', mkStore({ get: () => ({ currentStreak: o.streak || 0 }) }));
    put('ReadingStreakStore', mkStore({ get: () => ({ currentStreak: o.readStreak || 0 }), recomputeFromLoad: noop }));
    put('AnnotationStore', mkStore({ all: () => o.ann || {} }));
    put('buildProgressGroups', () => o.groups || []);
    put('tallyGroup', tallyGroup);
    put('countReadFor', countReadFor);
    put('mostAnnotatedSources', mostAnnotatedSources);
    put('BIBLE_BOOK_LIST', [{ id: 'psalms', title: 'Psalms' }]);
    if (o.days) {
      put('ReadingStatsStore', mkStore({
        get: () => ({ totalWordsRead: 4200 }), measuredWpm: () => 210,
        wordsForDays: (n) => Array.from({ length: n }, (_, i) => ({ date: '2026-10-' + String(i + 10), words: i * 40 })),
      }));
    }
  }
  const show = (props = {}) => render(
    <MyProgressScreen {...navProps} settings={{ markAsRead: true }} readItems={{}} historyCount={7} historyEnabled onStartReading={noop} {...props} />,
  );

  it('populated', async () => {
    setup({ notes: 3, links: 1, bookmarks: 2, journal: 4, streak: 2, readStreak: 3, groups: [GROUP], days: true });
    const { container } = show({ readItems: { mark: { 1: true, 2: true } } });
    expect(container.querySelectorAll('.prg-section').length).toBeGreaterThan(2);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('empty', async () => {
    setup({});
    const { container } = show({ historyCount: 0 });
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('axe — ClearProgressRow', () => {
  it('a row with reads and an empty one', async () => {
    const { container } = render(<div><ClearProgressRow label="Psalms" total={150} count={12} onClear={noop} /><ClearProgressRow label="Mark" total={16} count={0} onClear={noop} /></div>);
    expect(await seriousViolations(container)).toEqual([]);
  });
});

/* ═══ History ═══════════════════════════════════════════════════════ */
describe('axe — History', () => {
  function setup() {
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
  }
  const now = Date.now();
  const HISTORY = [
    { type: 'chapter', key: 'ch:psalms:23', bookId: 'psalms', bookTitle: 'Psalms', chapterNum: 23, chapterTitle: 'The Lord Is My Shepherd', ts: now - 5 * 60000 },
    { type: 'letter', key: 'lt:the-wide-path', letterId: 'the-wide-path', letterTitle: 'The Wide Path', letterNum: 1, volumeScreen: 'vol-one-idx', ts: now - 60 * 60000 },
    { type: 'chapter', key: 'ch:john:3', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: now - 400 * 86400000 },
  ];
  const show = (history) => render(<HistoryScreen history={history} {...navProps} onSelect={noop} onPruneDay={noop} onHome={noop} />);

  it('populated, an older year opened', async () => {
    setup();
    const { container } = show(HISTORY);
    const year = container.querySelector('.history-year-header');
    if (year) fireEvent.click(year);
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.change(container.querySelector('input.notes-index-search'), { target: { value: 'psalm' } });
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('empty', async () => {
    setup();
    const { container } = show([]);
    expect(await seriousViolations(container)).toEqual([]);
  });
});

/* ═══ Journal ═══════════════════════════════════════════════════════ */
const ENTRIES = [
  {
    id: 'e1', title: 'Morning prayer', pinned: true, created: 1720000000000, updated: 1720000600000, tags: ['dawn', 'psalms'],
    blocks: [
      { id: 'b1', type: 'p', text: 'A short first paragraph with **bold** and {{ref:Psalms 23:1}}.' },
      { id: 'b2', type: 'h2', text: 'A heading' },
      { id: 'b3', type: 'quote', text: 'The Lord is my shepherd', cite: 'Psalm 23' },
      { id: 'b4', type: 'divider' },
      { id: 'b5', type: 'chapter-card', bookId: 'psalms', chapter: 23 },
      { id: 'b6', type: 'notebook-card', notebookId: 'nb1' },
      { id: 'b7', type: 'journal-card', entryId: 'e2' },
      { id: 'b8', type: 'image', mediaId: 'm1', caption: 'Harbor at dusk' },
    ],
  },
  { id: 'e2', title: 'Evening', created: 1720000100000, updated: 1720000100000, tags: [], blocks: [{ id: 'c1', type: 'p', text: 'Evening thoughts.' }] },
];
function journalGlobals(entries = ENTRIES) {
  put('JournalStore', mkStore({
    get: (id) => entries.find((e) => e.id === id) || null,
    all: () => entries.slice(),
    togglePin: vi.fn(), remove: vi.fn(),
    associatedDataSummary: () => null,
    collectAllMediaIds: () => [],
    isReady: () => true,
  }));
  put('JournalHelpers', {
    ...RealJournalHelpers,
    resolveChapterCard: () => ({ eyebrow: 'Bible', title: 'Psalms 23' }),
    resolveNotebookCard: () => ({ eyebrow: 'Notebook', title: 'Faith' }),
  });
  put('JournalCardMenu', JournalCardMenu);
  put('JournalBlockView', JournalBlockView);
  put('JournalImageBlock', JournalImageBlock);
  put('JournalAudioBlock', JournalAudioBlock);
}

describe('axe — Journal hub', () => {
  it('populated, then a card menu and its delete confirm', async () => {
    journalGlobals();
    put('JournalMediaStore', { unclaimed: () => Promise.resolve([{ id: 'r1', created: 1720000000000, duration: 12 }]), delete: noop });
    const { container } = render(<JournalHubScreen {...navProps} onOpenEntry={noop} onCreateEntry={noop} />);
    await act(async () => {});
    expect(container.querySelector('.jrn-unclaimed')).not.toBeNull();
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Entry options' })[0]);
    expect(await seriousViolations(document.body)).toEqual([]);
    fireEvent.click(screen.getByText('Delete Entry'));
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it('empty, both tabs; the tabs say which is pressed', async () => {
    journalGlobals([]);
    const { container } = render(<JournalHubScreen {...navProps} onOpenEntry={noop} onCreateEntry={noop} />);
    expect(await seriousViolations(container)).toEqual([]);
    const all = screen.getByRole('button', { name: 'All Entries' });
    const pinned = screen.getByRole('button', { name: 'Pinned' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(pinned.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pinned);
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(pinned.getAttribute('aria-pressed')).toBe('true');
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('axe — Journal viewer', () => {
  it('an entry with every common block kind, then its options menu', async () => {
    journalGlobals();
    const { container } = render(<JournalViewerScreen {...navProps} entryId="e1" onEdit={noop} onNavigateToLink={noop} onOpenJournalEntry={noop} onOpenNotebook={noop} />);
    expect(container.querySelector('.jrn-viewer-blocks').children.length).toBeGreaterThan(5);
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Entry options' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it('an entry that is not there', async () => {
    journalGlobals();
    const { container } = render(<JournalViewerScreen {...navProps} entryId="nope" />);
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('axe — Journal editor', () => {
  beforeEach(() => {
    RealJournalStore._resetForTests({ forceLoaded: true });
    put('JournalStore', RealJournalStore);
    put('JournalHelpers', {
      ...RealJournalHelpers,
      resolveChapterCard: () => ({ eyebrow: 'Bible', title: 'Psalms 23' }),
      resolveNotebookCard: () => ({ eyebrow: 'Notebook', title: 'Faith' }),
    });
    put('createPressDrag', createPressDrag);
    put('JournalMediaStore', {
      compressImage: vi.fn(), put: vi.fn(), delete: vi.fn(),
      objectUrl: () => Promise.resolve(null), get: () => Promise.resolve(null),
    });
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
  });

  it('an entry with text, quote, divider, photo and card blocks; its fields are named', async () => {
    const entry = RealJournalStore.add({
      title: 'Morning prayer',
      blocks: [
        RealJournalHelpers.newBlock('p', { text: 'First paragraph' }),
        RealJournalHelpers.newBlock('h2', { text: 'A heading' }),
        RealJournalHelpers.newBlock('quote', { text: 'The Lord is my shepherd', cite: 'Psalm 23' }),
        RealJournalHelpers.newBlock('divider'),
        RealJournalHelpers.newBlock('image', { mediaId: 'm1', caption: '' }),
        RealJournalHelpers.newBlock('chapter-card', { bookId: 'psalms', chapter: 23 }),
      ],
    });
    const { container } = render(<JournalEditorScreen {...navProps} entryId={entry.id} />);
    expect(await seriousViolations(container)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Entry title' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Quoted text' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Quote citation' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Photo caption' })).toBeTruthy();
  });

  it('the insert sheet, its menu and a picker', async () => {
    const entry = RealJournalStore.add({ title: '', blocks: [RealJournalHelpers.newBlock('p', { text: '' })] });
    render(<JournalEditorScreen {...navProps} entryId={entry.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('dialog', { name: 'Insert' })).toBeTruthy();
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});

/* ═══ Journal sheets ════════════════════════════════════════════════ */
describe('axe — JournalInsertSheet pickers', () => {
  it('the bookmark picker: its search box is named', async () => {
    const bks = [{ id: 'b1', hlKey: 'bible:psalms:23', label: 'The shepherd', text: 'The Lord is my shepherd', created: 1 }];
    put('JournalHelpers', RealJournalHelpers);
    put('BookmarkStore', mkStore({ all: () => bks, get: (id) => bks.find((b) => b.id === id) }));
    put('NoteStore', mkStore({ list: () => [] }));
    put('NotebookStore', mkStore({ list: () => [{ id: 'nb1', name: 'Faith' }] }));
    put('_bookmarkSourceLabel', (k) => k);
    render(<JournalInsertSheet onClose={noop} onInsertBlock={noop} />);
    fireEvent.click(screen.getByText('Bookmark'));
    expect(await seriousViolations(document.body)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Search bookmarks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText('Notebook'));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});

describe('axe — JournalInboundSheet', () => {
  it('two entries referencing a passage', async () => {
    put('JournalIndexStore', { entriesReferencing: () => ['e1', 'e2'] });
    journalGlobals();
    render(<JournalInboundSheet refKey="bible:psalms:23:1" resourceLabel="Psalms 23:1" onClose={noop} onOpenEntry={noop} />);
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});

describe('axe — JournalRecordingSheet', () => {
  it('while asking for the microphone, the request is a status', async () => {
    put('PlatformBridge', {
      isAndroid: false, requestMicPermission: noop, startAudioSession: noop, endAudioSession: noop,
      nativeListRecordings: () => '[]', nativeRecordCancel: noop, nativeRecordStop: noop, nativeDeleteRecording: noop,
    });
    render(<JournalRecordingSheet onSave={noop} onClose={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'Voice Recording' });
    expect(await seriousViolations(dialog)).toEqual([]);
    expect(within(dialog).getByRole('status').textContent).toMatch(/microphone/i);
  });
});
