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
    toggle: vi.fn(),
    playTrack: vi.fn(),
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioSavedScreen } from './AudioSavedScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';

const wide = {
  key: 'one:wide-path', title: 'The Wide Path', sub: 'Volume One', partLabel: null,
  url: 'https://example.test/wide.mp3', readerCode: 'B', savedAt: 2,
};
const narrow = {
  key: 'one:narrow-path', title: 'The Narrow Path', sub: 'Volume One', partLabel: null,
  url: 'https://example.test/narrow.mp3', readerCode: 'T', savedAt: 1,
};

function installGlobals({ saved = [wide, narrow] } = {}) {
  globalThis.ScreenLayout = ({ children, utility }) => <main>{utility ? <h1>{utility.title}</h1> : null}{children}</main>;
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
  globalThis.COL_BY_KEY = new Map([['one', { letterScreen: 'vot-one-letter' }]]);
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    saved: () => saved, recent: () => [],
    isSaved: () => true, toggleSaved: vi.fn(), clearRecent: vi.fn(),
  };
}

function renderScreen(overrides = {}) {
  return render(
    <AudioSavedScreen
      onBack={() => {}} onOpenTrack={() => {}}
      onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
      theme="dark" onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  Object.values(player).forEach((value) => { if (typeof value === 'function' && 'mockClear' in value) value.mockClear(); });
  installGlobals();
});

afterEach(() => {
  cleanup();
  delete globalThis.AudioPlayer;
  for (const key of ['ScreenLayout', 'LibraryNav', 'COL_BY_KEY', 'AudioLibraryStore', 'AudioPositionsStore']) delete globalThis[key];
});

/** The bundle-b positions bridge, answering for one recording only. */
function installPositions(forUrl, record) {
  globalThis.AudioPositionsStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    getPosition: (track) => ((track && track.url) === forUrl ? record : null),
  };
}

describe('AudioSavedScreen (listen.html au-saved, au-saved0)', () => {
  it('lists every saved recording with play, star and one menu, under "Saved" in the bar', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Saved' })).toBeTruthy();
    expect(screen.getByText('2 saved')).toBeTruthy();
    expect(screen.getByText('Newest first')).toBeTruthy();
    expect(screen.getByText('The Wide Path')).toBeTruthy();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play The Wide Path' }));
    expect(player.playTrack).toHaveBeenCalledWith(wide);

    fireEvent.click(screen.getByRole('button', { name: 'Remove The Narrow Path from Saved' }));
    expect(globalThis.AudioLibraryStore.toggleSaved).toHaveBeenCalledWith(narrow);
  });

  it('search filters the list and says the narrowed count', () => {
    renderScreen();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search what you saved' }), { target: { value: 'narrow' } });
    expect(screen.queryByText('The Wide Path')).toBeNull();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();
    expect(screen.getByText('1 of 2 saved')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search what you saved' }), { target: { value: 'zzz' } });
    expect(screen.getByText(/Nothing you saved matches/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }));
    expect(screen.getByText('The Wide Path')).toBeTruthy();
  });

  it('the row menu opens the letter with the full track', () => {
    const onOpenTrack = vi.fn();
    renderScreen({ onOpenTrack });
    fireEvent.click(screen.getByRole('button', { name: 'More for The Wide Path' }));
    fireEvent.click(screen.getByRole('button', { name: /Open the letter/ }));
    expect(onOpenTrack).toHaveBeenCalledWith(wide);
  });

  it('says how much of a recording is left once the positions store knows', () => {
    installPositions(wide.url, { t: 1290, d: 1800 });
    renderScreen();
    // The row the store knows nothing about is untouched: no invented figure.
    expect(screen.getAllByText(/8:30 left/)).toHaveLength(1);
  });

  it('marks a recording the reader reached the end of as finished', () => {
    // Past the same 97% the player refuses to resume from, so the row never promises "0:04 left".
    installPositions(wide.url, { t: 1750, d: 1800 });
    renderScreen();
    expect(screen.getByText(/Finished/)).toBeTruthy();
  });

  it('empty: says how it fills, and its one button goes to the Volumes', () => {
    installGlobals({ saved: [] });
    const onOpenVolumes = vi.fn();
    renderScreen({ onOpenVolumes });
    expect(screen.getByText('Nothing saved yet')).toBeTruthy();
    expect(screen.getByText(/Tap the star beside any recording or song/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Browse The Volumes of Truth' }));
    expect(onOpenVolumes).toHaveBeenCalled();
  });

  it('a saved song sits in the same list, with its own play and star', () => {
    globalThis.SongCatalog = {
      loaded: true, subscribe: () => () => {}, getVersion: () => 0, load: vi.fn(),
      songById: (id) => (id === 's1' ? { id: 's1', t: 'A Test Song', cr: 'The flock', d: 125 } : null),
      songAlbumLabel: () => '',
    };
    globalThis.AudioLibraryStore.songSaved = () => ['s1', 'gone'];
    globalThis.AudioLibraryStore.toggleSongSaved = vi.fn();
    player.playSongs = vi.fn();
    try {
      renderScreen();
      expect(screen.getByText('3 saved')).toBeTruthy();
      expect(screen.getByText('Song · The flock · 2:05')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Play A Test Song' }));
      expect(player.playSongs).toHaveBeenCalledWith({ ids: ['s1'], startId: 's1', label: 'Saved' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove A Test Song from Saved' }));
      expect(globalThis.AudioLibraryStore.toggleSongSaved).toHaveBeenCalledWith('s1');
    } finally {
      delete globalThis.SongCatalog;
      delete player.playSongs;
    }
  });
});
