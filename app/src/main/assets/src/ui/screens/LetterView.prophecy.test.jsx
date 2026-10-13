// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* W44 (sweep 2026-10-13): prophecy-card expand/collapse-all.
   (1) It wrote only the card keys already in the saved map (cards someone had
       toggled by hand), so a collapse-all of untouched cards was never saved and
       they came back expanded after a reload. Every card key of the letter is now
       written, then saved once.
   (2) The signal outlived the letter: LetterView stays mounted from one letter
       (or study chapter) to the next, so the new letter's cards mounted under the
       old collapse-all. It is reset when the letter changes. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree'];

let realAudio;
let toggle;
let signals;

beforeEach(() => {
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  toggle = null;
  signals = [];
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = () => null;
  globalThis.ProphecyGroup = ({ expandSignal }) => { signals.push(expandSignal); return null; };
  globalThis.ProphecyExpandToggle = ({ onToggle }) => { toggle = onToggle; return null; };
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  AudioPlayer.hasAudio = () => false;
  AudioPlayer.playLetter = () => {};
  AudioPlayer.prewarm = () => {};
});

afterEach(() => {
  cleanup();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const group = (over) => ({
  type: 'prophecy-group', label: 'G',
  intro: [{ type: 'p' }], ot: { label: 'OT', blocks: [{ type: 'p' }] },
  nt: { label: 'NT', blocks: [{ type: 'p' }] }, vot: { label: 'VOT', blocks: [] },
  ...over,
});
const letterWith = (id) => ({
  id, title: 'T ' + id, num: 1, footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null,
  blocks: [{ type: 'p', segments: [] }, group(), group({ intro: [] })],
});
const view = (letter, statesRef, save) => (
  <LetterView letter={letter} volKey="two" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}}
    prophecyCardStatesRef={statesRef} saveProphecyCardStates={save} />
);

describe('LetterView — W44: expand/collapse-all', () => {
  it('collapse-all writes every card key of the letter, not only the ones toggled by hand, and saves once', () => {
    const statesRef = { current: { 'L1:1:ot': true, 'OTHER:1:ot': true } };
    const save = vi.fn();
    render(view(letterWith('L1'), statesRef, save));
    act(() => { toggle(false); });
    expect(statesRef.current).toEqual({
      'L1:1:intro': false, 'L1:1:ot': false, 'L1:1:nt': false,   // vot has no blocks: no card
      'L1:2:ot': false, 'L1:2:nt': false,                         // no intro: no card
      'OTHER:1:ot': true,                                         // another letter's cards untouched
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('the signal is reset when the letter changes', () => {
    const statesRef = { current: {} };
    const { rerender } = render(view(letterWith('L1'), statesRef, vi.fn()));
    act(() => { toggle(false); });
    expect(signals[signals.length - 1]).toBe(-1);
    rerender(view(letterWith('L2'), statesRef, vi.fn()));
    expect(signals[signals.length - 1]).toBe(0);
  });
});
