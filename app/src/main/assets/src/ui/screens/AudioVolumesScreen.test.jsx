// @ts-nocheck -- classic-global screen contract is isolated here.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player } = vi.hoisted(() => ({
  player: {
    subscribe: () => () => {},
    getVersion: () => 0,
    getShape: () => '0|',
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
    expect(screen.getByText('2 collections').parentElement.querySelector('[aria-hidden]').textContent).toBe('2');
  });

  // Downloads brief section 7 item 16 (RC.3): with no signal it said "Recordings available" over rows that need one.
  it('with no signal says how much of each collection is on the phone, not "Recordings available"', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    globalThis.OfflineAudio = {
      subscribe: () => () => {}, getVersion: () => 0, available: () => true,
      items: () => [{ url: 'u1', key: 'one:a', title: 'A', bytes: 1 }, { url: 'u2', key: 'one:a', title: 'A 2', bytes: 1 }, { url: 'u3', key: 'one:b', title: 'B', bytes: 1 }],
    };
    try {
      renderScreen();
      expect(screen.getByRole('button', { name: /Volume One/ }).textContent).toContain('2 on this phone · the rest need a connection');
      expect(screen.getByRole('button', { name: /Volume Two/ }).textContent).toContain('No recordings yet');
      cleanup();
      globalThis.OfflineAudio.items = () => [];
      renderScreen();
      expect(screen.getByRole('button', { name: /Volume One/ }).textContent).toContain('Needs a connection');
    } finally {
      delete globalThis.OfflineAudio;
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    }
  });

  // D4c (downloads brief 3h): online, a collection part on the phone says how much; all of it, All N.
  it('online, a collection with downloads says "2 of 3 on this phone", and All 3 once every recording is there', () => {
    globalThis.colLetterArr = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    player.hasAudio = () => true;
    globalThis.OfflineAudio = {
      subscribe: () => () => {}, getVersion: () => 0, available: () => true,
      items: () => [{ url: 'u1', key: 'one:a', title: 'A', bytes: 1 }, { url: 'u3', key: 'one:b', title: 'B', bytes: 1 }],
    };
    try {
      renderScreen();
      expect(screen.getByRole('button', { name: /Volume One/ }).textContent).toContain('2 of 3 on this phone');
      cleanup();
      globalThis.OfflineAudio.items = () => ['a', 'b', 'c'].map((id) => ({ url: 'u' + id, key: 'one:' + id, title: id, bytes: 1 }));
      renderScreen();
      expect(screen.getByRole('button', { name: /Volume One/ }).textContent).toContain('All 3 on this phone');
    } finally {
      delete globalThis.OfflineAudio;
      delete globalThis.colLetterArr;
      delete player.hasAudio;
    }
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
