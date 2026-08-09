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
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioLibraryScreen } from './AudioLibraryScreen.jsx';

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
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'vot-one-index', label: 'Volume One' }];
  globalThis.COL_BY_KEY = new Map([['one', { letterScreen: 'vot-one-letter' }]]);
  delete globalThis.AUDIO_MANIFEST;
  if (votManifest) globalThis.AUDIO_MANIFEST = { 'one:wide-path': [['idWide', 'B']] };
  globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': [['g', '']], 'bible-brm-kjv:exodus': [['e', '']] };
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    saved: () => saved, recent: () => recent,
    isSaved: (track) => activeSaved && !!track && track.url === savedTrack.url,
    toggleSaved: vi.fn(), clearRecent: vi.fn(),
  };
}

function renderScreen(overrides = {}) {
  return render(
    <AudioLibraryScreen
      onBack={() => {}} onOpenCollection={() => {}} onOpenSaved={() => {}} onOpenTrack={() => {}}
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
    expect(screen.getByRole('heading', { name: 'The Volumes of Truth' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Holy Bible' })).toBeTruthy();

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

  it('browse rows hand over the volKey, and Bible editions never wait for the VOT corpus', () => {
    installGlobals({ votManifest: false });                       // lazy corpus not yet landed
    const onOpenCollection = vi.fn();
    renderScreen({ onOpenCollection });

    const volRow = screen.getByRole('button', { name: /Volume One/ });
    expect(volRow.textContent).toContain('Loading recordings…');  // honest pre-corpus state
    fireEvent.click(volRow);
    expect(onOpenCollection).toHaveBeenCalledWith('one');

    const bibleRow = screen.getByRole('button', { name: /Biblical Restoration Ministries/ });
    expect(bibleRow.textContent).toContain('2 books');            // counted off its own manifest
    fireEvent.click(bibleRow);
    expect(onOpenCollection).toHaveBeenCalledWith('bible-brm-kjv');
  });

  it('turns the active recording into a clear control deck with progress and contextual actions', () => {
    setPlayerState({ queue: [savedTrack], qi: 0, status: 'playing', time: 48, duration: 120 });
    const openTrack = vi.fn();
    renderScreen({ onOpenTrack: openTrack });
    expect(screen.getByText('Playing now')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Playback progress' }).getAttribute('aria-valuenow')).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: 'Pause current recording' }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open current recording text' }));
    expect(openTrack).toHaveBeenCalledWith(savedTrack);
    fireEvent.click(screen.getByRole('button', { name: 'Remove current recording from saved recordings' }));
    expect(globalThis.AudioLibraryStore.toggleSaved).toHaveBeenCalledWith(savedTrack);
  });
});
