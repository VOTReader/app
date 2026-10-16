// @ts-nocheck — main's song catalog fixture and bundle-d's globals, installed by hand.
/* v2's Songs of the Letters (zones v2p6; design dz14 pictures 6d-songs, 6e-song-page), over main's real catalog code
   (utils/song-catalog.js adopting its test fixture) and main's SongParts helpers as bundle-d publishes them: the views
   (hub, lists, a song), the keep row's states, the three pages on a real boot (what each control plays, opens or keeps)
   and the two pinned gate pictures. Setup as main's ui/screens/AudioSongsScreen.test.jsx. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { V2App } from './App.jsx';
import { defineStart } from './places.js';
import { GATE_STATES } from './gate.js';
import { SongsScreen, SongScreen } from './screens/SongsScreens.jsx';
import {
  hubView, listView, listTitle, songView, keepRow, readingLetters, versionLabels, makersLine, songClock, songCountLabel,
  thumbUrl, styleChips, newestSongs, songsOfIds,
} from './songs-facts.js';
import * as Parts from '../ui/components/SongParts.jsx';
import { SongCatalog, adoptSongCatalog, _resetSongCatalogForTests } from '../utils/song-catalog.js';
import { SONG_FIXTURE } from '../utils/song-catalog.fixture.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const button = (root, name) => [...root.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) || null;

/* Main's fixture plus one family made from the same letter that does not sing its words (fam-e), so a letter has two
   songs and the verbatim gate has something to leave out. */
const LOVE = 'wtlb1:come-love-awaits-you';
const CATALOG = {
  ...SONG_FIXTURE,
  songs: SONG_FIXTURE.songs.concat([{
    id: 'eeeeeeeeeee1', t: 'Love Awaits', f: 'fam-e', v: 'Folk', st: ['folk'], dl: 'sung', lang: 'en', src: { k: 'letter', id: LOVE, c: 'h' },
    d: 240, b: 3000000, sh: 1, cr: 'psalmist', lyr: 0, rd: null, fs: '2025-09-20', hid: false, dup: null, vb: 0.2, vs: false,
  }]),
  styles: { ...SONG_FIXTURE.styles, folk: 'Folk' },
  families: SONG_FIXTURE.families.concat([{ id: 'fam-e', t: 'Love Awaits', feat: 'eeeeeeeeeee1', n: 1, col: 'wtlb1', src: { k: 'letter', id: LOVE, c: 'h' }, lb: 'inspired' }]),
};

let playerState = { queue: [], qi: 0, status: 'idle' };
const player = {
  subscribe: () => () => {}, getVersion: () => 0, getState: () => playerState,
  toggle: vi.fn(), playSongs: vi.fn(() => true), playLetter: vi.fn(),
};
/** The player holds this song (or reading), playing or paused. */
function holding(key, status = 'playing') { playerState = { queue: [{ key }], qi: 0, status }; }

let library;
let keep;
/** main's bundle-d globals the pages read */
function install({ saved = [], recent = [], kept = [], missing = [], progress = null, availability = 'ok' } = {}) {
  g.ReactDOM = ReactDOM;
  Object.assign(g, Parts);
  g.AudioPlayer = player;
  g.SongCatalog = SongCatalog;
  g.COL_BY_KEY = new Map([
    ['wtlb1', { label: 'Words to Live By, Part One', volKey: 'wtlb1' }],
    ['one', { label: 'Volume One', volKey: 'one' }],
    ['blessed', { label: 'The Blessed', volKey: 'blessed' }],
  ]);
  g.colLetterArr = (col) => ({
    wtlb1: [{ id: 'come-love-awaits-you', num: 7, title: 'Come, Love Awaits You (the letter)' }],
    one: [{ id: 'the-letter', num: 1, title: 'The Letter' }],
    blessed: [{ id: 'blessed-are-those-who-worship-me', num: 3, title: 'Blessed Are Those Who Worship Me' }],
  }[col.volKey] || []);
  library = {
    subscribe: () => () => {}, getVersion: () => 0,
    songSaved: () => saved, songRecent: () => recent,
    isSongSaved: (id) => saved.indexOf(id) >= 0, toggleSongSaved: vi.fn(),
  };
  g.AudioLibraryStore = library;
  keep = {
    subscribe: () => () => {}, getVersion: () => 0,
    availability: () => availability,
    progressOf: vi.fn((ids) => progress || { total: ids.length, kept: 0, busy: 0, failed: 0, bytes: ids.length * 3e6, needBytes: ids.length * 3e6 }),
    keep: vi.fn(), cancel: vi.fn(), remove: vi.fn(), removeAll: vi.fn(() => Promise.resolve()),
    keptIds: () => kept, missing: () => missing, bytesOf: (ids) => ids.length * 3e6, isKept: (id) => kept.indexOf(id) >= 0,
    waiting: () => false,
  };
  g.SongKeep = keep;
}

/** A Songs page on a real boot, with its place props. */
function page(Screen, route, more = {}) {
  const props = { route, gate: null, go: vi.fn(), replace: vi.fn(), desktop: false, device: 'phone', onReady: vi.fn(), ...more };
  return { ...render(<Screen {...props} />), props };
}

/** @type {Array<() => void>} */
const undo = [];

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(CATALOG);
  playerState = { queue: [], qi: 0, status: 'idle' };
  player.toggle.mockClear(); player.playSongs.mockClear(); player.playLetter.mockClear();
});

afterEach(() => {
  cleanup();
  for (const k of ['ReactDOM', 'AudioPlayer', 'SongCatalog', 'COL_BY_KEY', 'colLetterArr', 'AudioLibraryStore', 'SongKeep', 'NetStatus',
    'loadSongLyrics', ...Object.keys(Parts)]) delete g[k];
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  _resetSongCatalogForTests();
  vi.restoreAllMocks();
});

describe('the views (songs-facts.js over main\'s catalog)', () => {
  it('the hub: main\'s first styles the catalog has, the rest by size; the newest one per family; tiles biggest first; shelves; readings', () => {
    install({ saved: ['aaaaaaaaaaa3', 'bbbbbbbbbbb1', 'nope'], recent: ['ccccccccccc1'] });
    const v = hubView(SongCatalog, { library });
    expect(v.chips.primary).toEqual([{ key: 'worship', label: 'Worship' }, { key: 'pop', label: 'Pop' }, { key: 'folk', label: 'Folk' }]);
    expect(v.chips.more.map((c) => [c.key, c.n])).toEqual([['country', 1], ['rock', 1], ['spoken', 1]]);
    // same first-seen day: the later catalog row is newer; one row per family (fam-a by its Pop version)
    expect(v.newest.map((r) => [r.id, r.fam])).toEqual([['ccccccccccc2', 'fam-c'], ['bbbbbbbbbbb1', 'fam-b'], ['aaaaaaaaaaa2', 'fam-a'], ['eeeeeeeeeee1', 'fam-e']]);
    expect(v.newest[0]).toMatchObject({ title: 'The Letter', len: '3:00', versions: 2, line: SongCatalog.songAlbumLabel(SongCatalog.songById('ccccccccccc2')) });
    expect(v.newest[3].line).toBe('psalmist');
    // a hidden duplicate counts as its twin; an id the catalog lacks counts nothing
    expect([v.saved, v.recent]).toEqual([2, 1]);
    expect(v.kept).toBe('0');
    expect(v.tiles).toEqual([
      { col: 'wtlb1', label: 'Words to Live By, Part One', n: '3 songs', covers: ['eeeeeeeeeee1', 'aaaaaaaaaaa1', '', ''] },
      { col: 'one', label: 'Volume One', n: '2 songs', covers: ['ccccccccccc2', '', '', ''] },
    ]);
    // originals has only an unhosted song: no shelf; bible and prayers are empty
    expect(v.shelves).toEqual([{ v: 'shelf:inspired', title: 'Inspired by the letters', n: '1 song' }]);
    expect(v.readings).toBe(1);
  });

  it('Kept on the hub: "n · size", "Download again" after a restore, none where songs cannot be kept', () => {
    install({ kept: ['ccccccccccc2', 'aaaaaaaaaaa1'] });
    expect(hubView(SongCatalog, {}).kept).toBe('2 · 5.7 MB');
    install({ missing: ['aaaaaaaaaaa1'] });
    expect(hubView(SongCatalog, {}).kept).toBe('Download again');
    install({ availability: 'none' });
    expect(hubView(SongCatalog, {}).kept).toBeNull();
  });

  it('a collection lists its families in reading order, counted as songs and versions; Play all plays one each, Keep keeps all', () => {
    install();
    const v = listView(SongCatalog, 'col:wtlb1');
    expect([v.eyebrow, v.title, v.line, v.families]).toEqual(['From the letters', 'Words to Live By, Part One', '2 songs · 3 versions · 10 min', true]);
    // one letter: the family first seen first
    expect(v.rows).toEqual([
      { id: 'eeeeeeeeeee1', fam: 'fam-e', title: 'Love Awaits', len: '4:00', versions: 1, line: 'psalmist' },
      { id: 'aaaaaaaaaaa1', fam: 'fam-a', title: 'Come, Love Awaits You', len: '3:00', versions: 2, line: '' },
    ]);
    expect(v.ids).toEqual(['eeeeeeeeeee1', 'aaaaaaaaaaa1']);
    expect(v.allIds).toEqual(['eeeeeeeeeee1', 'aaaaaaaaaaa1', 'aaaaaaaaaaa2']);
  });

  it('a letter\'s songs: "letter:" every song made from it, "sung:" only those that sing its words (the verbatim gate)', () => {
    install();
    const all = listView(SongCatalog, 'letter:' + LOVE);
    expect([all.eyebrow, all.title]).toEqual(['Songs from this letter', 'Come, Love Awaits You (the letter)']);
    expect(all.rows.map((r) => r.fam)).toEqual(['fam-a', 'fam-e']);
    const sung = listView(SongCatalog, 'sung:' + LOVE);
    expect(sung.rows.map((r) => [r.fam, r.id])).toEqual([['fam-a', 'aaaaaaaaaaa1']]);
    expect([sung.line, sung.allIds]).toEqual(['1 song · 2 versions · 6 min', ['aaaaaaaaaaa1', 'aaaaaaaaaaa2']]);
    expect(listTitle(SongCatalog, 'sung:' + LOVE)).toBe('Come, Love Awaits You (the letter)');
  });

  it('Saved, Recent, New and Kept list songs, not families; Kept says each version and size, and what the store holds', () => {
    install({ saved: ['aaaaaaaaaaa3'], kept: ['ccccccccccc2', 'aaaaaaaaaaa1'] });
    const saved = listView(SongCatalog, 'saved', { library });
    expect([saved.title, saved.families, saved.ids, saved.line]).toEqual(['Saved songs', false, ['aaaaaaaaaaa2'], '1 song · 3 min']);
    expect(listView(SongCatalog, 'recent', { library })).toMatchObject({ title: 'Recently played songs', rows: [], line: '', empty: 'Songs you play will appear here.' });
    expect(listView(SongCatalog, 'new').ids).toEqual(['ccccccccccc2', 'bbbbbbbbbbb1', 'aaaaaaaaaaa2', 'eeeeeeeeeee1']);
    const kept = listView(SongCatalog, 'kept', { keep });
    expect(kept.rows.map((r) => [r.title, r.line, r.len])).toEqual([['The Letter', 'Rock · 2.9 MB', ''], ['Come, Love Awaits You', 'Country · hmarie777 · 2.9 MB', '']]);
    expect(kept.line).toBe('2 songs · 5.7 MB · they play with no signal');
    expect(listView(SongCatalog, 'shelf:inspired')).toMatchObject({ eyebrow: 'Songs of the Letters', title: 'Inspired by the letters', ids: ['bbbbbbbbbbb1'] });
  });

  it('a song\'s page: its versions featured first, where it is from, who made it, its worded version and the letter\'s other songs', () => {
    install();
    const a = songView(SongCatalog, 'fam-a');
    expect(a).toMatchObject({
      fam: 'fam-a', title: 'Come, Love Awaits You', eyebrow: 'Song · 2 versions', lead: 'aaaaaaaaaaa1', from: 'From the letter:',
      letter: { key: LOVE, title: 'Come, Love Awaits You (the letter)', route: { place: 'letter', collection: 'wtlb1', n: 7 } },
      shelf: 'Words to Live By, Part One', makers: 'Made with Suno · by hmarie777 and others', worded: 'aaaaaaaaaaa1', instrumental: false,
      foot: 'Words from the letter “Come, Love Awaits You (the letter)” · lyrics transcribed', moreAll: 2,
    });
    expect(a.versions).toEqual([{ id: 'aaaaaaaaaaa1', label: 'Country · hmarie777', len: '3:00' }, { id: 'aaaaaaaaaaa2', label: 'Pop', len: '3:00' }]);
    expect(a.more.map((r) => r.fam)).toEqual(['fam-e']);
    // a song that does not sing the words is only "inspired by" its letter; one with no letter names its shelf
    expect(songView(SongCatalog, 'fam-e')).toMatchObject({ from: 'Inspired by the letter:', more: [{ fam: 'fam-a' }], worded: '', foot: 'Lyrics transcribed from the song' });
    expect(songView(SongCatalog, 'fam-b')).toMatchObject({ letter: null, shelf: 'Inspired by the letters', makers: 'Made with Suno · by members of the flock' });
    // a low-confidence link is never shown; the family's medium one is
    expect(songView(SongCatalog, 'fam-c')).toMatchObject({ lead: 'ccccccccccc2', letter: { key: 'one:the-letter', title: 'The Letter' } });
    expect(songView(SongCatalog, 'fam-d')).toBeNull();
    expect(songView(SongCatalog, 'no-such-song')).toBeNull();
  });

  it('the keep row: none, Safari, kept (Remove only on a song), keeping with Cancel, Wi-Fi, keep with its size, offline, failures', () => {
    const p = (o) => ({ total: 16, kept: 0, busy: 0, failed: 0, bytes: 37616949, needBytes: 37616949, ...o });
    const k = (o, more = {}) => keepRow({ avail: 'ok', p: p(o), unit: 'versions', online: true, waiting: false, ...more });
    expect(keepRow({ avail: 'none', p: p({}), unit: 'versions', online: true, waiting: false })).toBeNull();
    expect(k({ total: 0 })).toBeNull();
    expect(k({}, { avail: 'ios-tab' })).toMatchObject({ kind: 'ios', act: '' });
    expect(k({})).toEqual({ kind: 'keep', t: 'Keep for offline listening', s: 'All 16 versions · 35.9 MB', act: 'Keep', off: false, note: '' });
    expect(k({ kept: 16, bytes: 37616949 }, { canRemove: true })).toEqual({ kind: 'kept', t: 'Available offline', s: '16 versions · 35.9 MB', act: 'Remove' });
    expect([k({ kept: 16 }).act, k({ kept: 16 }, { unit: 'songs' }).s]).toEqual(['', '16 songs · 35.9 MB']);
    expect(k({ total: 1, kept: 1, bytes: 3021597 })).toMatchObject({ s: 'On this phone · 2.9 MB' });
    expect(k({ total: 1, kept: 1, bytes: 3021597 }, { device: 'computer' }).s).toBe('On this computer · 2.9 MB');
    expect(k({ kept: 3, busy: 13 })).toMatchObject({ kind: 'busy', t: 'Keeping…', s: 'Keeping 4 of 16…', act: 'Cancel', pct: 19 });
    expect(k({ busy: 16 }, { waiting: true })).toMatchObject({ t: 'Waiting for Wi-Fi', s: 'Waiting for Wi-Fi', pct: 4 });
    expect(k({ kept: 4, needBytes: 3e6 })).toMatchObject({ s: 'The other 12 versions · 2.9 MB' });
    expect(k({}, { online: false })).toMatchObject({ off: true, note: 'Needs a connection' });
    expect([k({ failed: 1 }).note, k({ failed: 2 }).note]).toEqual(['One did not keep. Try again.', '2 did not keep. Try again.']);
    expect(k({ total: 1, needBytes: 3e6 }, { unit: 'songs' }).s).toBe('This song · 2.9 MB');
  });

  it('letters read with music, in reading order; names, counts, clocks, covers', () => {
    install();
    expect(readingLetters(SongCatalog)).toEqual([{ key: 'blessed:blessed-are-those-who-worship-me', volKey: 'blessed', id: 'blessed-are-those-who-worship-me',
      title: 'Blessed Are Those Who Worship Me', colLabel: 'The Blessed', d: 195.8 }]);
    // a shipped reader-M recording counts too; a song collection is not a letter collection
    g.AUDIO_MANIFEST = { 'one:the-letter': [['x', 'M']], 'inspired:x': [['y', 'M']], 'one:other': [['z', 'B']] };
    undo.push(() => { delete g.AUDIO_MANIFEST; });
    expect(readingLetters(SongCatalog).map((r) => r.key)).toEqual(['one:the-letter', 'blessed:blessed-are-those-who-worship-me']);
    expect(versionLabels([{ v: 'Cinematic' }, { v: 'Folk' }, { v: 'Cinematic' }, { v: '' }])).toEqual(['Cinematic', 'Folk', 'Cinematic · 2', 'Version']);
    expect([makersLine([{ cr: 'a' }, { cr: 'b' }]), makersLine([{ cr: 'a' }, { cr: 'b' }, { cr: 'c' }])])
      .toEqual(['Made with Suno · by a and b', 'Made with Suno · by a and b, and others']);
    expect([songClock(201.2), songClock(3725), songCountLabel(1), songCountLabel(1082), songCountLabel(2, 'letter', 'letters')]).toEqual(['3:21', '1:02:05', '1 song', '1,082 songs', '2 letters']);
    expect([thumbUrl('fcac1412cff5'), thumbUrl('fcac1412cff5', 512), thumbUrl('../x')]).toEqual([
      'https://votreader.github.io/songs/thumbs/256/fcac1412cff5.webp', 'https://votreader.github.io/songs/thumbs/512/fcac1412cff5.webp', '']);
    expect(styleChips(SongCatalog).counts).toMatchObject({ worship: 2, pop: 2, folk: 1 });
    expect(newestSongs(SongCatalog, 1).map((s) => s.id)).toEqual(['ccccccccccc2']);
    expect(songsOfIds(SongCatalog, ['aaaaaaaaaaa3', 'aaaaaaaaaaa2']).map((s) => s.id)).toEqual(['aaaaaaaaaaa2']);
  });
});

describe('the hub (6d) on a real boot', () => {
  it('Shuffle all plays one version of every song; Your songs, the tiles, the shelves and the readings open their lists', async () => {
    install({ saved: ['bbbbbbbbbbb1'] });
    const { container, props } = page(SongsScreen, { place: 'songs' });
    await settle();
    expect(container.querySelector('h1').textContent).toBe('Songs of the Letters');
    expect(props.onReady).toHaveBeenCalled();
    await click(button(container, 'Shuffle all songs'));
    expect(player.playSongs).toHaveBeenCalledWith({ filter: {}, shuffle: true, onePerFamily: true, label: 'Songs of the Letters' });
    expect(texts(container, '.sec .label')).toEqual(['New from the flock', 'Your songs', 'From the letters']);
    expect(texts(container, '.row.song .t').slice(0, 2)).toEqual(['The Letter', 'Lead Me To That Place']);
    expect(texts(container, '.row.mine .t')).toEqual(['Saved songs', 'Recently played songs', 'Kept on this phone']);
    expect(texts(container, '.row.mine .cnt')).toEqual(['1', '0', '0']);
    expect(texts(container, '.stile .t')).toEqual(['Words to Live By, Part One', 'Volume One']);
    expect(texts(container, '.sg-shelves .t')).toEqual(['Inspired by the letters', 'Letters read with music']);
    expect(texts(container, '.sg-shelves .cnt')).toEqual(['1 song', '1 letter']);
    await click(container.querySelectorAll('.stile')[1]);
    await click(container.querySelectorAll('.row.mine')[0]);
    await click(button(container, 'See all'));
    await click(container.querySelectorAll('.sg-shelves .row')[1]);
    expect(props.go.mock.calls.map((c) => c[0])).toEqual([{ place: 'songs', list: 'col:one' }, { place: 'songs', list: 'saved' },
      { place: 'songs', list: 'new' }, { place: 'songs', list: 'readings' }]);
  });

  it('a row plays the newest from it; the song the player holds is lit and its button pauses; "2 versions" opens the song', async () => {
    install();
    const { container, props } = page(SongsScreen, { place: 'songs' });
    await settle();
    await click(button(container, 'Play Lead Me To That Place'));
    expect(player.playSongs).toHaveBeenLastCalledWith({ ids: ['ccccccccccc2', 'bbbbbbbbbbb1', 'aaaaaaaaaaa2', 'eeeeeeeeeee1'], startId: 'bbbbbbbbbbb1', label: 'New from the flock' });
    cleanup();
    holding('song:ccccccccccc2');
    const again = page(SongsScreen, { place: 'songs' });
    await settle();
    const lit = again.container.querySelector('.row.song.on');
    expect(lit.querySelector('.t').textContent).toBe('The Letter');
    await click(button(again.container, 'Pause The Letter'));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    await click(button(again.container, '2 versions'));
    expect(again.props.go).toHaveBeenCalledWith({ place: 'song', family: 'fam-c' });
    expect(props.go).not.toHaveBeenCalled();
  });

  it('a style chip shuffles that style and lists its songs, each led by its version in the style; the route keeps the chip', async () => {
    install();
    const { container, props } = page(SongsScreen, { place: 'songs' });
    await settle();
    await click(button(container, 'Worship'));
    expect(button(container, 'Worship').getAttribute('aria-pressed')).toBe('true');
    await click(button(container, 'Shuffle Worship (2)'));
    expect(player.playSongs).toHaveBeenLastCalledWith({ filter: { style: 'worship' }, shuffle: true, onePerFamily: true, label: 'Worship songs' });
    expect(texts(container, '.sec .label')).toEqual(['Worship']);
    expect(container.querySelector('.sec .cnt').textContent).toBe('2 songs');
    expect(texts(container, '.row.song .t').sort()).toEqual(['Lead Me To That Place', 'The Letter']);
    await click(button(container, 'Play The Letter'));
    expect(player.playSongs.mock.lastCall[0]).toMatchObject({ startId: 'ccccccccccc1', label: 'Songs of the Letters' });
    await settle(450);
    expect(props.replace).toHaveBeenLastCalledWith({ place: 'songs', st: 'worship' });
  });

  it('More opens the other styles with their counts; picking one names it on the chip', async () => {
    install();
    const { container } = page(SongsScreen, { place: 'songs' });
    await settle();
    await click(button(container, 'More'));
    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet.getAttribute('aria-label')).toBe('More styles');
    expect(texts(sheet, '.opt .t')).toEqual(['Country', 'Rock', 'Spoken']);
    expect(texts(sheet, '.opt .s')).toEqual(['1 song', '1 song', '1 song']);
    await click(sheet.querySelectorAll('.opt')[1]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const chip = container.querySelector('.chip.more');
    expect([chip.textContent, chip.classList.contains('on')]).toEqual(['Rock', true]);
    expect(texts(container, '.row.song .t')).toEqual(['The Letter']);
  });

  it('Find lists what it finds, says when nothing is found and clears; the words go into the route for Back', async () => {
    install();
    const { container, props } = page(SongsScreen, { place: 'songs' });
    await settle();
    const q = container.querySelector('input.q');
    act(() => { fireEvent.change(q, { target: { value: 'love' } }); });
    expect(texts(container, '.row.song .t').sort()).toEqual(['Come, Love Awaits You', 'Love Awaits']);
    await settle(450);
    expect(props.replace).toHaveBeenLastCalledWith({ place: 'songs', q: 'love' });
    act(() => { fireEvent.change(q, { target: { value: 'zzzz' } }); });
    expect(container.querySelector('.sg-empty').textContent).toBe('No song by that name. Try a word from the letter.');
    await click(button(container, 'Clear the song search'));
    expect(texts(container, '.sec .label')).toEqual(['New from the flock', 'Your songs', 'From the letters']);
  });

  it('a route with words and a style opens on those results (Back from a song)', async () => {
    install();
    const { container } = page(SongsScreen, { place: 'songs', q: 'letter', st: 'rock' });
    await settle();
    expect(container.querySelector('input.q').value).toBe('letter');
    expect(container.querySelector('.chip.more').textContent).toBe('Rock');
    expect(texts(container, '.row.song .t')).toEqual(['The Letter']);
  });

  it('offline: main\'s note; a catalog that could not load says so and tries again', async () => {
    install();
    g.NetStatus = { subscribe: () => () => {}, getVersion: () => 0, isOffline: () => true };
    _resetSongCatalogForTests();
    const load = vi.spyOn(SongCatalog, 'load').mockImplementation(() => Promise.resolve(false));
    vi.spyOn(SongCatalog, 'error', 'get').mockReturnValue(true);
    const { container } = page(SongsScreen, { place: 'songs' });
    await settle();
    expect(container.querySelector('.sg-off').textContent).toBe('You’re offline. Songs kept on this phone still play.');
    expect(container.querySelector('.sg-state .lede').textContent).toBe('Songs need a connection the first time.');
    load.mockClear();
    await click(button(container, 'Try again'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('a list on a real boot', () => {
  it('a letter\'s songs: Play all, Shuffle, rows that play from themselves, and Keep for all their versions', async () => {
    install();
    const { container, props } = page(SongsScreen, { place: 'songs', list: 'letter:' + LOVE });
    await settle();
    expect([container.querySelector('.eyebrow').textContent, container.querySelector('h1').textContent, container.querySelector('.lede').textContent])
      .toEqual(['Songs from this letter', 'Come, Love Awaits You (the letter)', '2 songs · 3 versions · 10 min']);
    await click(button(container, 'Play all'));
    await click(button(container, 'Shuffle'));
    await click(button(container, 'Play Love Awaits'));
    const label = 'Come, Love Awaits You (the letter)';
    const ids = ['aaaaaaaaaaa1', 'eeeeeeeeeee1'];
    expect(player.playSongs.mock.calls.map((c) => c[0])).toEqual([{ ids, startId: undefined, shuffle: false, label },
      { ids, startId: undefined, shuffle: true, label }, { ids, startId: 'eeeeeeeeeee1', shuffle: false, label }]);
    expect(texts(container, '.keep .t')).toEqual(['Keep for offline listening']);
    // the line counts 2 songs and 3 versions, so Keep says versions
    expect(container.querySelector('.keep .s').textContent).toBe('All 3 versions · 8.6 MB');
    await click(button(container, 'Keep'));
    expect(keep.keep).toHaveBeenCalledWith(['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'eeeeeeeeeee1'], 'keep-list-letter:' + LOVE);
    await click(button(container, '2 versions'));
    expect(props.go).toHaveBeenCalledWith({ place: 'song', family: 'fam-a' });
  });

  it('a list keeping shows its progress and Cancel; all kept shows no button', async () => {
    install({ progress: { total: 3, kept: 1, busy: 2, failed: 0, bytes: 3e6, needBytes: 6e6 } });
    const { container } = page(SongsScreen, { place: 'songs', list: 'col:wtlb1' });
    await settle();
    expect(container.querySelector('.keep .s').textContent).toBe('Keeping 2 of 3…');
    expect(container.querySelector('.kbar > span').style.width).toBe('33%');
    await click(button(container, 'Cancel'));
    expect(keep.cancel).toHaveBeenCalledWith(['eeeeeeeeeee1', 'aaaaaaaaaaa1', 'aaaaaaaaaaa2']);
    cleanup();
    install({ progress: { total: 3, kept: 3, busy: 0, failed: 0, bytes: 9e6, needBytes: 0 } });
    const all = page(SongsScreen, { place: 'songs', list: 'col:wtlb1' });
    await settle();
    expect([all.container.querySelector('.keep .t').textContent, all.container.querySelector('.keep button')]).toEqual(['Available offline', null]);
  });

  it('Kept: each song with Remove, Remove all asks first, a restore offers what the backup lists; the laptop says this computer', async () => {
    install({ kept: ['ccccccccccc2'], missing: ['aaaaaaaaaaa2'], progress: { total: 1, kept: 0, busy: 0, failed: 0, bytes: 0, needBytes: 3e6 } });
    const { container } = page(SongsScreen, { place: 'songs', list: 'kept' });
    await settle();
    expect(container.querySelector('.lede').textContent).toBe('1 song · 2.9 MB · they play with no signal');
    await click(button(container, 'Remove The Letter from this phone'));
    expect(keep.remove).toHaveBeenCalledWith(['ccccccccccc2']);
    expect(texts(container, 'p.fine')[0]).toBe('Your backup lists 1 song kept on this phone that are not on it now.');
    await click(button(container, 'Keep'));
    expect(keep.keep).toHaveBeenCalledWith(['aaaaaaaaaaa2'], 'keep-restore');
    await click(button(container, 'Remove all from this phone'));
    const ask = document.querySelector('[role="dialog"]');
    expect(ask.querySelector('.sh').textContent).toBe('Remove all 1 song (2.9 MB) from this phone?');
    await click(button(ask, 'Keep them'));
    expect(keep.removeAll).not.toHaveBeenCalled();
    await click(button(container, 'Remove all from this phone'));
    await click(button(document.body, 'Yes, remove all'));
    expect(keep.removeAll).toHaveBeenCalledTimes(1);
    cleanup();
    const desk = page(SongsScreen, { place: 'songs', list: 'kept' }, { device: 'computer', desktop: true });
    await settle();
    expect(button(desk.container, 'Remove all from this computer')).toBeTruthy();
    expect(desk.container.querySelector('h1').textContent).toBe('Kept on this computer');
    expect(button(desk.container, 'Remove The Letter from this computer')).toBeTruthy();
    cleanup();
    const hub = page(SongsScreen, { place: 'songs' }, { device: 'computer', desktop: true });
    await settle();
    expect(texts(hub.container, '.row.mine .t')[2]).toBe('Kept on this computer');
  });

  it('an empty list says what goes there', async () => {
    install();
    const { container } = page(SongsScreen, { place: 'songs', list: 'saved' });
    await settle();
    expect(container.querySelector('.sg-empty').textContent).toBe('Tap Save on any song and it will wait here.');
    expect(button(container, 'Play all')).toBeNull();
    cleanup();
    // a list of songs (one version each) keeps songs
    const fresh = page(SongsScreen, { place: 'songs', list: 'new' });
    await settle();
    expect(fresh.container.querySelector('.keep .s').textContent).toBe('All 4 songs · 11.4 MB');
  });

  it('letters read with music: a row plays the reading (reader M), Read-along plays it and opens the letter; the one playing pauses', async () => {
    install();
    const { container, props } = page(SongsScreen, { place: 'songs', list: 'readings' });
    await settle();
    expect(container.querySelector('h1').textContent).toBe('Letters read with music');
    expect(texts(container, '.row.rd .t')).toEqual(['Blessed Are Those Who Worship Me']);
    expect(texts(container, '.row.rd .ln')).toEqual(['3:16']);
    await click(button(container, 'Play Blessed Are Those Who Worship Me, read with music'));
    const letter = { volKey: 'blessed', letter: { id: 'blessed-are-those-who-worship-me', title: 'Blessed Are Those Who Worship Me' }, collectionLabel: 'The Blessed', reader: 'M' };
    expect(player.playLetter).toHaveBeenLastCalledWith(letter);
    await click(button(container, 'Read along with Blessed Are Those Who Worship Me'));
    expect(props.go).toHaveBeenCalledWith({ place: 'letter', collection: 'blessed', n: 3 });
    cleanup();
    playerState = { queue: [{ key: 'blessed:blessed-are-those-who-worship-me', readerCode: 'M' }], qi: 0, status: 'playing' };
    const again = page(SongsScreen, { place: 'songs', list: 'readings' });
    await settle();
    expect(again.container.querySelector('.row.rd').classList.contains('on')).toBe(true);
    await click(button(again.container, 'Pause Blessed Are Those Who Worship Me, read with music'));
    expect(player.toggle).toHaveBeenCalledTimes(1);
  });
});

describe('a song (6e) on a real boot', () => {
  it('Play, Save, the letter it is from, its versions (the lead lit), its lyrics and the letter\'s other songs', async () => {
    install();
    g.loadSongLyrics = vi.fn(() => Promise.resolve({ lines: ['one', 'two', 'three', 'four', 'five', 'six'].map((t) => ({ t })) }));
    const { container, props } = page(SongScreen, { place: 'song', family: 'fam-a' });
    await settle();
    expect(g.loadSongLyrics).toHaveBeenCalledWith(SongCatalog.songById('aaaaaaaaaaa1'));
    expect([container.querySelector('.eyebrow').textContent, container.querySelector('h1').textContent, container.querySelector('.sp-meta').textContent])
      .toEqual(['Song · 2 versions', 'Come, Love Awaits You', 'Words to Live By, Part OneMade with Suno · by hmarie777 and others']);
    expect(container.querySelector('.sp-cover').getAttribute('src')).toBe('https://votreader.github.io/songs/thumbs/512/aaaaaaaaaaa1.webp');
    await click(container.querySelector('.sp-from'));
    expect(props.go).toHaveBeenCalledWith({ place: 'letter', collection: 'wtlb1', n: 7 });
    await click(button(container, 'Play'));
    expect(player.playSongs).toHaveBeenLastCalledWith({ filter: { family: 'fam-a' }, startId: 'aaaaaaaaaaa1', label: 'Come, Love Awaits You' });
    await click(button(container, 'Save'));
    expect(library.toggleSongSaved).toHaveBeenCalledWith('aaaaaaaaaaa1');
    expect(texts(container, '.row.ver .t')).toEqual(['Country · hmarie777', 'Pop']);
    expect(container.querySelector('.row.ver.on .t').textContent).toBe('Country · hmarie777');
    await click(button(container, 'Play Pop'));
    expect(player.playSongs).toHaveBeenLastCalledWith({ filter: { family: 'fam-a' }, startId: 'aaaaaaaaaaa2', label: 'Come, Love Awaits You' });
    expect(texts(container, '.lyr > p:not(.fine)')).toEqual(['one', 'two', 'three', 'four']);
    await click(button(container, 'Show all lyrics'));
    expect(texts(container, '.lyr > p:not(.fine)')).toHaveLength(6);
    expect(container.querySelector('.lyr .fine').textContent).toBe('Words from the letter “Come, Love Awaits You (the letter)” · lyrics transcribed');
    expect(texts(container, '.sec .label')).toEqual(['Versions', 'Lyrics', 'More songs from this letter']);
    expect(texts(container, '.row.song .t')).toEqual(['Love Awaits']);
    await click(button(container, 'Play Love Awaits'));
    expect(player.playSongs).toHaveBeenLastCalledWith({ filter: { family: 'fam-e' }, startId: 'eeeeeeeeeee1', label: 'Love Awaits' });
    expect(container.querySelector('.keep .s').textContent).toBe('All 2 versions · 5.7 MB');
    await click(button(container, 'Keep'));
    expect(keep.keep).toHaveBeenCalledWith(['aaaaaaaaaaa1', 'aaaaaaaaaaa2'], 'keep-fam-fam-a');
  });

  it('a saved song says Saved and unsaves every saved version; the version playing is lit and pauses; all kept offers Remove', async () => {
    install({ saved: ['aaaaaaaaaaa2'], progress: { total: 2, kept: 2, busy: 0, failed: 0, bytes: 6e6, needBytes: 0 } });
    holding('song:aaaaaaaaaaa2');
    const { container } = page(SongScreen, { place: 'song', family: 'fam-a' });
    await settle();
    const save = button(container, 'Saved');
    expect(save.getAttribute('aria-pressed')).toBe('true');
    await click(save);
    expect(library.toggleSongSaved.mock.calls).toEqual([['aaaaaaaaaaa2']]);
    expect(container.querySelector('.row.ver.on .t').textContent).toBe('Pop');
    await click(button(container, 'Pause'));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(texts(container, '.keep .t, .keep .s')).toEqual(['Available offline', '2 versions · 5.7 MB']);
    await click(button(container, 'Remove'));
    expect(keep.remove).toHaveBeenCalledWith(['aaaaaaaaaaa1', 'aaaaaaaaaaa2']);
  });

  it('offline, a version not kept here cannot play; a song no longer shared says so', async () => {
    install({ kept: ['aaaaaaaaaaa1'] });
    g.NetStatus = { subscribe: () => () => {}, getVersion: () => 0, isOffline: () => true };
    const { container } = page(SongScreen, { place: 'song', family: 'fam-a' });
    await settle();
    expect([...container.querySelectorAll('.row.ver')].map((r) => r.classList.contains('off'))).toEqual([false, true]);
    expect(button(container, 'Play Pop').disabled).toBe(true);
    expect(container.querySelector('.keep .kn').textContent).toBe('Needs a connection');
    cleanup();
    const gone = page(SongScreen, { place: 'song', family: 'fam-d' });
    await settle();
    expect(gone.container.textContent).toBe('This song is no longer shared.');
  });

  it('a letter\'s foot opens a song\'s page in v2 (the place it names exists), and Back names the hub above it', async () => {
    install();
    undo.push(defineStart(() => [{ place: 'home' }, { place: 'songs' }, { place: 'song', family: 'fam-c' }]));
    const { container } = render(<V2App gateId={null} />);
    await settle(60);
    const top = [...container.querySelectorAll('h1')].pop();
    expect(top.textContent).toBe('The Letter');
    expect(container.querySelector('.tb button').getAttribute('aria-label')).toBe('Back to Songs of the Letters');
  });
});

describe('the gate pictures', () => {
  it('6d draws the pinned hub: catalog 1097\'s newest two, Your songs, the four biggest collections, the shelves, 13 readings', async () => {
    expect(GATE_STATES['6d-songs'].stack).toEqual([{ place: 'home' }, { place: 'songs' }]);
    const { container } = render(<V2App gateId="6d-songs" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const pg = [...container.querySelectorAll('.page-head')].pop().parentElement;
    expect(pg.querySelector('h1').textContent).toBe('Songs of the Letters');
    // the kit's page class: its .content.songs rules size the title, the pill and the rows
    expect(pg.parentElement.className).toBe('content songs');
    expect(texts(pg, '.chip')).toEqual(['All', 'Worship', 'Pop', 'Hip-hop', 'Cinematic', 'Folk', 'More']);
    expect(texts(pg, '.row.song .t')).toEqual(['True Faith', 'I Belong']);
    expect(texts(pg, '.row.mine .cnt')).toEqual(['3', '12', '2 · 7.6 MB']);
    expect(texts(pg, '.stile .t')).toEqual(['Words To Live By: Part One', 'Letters from Timothy', 'The Blessed', 'Volume Seven']);
    expect(texts(pg, '.stile .s').slice(0, 3)).toEqual(['88 songs', '30 songs', '27 songs']);
    expect(button(pg, 'Show all 13 collections')).toBeTruthy();
    expect(texts(pg, '.sg-shelves .cnt')).toEqual(['669 songs', '194 songs', '13 letters']);
    // a gate boot plays and opens nothing
    await click(button(pg, 'Shuffle all songs'));
    await click(pg.querySelector('.stile'));
    expect(player.playSongs).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('h1')].pop().textContent).toBe('Songs of the Letters');
  });

  it('6e draws Elect and Precious: 16 versions (4 shown, repeats numbered), Keep for all of them, the lyrics\' first lines', async () => {
    const { container } = render(<V2App gateId="6e-song-page" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const pg = [...container.querySelectorAll('.page-head')].pop().parentElement;
    expect([pg.querySelector('.eyebrow').textContent, pg.querySelector('h1').textContent]).toEqual(['Song · 16 versions', 'Elect and Precious']);
    expect(pg.parentElement.className).toBe('content songs sp');
    expect(pg.querySelector('.sp-from').textContent).toBe('From the letter: Elect and Precious');
    expect(texts(pg, '.row.ver .t')).toEqual(['Cinematic', 'Cinematic · 2', 'Cinematic · 3', 'Cinematic · 4']);
    expect(pg.querySelector('.row.ver.on .t').textContent).toBe('Cinematic');
    expect(button(pg, 'Show all 16 versions')).toBeTruthy();
    // the catalog's 16 versions are 37,616,949 bytes (design's picture says 64 MB, from main's doc)
    expect(texts(pg, '.keep .t, .keep .s')).toEqual(['Keep for offline listening', 'All 16 versions · 35.9 MB']);
    expect(texts(pg, '.lyr > p:not(.fine)')).toHaveLength(4);
    expect(button(pg, 'Save').getAttribute('aria-pressed')).toBe('false');
  });
});
