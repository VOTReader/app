// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getShape: () => '0|',
    getState: () => playerState,
    collectionHasAudio: vi.fn(() => true),
    readerLabel: () => null,
    toggle: vi.fn(),
    playTrack: vi.fn(),
    prev: vi.fn(),
    next: vi.fn(),
    seek: vi.fn(),
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioLibraryScreen, lengthText, continueTitle } from './AudioLibraryScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';
import * as AT from '../../utils/audio-track.js';

const savedTrack = {
  key: 'one:wide-path', title: 'The Wide Path', sub: 'Volume One', partLabel: 'Part 1',
  url: 'https://example.test/wide.mp3', readerCode: 'vot', savedAt: 1,
};
const recentTrack = {
  key: 'one:narrow-path', title: 'The Narrow Path', sub: 'Volume One', partLabel: null,
  url: 'https://example.test/narrow.mp3', readerCode: 'vot', playedAt: Date.now() - 60_000,
};

/** N distinct recent rows, newest first — for the Show-all fold. */
function manyRecent(count) {
  return Array.from({ length: count }, (_, i) => ({
    ...recentTrack,
    title: 'Recent ' + (i + 1),
    url: 'https://example.test/recent-' + i + '.mp3',
    playedAt: Date.now() - (i + 1) * 60_000,
  }));
}

function installGlobals({ saved = [savedTrack], recent = [recentTrack], activeSaved = true, votManifest = true } = {}) {
  globalThis.ScreenLayout = ({ children, navChildren, navEnd }) => <main><nav>{navChildren}{navEnd}</nav>{children}</main>;
  globalThis.LibraryNav = () => null;
  /* The bundle-d slots these screens read across the bundle boundary since
     landing 24 (AudioShelf's rows and icons, the seek slider, the coverage
     badge, the audio tables). They are installed from THIS file's graph, not
     a shared setup: the vi.mock above only reaches modules imported here, and
     a shelf row bound to the real player would call straight past the fake. */
  Object.assign(globalThis, Shelf, AudioTrack, AudioCoverage, { AudioSeekSlider, CoverageBadge });
  // The screen reads the player from its window slot now (bundle-h reaches
  // across to bundle-d's one player); this is the same fake, installed there.
  globalThis.AudioPlayer = player;
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'vot-one-index', label: 'Volume One' }];
  globalThis.COL_BY_KEY = new Map([['one', { letterScreen: 'vot-one-letter' }]]);
  delete globalThis.AUDIO_MANIFEST;
  if (votManifest) globalThis.AUDIO_MANIFEST = { 'one:wide-path': [['idWide', 'B']] };
  globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': [['g', '']], 'bible-brm-kjv:exodus': [['e', '']] };
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    saved: () => saved, recent: () => recent,
    isSaved: (track) => activeSaved && !!track && track.url === savedTrack.url,
    toggleSaved: vi.fn(), clearRecent: vi.fn(), removeRecent: vi.fn(),
  };
}

function renderScreen(overrides = {}) {
  return render(
    <AudioLibraryScreen
      onBack={() => {}} onOpenCollection={() => {}} onOpenVolumes={() => {}} onOpenSaved={() => {}} onOpenTrack={() => {}}
      onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
      theme="dark" onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  Object.values(player).forEach((value) => { if (typeof value === 'function' && 'mockClear' in value) value.mockClear(); });
  localStorage.removeItem('vot-audio-recent-open');
  installGlobals();
});

afterEach(() => {
  cleanup();
  delete globalThis.AudioPlayer;
  for (const key of ['ScreenLayout', 'LibraryNav', 'COLLECTIONS', 'COL_BY_KEY', 'AUDIO_MANIFEST', 'BIBLE_AUDIO_MANIFEST', 'AudioLibraryStore']) delete globalThis[key];
  localStorage.removeItem('vot-audio-recent-open');
});

/* The LISTEN tab's root (the layout pass, 2026-11-10, mock listen.png): Continue listening; Listen to (the Volumes,
   the Bible with its editions in place, Studies, Songs); On this phone (Downloads, Saved recordings, Letter voice);
   then Recently played, as before. Every destination the hub had is one tap away still. */
const openBible = () => fireEvent.click(screen.getByRole('button', { name: /^The Bible/ }));
const editionRows = () => [...document.querySelectorAll('.root-sublist .root-row')];
const editionRow = (re) => editionRows().find((r) => re.test(r.querySelector('.root-row-title').textContent));

describe('AudioLibraryScreen -- the Listen root', () => {
  it('is a root titled Listen; Continue listening plays the newest recording; the saved row opens the shelf', () => {
    const onOpenSaved = vi.fn();
    renderScreen({ onOpenSaved });
    expect(screen.getByRole('heading', { level: 1, name: 'Listen' })).toBeTruthy();
    expect(screen.getByText('Continue listening')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Narrow Path' })).toBeTruthy();   // no part label: the title alone
    fireEvent.click(screen.getByRole('button', { name: 'Continue listening: The Narrow Path' }));
    expect(player.playTrack).toHaveBeenCalledWith(recentTrack);
    expect([...document.querySelectorAll('.root-section')].map((h) => h.textContent)).toEqual(['Listen to', 'On this phone', 'Recently played']);
    // The saved shelf is a doorway, with its count.
    expect(screen.queryByText('The Wide Path')).toBeNull();
    const saved = screen.getByRole('button', { name: /Saved recordings/ });
    expect(saved.querySelector('.root-row-count').textContent).toBe('1');
    fireEvent.click(saved);
    expect(onOpenSaved).toHaveBeenCalledTimes(1);
  });

  it('with nothing played yet there is no Continue card and no Recently played', () => {
    installGlobals({ recent: [] });
    renderScreen();
    expect(screen.queryByText('Continue listening')).toBeNull();
    expect(screen.queryByText('Recently played')).toBeNull();
  });

  it('recently played collapses, remembers the choice, and folds long trails behind Show all', () => {
    installGlobals({ recent: manyRecent(11) });
    renderScreen();
    expect(screen.getAllByText('Recent 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('Recent 11')).toBeNull();           // beyond the 8-row preview
    fireEvent.click(screen.getByRole('button', { name: 'Show all 11' }));
    expect(screen.getByText('Recent 11')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse recently played' }));
    expect(screen.queryByText('Recent 2')).toBeNull();
    expect(localStorage.getItem('vot-audio-recent-open')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'Expand recently played' }));
    expect(screen.getByText('Recent 2')).toBeTruthy();
    expect(localStorage.getItem('vot-audio-recent-open')).toBe('1');
  });

  it('one doorway per source family: the Volumes together, the Bible opening its editions in place', () => {
    installGlobals({ votManifest: false });                       // lazy corpus not yet landed
    const onOpenCollection = vi.fn();
    const onOpenVolumes = vi.fn();
    renderScreen({ onOpenCollection, onOpenVolumes });
    expect(screen.queryByRole('button', { name: /^Volume One/ })).toBeNull();
    const volumesRow = screen.getByRole('button', { name: /The Volumes of Truth/ });
    expect(volumesRow.textContent).toContain('1 collection · the Letters read aloud');
    fireEvent.click(volumesRow);
    expect(onOpenVolumes).toHaveBeenCalledTimes(1);
    expect(onOpenCollection).not.toHaveBeenCalled();

    const bible = screen.getByRole('button', { name: /^The Bible/ });
    expect(bible.getAttribute('aria-expanded')).toBe('false');
    expect(bible.querySelector('.root-row-sub').textContent).toMatch(/^KJV · NKJV · WEB/);
    expect(editionRows()).toHaveLength(0);
    openBible();
    expect(bible.getAttribute('aria-expanded')).toBe('true');
    const brm = editionRow(/Biblical Restoration Ministries/);
    expect(brm.textContent).toContain('2 books');                  // counted off its own manifest
    fireEvent.click(brm);
    expect(onOpenCollection).toHaveBeenCalledWith('bible-brm-kjv');
  });

  /* mt1 (Corbin 2026-09-21): every edition row has a true second line: a counted noun that agrees, the registry's
     description where it has one, and the reader when the manifest knows it. */
  it('every edition row has a true second line: agreeing plurals, the edition description, the reader the manifest knows', () => {
    installGlobals({ votManifest: false });
    globalThis.BIBLE_AUDIO_MANIFEST['bible-tsot-matthew:matthew'] = [['tsot-1', 'B']];
    globalThis.BIBLE_AUDIO_MANIFEST['bible-john-film:john'] = [['gjn-1', '']];
    renderScreen();
    openBible();
    const lineUnder = (re) => editionRow(re).querySelector('.root-row-sub').textContent;
    expect(lineUnder(/Biblical Restoration Ministries/)).toBe('2 books · chapter by chapter');
    expect(lineUnder(/The Scriptures of Truth/)).toBe('1 book · Corrected Version by Timothy, with The Lord');
    globalThis.BIBLE_AUDIO_MANIFEST['bible-brm-kjv:genesis'] = [['g', 'T']];   // a reader the label does not carry
    cleanup(); renderScreen(); openBible();
    expect(lineUnder(/Biblical Restoration Ministries/)).toBe('2 books · Read by Timothy');
    expect(lineUnder(/The Gospel of John/)).toBe('1 book · Film audio, listening only');
  });

  /* 2026-09-12/13: the shelf lists every edition the registry OFFERS, through the one predicate every door asks. */
  it('the Bible offers every edition the registry OFFERS — all five today', () => {
    installGlobals({ votManifest: false });
    globalThis.BIBLE_AUDIO_MANIFEST['bible-tsot-matthew:matthew'] = [['tsot-1', '']];
    renderScreen();
    openBible();
    const rows = editionRows().map((row) => row.querySelector('.root-row-title').textContent);
    expect(rows).toContain(AT.BIBLE_AUDIO_EDITIONS['tsot-matthew'].label);
    expect(Object.keys(AT.BIBLE_AUDIO_EDITIONS)).toHaveLength(5);
    expect(rows).toEqual(Object.values(AT.BIBLE_AUDIO_EDITIONS).filter(AT.bibleAudioOffered).map((e) => e.label));
  });

  it('the active recording: Now playing, its progress, pause, and its text from the art', () => {
    setPlayerState({ queue: [savedTrack], qi: 0, status: 'playing', time: 48, duration: 120 });
    const openTrack = vi.fn();
    renderScreen({ onOpenTrack: openTrack });
    expect(screen.getByText('Now playing')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Wide Path · Part 1' })).toBeTruthy();
    expect(screen.getByText('Volume One · 1 min left')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Playback position' }).getAttribute('aria-valuenow')).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: 'Pause current recording' }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open the text of The Wide Path' }));
    expect(openTrack).toHaveBeenCalledWith(savedTrack);
  });

  it('Letter voice states the current choice and opens the voice picker in place; a pick sets it', () => {
    const onSetLetterReader = vi.fn();
    globalThis.useModalRegistry = () => {};
    globalThis.useFocusTrap = () => ({ current: null });
    globalThis.SheetHandle = () => null;
    const hadDom = 'ReactDOM' in globalThis;
    if (!hadDom) globalThis.ReactDOM = { createPortal: (node) => node };
    try {
      renderScreen({ onSetLetterReader, letterReader: 'auto' });
      const row = screen.getByRole('button', { name: /Letter voice/ });
      expect(row.textContent).toContain('Automatic · each recording’s own reader');
      fireEvent.click(row);
      fireEvent.click(screen.getByRole('radio', { name: /Read by Timothy/ }));
      expect(onSetLetterReader).toHaveBeenCalledWith('T');
      cleanup();
      renderScreen({ onSetLetterReader, letterReader: 'T' });
      expect(screen.getByRole('button', { name: /Letter voice/ }).textContent).toContain('Read by Timothy');
    } finally {
      delete globalThis.useModalRegistry; delete globalThis.useFocusTrap; delete globalThis.SheetHandle;
      if (!hadDom) delete globalThis.ReactDOM;
    }
  });

  it('the Continue title says a Bible chapter once ("Genesis 1"), and a letter’s part', () => {
    expect(continueTitle({ title: 'Genesis 1', partLabel: 'Chapter 1' })).toBe('Genesis 1');
    expect(continueTitle({ title: 'The Wide Path', partLabel: 'Part 2' })).toBe('The Wide Path · Part 2');
    expect(continueTitle({ title: 'The Narrow Path', partLabel: null })).toBe('The Narrow Path');
  });

  it('drops one recent row without clearing the whole trail', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Remove The Narrow Path from recently played' }));
    expect(globalThis.AudioLibraryStore.removeRecent).toHaveBeenCalledWith(recentTrack.url);
    expect(globalThis.AudioLibraryStore.clearRecent).not.toHaveBeenCalled();
  });
});

// s18.8 (n101): Clear history emptied the list at one tap; now a 5 s Undo puts it back.
describe('AudioLibraryScreen -- Clear history has an Undo', () => {
  it('Clear history offers Undo, and Undo restores the cleared rows', () => {
    installGlobals();
    const gone = [recentTrack];
    globalThis.AudioLibraryStore.clearRecent = vi.fn(() => gone);
    globalThis.AudioLibraryStore.restoreRecent = vi.fn();
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    const toast = document.getElementById('vot-toast-history-cleared');
    expect(toast.textContent).toBe('History clearedUndo');
    fireEvent.click(toast.querySelector('.vot-undo-btn'));
    expect(globalThis.AudioLibraryStore.restoreRecent).toHaveBeenCalledWith(gone);
  });
});

// RC.7 (n372): the length under the scrubber is never 'Streaming'.
describe('AudioLibraryScreen -- the now-playing length', () => {
  const setOnline = (v) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
  afterEach(() => { delete globalThis.AUDIO_LENGTHS; setOnline(true); });
  const URL = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/idL.mp3';
  it('uses the loaded length, then the baked one, then says why offline', () => {
    expect(lengthText({ duration: 125, queue: [], qi: 0 })).toBe('2:05');
    globalThis.AUDIO_LENGTHS = { idL: [1e6, 61] };
    expect(lengthText({ duration: 0, queue: [{ url: URL }], qi: 0 })).toBe('1:01');
    delete globalThis.AUDIO_LENGTHS;
    globalThis.AUDIO_LENGTHS = {};
    setOnline(false);
    expect(lengthText({ duration: 0, queue: [{ url: URL }], qi: 0 })).toBe('Needs a connection');
    setOnline(true);
    expect(lengthText({ duration: 0, queue: [{ url: URL }], qi: 0 })).not.toBe('Streaming');
  });
});

describe('AudioLibraryScreen -- the offline line counts what is on the phone (RC.2)', () => {
  const setOnline = (v) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
  const offlineWith = (n) => {
    setOnline(false);
    globalThis.OfflineAudio = {
      available: () => true, subscribe: () => () => {}, getVersion: () => 0, news: () => null, statusOf: () => 'none',
      items: () => Array.from({ length: n }, (_, i) => ({ url: 'https://example.test/' + i + '.mp3', bytes: 1, savedAt: i })),
      pending: () => ({ busy: 0 }), totalBytes: () => n,
    };
  };
  afterEach(() => { delete globalThis.OfflineAudio; setOnline(true); });
  const line = () => document.querySelector('.offline-note').textContent;

  it('with nothing saved, it says so instead of promising recordings that still play', () => {
    offlineWith(0);
    renderScreen();
    expect(line()).toBe('You’re offline. No recordings are saved on this phone yet.');
  });

  it('counts the recordings that do still play', () => {
    offlineWith(2);
    renderScreen();
    expect(line()).toBe('You’re offline. 2 recordings on this phone still play.');
    cleanup();
    offlineWith(1);
    renderScreen();
    expect(line()).toBe('You’re offline. 1 recording on this phone still plays.');
  });
});

describe('AudioLibraryScreen -- the read-along badge', () => {
  /* The editions say which ones light their words (hub order 2026-09-22). The John film is the one listening-only
     edition (audio-track.js declares `timed: false`). The badges ride the edition rows the Bible row opens; the
     top rows are the mock's plain rows. */
  function badgeIn(name) {
    const row = editionRows().find((b) => b.textContent.includes(name));
    return row ? row.querySelector('.coverage-badge') : null;
  }

  it('marks a timed edition read-along and the film listening only', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:genesis': [['g', '']],
      'bible-john-film:john': [['j', '']],
    };
    renderScreen();
    openBible();
    const brm = badgeIn('Biblical Restoration Ministries');
    expect(brm.textContent).toBe('Read-along');
    expect(brm.className).toContain('coverage-badge-read-along');
    const film = badgeIn('Gospel of John');
    expect(film.textContent).toBe('Listening only');
    expect(film.getAttribute('title')).toMatch(/not timed/i);
  });

  /* Songs of the Letters (L2): one row under the Volumes, the real count once the catalog is in. */
  it('offers Songs of the Letters as a row that names its songs and opens the hub', () => {
    const load = vi.fn(() => Promise.resolve(true));
    const visible = { hid: false, sh: 1 };
    globalThis.SongCatalog = { loaded: false, subscribe: () => () => {}, getVersion: () => 0, load, songs: () => [] };
    globalThis.songCountLabel = (n) => n.toLocaleString('en-US') + (n === 1 ? ' song' : ' songs');
    const onOpenSongs = vi.fn();
    const first = renderScreen({ onOpenSongs });
    expect(load).toHaveBeenCalledTimes(1);                        // the hub warms the catalog a tap before Songs
    let row = screen.getByRole('button', { name: /Songs of the Letters/ });
    expect(row.textContent).toContain('Sung by the flock');
    first.unmount();

    globalThis.SongCatalog = { loaded: true, subscribe: () => () => {}, getVersion: () => 1, load, songs: () => Array.from({ length: 1083 }, (_, i) => (i === 0 ? { hid: true, sh: 1 } : visible)) };
    renderScreen({ onOpenSongs });
    row = screen.getByRole('button', { name: /Songs of the Letters/ });
    expect(row.textContent).toContain('1,082 songs · sung by the flock');   // hidden rows never count
    fireEvent.click(row);
    expect(onOpenSongs).toHaveBeenCalledTimes(1);
    delete globalThis.SongCatalog;
    delete globalThis.songCountLabel;
  });
});
