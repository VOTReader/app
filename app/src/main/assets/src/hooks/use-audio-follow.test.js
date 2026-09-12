// @ts-nocheck — drives a fake player store through the hook
/* w-audio-continue — RED for the follower ("Turn the Page with the Audio"; design-audio-continue.md §d).

   When the playing track crosses a UNIT boundary (another letter, another Bible chapter or book), the screen
   moves to the new reading ONLY when the active tab shows the unit that just ended — the live-pane rule. A
   reader on the Journal, Home, another reading, or with a sheet open (other than the listening desk) is never
   moved; the navigation pushes no history entry (suppressNextHistoryPush, the hardware-back handshake); the
   row off keeps the audio going and the screen still; window.__openReading() is the manual path either way. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('./use-history-sync.js', () => ({ suppressNextHistoryPush: vi.fn() }));
import { suppressNextHistoryPush } from './use-history-sync.js';
import { modalRegistry } from './use-modal-registry.js';
import { useAudioFollow } from './use-audio-follow.js';

const LETTER = (volKey, id, sub) => ({ key: volKey + ':' + id, title: id, sub, url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3', readerCode: 'B', partLabel: null });
const CHAPTER = (bookId, n) => ({ key: 'bible-brm-kjv:' + bookId, title: bookId, sub: 'KJV', url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/brm1_' + bookId + '_00' + n + '.mp3', readerCode: '', partLabel: 'Chapter ' + n });

/** A fake of the two player calls the hook makes, plus a way to move the queue. */
function fakePlayer(queue, qi = 0) {
  const subs = new Set();
  const st = { queue, qi, status: 'playing' };
  return {
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    getState: () => st,
    bibleChapterOfTrack: (t) => { const m = /Chapter (\d+)/.exec((t && t.partLabel) || ''); return m ? Number(m[1]) : 0; },
    advance: () => { st.qi++; subs.forEach((cb) => cb()); },
  };
}

function mount(player, pane, enabled = true) {
  globalThis.AudioPlayer = player;
  const setters = { setLetterId: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setScreen: vi.fn() };
  const hook = renderHook((p) => useAudioFollow(p), { initialProps: { enabled, ...pane, ...setters } });
  return { ...setters, hook };
}

beforeEach(() => {
  globalThis.COL_BY_KEY = new Map([
    ['one', { volKey: 'one', letterScreen: 'vot-one-letter', label: 'Volume One' }],
    ['two', { volKey: 'two', letterScreen: 'vot-two-letter', label: 'Volume Two' }],
  ]);
  suppressNextHistoryPush.mockClear();
});
afterEach(() => {
  delete globalThis.AudioPlayer;
  delete globalThis.COL_BY_KEY;
  delete globalThis.__openReading;
  for (const id of modalRegistry.openIds()) modalRegistry.unregister(id);
});

describe('the follower moves the live pane with the audio — and nothing else', () => {
  it('a letter boundary while the active tab shows the ended letter opens the next letter, without a history push', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setLetterId).toHaveBeenCalledWith('first');
    expect(m.setScreen).toHaveBeenCalledWith('vot-two-letter');
    expect(suppressNextHistoryPush, 'no history entry per reading the audio walks').toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the Journal', { screen: 'journal-hub', letterId: null, bookId: null, chapterNum: null }],
    ['Home (the shelf listener who never opened the reading)', { screen: 'home', letterId: null, bookId: null, chapterNum: null }],
    ['ANOTHER letter', { screen: 'vot-one-letter', letterId: 'somewhere-else', bookId: null, chapterNum: null }],
  ])('a reader on %s is never moved: the audio continues, the screen stays', (_where, pane) => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, pane);
    act(() => player.advance());
    expect(m.setLetterId).not.toHaveBeenCalled();
    expect(m.setScreen).not.toHaveBeenCalled();
    expect(suppressNextHistoryPush).not.toHaveBeenCalled();
  });

  it('a Bible chapter boundary inside a book follows too (today the wash goes dark there), and a book boundary lands on chapter 1', () => {
    const player = fakePlayer([CHAPTER('jonah', 4), CHAPTER('micah', 1)]);
    const m = mount(player, { screen: 'bible-ch', letterId: null, bookId: 'jonah', chapterNum: 4 });
    act(() => player.advance());
    expect(m.setBookId).toHaveBeenCalledWith('micah');
    expect(m.setChapterNum).toHaveBeenCalledWith(1);
    expect(m.setScreen).toHaveBeenCalledWith('bible-ch');
    // and inside a book: chapter 3 → 4 with the pane on 3
    const p2 = fakePlayer([CHAPTER('jonah', 3), CHAPTER('jonah', 4)]);
    const m2 = mount(p2, { screen: 'bible-ch', letterId: null, bookId: 'jonah', chapterNum: 3 });
    act(() => p2.advance());
    expect(m2.setChapterNum).toHaveBeenCalledWith(4);
  });

  it('with the row off the screen stays — and "Open the reading" (window.__openReading) still lands on the playing track', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null }, false);
    act(() => player.advance());
    expect(m.setScreen).not.toHaveBeenCalled();
    expect(typeof globalThis.__openReading).toBe('function');
    act(() => globalThis.__openReading());
    expect(m.setLetterId).toHaveBeenCalledWith('first');
    expect(m.setScreen).toHaveBeenCalledWith('vot-two-letter');
  });

  it('an open sheet other than the listening desk blocks the follow; the desk alone does not', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    act(() => player.advance());
    expect(m.setScreen, 'a page must not swap under a finger mid-note').not.toHaveBeenCalled();
    modalRegistry.unregister('note-sheet');
    const p2 = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m2 = mount(p2, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'audio-manager-sheet', dismiss: () => {} });
    act(() => p2.advance());
    expect(m2.setScreen, 'the desk is the player\'s own UI').toHaveBeenCalledWith('vot-two-letter');
  });

  it('a part boundary inside one letter is not a unit boundary: nothing moves', () => {
    const a1 = { ...LETTER('one', 'long', 'Volume One'), partLabel: 'Part 1' };
    const a2 = { ...LETTER('one', 'long', 'Volume One'), partLabel: 'Part 2', url: a1.url.replace('.mp3', '-2.mp3') };
    const player = fakePlayer([a1, a2]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'long', bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setLetterId).not.toHaveBeenCalled();
    expect(m.setScreen).not.toHaveBeenCalled();
  });

  it('unmounting unsubscribes and withdraws the bridge; a missing player is a no-op, never a throw', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    m.hook.unmount();
    expect(globalThis.__openReading).toBeUndefined();
    act(() => player.advance());
    expect(m.setScreen).not.toHaveBeenCalled();
    delete globalThis.AudioPlayer;
    expect(() => renderHook((p) => useAudioFollow(p), { initialProps: { enabled: true, screen: 'home', setScreen: vi.fn() } })).not.toThrow();
  });
});
