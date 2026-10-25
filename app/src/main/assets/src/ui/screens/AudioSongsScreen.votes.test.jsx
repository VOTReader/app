// @ts-nocheck -- classic-global screen contract is isolated here.
/* sy4-3 (Corbin 2026-10-22; pictures calls/song-voting-mockups 01-04): the Songs hub's Popular / All-time loved /
   New shelves from votes.json, the empty Popular card, and the See all page with three tabs. A family shows once;
   no numbers but "N versions". */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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
import { SongVotes, _resetSongVotesForTests } from '../../utils/song-votes.js';
import { bigSongCatalog } from '../../utils/song-catalog.fixture.js';

const BIG = bigSongCatalog(12);
// Family 0 has three versions; its third is the one listeners like.
const extra = ['aa0000000001', 'aa0000000002'].map((id, i) => ({ ...BIG.songs[0], id, v: 'Take ' + (i + 2) }));
BIG.songs.push(...extra);
const ids = BIG.songs.map((s) => s.id);

function installGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ backLabel }) => <nav>{backLabel}</nav>;
  globalThis.useModalRegistry = () => {};
  globalThis.useFocusTrap = () => null;
  Object.assign(globalThis, Shelf, Parts, KeepParts, { SongKeep, formatSongBytes });
  globalThis.AudioPlayer = player;
  globalThis.SongCatalog = SongCatalog;
  globalThis.SongVotes = SongVotes;
  globalThis.COL_BY_KEY = new Map([['wtlb1', { label: 'Words to Live By, Part One', volKey: 'wtlb1' }]]);
  globalThis.colLetterArr = () => [];
  globalThis.AudioLibraryStore = { subscribe: () => () => {}, getVersion: () => 0, songSaved: () => [], songRecent: () => [], saved: () => [], recent: () => [] };
}

async function tally(body) {
  globalThis.fetch = vi.fn(async () => (body ? { status: 200, ok: true, text: async () => JSON.stringify(body) } : { status: 404, ok: false }));
  await act(async () => { await SongVotes.loadTally(); });
}

function renderScreen(route) {
  const props = {
    route, onPush: vi.fn(), onReplaceTop: vi.fn(), onBack: vi.fn(), rootBackLabel: 'Home',
    onSearch: () => {}, onHistory: () => {}, onSettings: () => {}, theme: 'dark', onThemeChange: () => {},
  };
  render(<AudioSongsScreen {...props} />);
  return props;
}

const section = (name) => screen.getByRole('heading', { name }).closest('section');

beforeEach(() => {
  _resetSongCatalogForTests();
  _resetSongVotesForTests();
  adoptSongCatalog(BIG);
  installGlobals();
  player.playSongs.mockClear();
  const data = new Map();
  globalThis.IDBAdapter = { get: async (_s, k) => data.get(k), put: async (_s, k, v) => { data.set(k, v); } };
});
afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'LibraryNav', 'useModalRegistry', 'useFocusTrap', 'AudioPlayer', 'SongCatalog', 'SongVotes', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore', 'IDBAdapter', 'fetch']) delete globalThis[key];
  _resetSongCatalogForTests();
  _resetSongVotesForTests();
});

describe('the hub shelves', () => {
  it('Popular, All-time loved and New, three tiles each, a family once with "N versions"', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [extra[1], ids[3], ids[4], ids[5]].map((x) => x.id || x), loved: [ids[6], ids[7], ids[8], ids[9]] });
    renderScreen([{ k: 'hub' }]);
    const pop = section('Popular');
    expect(within(pop).getByText('Loved lately')).toBeTruthy();
    const tiles = pop.querySelectorAll('.songs-top-tile');
    expect(tiles.length).toBe(3);
    expect(tiles[0].textContent).toContain('3 versions');
    expect(within(section('All-time loved')).getAllByRole('button', { name: /^Play / }).length).toBe(3);
    expect(section('New from the flock').querySelectorAll('.songs-top-tile').length).toBe(3);
    // No numbers on tiles but the versions line.
    for (const t of pop.querySelectorAll('.songs-top-tile')) expect(t.textContent.replace(/\d+ versions/, '').replace(/Number \d+/, '')).not.toMatch(/\d/);
  });

  it('a tile plays its shelf from that song (the family\'s ranked version)', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [extra[1].id, ids[3]], loved: [] });
    renderScreen([{ k: 'hub' }]);
    fireEvent.click(section('Popular').querySelector('.songs-top-tile'));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: [extra[1].id, ids[3]], startId: extra[1].id }));
  });

  it('no votes yet (votes.json 404): the calm card points to New, no See all, no All-time loved', async () => {
    await tally(null);
    const props = renderScreen([{ k: 'hub' }]);
    const pop = section('Popular');
    expect(within(pop).getByText('Popular fills in as listeners like songs.')).toBeTruthy();
    expect(within(pop).queryByRole('button', { name: /See all/ })).toBe(null);
    expect(screen.queryByRole('heading', { name: 'All-time loved' })).toBe(null);
    fireEvent.click(within(pop).getByRole('button', { name: /Start with New/ }));
    expect(props.onPush).toHaveBeenCalledWith({ k: 'list', v: 'top:new' });
  });

  it('All-time loved stays hidden while it is too thin', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [ids[1]], loved: [ids[2], ids[3]] });
    renderScreen([{ k: 'hub' }]);
    expect(screen.queryByRole('heading', { name: 'All-time loved' })).toBe(null);
    expect(section('Popular').querySelectorAll('.songs-top-tile').length).toBe(1);
  });

  it('See all opens the one page on its tab', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [ids[1]], loved: [] });
    const props = renderScreen([{ k: 'hub' }]);
    fireEvent.click(screen.getByRole('button', { name: 'See all popular songs' }));
    expect(props.onPush).toHaveBeenCalledWith({ k: 'list', v: 'top:popular' });
  });
});

describe('See all: one page, three tabs', () => {
  it('Popular tab lists the ranked songs with its line; a family shows once with its versions link', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [extra[1].id, ids[0], ids[3]], loved: [] });
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'top:popular' }]);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Popular', 'All-time loved', 'New']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Songs listeners have loved lately')).toBeTruthy();
    const rows = document.querySelectorAll('.songs-top-list .songs-row');
    expect(rows.length).toBe(2);   // ids[0] is the same family as extra[1]
    expect(rows[0].textContent).toContain('3 versions');
  });

  it('a tab replaces the page in place', async () => {
    await tally({ v: 1, min: 3, songs: {}, popular: [ids[1]], loved: [] });
    const props = renderScreen([{ k: 'hub' }, { k: 'list', v: 'top:popular' }]);
    fireEvent.click(screen.getByRole('tab', { name: 'New' }));
    expect(props.onReplaceTop).toHaveBeenCalledWith({ k: 'list', v: 'top:new' });
  });

  it('New lists the newest songs first; empty Popular says so', async () => {
    await tally(null);
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'top:new' }]);
    expect(screen.getByText('Newest songs first')).toBeTruthy();
    expect(document.querySelectorAll('.songs-top-list .songs-row').length).toBeGreaterThan(0);
    cleanup();
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'top:loved' }]);
    expect(screen.getByText('Songs listeners have loved most')).toBeTruthy();
    expect(screen.getByText('Popular fills in as listeners like songs.')).toBeTruthy();
  });
});

describe('Liked Songs (so-liked, Corbin 10-24)', () => {
  it('hidden while nothing is liked', async () => {
    await tally(null);
    await act(async () => { await SongVotes.load(); });
    renderScreen([{ k: 'hub' }]);
    expect(screen.queryByRole('heading', { name: 'Liked Songs' })).toBeNull();
  });

  it('a shelf of the likes of this listener, newest like first, that plays from the tapped song; See all opens the list', async () => {
    await tally(null);
    await act(async () => { await SongVotes.load(); });
    act(() => { SongVotes.setVote(ids[2], 1, 1000); SongVotes.setVote(ids[5], 1, 3000); SongVotes.setVote(ids[7], 1, 2000); SongVotes.setVote(ids[8], 1, 500); });
    const props = renderScreen([{ k: 'hub' }]);
    const shelf = section('Liked Songs');
    const tiles = shelf.querySelectorAll('.songs-top-tile');
    expect(tiles.length).toBe(3);
    expect(tiles[0].textContent).toContain(BIG.songs[5].t);
    expect(tiles[1].textContent).toContain(BIG.songs[7].t);
    fireEvent.click(tiles[1]);
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: [ids[5], ids[7], ids[2], ids[8]], startId: ids[7], label: 'Liked Songs' }));
    fireEvent.click(within(shelf).getByRole('button', { name: 'See all liked songs' }));
    expect(props.onPush).toHaveBeenCalledWith({ k: 'list', v: 'liked' });
  });

  it('the full list scrolls every like and has Play all', async () => {
    await tally(null);
    await act(async () => { await SongVotes.load(); });
    act(() => { for (let i = 0; i < 6; i++) SongVotes.setVote(ids[i + 1], 1, 1000 + i); });
    renderScreen([{ k: 'hub' }, { k: 'list', v: 'liked' }]);
    expect(screen.getByRole('heading', { name: 'Liked Songs' })).toBeTruthy();
    expect(document.querySelectorAll('.songs-list .songs-row').length).toBe(6);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ ids: [6, 5, 4, 3, 2, 1].map((i) => ids[i]), label: 'Liked Songs' }));
  });
});
