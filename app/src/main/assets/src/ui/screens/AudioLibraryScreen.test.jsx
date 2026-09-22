// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
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

import { AudioLibraryScreen } from './AudioLibraryScreen.jsx';
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
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
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

describe('AudioLibraryScreen -- the hub', () => {
  it('shows resume, the saved sub-menu row, recent rows, and both browse groups', () => {
    const onOpenSaved = vi.fn();
    renderScreen({ onOpenSaved });
    expect(screen.getByRole('heading', { name: 'Listening Library' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume last' })).toBeTruthy();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();     // recent, open by default
    expect(screen.getByRole('button', { name: /The Volumes of Truth/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Biblical Restoration Ministries/ })).toBeTruthy();

    // The saved shelf is a doorway now, not an inline list.
    expect(screen.queryByText('The Wide Path')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Saved recordings/ }));
    expect(onOpenSaved).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Resume last' }));
    expect(player.playTrack).toHaveBeenCalledWith(recentTrack);
  });

  it('recently played collapses, remembers the choice, and folds long trails behind Show all', () => {
    installGlobals({ recent: manyRecent(11) });
    renderScreen();
    expect(screen.getByText('Recent 1')).toBeTruthy();
    expect(screen.queryByText('Recent 11')).toBeNull();           // beyond the 8-row preview
    fireEvent.click(screen.getByRole('button', { name: 'Show all 11' }));
    expect(screen.getByText('Recent 11')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse recently played' }));
    expect(screen.queryByText('Recent 1')).toBeNull();
    expect(localStorage.getItem('vot-audio-recent-open')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'Expand recently played' }));
    expect(screen.getByText('Recent 1')).toBeTruthy();
    expect(localStorage.getItem('vot-audio-recent-open')).toBe('1');
  });

  it('browse offers one doorway per source family — the Volumes together, each Bible edition', () => {
    installGlobals({ votManifest: false });                       // lazy corpus not yet landed
    const onOpenCollection = vi.fn();
    const onOpenVolumes = vi.fn();
    renderScreen({ onOpenCollection, onOpenVolumes });

    // The fourteen collections do NOT splay across the hub (owner directive) —
    // one doorway carries them all, like the Scriptures'.
    expect(screen.queryByRole('button', { name: /^♪?\s*Volume One/ })).toBeNull();
    const volumesRow = screen.getByRole('button', { name: /The Volumes of Truth/ });
    expect(volumesRow.textContent).toContain('1 collection');     // the fixture registry has one (and it agrees)
    fireEvent.click(volumesRow);
    expect(onOpenVolumes).toHaveBeenCalledTimes(1);
    expect(onOpenCollection).not.toHaveBeenCalled();

    const bibleRow = screen.getByRole('button', { name: /Biblical Restoration Ministries/ });
    expect(bibleRow.textContent).toContain('2 books');            // counted off its own manifest
    fireEvent.click(bibleRow);
    expect(onOpenCollection).toHaveBeenCalledWith('bible-brm-kjv');
  });

  /* mt1 (Corbin 2026-09-21, S22 screenshot of this shelf): "1 books · chapter
     by chapter" under Matthew and John. Every source row gets a true second
     line: a counted noun that agrees, the registry's one-line description
     where it has one, and the reader when the manifest knows it. */
  it('every Browse row has a true second line: agreeing plurals, the edition description, the reader the manifest knows', () => {
    installGlobals({ votManifest: false });
    globalThis.BIBLE_AUDIO_MANIFEST['bible-tsot-matthew:matthew'] = [['tsot-1', 'B']];
    globalThis.BIBLE_AUDIO_MANIFEST['bible-john-film:john'] = [['gjn-1', '']];
    renderScreen();
    const lineUnder = (re) => screen.getByRole('button', { name: re }).querySelector('small').textContent;
    expect(lineUnder(/Biblical Restoration Ministries/)).toBe('2 books · chapter by chapter');
    // The reader rides the second line only when the label does not already
    // name one: Matthew's label says "(read by Benjamin)", and at 360 px the
    // repeat pushed "· R…" off the end of the line (headless look, 21:2x).
    expect(lineUnder(/The Scriptures of Truth/)).toBe('1 book · Corrected Version by Timothy, with The Lord');
    globalThis.BIBLE_AUDIO_MANIFEST['bible-brm-kjv:genesis'] = [['g', 'T']];   // a reader the label does not carry
    cleanup(); renderScreen();
    expect(lineUnder(/Biblical Restoration Ministries/)).toBe('2 books · Read by Timothy');
    expect(lineUnder(/The Gospel of John/)).toBe('1 book · Film audio, listening only');
    expect(lineUnder(/The Volumes of Truth/)).toBe('1 collection · the Letters read aloud');
    expect(document.querySelector('.audio-library-browse').textContent).not.toMatch(/\b1 (books|collections)\b/);
  });

  /* 2026-09-12: an edition whose assets are not on the release (tsot-matthew,
     every chapter 404ed live) was offered nowhere, through ONE registry flag and
     ONE predicate (utils/audio-track.hide.test.js owns the registry half). The
     shelf is the first door: it lists the REAL registry, so the counts here are
     the registry's. 2026-09-13: the mirror landed and the flag line is deleted;
     this case reads the edition back on the shelf, so the flag's return reddens
     it. The filter itself is dormant on this registry (nothing is flagged): the
     derived line at the end keeps the shelf ON the predicate, and the synthetic
     Settings case is the live witness that a flagged entry is filtered. */
  it('the shelf offers every edition the registry OFFERS — all five today, tsot-matthew back among them (mirrored 2026-09-13)', () => {
    installGlobals({ votManifest: false });
    // Same fixture as the hide's case: the manifest carries the edition's row,
    // so the shelf's answer is the flag's alone.
    globalThis.BIBLE_AUDIO_MANIFEST['bible-tsot-matthew:matthew'] = [['tsot-1', '']];
    renderScreen();
    // The browse shelf only: the saved-recordings row shares the row class.
    const rows = [...document.querySelectorAll('.audio-library-browse .audio-library-shelf-row')]
      .map((row) => row.querySelector('strong').textContent)
      .filter((label) => label !== 'The Volumes of Truth');
    // The door itself, as the reader sees it:
    expect(rows).toContain(AT.BIBLE_AUDIO_EDITIONS['tsot-matthew'].label);
    expect(Object.keys(AT.BIBLE_AUDIO_EDITIONS)).toHaveLength(5);
    expect(rows).toHaveLength(5);                                  // none hidden today
    // And the rule it follows — the same predicate every other door asks:
    expect(typeof AT.bibleAudioOffered, 'audio-track.js must export bibleAudioOffered').toBe('function');
    expect(rows).toEqual(Object.values(AT.BIBLE_AUDIO_EDITIONS).filter(AT.bibleAudioOffered).map((e) => e.label));
  });

  it('turns the active recording into a clear control deck with progress and contextual actions', () => {
    setPlayerState({ queue: [savedTrack], qi: 0, status: 'playing', time: 48, duration: 120 });
    const openTrack = vi.fn();
    renderScreen({ onOpenTrack: openTrack });
    expect(screen.getByText('Playing now')).toBeTruthy();
    // The shared scrubber, not a painted div: a listener can MOVE this one.
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider.value).toBe('48');
    expect(slider.max).toBe('120');
    fireEvent.change(slider, { target: { value: '90' } });
    expect(player.seek).toHaveBeenCalledWith(90);

    fireEvent.click(screen.getByRole('button', { name: 'Pause current recording' }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open current recording text' }));
    expect(openTrack).toHaveBeenCalledWith(savedTrack);
    fireEvent.click(screen.getByRole('button', { name: 'Remove current recording from saved recordings' }));
    expect(globalThis.AudioLibraryStore.toggleSaved).toHaveBeenCalledWith(savedTrack);
  });

  it('carries the mini-player transport rules onto the hub card', () => {
    // A queue of one: prev survives as a Restart, next is absent — the same
    // conditional pair AudioPlayerBar renders.
    setPlayerState({ queue: [savedTrack], qi: 0, status: 'playing', time: 10, duration: 120 });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Restart current recording' }));
    expect(player.prev).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Next recording' })).toBeNull();

    cleanup();
    setPlayerState({ queue: [savedTrack, recentTrack], qi: 0, status: 'playing', time: 10, duration: 120 });
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Restart current recording' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next recording' }));
    expect(player.prev).toHaveBeenCalledTimes(2);
    expect(player.next).toHaveBeenCalledTimes(1);
  });

  it('drops one recent row without clearing the whole trail', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Remove The Narrow Path from recently played' }));
    expect(globalThis.AudioLibraryStore.removeRecent).toHaveBeenCalledWith(recentTrack.url);
    expect(globalThis.AudioLibraryStore.clearRecent).not.toHaveBeenCalled();
  });
});

describe('AudioLibraryScreen -- the read-along badge', () => {
  /* Hub order 2026-09-22: the shelf says which editions light their words.
     The John film is the one listening-only edition (audio-track.js declares
     `timed: false` — its narration is a translation this corpus does not
     carry), and until now nothing on the way in said so. */
  function badgeIn(name) {
    const row = [...document.querySelectorAll('.audio-library-shelf-row')].find((b) => b.textContent.includes(name));
    return row ? row.querySelector('.coverage-badge') : null;
  }

  it('marks a timed edition read-along and the film listening only', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:genesis': [['g', '']],
      'bible-john-film:john': [['j', '']],
    };
    renderScreen();
    const brm = badgeIn('Biblical Restoration Ministries');
    expect(brm.textContent).toBe('Read-along');
    expect(brm.className).toContain('coverage-badge-read-along');
    const film = badgeIn('Gospel of John');
    expect(film.textContent).toBe('Listening only');
    expect(film.getAttribute('title')).toMatch(/not timed/i);
  });

  it('gives the Letters shelf its badge too -- every letter is timed', () => {
    renderScreen();
    expect(badgeIn('The Volumes of Truth').textContent).toBe('Read-along');
  });
});
