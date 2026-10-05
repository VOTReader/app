// @ts-nocheck -- a fake player; NowPlaying is a controller over it.
/* rv1 Now Playing (overhaul review build): the typographic cover, the transport (−15 · prev · play · next · +15),
   the chip row (speed keeps the 1 % control, sleep, voice, parts, save) and "Open the reading". No queue. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player } = vi.hoisted(() => ({
  player: {
    readerLabel: (code) => ({ B: 'Benjamin' }[code] || null),
    getSleepRemainingSeconds: vi.fn(() => 0),
    liveLetter: vi.fn(() => null), bibleChapterOfTrack: () => 0, getPreciseTime: () => 30,
    skip: vi.fn(), prev: vi.fn(), next: vi.fn(), toggle: vi.fn(), stop: vi.fn(), playAt: vi.fn(),
    setSleepTimer: vi.fn(), setSleepAtTrackEnd: vi.fn(), clearSleepTimer: vi.fn(), setPlaybackRate: vi.fn(), seek: vi.fn(),
  },
}));
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { NowPlaying, listenEyebrow } from './NowPlaying.jsx';

const T = { key: 'one:a', url: 'u:a', title: 'Belong to the Church Without Walls', sub: 'Volume One', readerCode: 'B' };
const base = (over = {}) => ({
  state: { queue: [T, { key: 'one:b', url: 'u:b', title: 'Next' }], qi: 0, status: 'playing', time: 30, duration: 600, rate: 1, ...over.state },
  current: T, voices: null, saved: false, onToggleSave: vi.fn(), onClose: vi.fn(), trapRef: { current: null }, ...over,
});

beforeEach(() => {
  globalThis.COL_BY_KEY = new Map([['one', { key: 'one', label: 'Volume One', kind: 'letter', letterScreen: 'vot-one-letter' }]]);
  globalThis.colLetterArr = () => [{ id: 'a', num: 7 }];
  Object.values(player).forEach((v) => { if (typeof v === 'function' && 'mockClear' in v) v.mockClear(); });
});
afterEach(() => { cleanup(); delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr; delete window.__openAudioText; });

describe('listenEyebrow', () => {
  it('names a letter, and the preface that lives outside the letter list', () => {
    globalThis.colPreface = () => ({ id: 'pref' });
    try {
      expect(listenEyebrow({ key: 'one:a' })).toBe('Volume One · Letter 7');
      expect(listenEyebrow({ key: 'one:pref' })).toBe('Volume One · Preface');
      expect(listenEyebrow({ key: 'nope:x', sub: 'Purity' })).toBe('Purity');
    } finally { delete globalThis.colPreface; }
  });
});

describe('NowPlaying', () => {
  it('draws the typographic cover: eyebrow, title, reader', () => {
    render(<NowPlaying {...base()} />);
    expect(screen.getByRole('heading', { name: T.title })).toBeTruthy();
    expect(screen.getByText('Volume One · Letter 7')).toBeTruthy();
    expect(screen.getByText('Read by Benjamin')).toBeTruthy();
    expect(screen.getByText('−9:30')).toBeTruthy();
  });

  it('the transport: −15, previous, pause, next, +15 call the one player', () => {
    render(<NowPlaying {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(player.skip.mock.calls).toEqual([[-15], [15]]);
    expect(player.prev).toHaveBeenCalled();
    expect(player.toggle).toHaveBeenCalled();
    expect(player.next).toHaveBeenCalled();
  });

  it('sleep: the panel arms minutes, the end of this recording, or off', () => {
    render(<NowPlaying {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sleep timer: Off' }));
    fireEvent.click(screen.getByRole('button', { name: '30 min' }));
    expect(player.setSleepTimer).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByRole('button', { name: 'Sleep timer: Off' }));
    fireEvent.click(screen.getByRole('button', { name: 'End of this recording' }));
    expect(player.setSleepAtTrackEnd).toHaveBeenCalled();
  });

  it('speed opens the full speed control (presets and the 1 % slider)', () => {
    render(<NowPlaying {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speed 1×' }));
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('voice lists the readings and switches; parts are offered only for a multi-part letter', () => {
    const select = vi.fn();
    render(<NowPlaying {...base({ voices: { kind: 'reader', activeLabel: 'Benjamin', chips: [{ id: 'B', label: 'Benjamin', active: true, select: vi.fn() }, { id: 'T', label: 'Timothy', active: false, select }] } })} />);
    expect(screen.getByRole('button', { name: 'Parts' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Timothy' }));
    expect(select).toHaveBeenCalled();
  });

  it('Save toggles, and Open the reading hands over to the text and closes', () => {
    const open = vi.fn();
    window.__openAudioText = open;
    const props = base();
    render(<NowPlaying {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '☆ Save' }));
    expect(props.onToggleSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Open the reading/ }));
    expect(open).toHaveBeenCalledWith(T);
    expect(props.onClose).toHaveBeenCalled();
  });
});
