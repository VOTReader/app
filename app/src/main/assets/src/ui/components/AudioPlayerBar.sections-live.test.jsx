// @ts-nocheck — the REAL AudioPlayer singleton through a fake media element, pointed at a WTLB compilation.
/* THE MINI-PLAYER AND THE DESK NAME THE LETTER A COMPILATION IS READING (listening item 2, 2026-09-22).
   A compilation file reads 19-31 letters in 10-24 minutes; the bar and the desk used to title it with its
   section label ("Part 1 · Intro–19") the whole way through. Now the letter under the clock
   (AudioPlayer.liveLetter) takes the title line and the section label moves beside it; before the first
   letter, or when the registry has not landed, the section label stays the title as before. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import * as ReactDOM from 'react-dom';
import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioPlayerBar } from './AudioPlayerBar.jsx';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const PART1_ID = '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g';
const SECTIONS_FIXTURE = {
  [PART1_ID]: {
    'wtlb1:introduction': [[4.2, 0, -1, -1, 0], [5.31, 0, 30, 50, 0]],
    'wtlb1:come-love-awaits-you': [[61.0, 0, 0, 54, 0], [66.16, 1, 0, 40, 0]],
    'wtlb1:crowning-glory': [[118.5, 0, 0, 40, 0]],
  },
};
const WTLB1 = { volKey: 'wtlb1', label: 'Words To Live By: Part One', readKey: 'wtlb1', letterScreen: 'wtlb' };
const ITEMS = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'come-love-awaits-you', title: 'Come, Love Awaits You' },
  { id: 'crowning-glory', title: 'Crowning Glory' },
];

const tick = (t) => act(() => { const el = FakeAudio.last; el.duration = 900; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
const barTitle = () => document.querySelector('.audio-bar-title').textContent;

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.ReactDOM = ReactDOM;               // AudioManagerSheet portals through the runtime global
  globalThis.AUDIO_MANIFEST = {};
  globalThis.AUDIO_SECTIONS = { wtlb1: [['Part 1 · Intro–19', PART1_ID, 'V']] };
  globalThis.AUDIO_SYNC_SECTIONS = SECTIONS_FIXTURE;
  globalThis.COL_BY_KEY = new Map([['wtlb1', WTLB1]]);
  globalThis.colLetterArr = () => ITEMS;
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  for (const k of ['Audio', 'AUDIO_MANIFEST', 'AUDIO_SECTIONS', 'AUDIO_SYNC_SECTIONS', 'COL_BY_KEY', 'colLetterArr', '__votAudioArbiter', 'ReactDOM']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('a WTLB compilation in the mini-player and the desk', () => {
  it('the bar titles the letter being read, with the section beside it', () => {
    render(<AudioPlayerBar />);
    act(() => { AudioPlayer.playSection('wtlb1', 0, WTLB1.label); });
    tick(2);
    expect(barTitle(), 'the file intro: the section names itself').toBe('Part 1 · Intro–19');
    tick(63);
    expect(barTitle()).toBe('Come, Love Awaits You · Part 1 · Intro–19');
    tick(119);
    expect(barTitle()).toBe('Crowning Glory · Part 1 · Intro–19');
  });

  it('the desk heading is the letter, the section rides the line under it', () => {
    render(<AudioPlayerBar />);
    act(() => { AudioPlayer.playSection('wtlb1', 0, WTLB1.label); });
    tick(63);
    fireEvent.click(document.querySelector('.audio-bar-summary'));
    const h2 = document.getElementById('audio-manager-title');
    expect(h2.textContent).toContain('Come, Love Awaits You');
    expect(h2.textContent).not.toContain('Part 1 · Intro–19');
    expect(h2.parentElement.querySelector('p').textContent).toContain('Part 1 · Intro–19');
  });

  it('a keyed recording keeps its own title', () => {
    globalThis.AUDIO_MANIFEST = { 'wtlb1:crowning-glory': [['idCG', 'V']] };
    render(<AudioPlayerBar />);
    act(() => { AudioPlayer.playLetter({ volKey: 'wtlb1', letter: ITEMS[2], collectionLabel: WTLB1.label }); });
    tick(40);
    expect(barTitle()).toBe('Crowning Glory');
  });
});
