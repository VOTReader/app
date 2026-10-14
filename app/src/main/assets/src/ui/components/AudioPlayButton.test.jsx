// @ts-nocheck -- a fake player: HeroListen only subscribes to it.
/* HeroListen, the Bible screens' ▶ Listen (ra4, Corbin 2026-10-14): "Resume · N min left" when the screen's
   resume question says a Listen tap would pick the chapter up part-way; the tap itself is unchanged. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player } = vi.hoisted(() => ({ player: { subscribe: () => () => {}, getVersion: () => 0 } }));
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { HeroListen, resumePillText } from './AudioPlayButton.jsx';

afterEach(() => { cleanup(); });

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
