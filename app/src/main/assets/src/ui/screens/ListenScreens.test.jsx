// @ts-nocheck -- classic-global screen contract (bundle-h reads bundle-d as globals), isolated here.
/* rv1 the Listen tab (overhaul review build): the root's sections and hero, a Source's Play/Resume and rows,
   a voice's shelves, the offline banner. Built to the Design canvas's words (21a Listen, 21c Volume One). */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => playerState,
    collectionHasAudio: vi.fn(() => true),
    hasAudio: vi.fn(() => true),
    readerLabel: (code) => ({ B: 'Benjamin', T: 'Timothy' }[code] || null),
    renditionsFor: vi.fn((volKey, item) => [{ reader: item.id === 'b' ? 'T' : 'B', tracks: [{ key: volKey + ':' + item.id, url: 'u:' + item.id, title: item.title, readerCode: item.id === 'b' ? 'T' : 'B' }] }]),
    playbackTracks: vi.fn((volKey, item) => [{ key: volKey + ':' + item.id, url: 'u:' + item.id, title: item.title, readerCode: item.id === 'b' ? 'T' : 'B' }]),
    playTrack: vi.fn(),
    playSection: vi.fn(),
    sectionsFor: vi.fn(() => []),
    playBibleBook: vi.fn(),
    bibleChapterOfTrack: (t) => t.ch,
    playCollection: vi.fn(),
    toggle: vi.fn(),
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { ListenRoot, ListenSource, ListenYours, ListenBible } from './ListenScreens.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import { listenEyebrow, listenReaderLine } from '../components/NowPlaying.jsx';

const A = { id: 'a', num: 1, title: 'Chosen by God' };
const B = { id: 'b', num: 2, title: 'Christmas' };
const COL = { volKey: 'one', cardId: 'vot-one-index', label: 'Volume One', kind: 'letter' };
let positions;
let recent;
let saved;

function install() {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  Object.assign(globalThis, Shelf, AudioTrack, { listenEyebrow, listenReaderLine });
  globalThis.AudioPlayer = player;
  globalThis.COLLECTIONS = [COL];
  globalThis.COL_BY_KEY = new Map([['one', COL]]);
  globalThis.colLetterArr = () => [A, B];
  globalThis.colPreface = () => null;
  globalThis.BIBLE_STUDIES = [];
  globalThis.AudioLibraryStore = { subscribe: () => () => {}, getVersion: () => 0, recent: () => recent, saved: () => saved };
  globalThis.AudioPositionsStore = { subscribe: () => () => {}, getVersion: () => 0, getPosition: (t) => positions[t.url || t] || null };
  globalThis.SongCatalog = { subscribe: () => () => {}, getVersion: () => 0, loaded: true, songs: () => Array.from({ length: 1087 }, () => ({ sh: 1 })), load: vi.fn() };
}

const rootProps = () => ({
  onBack: vi.fn(), onOpenSource: vi.fn(), onOpenBible: vi.fn(), onOpenSaved: vi.fn(), onOpenDownloads: vi.fn(), onOpenHistory: vi.fn(),
  onOpenSongs: vi.fn(), onReadStudies: vi.fn(), onOpenNowPlaying: vi.fn(), onSearch: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(),
  theme: 'dark', onThemeChange: vi.fn(), bibleAudio: 'brm-kjv',
});

beforeEach(() => {
  positions = {};
  recent = [];
  saved = [];
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  Object.values(player).forEach((v) => { if (typeof v === 'function' && 'mockClear' in v) v.mockClear(); });
  install();
});
afterEach(() => {
  cleanup();
  for (const k of ['ScreenLayout', 'LibraryNav', 'AudioPlayer', 'COLLECTIONS', 'COL_BY_KEY', 'colLetterArr', 'colPreface', 'BIBLE_STUDIES', 'AudioLibraryStore', 'AudioPositionsStore', 'SongCatalog']) delete globalThis[k];
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('ListenRoot', () => {
  it('first run: no empty shelves, a way in to the Letters', () => {
    const p = rootProps();
    render(<ListenRoot {...p} />);
    expect(screen.getByRole('heading', { name: 'Hear the Letters read aloud' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Start with Volume One/ }));
    expect(p.onOpenSource).toHaveBeenCalledWith('one');
  });

  it('a returning listener gets the Continue hero: eyebrow, reader, minutes left, Resume opens Now Playing', () => {
    const track = { key: 'one:b', url: 'u:b', title: 'Christmas', sub: 'Volume One', readerCode: 'T' };
    recent = [track];
    positions = { 'u:b': { t: 300, d: 840 } };
    const p = rootProps();
    render(<ListenRoot {...p} />);
    expect(screen.getByRole('heading', { name: 'Christmas' })).toBeTruthy();
    expect(screen.getByText('Volume One · Letter 2')).toBeTruthy();
    expect(screen.getByText('Read by Timothy · 9 min left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(player.playTrack).toHaveBeenCalledWith(track);
    expect(p.onOpenNowPlaying).toHaveBeenCalled();
  });

  it('lists the Letters, the Scriptures with Your Bible voice, the Voices, Songs and Your Listening (zero counts shown)', () => {
    const p = rootProps();
    render(<ListenRoot {...p} />);
    expect(screen.getByRole('button', { name: /Volume One\s*2 letters/ })).toBeTruthy();
    expect(screen.getByText('Your Bible voice')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Benjamin/ }));
    expect(p.onOpenSource).toHaveBeenCalledWith('voice:B');
    expect(screen.getByRole('button', { name: /Over 1,000 songs/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saved · 0' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(p.onOpenHistory).toHaveBeenCalled();
  });

  it('an unreleased Bible edition has no Scriptures row (the hide flag, as the old hub shelf honored it)', () => {
    const [hiddenId, hidden] = Object.entries(AudioTrack.BIBLE_AUDIO_EDITIONS)[0];
    globalThis.bibleAudioOffered = (e) => e.volKey !== hidden.volKey;
    render(<ListenRoot {...rootProps()} bibleAudio={hiddenId} />);
    expect(screen.queryByRole('button', { name: new RegExp('^' + hidden.label) })).toBeNull();
  });

  it('offline: one calm banner with the way to Downloads', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const p = rootProps();
    render(<ListenRoot {...p} />);
    expect(screen.getByRole('status').textContent).toContain('Offline · downloads still play');
    fireEvent.click(screen.getByRole('button', { name: 'Downloads ›' }));
    expect(p.onOpenDownloads).toHaveBeenCalled();
  });
});

describe('ListenSource', () => {
  const srcProps = (sourceKey) => ({ sourceKey, onBack: vi.fn(), onOpenNowPlaying: vi.fn(), onSearch: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(), theme: 'dark', onThemeChange: vi.fn() });

  it('a collection: eyebrow, title, fact line, Play from the top, numbered rows with their reader', () => {
    const p = srcProps('one');
    render(<ListenSource {...p} />);
    expect(screen.getByRole('heading', { name: 'Volume One' })).toBeTruthy();
    expect(screen.getByText('2 letters · read-along')).toBeTruthy();
    expect(screen.getByText('Read by Benjamin')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Play$/ }));
    expect(player.playCollection).toHaveBeenCalledWith(expect.objectContaining({ volKey: 'one', startId: 'a' }));
    expect(p.onOpenNowPlaying).toHaveBeenCalled();
  });

  it('Resume names the letter in progress and starts there; the row says how much is left', () => {
    positions = { 'u:b': { t: 120, d: 600 } };
    render(<ListenSource {...srcProps('one')} />);
    expect(screen.getByText('Read by Timothy · 8 min left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Resume · Letter 2/ }));
    expect(player.playCollection).toHaveBeenCalledWith(expect.objectContaining({ startId: 'b' }));
  });

  it("a row's ⋮ offers the other voices it was read in, and Save", () => {
    player.renditionsFor.mockImplementation((volKey, item) => [
      { reader: 'B', tracks: [{ key: volKey + ':' + item.id, url: 'u:' + item.id, readerCode: 'B' }] },
      { reader: 'T', tracks: [{ key: volKey + ':' + item.id, url: 't:' + item.id, readerCode: 'T' }] },
    ]);
    globalThis.AudioLibraryStore.toggleSaved = vi.fn();
    globalThis.AudioLibraryStore.isSaved = () => false;
    render(<ListenSource {...srcProps('one')} />);
    fireEvent.click(screen.getByRole('button', { name: 'More for Chosen by God' }));
    fireEvent.click(screen.getByRole('button', { name: '☆ Save' }));
    expect(globalThis.AudioLibraryStore.toggleSaved).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play read by Timothy' }));
    expect(player.playCollection).toHaveBeenCalledWith(expect.objectContaining({ startId: 'a', startReader: 'T' }));
    player.renditionsFor.mockReset();
  });

  it('a collection with compilations offers them, each playing its longer sitting', () => {
    player.sectionsFor.mockReturnValueOnce([['Part 1 · Intro–19', 's1', 'V'], ['Part 2 · 20–39', 's2', 'V']]);
    const p = srcProps('one');
    render(<ListenSource {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Part 2 · 20–39/ }));
    expect(player.playSection).toHaveBeenCalledWith('one', 1, 'Volume One');
    expect(p.onOpenNowPlaying).toHaveBeenCalled();
  });

  it('a voice: every letter that reader read, shelved by collection, played in that voice', () => {
    render(<ListenSource {...srcProps('voice:B')} />);
    expect(screen.getByRole('heading', { name: 'Benjamin' })).toBeTruthy();
    expect(screen.getByText('Every letter Benjamin has read aloud')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Chosen by God' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play Christmas' })).toBeNull();   // Timothy's reading
    fireEvent.click(screen.getByRole('button', { name: /Play all/ }));
    expect(player.playCollection).toHaveBeenCalledWith(expect.objectContaining({ volKey: 'one', startId: 'a', startReader: 'B' }));
  });
});

describe('ListenYours', () => {
  const props = (segment) => ({ segment, onBack: vi.fn(), onOpenNowPlaying: vi.fn(), onSearch: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(), theme: 'dark', onThemeChange: vi.fn() });

  it('History lists what was started and plays it; the segments switch', () => {
    recent = [{ key: 'one:a', url: 'u:a', title: 'Chosen by God', playedAt: Date.now() }];
    const p = props('history');
    render(<ListenYours {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Chosen by God/ }));
    expect(player.playTrack).toHaveBeenCalled();
    expect(p.onOpenNowPlaying).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    expect(screen.getByText('Tap ☆ on any recording to keep it here.')).toBeTruthy();
  });

  it('Downloads: the storage line, each recording with Remove, and the empty line', () => {
    const remove = vi.fn();
    globalThis.OfflineAudio = {
      available: () => true, subscribe: () => () => {}, getVersion: () => 0, news: () => null,
      items: () => [{ url: 'u:a', title: 'Chosen by God', bytes: 6_400_000 }], totalBytes: () => 6_400_000, freeBytes: () => 18e9,
      pending: () => ({ busy: 0 }), remove, cancel: vi.fn(),
    };
    try {
      render(<ListenYours {...props('downloads')} />);
      expect(screen.getByText('VOTReader 6.4 MB · 18 GB free')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Chosen by God from this phone' }));
      expect(remove).toHaveBeenCalledWith(['u:a']);
    } finally { delete globalThis.OfflineAudio; }
  });
});

describe('ListenBible', () => {
  const chapters = (book, n) => Array.from({ length: n }, (_, i) => ({ key: 'bible-web:' + book, url: 'b:' + book + ':' + (i + 1), ch: i + 1 }));
  const props = () => ({ volKey: 'bible-web', onBack: vi.fn(), onOpenNowPlaying: vi.fn(), onSearch: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(), theme: 'dark', onThemeChange: vi.fn() });
  beforeEach(() => {
    globalThis.BIBLE_AUDIO_BOOKS = [['genesis', 'Genesis'], ['exodus', 'Exodus'], ['matthew', 'Matthew'], ['john', 'John']];
    player.playbackTracks.mockImplementation((volKey, item) => chapters(item.id, item.id === 'genesis' ? 50 : 3));
  });
  afterEach(() => { delete globalThis.BIBLE_AUDIO_BOOKS; player.playbackTracks.mockReset(); });

  it('books split Old | New Testament; a book opens its chapter grid; a chapter plays and opens Now Playing', () => {
    const p = props();
    render(<ListenBible {...p} />);
    expect(screen.getByRole('heading', { name: 'WEB · World English Bible' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Genesis/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Matthew/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'New Testament' }));
    expect(screen.getByRole('button', { name: /^Matthew/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Old Testament' }));
    fireEvent.click(screen.getByRole('button', { name: /^Genesis/ }));
    expect(screen.getByRole('heading', { name: 'Genesis' })).toBeTruthy();
    expect(screen.getByText('50 chapters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Genesis 7' }));
    expect(player.playBibleBook).toHaveBeenCalledWith(expect.objectContaining({ volKey: 'bible-web', bookId: 'genesis', chapterNum: 7 }));
    expect(p.onOpenNowPlaying).toHaveBeenCalled();
  });

  it('Resume names the chapter in progress; heard chapters carry a check', () => {
    positions = { 'b:genesis:3': { t: 100, d: 300 }, 'b:genesis:1': { t: 299, d: 300 } };
    render(<ListenBible {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Genesis/ }));
    expect(screen.getByRole('button', { name: /Resume · Chapter 3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Genesis 1, heard' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All books/ }));
    expect(screen.getByRole('button', { name: /^Genesis/ })).toBeTruthy();
  });
});
