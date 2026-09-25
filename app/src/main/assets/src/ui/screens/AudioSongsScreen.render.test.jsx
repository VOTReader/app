// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/* n3-04 (sweep 2): the Songs screens subscribed to every player notify, and the
   player notifies once a second while anything plays, so the hub and a list of up
   to 907 rows re-rendered every second. Here the fake player is LIVE: subscribe
   keeps its listeners and a clock tick bumps the version, as the real one does. */
const { player, setPlayerState, tick } = vi.hoisted(() => {
  let playerState;
  let version = 0;
  const listeners = new Set();
  const notify = () => { version++; for (const cb of [...listeners]) cb(); };
  const player = {
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => version,
    getState: () => playerState,
    toggle: vi.fn(),
    playSongs: vi.fn(() => true),
    playLetter: vi.fn(),
  };
  return {
    player,
    setPlayerState: (next, { silent = false } = {}) => { playerState = next; if (!silent) notify(); },
    tick: () => { playerState = { ...playerState, time: playerState.time + 1 }; notify(); },
  };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioSongsScreen } from './AudioSongsScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as Parts from '../components/SongParts.jsx';
import * as KeepParts from '../components/SongKeepParts.jsx';
import { SongKeep, formatSongBytes } from '../../utils/song-keep.js';
import { SongCatalog, adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { bigSongCatalog } from '../../utils/song-catalog.fixture.js';

let rowRenders = 0;

function installGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ backLabel }) => <nav>{backLabel}</nav>;
  globalThis.useModalRegistry = () => {};
  globalThis.useFocusTrap = () => null;
  Object.assign(globalThis, Shelf, Parts, KeepParts, { SongKeep, formatSongBytes });
  // Count every row the screen draws.
  globalThis.SongListRow = (props) => { rowRenders++; return Parts.SongListRow(props); };
  globalThis.AudioPlayer = player;
  globalThis.SongCatalog = SongCatalog;
  globalThis.COL_BY_KEY = new Map([['wtlb1', { label: 'Words to Live By, Part One', volKey: 'wtlb1' }]]);
  globalThis.colLetterArr = () => [];
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    songSaved: () => [], songRecent: () => [], saved: () => [], recent: () => [],
  };
}

function renderScreen(route) {
  let commits = 0;
  const props = {
    route, onPush: vi.fn(), onReplaceTop: vi.fn(), onBack: vi.fn(), rootBackLabel: 'Home',
    onSearch: () => {}, onHistory: () => {}, onSettings: () => {}, theme: 'dark', onThemeChange: () => {},
  };
  render(<React.Profiler id="songs" onRender={() => { commits++; }}><AudioSongsScreen {...props} /></React.Profiler>);
  return { commits: () => commits };
}

const BIG = bigSongCatalog(300);
const firstId = BIG.songs[0].id;
const secondId = BIG.songs[1].id;
const playing = (id, status = 'playing') => ({ queue: [{ key: 'song:' + id, url: 'x' }], qi: 0, status, time: 3, duration: 100 });

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(BIG);
  setPlayerState(playing(firstId), { silent: true });
  rowRenders = 0;
  installGlobals();
});

afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'LibraryNav', 'useModalRegistry', 'useFocusTrap', 'AudioPlayer', 'SongCatalog', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore', 'SongListRow']) delete globalThis[key];
  _resetSongCatalogForTests();
});

describe('AudioSongsScreen -- (n3-04) the player clock does not redraw the songs screens', () => {
  it('a long list stays still while the playing song\'s clock ticks', () => {
    const { commits } = renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    expect(document.querySelectorAll('.songs-row').length).toBe(300);
    const before = commits();
    act(() => { for (let i = 0; i < 5; i++) tick(); });
    expect(commits()).toBe(before);
  });

  it('the hub stays still while the clock ticks', () => {
    const { commits } = renderScreen([{ k: 'hub' }]);
    const before = commits();
    act(() => { for (let i = 0; i < 5; i++) tick(); });
    expect(commits()).toBe(before);
  });

  it('a pause redraws only the playing row, and its button says Play', () => {
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    const current = () => document.querySelector('.songs-row.is-current');
    expect(current().querySelector('.song-play').className).toContain('is-playing');
    rowRenders = 0;
    act(() => setPlayerState(playing(firstId, 'paused')));
    expect(current().querySelector('.song-play').className).not.toContain('is-playing');
    expect(rowRenders).toBe(1);
  });

  it('the next song moves the current mark, redrawing just the two rows', () => {
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    rowRenders = 0;
    act(() => setPlayerState(playing(secondId)));
    const rows = [...document.querySelectorAll('.songs-row.is-current')];
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('strong').textContent).toBe(BIG.families.find((f) => f.id === BIG.songs[1].f).t);
    expect(rowRenders).toBe(2);
  });

  it('a row\'s tap plays the list as it is now, not as it was when the row last drew', () => {
    renderScreen([{ k: 'list', v: 'col:wtlb1' }]);
    act(() => setPlayerState(playing(secondId, 'paused')));
    player.playSongs.mockClear();
    const last = [...document.querySelectorAll('.songs-row')].pop();
    act(() => { last.querySelector('.song-play').click(); });
    expect(player.playSongs).toHaveBeenCalledTimes(1);
    expect(player.playSongs.mock.calls[0][0].ids.length).toBe(300);
  });
});

describe('AudioSongsScreen -- (n3-04) long lists skip the rows off screen', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../app.css'), 'utf8');
  it('a list row outside a card is content-visibility:auto with a remembered height, whole focus rings, and none while scroll restores', () => {
    const rule = css.match(/\.songs-list:not\(\.songs-card\) > \.songs-row \{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/content-visibility:auto/);
    expect(rule[1]).toMatch(/contain-intrinsic-size:auto \d+px/);
    expect(rule[1]).toMatch(/overflow-clip-margin:1\dpx/);
    expect(css).toMatch(/body\.scroll-restoring \.songs-list > \.songs-row \{ content-visibility: ?visible; \}/);
  });
});
