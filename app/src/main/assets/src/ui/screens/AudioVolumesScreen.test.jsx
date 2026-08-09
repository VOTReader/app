// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player } = vi.hoisted(() => ({
  player: {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => ({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 }),
    collectionHasAudio: vi.fn((volKey) => volKey === 'one'),
  },
}));

vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioVolumesScreen } from './AudioVolumesScreen.jsx';

function installGlobals({ votManifest = true } = {}) {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.COLLECTIONS = [
    { volKey: 'one', cardId: 'vot-one-index', label: 'Volume One' },
    { volKey: 'two', cardId: 'vot-two-index', label: 'Volume Two' },
    { volKey: 'hm', cardId: null, label: 'Hidden Manna' },
  ];
  delete globalThis.AUDIO_MANIFEST;
  if (votManifest) globalThis.AUDIO_MANIFEST = { 'one:x': [['id1', 'B']] };
}

function renderScreen(overrides = {}) {
  return render(
    <AudioVolumesScreen
      onBack={() => {}} onOpenCollection={() => {}}
      onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
      theme="dark" onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  player.collectionHasAudio.mockClear();
  installGlobals();
});

afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'LibraryNav', 'COLLECTIONS', 'AUDIO_MANIFEST']) delete globalThis[key];
});

describe('AudioVolumesScreen', () => {
  it('lists every public collection with an honest availability line, Hidden Manna excluded', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'The Volumes of Truth' })).toBeTruthy();
    const one = screen.getByRole('button', { name: /Volume One/ });
    const two = screen.getByRole('button', { name: /Volume Two/ });
    expect(one.textContent).toContain('Recordings available');
    expect(two.textContent).toContain('No recordings yet');
    expect(screen.queryByText('Hidden Manna')).toBeNull();
    expect(screen.getByLabelText('2 collections').textContent).toBe('2');
  });

  it('hands the volKey to the coordinator wiring', () => {
    const onOpenCollection = vi.fn();
    renderScreen({ onOpenCollection });
    fireEvent.click(screen.getByRole('button', { name: /Volume Two/ }));
    expect(onOpenCollection).toHaveBeenCalledWith('two');
  });

  it('says Loading while the lazy corpus is still on its way', () => {
    installGlobals({ votManifest: false });
    renderScreen();
    expect(screen.getByRole('button', { name: /Volume One/ }).textContent).toContain('Loading recordings…');
  });
});
