/* v2 group 11, saved data re-shown (v2g11; v2 build plan rule 5: saved data stays and shows up in the new places). Main's
   REAL stores (installed on window as bundle-b's _entry-b.js does) are filled by main's own writers in main's own shapes,
   then v2 boots for real and every item is found where v2 shows it: Continue, Recent (history and the open pages),
   Notes (journal, highlights, notes, bookmarks, saved recordings, links), a collection's read marks and minutes left, and
   main's highlights on a letter's text and a Bible chapter's verse. Looking writes nothing: every store write path is watched. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { StateStore } from '../stores/state-store.js';
import { HistoryStore } from '../stores/history-store.js';
import { AnnotationStore } from '../stores/annotation-store.js';
import { NoteStore } from '../stores/note-store.js';
import { LinkStore } from '../stores/link-store.js';
import { JournalStore } from '../stores/journal-store.js';
import { BookmarkStore } from '../stores/bookmark-store.js';
import { AudioLibraryStore } from '../stores/audio-library-store.js';
import { AudioPositionsStore } from '../stores/audio-positions-store.js';
import { _collectMarks } from '../ui/screens/HighlightsScreen.jsx';
import { applyDOMHighlights } from '../renderer/annotation-engine.jsx';
import { _bookmarkSourceLabel } from '../utils/bookmark-source.js';
import { normalizeExcerptDisplay } from '../utils/excerpt-display.js';
import { AUDIO_RELEASE_PREFIX } from '../utils/audio-track.js';
import { COLLECTIONS, COL_BY_KEY, COL_BY_LETTER_SC, COL_BY_INDEX_SC } from '../data/scripture-resolution.js';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((el) => el.textContent);

const STORES = { StateStore, HistoryStore, AnnotationStore, NoteStore, LinkStore, JournalStore, BookmarkStore, AudioLibraryStore, AudioPositionsStore };
const HELPERS = { _collectMarks, normalizeExcerptDisplay, applyDOMHighlights, _bookmarkSourceLabel, COLLECTIONS, COL_BY_KEY, COL_BY_LETTER_SC, COL_BY_INDEX_SC };

const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
/** The corpus in its real shapes: Format A volume letters (blocks), Volume One's preface, Format B Words To Live By. */
const CORPUS = {
  LETTERS_V1: [
    { id: 'chosen-by-god', num: 1, title: 'Chosen by God', date: '8/31/04', blocks: [para('Thus says The Lord to His servant:'), para('Many things you must overcome in the years ahead.')] },
    { id: 'honor-not', num: 2, title: 'Honor Not the Day of the Dead... Honor God', date: '10/6/04', blocks: [para('Honor not the day of the dead.')] },
    { id: 'one-3', num: 3, title: 'The Third Letter', date: '10/7/04', blocks: [para('A third letter.')] },
    { id: 'one-4', num: 4, title: 'The Fourth Letter', date: '10/8/04', blocks: [para('A fourth letter.')] },
  ],
  LETTERS_V1_PREFACE: { id: 'v1-preface', title: 'A Word of Warning', blocks: [para('Hear.')] },
  WTLB_ONE: [{ id: 'w-12', num: 12, title: 'On Prayer', paragraphs: [{ align: 'left', text: 'Pray always.' }] }],
};
const RECORDING = { key: 'one:honor-not', title: 'Honor Not the Day of the Dead... Honor God', sub: 'Volume One · Letter 2',
  url: AUDIO_RELEASE_PREFIX + 'v1-02.mp3', readerCode: 'benjamin', partLabel: null };
const THIRD_URL = AUDIO_RELEASE_PREFIX + 'v1-03.mp3';

/** Main's writers, main's shapes (the comments name where main writes each one). */
function seed() {
  // usePersistedState: vot-state whole; the reader is on Letter 1 with six pages open (main's tabs; the preface too)
  StateStore.set({
    activeReadKey: 'vol:one', lastReadLetterMap: { one: 'chosen-by-god' }, readItems: { 'v1:volume-one:honor-not': 1 },
    tabs: [{ screen: 'vot-one-letter', letterId: 'chosen-by-god' }, { screen: 'bible-ch', bookId: 'john', chapterNum: 3 },
      { screen: 'wtlb-one-entry', letterId: 'w-12' }, { screen: 'vot-one-letter', letterId: 'one-3' }, { screen: 'home' },
      { screen: 'vot-one-letter', letterId: 'v1-preface' }],
    activeTabIdx: 0,
  });
  // use-nav-history-tracking: newest first
  HistoryStore.add({ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 });
  HistoryStore.add({ type: 'letter', letterId: 'honor-not', letterTitle: 'Honor Not the Day of the Dead... Honor God', letterNum: 2, volumeScreen: 'vot-one-index' });
  // SelectionToolbar: a highlight, and a note (an annotation of kind note + its NoteStore body)
  const created = Date.now() - 60000;
  AnnotationStore.add('letter:chosen-by-god:1', { id: 'h1', groupId: 'h1', kind: 'highlight', start: 0, end: 15, color: 'green', text: 'Many things you', created });
  AnnotationStore.add('letter:chosen-by-god:0', { id: 'h2', groupId: 'h2', kind: 'note', start: 0, end: 9, color: 'blue', text: 'Thus says', created });
  NoteStore.set('h2', { body: 'Read this again on Sunday.', fullText: 'Thus says', keys: ['letter:chosen-by-god:0'] });
  LinkStore.add({ id: 'l1', source: { type: 'letter', key: 'letter:honor-not:0', label: 'Honor Not the Day of the Dead... Honor God' },
    target: { type: 'bible', key: 'bible:john:15:16', label: 'John 15:16' }, created });
  JournalStore.add({ title: 'On being set apart', blocks: [{ type: 'p', text: 'What it asks of me this week.' }] });
  BookmarkStore.add(/** @type {any} */ ({ id: 'b1', hlKey: 'wtlb:w-12:0', label: '' }));   // add() stamps created/updated
  // the player: a saved recording (the library's heart) and a place left in Letter 3's recording
  AudioLibraryStore.toggleSaved(RECORDING);
  AudioPositionsStore.setPosition(THIRD_URL, 120, 600);
}

/** Every path a store writes through, watched once the seed is in. */
function watchWrites() {
  const spies = [];
  for (const [label, store] of Object.entries(STORES)) {
    for (const name of ['_save', '_saveMerged', 'replaceExact']) {
      if (typeof store[name] === 'function') spies.push(vi.spyOn(/** @type {any} */ (store), name).mockName(label + '.' + name));
    }
  }
  spies.push(vi.spyOn(Storage.prototype, 'setItem').mockName('localStorage.setItem'),
    vi.spyOn(Storage.prototype, 'removeItem').mockName('localStorage.removeItem'));
  return () => spies.filter((s) => s.mock.calls.length).map((s) => s.getMockName() + ' ' + JSON.stringify(s.mock.calls.map((c) => c[0])));
}

beforeEach(async () => {
  localStorage.clear();
  IDBAdapter._resetForTests();
  await new Promise((done) => { const req = indexedDB.deleteDatabase(IDBAdapter.DB_NAME); req.onsuccess = done; req.onerror = done; });
  for (const store of Object.values(STORES)) store._resetForTests({ forceLoaded: true });
  Object.assign(g, STORES, HELPERS, CORPUS);
  // listenResume's seam (utils/audio-player/queue.js:98 reads AudioPositionsStore at the letter's first track): the
  // catalog behind playbackTracks is too heavy for jsdom, so the walk on the real build proves the real one.
  g.AudioPlayer = { subscribe: () => () => {}, getVersion: () => 0, getState: () => ({ status: 'idle', queue: [], qi: 0 }),
    hasAudio: () => false, listenResume: ({ volKey, letter }) => {
    if (volKey !== 'one' || !letter) return null;
    const p = AudioPositionsStore.getPosition(AUDIO_RELEASE_PREFIX + 'v1-0' + letter.num + '.mp3');
    return p ? { at: p.t, left: p.d - p.t } : null;
  } };
  seed();
  await Promise.all(Object.values(STORES).map((store) => store.whenSaved()));
});
afterEach(() => {
  cleanup();
  for (const k of [...Object.keys(STORES), ...Object.keys(HELPERS), ...Object.keys(CORPUS), 'AudioPlayer']) delete g[k];
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("main's saved data, found in v2", () => {
  it('Home: Continue is the letter main left open; Recent is the history and the recordings played, newest first, then the open pages', async () => {
    // the player, a moment after the reading: Letter 4's recording started (main's AudioPlayer calls recordPlayed)
    await new Promise((r) => setTimeout(r, 2));
    AudioLibraryStore.recordPlayed({ key: 'one:one-4', title: 'The Fourth Letter', sub: null, url: AUDIO_RELEASE_PREFIX + 'v1-04.mp3', readerCode: 'benjamin', partLabel: null });
    await AudioLibraryStore.whenSaved();
    const writes = watchWrites();
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.pill.block').textContent.trim()).toBe('Continue reading');
    expect(container.querySelector('.cont-where').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(texts(container, '.recent .chip')).toEqual(['Vol. One, Letter 4', 'Vol. One, Letter 2', 'John 3', 'On Prayer', 'Vol. One, Letter 3', 'Vol. One, Preface']);
    expect(writes()).toEqual([]);
    // a recording played opens its letter
    await click([...container.querySelectorAll('.recent .chip')][0]);
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('The Fourth Letter'));
  });

  it('Home: an open page opens where it was, under its collection', async () => {
    const { container } = render(<V2App gateId={null} />);
    // Words To Live By's entry
    await click([...container.querySelectorAll('.recent .chip')][2]);
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('On Prayer'));
    expect(container.querySelector('.tb .title').textContent).toBe('Words To Live By');   // picture 1d's bar (dz13)
  });

  it("Home: the volume's preface left open is in Recent and opens", async () => {
    const { container } = render(<V2App gateId={null} />);
    expect(texts(container, '.recent .chip')).toEqual(['Vol. One, Letter 2', 'John 3', 'On Prayer', 'Vol. One, Letter 3', 'Vol. One, Preface']);
    await click([...container.querySelectorAll('.recent .chip')][4]);
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('A Word of Warning'));
  });

  it('Notes: every journal entry, highlight, note, bookmark, saved recording and link, each opening its place', async () => {
    const writes = watchWrites();
    const { container } = render(<V2App gateId={null} />);
    await click([...container.querySelectorAll('.tab')].find((t) => t.textContent === 'Notes'));
    await waitFor(() => expect(container.querySelectorAll('.marks .mark').length).toBe(6));
    const rows = texts(container, '.marks .mark');
    const row = (s) => rows.find((r) => r.includes(s)) || '';
    expect(row('On being set apart')).toMatch(/What it asks of me this week\.Journal · Today$/);
    expect(row('Many things you')).toBe('Many things youHighlight · Volume One · Letter 1 · Today');
    expect(row('Read this again on Sunday.')).toBe('“Thus says”Read this again on Sunday.Note · Volume One · Letter 1 · Today');
    expect(row('On Prayer')).toBe('On PrayerBookmark · Words To Live By: Part One · Today');
    expect(row('Saved recording')).toBe('Honor Not the Day of the Dead... Honor GodSaved recording · Volume One · Letter 2 · Today');
    expect(row('joined to')).toBe('Honor Not the Day of the Dead... Honor God, joined to John 15:16Link · Volume One · Letter 2 · Today');
    // the Bookmarks chip holds the places saved, the recording among them
    await click([...container.querySelectorAll('.chips.kinds .chip')].find((c) => c.textContent === 'Bookmarks'));
    expect(texts(container, '.marks .mark .mt')).toEqual(expect.arrayContaining(['On Prayer', 'Honor Not the Day of the Dead... Honor God']));
    expect(container.querySelectorAll('.marks .mark').length).toBe(2);
    expect(writes()).toEqual([]);
    // a Words To Live By bookmark opens its entry (before v2g11 only a Volume's rows opened)
    await click([...container.querySelectorAll('.marks .mark')].find((m) => m.textContent.startsWith('On Prayer')));
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('On Prayer'));
  });

  it('a saved recording opens its letter', async () => {
    const { container } = render(<V2App gateId={null} />);
    await click([...container.querySelectorAll('.tab')].find((t) => t.textContent === 'Notes'));
    await waitFor(() => expect(container.querySelectorAll('.marks .mark').length).toBe(6));
    await click([...container.querySelectorAll('.marks .mark')].find((m) => m.textContent.includes('Saved recording')));
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('Honor Not the Day of the Dead... Honor God'));
    expect(container.querySelector('.overline').textContent).toBe('Volume One · Letter 2');
  });

  it("a collection: main's read mark says Finished, a recording left part-way says the minutes left", async () => {
    const writes = watchWrites();
    const { container } = render(<V2App gateId={null} />);
    await click(container.querySelector('.vols button.c'));
    await waitFor(() => expect(container.querySelector('.row.num-row[data-key="one/2"]')).not.toBe(null));
    expect(container.querySelector('.row.num-row[data-key="one/2"] .s').textContent).toBe('10/6/04 · Finished');
    expect(container.querySelector('.row.num-row[data-key="one/3"] .s').textContent).toBe('10/7/04 · 8 min left');
    expect(container.querySelector('.row.num-row[data-key="one/1"] .s').textContent).toBe('8/31/04');
    expect(writes()).toEqual([]);
  });

  it("a letter shows main's highlight on its text, and reading it keeps main's open pages", async () => {
    const { container } = render(<V2App gateId={null} />);
    await click(container.querySelector('.pill.block'));
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('Chosen by God'));
    await waitFor(() => expect(texts(container, '[data-hl-key="letter:chosen-by-god:1"] mark.hl-dom')).toEqual(['Many things you']));
    expect(StateStore.get().tabs.length).toBe(6);
    expect(StateStore.get().readItems).toEqual({ 'v1:volume-one:honor-not': 1 });
    expect(AnnotationStore.get('letter:chosen-by-god:1').map((a) => a.id)).toEqual(['h1']);
    expect(AudioLibraryStore.saved().map((t) => t.key)).toEqual(['one:honor-not']);
  });

  it("a Bible chapter shows main's verse highlight on its words (not its number)", async () => {
    const john = { id: 'john', title: 'John', chapters: [{ num: 3, sections: [{ verses: [{ n: 16, text: 'For God so loved the world' }, { n: 17, text: 'For God did not send' }] }] }] };
    Object.assign(g, { BOOKS: { john }, BIBLE_BOOK_LIST: [john] });
    AnnotationStore.add('bible:john:3:16', { id: 'h3', groupId: 'h3', kind: 'highlight', start: 0, end: 16, color: 'yellow', text: 'For God so loved', created: Date.now() });
    try {
      const { container } = render(<V2App gateId={null} />);
      await click([...container.querySelectorAll('.recent .chip')].find((c) => c.textContent === 'John 3'));
      await waitFor(() => expect(texts(container, '[data-hl-key="bible:john:3:16"] mark.hl-dom')).toEqual(['For God so loved']));
      expect(container.querySelector('#v-16 .vn').textContent).toBe('16');
      expect(container.querySelectorAll('mark.hl-dom').length).toBe(1);
    } finally { delete g.BOOKS; delete g.BIBLE_BOOK_LIST; }
  });
});
