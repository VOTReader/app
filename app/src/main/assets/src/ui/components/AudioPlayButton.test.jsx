// @ts-nocheck -- a fake player: HeroListen only subscribes to it.
/* HeroListen, the Bible screens' ▶ Listen (ra4, Corbin 2026-10-14): "Resume · N min left" when the screen's
   resume question says a Listen tap would pick the chapter up part-way; the tap itself is unchanged. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, setPlayerState } = vi.hoisted(() => {
  let playerState;
  const player = { subscribe: () => () => {}, getVersion: () => 0, getState: () => playerState, toggle: vi.fn() };
  return { player, setPlayerState: (next) => { playerState = next; } };
});
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { HeroListen, STILL_LOADING_MS, resumePillText } from './AudioPlayButton.jsx';

const JONAH_2 = { key: 'bible-brm-kjv:jonah', partLabel: 'Chapter 2', url: 'https://example.test/brm1_jonah_002.mp3' };

beforeEach(() => {
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  player.toggle.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('HeroListen: RESUME · N MIN LEFT (ra4)', () => {
  it('a chapter with a saved place says how long is left, and the tap is the same Listen', () => {
    const onClick = vi.fn();
    render(<HeroListen onClick={onClick} canPlay={() => true} resume={() => ({ at: 85, left: 155 })} />);
    const pill = screen.getByRole('button', { name: 'Resume · 3 min left' });
    expect(pill.textContent).toBe('Resume · 3 min left');
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no saved place, or no question asked, is the plain Listen', () => {
    render(<HeroListen onClick={() => {}} canPlay={() => true} resume={() => null} />);
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();
    cleanup();
    render(<HeroListen onClick={() => {}} canPlay={() => true} />);
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();
  });

  it('offline and not on the phone: disabled plain Listen, never a resume it cannot make', () => {
    render(<HeroListen onClick={() => {}} canPlay={() => false} resume={() => ({ at: 85, left: 155 })} />);
    const pill = screen.getByRole('button', { name: 'Listen' });
    expect(pill.disabled).toBe(true);
  });

  it('resumePillText: the nearest whole minute (3:11 left is 3, as the approved mock shows), never 0; no length is Resume alone', () => {
    expect(resumePillText({ at: 184, left: 191 })).toBe('Resume · 3 min left');
    expect(resumePillText({ at: 10, left: 150 })).toBe('Resume · 3 min left');
    expect(resumePillText({ at: 10, left: 89 })).toBe('Resume · 1 min left');
    expect(resumePillText({ at: 10, left: 5 })).toBe('Resume · 1 min left');
    expect(resumePillText({ at: 10, left: 0 })).toBe('Resume');
  });
});

/* U04.5 + U10.2 (UX sweep 2026-10-22): the hero said Listen while its own chapter played, and on a slow network a
   Listen pill said PAUSE at 0:00 for 20 to 30 s. It now says what the audio is doing. */
describe('HeroListen: says what the audio is doing (U04.5, U10.2)', () => {
  it('its chapter playing: Pause, and the tap pauses it instead of starting the chapter again', () => {
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'playing', time: 40, duration: 240 });
    const onClick = vi.fn();
    render(<HeroListen onClick={onClick} canPlay={() => true} resume={() => ({ at: 85, left: 155 })} here={() => true} />);
    const pill = screen.getByRole('button', { name: 'Pause the reading' });
    expect(pill.textContent).toBe('Pause');
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pill);
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('another chapter playing: this one’s Listen (or Resume), and the tap starts this chapter', () => {
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'playing', time: 40, duration: 240 });
    const onClick = vi.fn();
    render(<HeroListen onClick={onClick} canPlay={() => true} resume={() => null} here={() => false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it('its chapter loaded and paused part-way: Resume from the bar’s own clock, and the tap un-pauses it', () => {
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'paused', time: 60, duration: 240 });
    const onClick = vi.fn();
    render(<HeroListen onClick={onClick} canPlay={() => true} resume={() => null} here={() => true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume · 3 min left' }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('the minutes ride their own span, so large text can drop them and keep Resume whole (RC.8)', () => {
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'paused', time: 60, duration: 240 });
    render(<HeroListen onClick={vi.fn()} canPlay={() => true} resume={() => null} here={() => true} />);
    const pill = screen.getByRole('button', { name: 'Resume · 3 min left' });
    expect(pill.querySelector('.pill-left').textContent).toBe(' · 3 min left');
    expect(pill.textContent).toBe('Resume · 3 min left');
  });

  it('offline, its chapter playing can still be paused', () => {
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'playing', time: 40, duration: 240 });
    render(<HeroListen onClick={() => {}} canPlay={() => false} here={() => true} />);
    expect(screen.getByRole('button', { name: 'Pause the reading' }).disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('loading: Loading…, never Pause; after about 8 s, Still loading · Cancel; the tap takes the start back', () => {
    vi.useFakeTimers();
    setPlayerState({ queue: [JONAH_2], qi: 0, status: 'loading', time: 0, duration: 0 });
    const onClick = vi.fn();
    render(<HeroListen onClick={onClick} canPlay={() => true} here={() => true} />);
    const pill = screen.getByRole('button', { name: 'Loading the reading' });
    expect(pill.textContent).toBe('Loading…');
    expect(pill.getAttribute('aria-busy')).toBe('true');
    act(() => { vi.advanceTimersByTime(STILL_LOADING_MS - 100); });
    expect(pill.textContent).toBe('Loading…');
    act(() => { vi.advanceTimersByTime(200); });
    expect(STILL_LOADING_MS).toBe(8000);
    const late = screen.getByRole('button', { name: 'Still loading. Cancel' });
    expect(late.textContent).toBe('Still loading · Cancel');
    fireEvent.click(late);
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
