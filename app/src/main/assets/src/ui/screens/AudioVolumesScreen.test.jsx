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
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';

function installGlobals({ votManifest = true } = {}) {
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
  delete globalThis.AudioPlayer;
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
