// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => playerState,
    toggle: vi.fn(),
    playTrack: vi.fn(),
  };
  return { player, setPlayerState: (next) => { playerState = next; } };
});

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioSavedScreen } from './AudioSavedScreen.jsx';

const wide = {
  key: 'one:wide-path', title: 'The Wide Path', sub: 'Volume One', partLabel: null,
  url: 'https://example.test/wide.mp3', readerCode: 'B', savedAt: 2,
};
const narrow = {
  key: 'one:narrow-path', title: 'The Narrow Path', sub: 'Volume One', partLabel: null,
  url: 'https://example.test/narrow.mp3', readerCode: 'T', savedAt: 1,
};

function installGlobals({ saved = [wide, narrow] } = {}) {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
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
  for (const key of ['ScreenLayout', 'LibraryNav', 'COL_BY_KEY', 'AudioLibraryStore']) delete globalThis[key];
});

describe('AudioSavedScreen', () => {
  it('lists every kept recording with play, text, and un-save at hand', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Saved recordings' })).toBeTruthy();
    expect(screen.getByText('The Wide Path')).toBeTruthy();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play The Wide Path' }));
    expect(player.playTrack).toHaveBeenCalledWith(wide);

    fireEvent.click(screen.getByRole('button', { name: 'Remove The Narrow Path from saved recordings' }));
    expect(globalThis.AudioLibraryStore.toggleSaved).toHaveBeenCalledWith(narrow);
  });

  it('search filters the shelf and reports the narrowed count honestly', () => {
    renderScreen();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search saved recordings' }), { target: { value: 'narrow' } });
    expect(screen.queryByText('The Wide Path')).toBeNull();
    expect(screen.getByText('The Narrow Path')).toBeTruthy();
    expect(screen.getByLabelText('2 saved recordings').textContent).toBe('1 of 2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search saved recordings' }), { target: { value: 'zzz' } });
    expect(screen.getByText(/No saved recordings match/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear recording search' }));
    expect(screen.getByText('The Wide Path')).toBeTruthy();
  });

  it('the text affordance hands the full track to the coordinator wiring', () => {
    const onOpenTrack = vi.fn();
    renderScreen({ onOpenTrack });
    fireEvent.click(screen.getByRole('button', { name: 'Open text for The Wide Path' }));
    expect(onOpenTrack).toHaveBeenCalledWith(wide);
  });

  it('an empty shelf explains how recordings arrive here', () => {
    installGlobals({ saved: [] });
    renderScreen();
    expect(screen.getByText(/Use the star beside any recording/)).toBeTruthy();
  });
});
