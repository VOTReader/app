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

function installGlobals({ saved = [savedTrack], recent = [recentTrack], activeSaved = true } = {}) {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'vot-one-index', label: 'Volume One' }];
  globalThis.COL_BY_KEY = new Map([['one', { letterScreen: 'vot-one-letter' }]]);
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    saved: () => saved, recent: () => recent,
    isSaved: (track) => activeSaved && !!track && track.url === savedTrack.url,
    toggleSaved: vi.fn(), clearRecent: vi.fn(),
  };
}

function renderScreen() {
  return render(
    <AudioLibraryScreen
      onBack={() => {}} onOpenCollection={() => {}} onOpenTrack={() => {}}
      onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
      theme="dark" onThemeChange={() => {}}
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
  for (const key of ['ScreenLayout', 'LibraryNav', 'COLLECTIONS', 'COL_BY_KEY', 'AudioLibraryStore']) delete globalThis[key];
});

describe('AudioLibraryScreen -- personal shelf redesign', () => {
  it('makes resume, saved, recent, and collection browsing immediately visible', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Listening Library' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search saved and recent recordings' })).toBeTruthy();
    expect(screen.getByLabelText('Listening Library summary').textContent).toBe('1 saved1 recent');
    expect(screen.getByRole('button', { name: 'Play The Wide Path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume last' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Volume One/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Resume last' }));
    expect(player.playTrack).toHaveBeenCalledWith(recentTrack);
  });

  it('filters both shelf sections without hiding the source browser', () => {
    renderScreen();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search saved and recent recordings' }), { target: { value: 'narrow' } });
    expect(screen.queryByText('The Wide Path')).toBeNull();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose a collection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear recording search' })).toBeTruthy();
  });

  it('turns the active recording into a clear control deck with progress and contextual actions', () => {
    setPlayerState({ queue: [savedTrack], qi: 0, status: 'playing', time: 48, duration: 120 });
    const openTrack = vi.fn();
    render(
      <AudioLibraryScreen
        onBack={() => {}} onOpenCollection={() => {}} onOpenTrack={openTrack}
        onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
        theme="dark" onThemeChange={() => {}}
      />
    );
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
