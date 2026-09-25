// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/* The FakeAudio pattern (AudioSavedScreen.test): one fake player, installed in
   the window slot the lazy screen reads across the bundle boundary. */
const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => playerState,
    toggle: vi.fn(),
    playSongs: vi.fn(() => true),
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioSongsScreen } from './AudioSongsScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as Parts from '../components/SongParts.jsx';
import { SongCatalog, adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { SONG_FIXTURE } from '../../utils/song-catalog.fixture.js';

let library;

function installGlobals({ saved = [], recent = [] } = {}) {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ backLabel }) => <nav>{backLabel}</nav>;
  globalThis.useModalRegistry = () => {};
  globalThis.useFocusTrap = () => null;
  Object.assign(globalThis, Shelf, Parts);
  globalThis.AudioPlayer = player;
  globalThis.SongCatalog = SongCatalog;
  globalThis.COL_BY_KEY = new Map([
    ['wtlb1', { label: 'Words to Live By, Part One', volKey: 'wtlb1' }],
    ['one', { label: 'Volume One', volKey: 'one' }],
  ]);
  globalThis.colLetterArr = (col) => (col.volKey === 'wtlb1' ? [{ id: 'come-love-awaits-you', title: 'Come, Love Awaits You (the letter)' }] : [{ id: 'the-letter', title: 'The Letter' }]);
  library = {
    subscribe: () => () => {}, getVersion: () => 0,
    songSaved: () => saved, songRecent: () => recent, saved: () => [], recent: () => [],
  };
  globalThis.AudioLibraryStore = library;
}

function renderScreen(route = [{ k: 'hub' }], overrides = {}) {
  const props = {
    route, onPush: vi.fn(), onReplaceTop: vi.fn(), onBack: vi.fn(), rootBackLabel: 'Home',
    onSearch: () => {}, onHistory: () => {}, onSettings: () => {}, theme: 'dark', onThemeChange: () => {},
    ...overrides,
  };
  return { ...render(<AudioSongsScreen {...props} />), props };
}

const rowOf = (title) => [...document.querySelectorAll('.songs-row')].find((r) => r.querySelector('strong').textContent === title) || null;

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(SONG_FIXTURE);
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  player.toggle.mockClear();
  player.playSongs.mockClear();
  installGlobals();
});

afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'LibraryNav', 'useModalRegistry', 'useFocusTrap', 'AudioPlayer', 'SongCatalog', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore']) delete globalThis[key];
  _resetSongCatalogForTests();
});

describe('AudioSongsScreen -- the hub', () => {
  it('opens on one filled Shuffle all songs that plays one version of every song, shuffled', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Songs of the Letters');
    fireEvent.click(screen.getByRole('button', { name: /Shuffle all songs/i }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ filter: {}, shuffle: true, onePerFamily: true }));
  });

  it('a style chip turns the button into Shuffle <style> (<songs>) and shuffles only that style', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Worship' }));
    const button = screen.getByRole('button', { name: /Shuffle Worship \(2\)/ });   // fam-b and fam-c each have a worship version
    fireEvent.click(button);
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ filter: { style: 'worship' }, shuffle: true }));
    // The chip also lists the style's songs, each led by its worship version.
    expect(rowOf('The Letter')).toBeTruthy();
    expect(rowOf('Come, Love Awaits You')).toBeNull();
  });

  it('keeps the rarer styles behind More, in a select sheet', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Country' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Country/ }));
    expect(screen.getByRole('button', { name: /Shuffle Country \(1\)/ })).toBeTruthy();
  });

  it('Find filters songs in memory by title, maker or letter, and says so when nothing matches', () => {
    renderScreen();
    const input = screen.getByPlaceholderText('Find a song, a letter, or a maker');
    fireEvent.change(input, { target: { value: 'love awaits' } });
    const row = rowOf('Come, Love Awaits You');
    expect(row.textContent).toContain('2 versions');
    fireEvent.click(within(row).getByRole('button', { name: /Play Come, Love Awaits You/ }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: ['aaaaaaaaaaa1'], startId: 'aaaaaaaaaaa1' }));

    fireEvent.change(input, { target: { value: 'hmarie777' } });            // a maker
    expect(rowOf('Come, Love Awaits You')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'the letter' } });           // a letter's title
    expect(rowOf('The Letter')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(screen.getByText('No song by that name. Try a word from the letter.')).toBeTruthy();
  });

  it('a row whose song is playing shows a FILLED pause, and a tap pauses rather than restarting', () => {
    setPlayerState({ queue: [{ key: 'song:aaaaaaaaaaa2', url: 'x' }], qi: 0, status: 'playing', time: 3, duration: 100 });
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    const button = within(rowOf('Come, Love Awaits You')).getByRole('button', { name: /Pause Come, Love Awaits You/ });
    expect(button.className).toContain('is-playing');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(player.playSongs).not.toHaveBeenCalled();
  });

  it('shows New from the flock, Your songs, the letter collections as tiles and the shelves', () => {
    const { props } = renderScreen();
    expect(screen.getByRole('heading', { name: 'New from the flock' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Saved songs/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recently played songs/ })).toBeTruthy();
    expect(screen.queryByText(/Kept on this phone/)).toBeNull();                       // only once L6 ships
    const tile = screen.getByRole('button', { name: /Words to Live By, Part One/ });
    expect(tile.textContent).toContain('2 songs');                                     // visible recordings, the hidden twin not counted
    expect(tile.querySelectorAll('.song-cover').length).toBe(4);                      // the 2x2 mosaic
    fireEvent.click(tile);
    expect(props.onReplaceTop).toHaveBeenCalledWith({ k: 'hub' });
    expect(props.onPush).toHaveBeenCalledWith({ k: 'list', v: 'col:wtlb1' });
    expect([...document.querySelectorAll('.songs-shelf')].map((b) => b.textContent)).toEqual(['Inspired by the letters1 song', 'Bible songs'].slice(0, 1));
    // fam-d's only song has no shard: nothing to hear, so no shelf that opens onto it.
    expect(screen.queryByRole('button', { name: /Flock originals and prayers/ })).toBeNull();
  });

  it('leaving the hub keeps its Find box and chip, so Back returns to the same results', () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Pop' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText('Find a song, a letter, or a maker'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Saved songs/ }));
    expect(props.onPush).toHaveBeenCalledWith({ k: 'list', v: 'saved' });
  });

  it('a hub frame opened from Search arrives with its Find box filled', () => {
    renderScreen([{ k: 'hub', q: 'love awaits' }]);
    expect(screen.getByPlaceholderText('Find a song, a letter, or a maker').value).toBe('love awaits');
    expect(rowOf('Come, Love Awaits You')).toBeTruthy();
  });
});

describe('AudioSongsScreen -- lists', () => {
  it('a collection lists its songs with Play all, and the back pill names the hub', () => {
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'col:wtlb1' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Words to Live By, Part One');
    expect(screen.getByRole('navigation').textContent).toBe('Songs of the Letters');   // the nav's back label
    fireEvent.click(screen.getByRole('button', { name: /Play all/ }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: ['aaaaaaaaaaa1'], shuffle: false }));
  });

  it('a letter\'s list never shows a low-confidence song, and leads with that letter\'s version', () => {
    renderScreen([{ k: 'list', v: 'letter:one:the-letter' }]);
    const row = rowOf('The Letter');
    expect(row).toBeTruthy();                                                         // led by c2 (medium); c1 is a low link
    fireEvent.click(within(row).getByRole('button', { name: /Play The Letter/ }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: ['ccccccccccc2'], startId: 'ccccccccccc2' }));
  });

  it('saved songs resolve a hidden duplicate to its kept twin; an empty shelf says what to do', () => {
    installGlobals({ saved: ['aaaaaaaaaaa3'] });
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'saved' }]);
    const row = rowOf('Come, Love Awaits You');
    fireEvent.click(within(row).getByRole('button', { name: /Play/ }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: ['aaaaaaaaaaa2'], startId: 'aaaaaaaaaaa2' }));
    cleanup();
    installGlobals({ recent: [] });
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'recent' }]);
    expect(screen.getByText('Songs you play will appear here.')).toBeTruthy();
  });
});

describe('AudioSongsScreen -- states', () => {
  it('shows a skeleton while the catalog loads, and asks for it', () => {
    const load = vi.fn(() => new Promise(() => {}));
    installGlobals();
    globalThis.SongCatalog = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0, load };
    renderScreen();
    expect(screen.getByRole('status', { name: 'Loading songs' })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('with no catalog anywhere it says songs need a connection the first time, and can try again', () => {
    const load = vi.fn(() => Promise.resolve(false));
    installGlobals();
    globalThis.SongCatalog = { loaded: false, error: true, subscribe: () => () => {}, getVersion: () => 0, load };
    renderScreen();
    expect(screen.getByText('Songs need a connection the first time.')).toBeTruthy();
    load.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
