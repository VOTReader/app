import { describe, expect, it } from 'vitest';
import { decodeSongsRoute, encodeSongsRoute, pushSongsFrame, popSongsFrame, replaceSongsTop, SONGS_SCREEN } from './songs-route.js';

describe('songs-route: the Songs stack in audioColKey', () => {
  it('reads anything that is not ours as the hub, never a throw', () => {
    for (const key of [null, undefined, '', 'wtlb1', 'study:abc', 'songs:', 'songs:{bad json', 'songs:{"k":"hub"}', 'songs:[]', 'songs:[{"k":"nope"}]', 42]) {
      expect(decodeSongsRoute(key)).toEqual([{ k: 'hub' }]);
    }
  });

  it('round-trips hub, list, song and readings frames', () => {
    const frames = [{ k: 'hub', q: 'love awaits', st: 'worship' }, { k: 'list', v: 'col:wtlb1' }, { k: 'song', v: 'come-love-awaits-you' }, { k: 'readings' }];
    expect(decodeSongsRoute(encodeSongsRoute(frames))).toEqual(frames);
    expect(SONGS_SCREEN).toBe('audio-library-songs');
  });

  it('drops unreadable frames and bounds the strings', () => {
    const key = 'songs:' + JSON.stringify([{ k: 'hub', q: 'x'.repeat(500), st: 7 }, { k: 'list' }, { k: 'song', v: 'fam' }, 'junk']);
    const frames = decodeSongsRoute(key);
    expect(frames.length).toBe(2);
    expect(frames[0].q.length).toBe(160);
    expect(frames[0].st).toBeUndefined();
    expect(frames[1]).toEqual({ k: 'song', v: 'fam' });
  });

  it('pushes, pops to the bottom frame and then reports the way out', () => {
    let key = encodeSongsRoute([{ k: 'hub' }]);
    key = pushSongsFrame(key, { k: 'list', v: 'saved' });
    expect(decodeSongsRoute(key)).toEqual([{ k: 'hub' }, { k: 'list', v: 'saved' }]);
    key = popSongsFrame(key);
    expect(decodeSongsRoute(key)).toEqual([{ k: 'hub' }]);
    expect(popSongsFrame(key)).toBeNull();
  });

  it('a stack opened on a list (a letter page) leaves from that list, not through a hub', () => {
    const key = encodeSongsRoute([{ k: 'list', v: 'letter:wtlb1:come-love-awaits-you' }]);
    expect(popSongsFrame(key)).toBeNull();
  });

  it('replaces the top frame (the hub keeping its Find box under a list)', () => {
    const key = replaceSongsTop(encodeSongsRoute([{ k: 'hub' }]), { k: 'hub', q: 'love' });
    expect(decodeSongsRoute(key)).toEqual([{ k: 'hub', q: 'love' }]);
  });

  it('keeps the bottom frame when a long walk overflows the stack', () => {
    let key = encodeSongsRoute([{ k: 'hub' }]);
    for (let i = 0; i < 30; i++) key = pushSongsFrame(key, { k: 'song', v: 'fam-' + i });
    const frames = decodeSongsRoute(key);
    expect(frames.length).toBe(12);
    expect(frames[0]).toEqual({ k: 'hub' });
    expect(frames[frames.length - 1]).toEqual({ k: 'song', v: 'fam-29' });
  });
});
