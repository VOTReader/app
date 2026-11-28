// @ts-nocheck -- classic-global screen contract is isolated here.
/* songs-sort slice 1 (Corbin 2026-11-27: "if I want all the letters that are spoken, and/or spoken/music, etc, if I
   want to download that playlist or whatever, I can easily"). The hub's Playlists group holds two sets read from the
   catalog's own fields (SongCatalog.songsInSet): the Letters' words, sung, and Spoken word. Each opens as a shelf with
   its count, Play all, Shuffle and one Keep for what Play all plays; Spoken word also opens the Letters read with music.
   Counts come from the catalog, never from this file: the live catalog moves as the songs are sorted. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, act } from '@testing-library/react';

const { player } = vi.hoisted(() => ({
  player: {
    subscribe: () => () => {}, getVersion: () => 0,
    getState: () => ({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 }),
    toggle: vi.fn(), playSongs: vi.fn(() => true), playLetter: vi.fn(),
  },
}));
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioSongsScreen } from './AudioSongsScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as Parts from '../components/SongParts.jsx';
import * as KeepParts from '../components/SongKeepParts.jsx';
import { SongKeep, formatSongBytes } from '../../utils/song-keep.js';
import { SongCatalog, adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { SONG_FIXTURE } from '../../utils/song-catalog.fixture.js';
import { NetStatus } from '../../utils/net-status.js';
import { utilityNav } from '../components/RootNav.jsx';

let store;
let library;
const realFetch = globalThis.fetch;

function fakeStore(ids = []) {
  const map = new Map(ids.map((id) => [id, { id, blob: new Blob([new Uint8Array(4)]), bytes: 3000000, sha256: '', keptAt: 1 }]));
  return {
    map,
    all: vi.fn(async () => [...map.values()]),
    get: vi.fn(async (id) => map.get(id) || null),
    put: vi.fn(async (rec) => { map.set(rec.id, rec); }),
    delete: vi.fn(async (id) => { map.delete(id); }),
  };
}

async function install({ kept = [] } = {}) {
  globalThis.ScreenLayout = ({ children, utility }) => <main>{utility ? <nav>{utilityNav(utility)}</nav> : null}{children}</main>;
  globalThis.LibraryNav = ({ backLabel }) => <nav>{backLabel}</nav>;
  globalThis.useModalRegistry = () => {};
  globalThis.useFocusTrap = () => null;
  Object.assign(globalThis, Shelf, Parts, KeepParts, { SongKeep, formatSongBytes });
  globalThis.AudioPlayer = player;
  globalThis.SongCatalog = SongCatalog;
  globalThis.COL_BY_KEY = new Map([['wtlb1', { label: 'Words to Live By, Part One', volKey: 'wtlb1' }], ['one', { label: 'Volume One', volKey: 'one' }]]);
  globalThis.colLetterArr = () => [];
  if (!globalThis.indexedDB) globalThis.indexedDB = {};
  store = fakeStore(kept);
  globalThis.OfflineSongsStore = store;
  library = {
    subscribe: () => () => {}, getVersion: () => 0,
    songSaved: () => [], songRecent: () => [], saved: () => [], recent: () => [],
    kept: kept.slice(),
    songKept() { return this.kept.slice(); },
    setSongsKept: vi.fn(function (ids, on) { const rest = this.kept.filter((x) => ids.indexOf(x) < 0); this.kept = on ? ids.concat(rest) : rest; }),
  };
  globalThis.AudioLibraryStore = library;
  SongKeep._reset();
  await SongKeep.ready();
}

function renderScreen(route, onPush = vi.fn()) {
  render(<AudioSongsScreen route={route} onPush={onPush} onReplaceTop={vi.fn()} onBack={vi.fn()} rootBackLabel="Home"
    onSearch={() => {}} onHistory={() => {}} onSettings={() => {}} theme="dark" onThemeChange={() => {}} />);
  return onPush;
}

/** The families of a set and each one's lead (the first of its versions in the set), from the catalog itself, the
    families in reading order: the set lists Volume One (fam-c) before Words to Live By (fam-a), and a family of
    another shelf (fam-b, inspired) after the letter collections. */
const READING_ORDER = ['fam-c', 'fam-a', 'fam-b'];
function setOf(name) {
  const songs = SongCatalog.songsInSet(name);
  const leads = [];
  for (const s of songs) if (!leads.some((x) => x.f === s.f)) leads.push(s);
  leads.sort((a, b) => READING_ORDER.indexOf(a.f) - READING_ORDER.indexOf(b.f));
  return { songs, leads, bytes: leads.reduce((a, s) => a + s.b, 0) };
}
const rowOf = (group, title) => within(screen.getByRole('group', { name: group })).getAllByRole('button')
  .find((b) => b.querySelector('.ui-row-title') && b.querySelector('.ui-row-title').textContent === title);

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(SONG_FIXTURE);
  Parts._resetSongLyricsForTests();
  NetStatus._reset();
  globalThis.fetch = vi.fn(() => new Promise(() => {}));
  player.playSongs.mockClear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  Object.defineProperty(window.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 1e10, usage: 0 }), persist: async () => true } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const key of ['ScreenLayout', 'LibraryNav', 'useModalRegistry', 'useFocusTrap', 'AudioPlayer', 'SongCatalog', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore', 'OfflineSongsStore']) delete globalThis[key];
  SongKeep._reset();
  _resetSongCatalogForTests();
  globalThis.fetch = realFetch;
});

describe('the hub: Playlists', () => {
  it('lists the two sets first, each with its count of songs, and opens each as a list', async () => {
    await install();
    const onPush = renderScreen([{ k: 'hub' }]);
    const labels = [...document.querySelectorAll('.ui-label')].map((h) => h.textContent);
    expect(labels[0]).toBe('Playlists');
    const words = rowOf('Playlists', 'The Letters’ words, sung');
    const spoken = rowOf('Playlists', 'Spoken word');
    expect(words.querySelector('.ui-row-value').textContent).toBe(Parts.songCountLabel(setOf('words').leads.length));
    expect(spoken.querySelector('.ui-row-value').textContent).toBe(Parts.songCountLabel(setOf('spoken').leads.length));
    fireEvent.click(words);
    expect(onPush).toHaveBeenLastCalledWith({ k: 'list', v: 'set:words' });
    fireEvent.click(spoken);
    expect(onPush).toHaveBeenLastCalledWith({ k: 'list', v: 'set:spoken' });
  });

  it('a set the catalog has no songs for is not offered', async () => {
    await install();
    adoptSongCatalog({ ...SONG_FIXTURE, version: 'no-spoken', songs: SONG_FIXTURE.songs.filter((s) => s.dl !== 'spoken') });
    renderScreen([{ k: 'hub' }]);
    expect(rowOf('Playlists', 'The Letters’ words, sung')).toBeTruthy();
    expect(rowOf('Playlists', 'Spoken word')).toBeUndefined();
  });
});

describe('a set\'s list', () => {
  it('the Letters\' words, sung: what it holds, its count, its rows, and Play all plays one of each song', async () => {
    await install();
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'set:words' }]);
    const set = setOf('words');
    expect(document.querySelector('.bar-title').textContent).toBe('The Letters’ words, sung');
    expect(screen.getByText('Songs that sing a Letter’s own words.')).toBeTruthy();
    expect(screen.getByText(new RegExp('^' + Parts.songCountLabel(set.leads.length) + ' · ' + Parts.songCountLabel(set.songs.length, 'version', 'versions') + ' · '))).toBeTruthy();
    expect([...document.querySelectorAll('.songs-row .ui-row-title')].map((t) => t.textContent)).toEqual(['The Letter', 'Come, Love Awaits You']);
    expect(set.leads.map((s) => s.id)).toEqual(['ccccccccccc2', 'aaaaaaaaaaa1']);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(player.playSongs).toHaveBeenLastCalledWith(expect.objectContaining({ ids: set.leads.map((s) => s.id), shuffle: false, label: 'The Letters’ words, sung' }));
  });

  it('Keep all keeps what Play all plays, says how many and how big, and reads kept once they are all here', async () => {
    await install();
    const keepSpy = vi.spyOn(SongKeep, 'keep').mockResolvedValue(undefined);
    renderScreen([{ k: 'list', v: 'set:words' }]);
    const set = setOf('words');
    const btn = screen.getByRole('button', { name: 'Keep all ' + Parts.songCountLabel(set.leads.length) + ' · ' + formatSongBytes(set.bytes) });
    await act(async () => { fireEvent.click(btn); });
    expect(keepSpy).toHaveBeenCalledWith(set.leads.map((s) => s.id), 'keep-set-words');
    cleanup();
    await install({ kept: setOf('words').leads.map((s) => s.id) });
    renderScreen([{ k: 'list', v: 'set:words' }]);
    expect(screen.queryByRole('button', { name: /^Keep/ })).toBeNull();
    expect(screen.getByText('All ' + set.leads.length + ' on this phone · ' + formatSongBytes(set.bytes))).toBeTruthy();
  });

  it('with some kept, the button offers the others, so none look missing', async () => {
    const set = setOf('words');
    await install({ kept: [set.leads[0].id] });
    renderScreen([{ k: 'list', v: 'set:words' }]);
    const rest = set.leads.slice(1);
    expect(screen.getByRole('button', { name: 'Keep the other ' + rest.length + ' · ' + formatSongBytes(rest.reduce((a, s) => a + s.b, 0)) })).toBeTruthy();
  });

  it('Spoken word: what it holds, its rows, and the Letters read with music one tap away', async () => {
    await install();
    const onPush = renderScreen([{ k: 'hub' }, { k: 'list', v: 'set:spoken' }]);
    const set = setOf('spoken');
    expect(document.querySelector('.bar-title').textContent).toBe('Spoken word');
    expect(screen.getByText('Read aloud rather than sung.')).toBeTruthy();
    expect([...document.querySelectorAll('.songs-row .ui-row-title')].map((t) => t.textContent))
      .toEqual(set.leads.map((s) => SongCatalog.familyById(s.f).t));
    const readings = rowOf('Whole Letters', 'Letters read with music');
    expect(readings.querySelector('.ui-row-value').textContent).toBe('1 letter');
    fireEvent.click(readings);
    expect(onPush).toHaveBeenLastCalledWith({ k: 'readings' });
    expect(screen.getByRole('button', { name: /^Keep all 1 song · / })).toBeTruthy();
  });

  it('the back pill of a page opened from a set names the set', async () => {
    await install();
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'set:spoken' }, { k: 'song', v: 'fam-b' }]);
    expect(screen.getByRole('button', { name: 'Back to Spoken word' })).toBeTruthy();
  });
});
