// @ts-nocheck -- classic-global screen contract is isolated here.
/* Songs of the Letters -- Keep on this phone (K1) on the Songs screens: since W3d no Keep card on the song page,
   no Keep all on a list and no Kept row on the hub (Downloads is the one place, U 8.6); the Kept list with
   Remove and a Remove all confirm strip, and a restore's "Download your N songs again". */
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

async function install({ kept = [], listed = kept } = {}) {
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
    kept: listed.slice(),
    songKept() { return this.kept.slice(); },
    setSongsKept: vi.fn(function (ids, on) { const rest = this.kept.filter((x) => ids.indexOf(x) < 0); this.kept = on ? ids.concat(rest) : rest; }),
  };
  globalThis.AudioLibraryStore = library;
  SongKeep._reset();
  await SongKeep.ready();
}

function renderScreen(route, onPush = vi.fn()) {
  return render(<AudioSongsScreen route={route} onPush={onPush} onReplaceTop={vi.fn()} onBack={vi.fn()} rootBackLabel="Home"
    onSearch={() => {}} onHistory={() => {}} onSettings={() => {}} theme="dark" onThemeChange={() => {}} />);
}

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(SONG_FIXTURE);
  // A song page fetches its lyrics once per module and a failed fetch marks the network down: start every test with
  // no lyrics cached, the network up, and a fetch that never answers (no real request), in whatever order they run.
  Parts._resetSongLyricsForTests();
  NetStatus._reset();
  globalThis.fetch = vi.fn(() => new Promise(() => {}));
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  Object.defineProperty(window.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 1e10, usage: 0 }), persist: async () => true } });
});

afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'LibraryNav', 'useModalRegistry', 'useFocusTrap', 'AudioPlayer', 'SongCatalog', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore', 'OfflineSongsStore']) delete globalThis[key];
  SongKeep._reset();
  _resetSongCatalogForTests();
  globalThis.fetch = realFetch;
});

/* W3d (design brief U 8.6): Downloads is the one place to keep songs. The song page's Keep card, a list's Keep all
   and the hub's Kept row are gone; the Kept list stays (Settings and the player open it) with its Remove and Remove all. */
describe('Keep on this phone -- one place to download (U 8.6)', () => {
  it('the song page carries no Keep card, kept or not', async () => {
    await install();
    renderScreen([{ k: 'song', v: 'fam-a' }]);
    expect(screen.queryByRole('heading', { name: 'Keep for offline listening' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Keep/ })).toBeNull();
    cleanup();
    await install({ kept: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2'] });
    renderScreen([{ k: 'song', v: 'fam-a' }]);
    expect(screen.queryByRole('heading', { name: 'Available offline' })).toBeNull();
    expect(screen.queryByRole('button', { name: /from this phone/ })).toBeNull();
  });
});

describe('Keep on this phone -- lists, the hub row and the Kept list', () => {
  it('a collection offers no Keep all, and the hub no Kept row, even with songs kept', async () => {
    await install({ kept: ['aaaaaaaaaaa1'] });
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    expect(screen.queryByRole('button', { name: /^Keep all/ })).toBeNull();
    cleanup();
    renderScreen([{ k: 'hub' }]);
    expect(screen.queryByText(/Kept on this phone/)).toBeNull();
  });

  it('the Kept list plays its songs, removes one, and Remove all asks first', async () => {
    await install({ kept: ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    expect(document.querySelector('.bar-title').textContent).toBe('Kept on this phone');
    expect(document.querySelectorAll('.songs-row')).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Lead Me To That Place from this phone' })); });
    expect(store.map.has('bbbbbbbbbbb1')).toBe(false);
    expect(library.kept).toEqual(['aaaaaaaaaaa1']);
    expect(document.querySelectorAll('.songs-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all from this phone' }));
    const strip = screen.getByRole('group', { name: 'Remove all kept songs' });
    // One song left: the strip names that song, not 'all 1 song' (vot-ui walk, 11-18).
    expect(strip.textContent).toContain('Remove this song (3 MB) from this phone?');
    expect(strip.textContent).toContain('It can be kept again.');
    expect(within(strip).getByRole('button', { name: 'Keep it' })).toBeTruthy();
    await act(async () => { fireEvent.click(within(strip).getByRole('button', { name: 'Yes, remove it' })); });
    expect(store.map.size).toBe(0);
    expect(screen.getByText(/Songs you keep play here with no signal/)).toBeTruthy();
  });

  it('after a restore, the list offers Download your N songs again (X MB)', async () => {
    await install({ kept: [], listed: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    expect(screen.getByRole('button', { name: 'Download your 2 songs again (6 MB)' })).toBeTruthy();
  });
});

/* K3 (Songs walk W2, 2026-09-25): which rows are on the phone, the Remove all
   strip in the app's own confirm grammar, and the hub's Find words kept in its frame. */
describe('K3 -- kept rows, the Remove all strip, Find kept', () => {
  it('(W2-02) a kept song\'s row carries a quiet On this phone mark; the others do not', async () => {
    await install({ kept: ['aaaaaaaaaaa1'] });
    library.songRecent = () => ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'];
    renderScreen([{ k: 'list', v: 'recent' }]);
    const rows = [...document.querySelectorAll('.songs-row')];
    const byTitle = (t) => rows.find((r) => r.querySelector('.ui-row-title').textContent === t);
    const mark = byTitle('Come, Love Awaits You').querySelector('.songs-row-kept');
    expect(mark).not.toBeNull();
    expect(mark.textContent).toContain('On this phone');
    expect(byTitle('Lead Me To That Place').querySelector('.songs-row-kept')).toBeNull();
  });

  it('(W2-05) Remove all asks in the one confirm, as a card: Keep them, Yes, remove all', async () => {
    await install({ kept: ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all from this phone' }));
    const strip = screen.getByRole('group', { name: 'Remove all kept songs' });
    expect(strip.textContent).toContain('Remove all 2 songs (');
    expect(strip.className).toBe('ui-confirm is-card');
    expect(within(strip).getByRole('button', { name: 'Keep them' }).className).toBe('ui-btn is-small is-outline ui-confirm-cancel');
    const go = within(strip).getByRole('button', { name: 'Yes, remove all' });
    expect(go.className).toBe('ui-btn is-small ui-confirm-yes is-danger');
    expect(go.className).not.toContain('songs-shuffle');
    await act(async () => { fireEvent.click(go); });
    expect(store.map.size).toBe(0);
  });

  it('(W2-07) the hub keeps its Find words in its frame as they are typed, so a letter and Back find them there', async () => {
    await install();
    vi.useFakeTimers();
    try {
      const onReplaceTop = vi.fn();
      render(<AudioSongsScreen route={[{ k: 'hub' }]} onPush={vi.fn()} onReplaceTop={onReplaceTop} onBack={vi.fn()} rootBackLabel="Home"
        onSearch={() => {}} onHistory={() => {}} onSettings={() => {}} theme="dark" onThemeChange={() => {}} />);
      fireEvent.change(screen.getByPlaceholderText('Find a song, a letter, or a maker'), { target: { value: 'consider my love' } });
      act(() => { vi.advanceTimersByTime(600); });
      expect(onReplaceTop).toHaveBeenLastCalledWith({ k: 'hub', q: 'consider my love' });
    } finally { vi.useRealTimers(); }
  });
});
