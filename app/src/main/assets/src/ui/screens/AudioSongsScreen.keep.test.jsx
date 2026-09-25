// @ts-nocheck -- classic-global screen contract is isolated here.
/* Songs of the Letters -- Keep on this phone (K1) on the Songs screens: the song page's
   card in its three states, Keep all on a list, the hub's Kept row, the Kept list with
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
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
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

describe('Keep on this phone -- the song page card (r2-more-screens, third panel)', () => {
  it('offers the whole family with its catalog size, then says Keeping 1 of 2 with a bar and Cancel', async () => {
    await install();
    // A download that waits until it is cancelled, as fetch does with an abort signal.
    globalThis.fetch = vi.fn((_url, opts) => new Promise((_ok, fail) => {
      opts.signal.addEventListener('abort', () => fail(new DOMException('cancelled', 'AbortError')));
    }));
    renderScreen([{ k: 'song', v: 'fam-a' }]);
    expect(screen.getByRole('heading', { name: 'Keep for offline listening' })).toBeTruthy();
    expect(screen.getByText('Keep all 2 versions on your phone to listen without internet.')).toBeTruthy();
    const go = screen.getByRole('button', { name: 'Keep · 6 MB' });   // 2 x 3,000,000 bytes, from the catalog
    await act(async () => { fireEvent.click(go); });
    expect(screen.getByRole('heading', { name: 'Keeping…' })).toBeTruthy();
    expect(screen.getByText('Keeping 1 of 2…')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    expect(screen.getByRole('heading', { name: 'Keep for offline listening' })).toBeTruthy();
  });

  it('a family all on the phone reads Available offline, On this phone, with its size', async () => {
    await install({ kept: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2'] });
    renderScreen([{ k: 'song', v: 'fam-a' }]);
    expect(screen.getByRole('heading', { name: 'Available offline' })).toBeTruthy();
    expect(screen.getByText('On this phone')).toBeTruthy();
    expect(screen.getByText('2 versions · 6 MB')).toBeTruthy();
  });

  it('refuses early, in words, when the phone lacks the room', async () => {
    await install();
    Object.defineProperty(window.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 4e6, usage: 0 }), persist: async () => true } });
    globalThis.fetch = vi.fn();
    renderScreen([{ k: 'song', v: 'fam-a' }]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep · 6 MB' })); });
    expect(screen.getByRole('status').textContent).toBe('Not enough room: needs 6 MB, 4 MB free.');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('an iPhone in a Safari tab is told to add the app to its Home Screen', async () => {
    await install();
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: false });
    try {
      renderScreen([{ k: 'song', v: 'fam-a' }]);
      expect(screen.getByText('Add VOTReader to your Home Screen to keep songs.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Keep ·/ })).toBeNull();
    } finally { delete window.navigator.standalone; }
  });
});

describe('Keep on this phone -- lists, the hub row and the Kept list', () => {
  it('a collection offers Keep all N with the size of every version', async () => {
    await install();
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    expect(screen.getByRole('button', { name: 'Keep all 2 · 6 MB' })).toBeTruthy();
  });

  it('the hub counts the kept songs and their size in Your songs, and opens the Kept list', async () => {
    await install({ kept: ['aaaaaaaaaaa1'] });
    const onPush = vi.fn();
    renderScreen([{ k: 'hub' }], onPush);
    const row = screen.getByRole('button', { name: /Kept on this phone/ });
    expect(row.textContent).toContain('1 · 3 MB');
    fireEvent.click(row);
    expect(onPush).toHaveBeenCalledWith({ k: 'list', v: 'kept' });
  });

  it('the Kept list plays its songs, removes one, and Remove all asks first', async () => {
    await install({ kept: ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kept on this phone');
    expect(document.querySelectorAll('.songs-row')).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Lead Me To That Place from this phone' })); });
    expect(store.map.has('bbbbbbbbbbb1')).toBe(false);
    expect(library.kept).toEqual(['aaaaaaaaaaa1']);
    expect(document.querySelectorAll('.songs-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all from this phone' }));
    const strip = screen.getByRole('group', { name: 'Remove all kept songs' });
    expect(strip.textContent).toContain('Remove all 1 song (3 MB) from this phone?');
    await act(async () => { fireEvent.click(within(strip).getByRole('button', { name: 'Yes, remove all' })); });
    expect(store.map.size).toBe(0);
    expect(screen.getByText(/Songs you keep play here with no signal/)).toBeTruthy();
  });

  it('after a restore, the list offers Download your N songs again (X MB)', async () => {
    await install({ kept: [], listed: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    expect(screen.getByRole('button', { name: 'Download your 2 songs again (6 MB)' })).toBeTruthy();
  });
});

/* K3 (Songs walk W2, 2026-09-25): which rows are on the phone, a Remove on a kept song's page, the Remove all
   strip in the app's own confirm grammar, and the hub's Find words kept in its frame. */
describe('K3 -- kept rows, Remove on the page, the Remove all strip, Find kept', () => {
  it('(W2-02) a kept song\'s row carries a quiet On this phone mark; the others do not', async () => {
    await install({ kept: ['aaaaaaaaaaa1'] });
    library.songRecent = () => ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'];
    renderScreen([{ k: 'list', v: 'recent' }]);
    const rows = [...document.querySelectorAll('.songs-row')];
    const byTitle = (t) => rows.find((r) => r.querySelector('strong').textContent === t);
    const mark = byTitle('Come, Love Awaits You').querySelector('.songs-row-kept');
    expect(mark).not.toBeNull();
    expect(mark.textContent).toContain('On this phone');
    expect(byTitle('Lead Me To That Place').querySelector('.songs-row-kept')).toBeNull();
  });

  it('(W2-06) a kept song\'s page card has a quiet Remove that takes it off the phone', async () => {
    await install({ kept: ['bbbbbbbbbbb1'] });
    renderScreen([{ k: 'song', v: 'fam-b' }]);
    expect(screen.getByRole('heading', { name: 'Available offline' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Lead Me To That Place from this phone' })); });
    expect(store.map.has('bbbbbbbbbbb1')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Keep for offline listening' })).toBeTruthy();
  });

  it('(W2-05) Remove all asks in the Downloads screen\'s strip: Keep them, Yes, remove all', async () => {
    await install({ kept: ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'] });
    renderScreen([{ k: 'list', v: 'kept' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all from this phone' }));
    const strip = screen.getByRole('group', { name: 'Remove all kept songs' });
    expect(strip.className).toContain('offline-confirm');
    expect(within(strip).getByRole('button', { name: 'Keep them' }).className).toBe('offline-confirm-cancel');
    const go = within(strip).getByRole('button', { name: 'Yes, remove all' });
    expect(go.className).toBe('offline-confirm-go');
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
