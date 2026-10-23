// @ts-nocheck: sets the lazy lengths table and its global the way the bundle does.
/* A plan's Listen says how long today's portion plays (reading-plan brief C5, player brief 3f; pl-l2 L3):
   "Listen · 14 min" once every recording of it has a known length, plain "Listen" until then. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioLengths } from '../../utils/audio-lengths.js';
import { PlanListen } from './TodayCard.jsx';

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const REFS = [{ bid: 'genesis', cid: 1 }, { bid: 'genesis', cid: 2 }];
const tracksOf = (refs) => refs.map((r) => ({ url: URL_OF(r.bid + r.cid) }));

afterEach(() => { cleanup(); delete globalThis.AUDIO_LENGTHS; delete globalThis.AudioLengths; });

describe('PlanListen', () => {
  it('reads "Listen · N min" from the recordings\' lengths, and plays on a tap', () => {
    globalThis.AudioLengths = AudioLengths;
    globalThis.AUDIO_LENGTHS = { genesis1: [1e6, 400], genesis2: [1e6, 440] };
    let heard = 0;
    render(<PlanListen refs={REFS} tracksOf={tracksOf} label="Listen to Bible in a Year" onListen={() => { heard++; }} />);
    const btn = screen.getByRole('button', { name: 'Listen to Bible in a Year, about 14 min' });
    expect(btn.textContent).toBe('Listen · 14 min');
    fireEvent.click(btn);
    expect(heard).toBe(1);
  });

  it('is plain Listen while any length is unknown, or with no way to the tracks', () => {
    globalThis.AudioLengths = AudioLengths;
    globalThis.AUDIO_LENGTHS = { genesis1: [1e6, 400] };
    const { unmount } = render(<PlanListen refs={REFS} tracksOf={tracksOf} label="Listen" onListen={() => {}} />);
    expect(screen.getByRole('button').textContent).toBe('Listen');
    unmount();
    render(<PlanListen refs={REFS} label="Listen" onListen={() => {}} />);
    expect(screen.getByRole('button').textContent).toBe('Listen');
  });
});
