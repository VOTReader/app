// @ts-nocheck -- a fake player and hand-made corpus globals.
/* rv1 Now Playing's live text (audit-listen 5.4 phase 2, sheet 37): the clause under the clock in large serif, the
   next one dimmed; cut from the letter's blocks with the sync rows' offsets; letters only; a tap opens the reading. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player, clock } = vi.hoisted(() => {
  const clock = { t: 0 };
  return {
    clock,
    player: { bibleChapterOfTrack: vi.fn(() => 0), getPreciseTime: () => clock.t },
  };
});
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));
vi.mock('../../utils/sync-loaders.js', () => ({
  loadAudioSync: vi.fn(), loadBibleSync: vi.fn(),
  audioSyncStore: { subscribe: () => () => {}, getVersion: () => 0 },
  bibleSyncStore: { subscribe: () => () => {}, getVersion: () => 0 },
  audioSyncSectionsStore: { subscribe: () => () => {}, getVersion: () => 0 },
}));

import { NowPlayingText, clauseText } from './NowPlayingText.jsx';

const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const LETTER = { id: 'a', num: 7, blocks: [
  { type: 'heading', text: 'Belong to the Church Without Walls' },
  para('I belong to no church named of men. I belong to The Lord, YahuShua HaMashiach,'),
  para('Whole paragraph read as one.'),
] };
const T = { key: 'one:a', url: 'https://x/releases/download/audio-v1/one-a.mp3', title: 'Belong' };
const ROWS = [[10, 1, 0, 35, 0], [13, 1, 36, 78, 0], [20, 2, -1, -1, 0]];
const state = (over = {}) => ({ queue: [T], qi: 0, status: 'paused', time: 0, ...over });

beforeEach(() => {
  globalThis.COL_BY_KEY = new Map([['one', { key: 'one', label: 'Volume One' }]]);
  globalThis.colLetterArr = () => [LETTER];
  globalThis.colPreface = () => null;
  globalThis.AUDIO_SYNC = { 'one:a': ROWS };
  globalThis.AUDIO_MANIFEST = { 'one:a': [['one-a']] };
  clock.t = 0;
});
afterEach(() => {
  cleanup();
  for (const k of ['COL_BY_KEY', 'colLetterArr', 'colPreface', 'AUDIO_SYNC', 'AUDIO_MANIFEST', 'AUDIO_SYNC_ALT']) delete globalThis[k];
});

describe('clauseText', () => {
  it('cuts a clause, gives a Format-B row its whole block, and paints nothing for a stale row', () => {
    expect(clauseText(LETTER.blocks, ROWS[0])).toBe('I belong to no church named of men.');
    expect(clauseText(LETTER.blocks, ROWS[2])).toBe('Whole paragraph read as one.');
    expect(clauseText(LETTER.blocks, [1, 1, 70, 90, 0])).toBe('');
    expect(clauseText(LETTER.blocks, [1, 0, 0, 5, 0])).toBe('');   // a heading has no text domain
  });
});

describe('NowPlayingText', () => {
  it('before the first clause: only what comes next, dimmed', () => {
    clock.t = 2;
    const { container } = render(<NowPlayingText state={state({ time: 2 })} current={T} onOpen={null} />);
    expect(container.querySelector('.now-playing-text-now')).toBeNull();
    expect(container.querySelector('.now-playing-text-next').textContent).toBe('I belong to no church named of men.');
  });

  it('the clause under the clock, the next one under it; a tap opens the reading', () => {
    clock.t = 14;
    const onOpen = vi.fn();
    const { container } = render(<NowPlayingText state={state({ time: 14 })} current={T} onOpen={onOpen} />);
    expect(container.querySelector('.now-playing-text-now').textContent).toBe('I belong to The Lord, YahuShua HaMashiach,');
    expect(container.querySelector('.now-playing-text-next').textContent).toBe('Whole paragraph read as one.');
    fireEvent.click(screen.getByRole('button', { name: /YahuShua HaMashiach, \(open the reading here\)/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('moves with a seek while paused', () => {
    clock.t = 11;
    const { container, rerender } = render(<NowPlayingText state={state({ time: 11 })} current={T} onOpen={null} />);
    expect(container.querySelector('.now-playing-text-now').textContent).toBe('I belong to no church named of men.');
    clock.t = 21;
    act(() => { rerender(<NowPlayingText state={state({ time: 21 })} current={T} onOpen={null} />); });
    expect(container.querySelector('.now-playing-text-now').textContent).toBe('Whole paragraph read as one.');
  });

  it('an alternate voice uses its own timeline, and one with none shows no pane (honest beats plausible)', () => {
    const alt = { ...T, url: 'https://x/releases/download/audio-v1/one-a-tim.mp3' };
    clock.t = 14;
    const { container } = render(<NowPlayingText state={state({ queue: [alt], time: 14 })} current={alt} onOpen={null} />);
    expect(container.querySelector('.now-playing-text')).toBeNull();
    cleanup();
    globalThis.AUDIO_SYNC_ALT = { 'one-a-tim': [[12, 2, -1, -1, 0]] };
    const again = render(<NowPlayingText state={state({ queue: [alt], time: 14 })} current={alt} onOpen={null} />);
    expect(again.container.querySelector('.now-playing-text-now').textContent).toBe('Whole paragraph read as one.');
  });

  it('a Bible chapter, a compilation and a letter with no timings draw nothing', () => {
    player.bibleChapterOfTrack.mockReturnValueOnce(3).mockReturnValueOnce(3);
    const bible = { key: 'bible-brm-kjv:gen', url: 'https://x/gen-3.mp3' };
    expect(render(<NowPlayingText state={state({ queue: [bible] })} current={bible} onOpen={null} />).container.innerHTML).toBe('');
    const comp = { key: null, url: 'https://x/wtlb-part-1.mp3' };
    expect(render(<NowPlayingText state={state({ queue: [comp] })} current={comp} onOpen={null} />).container.innerHTML).toBe('');
    delete globalThis.AUDIO_SYNC;
    expect(render(<NowPlayingText state={state()} current={T} onOpen={null} />).container.innerHTML).toBe('');
  });
});
