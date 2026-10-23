// @ts-nocheck
/* The 👍/👎 pair (sy4-3; pictures song-voting-mockups 05-08, sv-mock README "Components"): two toggle buttons
   with aria-pressed and named labels, one vote that changes or clears, the first-👎 note once per install, and the
   song page's question. No numbers. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { SongVotePair, SongVoteAsk } from './SongVoteParts.jsx';
import { SongVotes, _resetSongVotesForTests } from '../../utils/song-votes.js';

const SONG = { id: 'aaaaaaaaaaaa', t: 'Come Home' };
const OTHER = { id: 'bbbbbbbbbbbb', t: 'True Faith' };

const hadReactDOM = 'ReactDOM' in globalThis;
const oldReactDOM = globalThis.ReactDOM;
beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;   // the note is a portal on the body (the app's ReactDOM global)
  _resetSongVotesForTests();
  const data = new Map();
  globalThis.IDBAdapter = { get: async (_s, k) => data.get(k), put: async (_s, k, v) => { data.set(k, v); } };
  globalThis.fetch = vi.fn(async () => ({ status: 204, ok: true }));
});
afterEach(() => {
  cleanup();
  _resetSongVotesForTests();
  delete globalThis.IDBAdapter;
  delete globalThis.fetch;
  if (hadReactDOM) globalThis.ReactDOM = oldReactDOM; else delete globalThis.ReactDOM;
});

const up = () => screen.getByRole('button', { name: 'Like Come Home' });
const down = () => screen.getByRole('button', { name: 'Not for me: Come Home' });

describe('the pair', () => {
  it('starts with neither pressed and shows no number', () => {
    const { container } = render(<SongVotePair song={SONG} />);
    expect(up().getAttribute('aria-pressed')).toBe('false');
    expect(down().getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('like, tap again to clear; thumbs-down replaces the like', () => {
    render(<SongVotePair song={SONG} />);
    act(() => { fireEvent.click(up()); });
    expect(up().getAttribute('aria-pressed')).toBe('true');
    expect(SongVotes.voteOf(SONG.id)).toBe(1);
    act(() => { fireEvent.click(up()); });
    expect(up().getAttribute('aria-pressed')).toBe('false');
    act(() => { fireEvent.click(up()); });
    act(() => { fireEvent.click(down()); });
    expect(up().getAttribute('aria-pressed')).toBe('false');
    expect(down().getAttribute('aria-pressed')).toBe('true');
    expect(SongVotes.voteOf(SONG.id)).toBe(-1);
  });

  it('a tap on the pair does not reach the row under it (the row plays on a tap)', () => {
    const onRow = vi.fn();
    render(<div onClick={onRow}><SongVotePair song={SONG} /></div>);
    act(() => { fireEvent.click(up()); });
    expect(onRow).not.toHaveBeenCalled();
  });

  it('two pairs for one song agree; another song is untouched', () => {
    render(<><SongVotePair song={SONG} /><SongVoteAsk song={SONG} /><SongVotePair song={OTHER} /></>);
    act(() => { fireEvent.click(screen.getAllByRole('button', { name: 'Like Come Home' })[0]); });
    for (const b of screen.getAllByRole('button', { name: 'Like Come Home' })) expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Like True Faith' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the first thumbs-down note', () => {
  it('shows once per install, says only you see it, and OK closes it', () => {
    render(<SongVotePair song={SONG} />);
    act(() => { fireEvent.click(down()); });
    expect(screen.getByText('Only you see this. We’ll play it less for you.')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'OK' })); });
    expect(screen.queryByText(/Only you see this/)).toBe(null);
    act(() => { fireEvent.click(down()); });   // clear
    act(() => { fireEvent.click(down()); });   // again: no note the second time
    expect(screen.queryByText(/Only you see this/)).toBe(null);
    expect(SongVotes.downNoteSeen()).toBe(true);
  });

  it('a tap elsewhere closes it; no timer', async () => {
    vi.useFakeTimers();
    try {
      render(<><SongVotePair song={SONG} /><p>elsewhere</p></>);
      act(() => { fireEvent.click(down()); });
      act(() => { vi.advanceTimersByTime(60000); });
      expect(screen.getByText(/Only you see this/)).toBeTruthy();
      act(() => { fireEvent.pointerDown(screen.getByText('elsewhere')); });
      expect(screen.queryByText(/Only you see this/)).toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the song page question', () => {
  it('asks in words and carries the pair', () => {
    render(<SongVoteAsk song={SONG} />);
    expect(screen.getByText('Do you like this song?')).toBeTruthy();
    expect(up()).toBeTruthy();
    expect(down()).toBeTruthy();
  });
});
