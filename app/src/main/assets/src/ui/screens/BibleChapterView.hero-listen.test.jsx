// @ts-nocheck — free-var globals stubbed per test; the REAL player through a fake media element
/* BibleChapterView — the hero's Listen says what its chapter's audio is doing (U04.5 + U10.2, UX sweep 2026-10-22).
   ──────────────────────────────────────────────────────────────────
   The hero said Listen while its own chapter played (a tap started the chapter again), and on a slow network a
   Listen pill read PAUSE at 0:00 for 20 to 30 s. The screen now asks the player whether its chapter is the one
   loaded (listenHere): Loading… while it loads, Pause while it plays, and a tap toggles it. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';

vi.mock('../../utils/audio-text-edition.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, recordingTranslationFor: () => 'nkjv' };
});

import { AudioPlayer } from '../../utils/audio-player.js';
import { BibleChapterView } from './BibleChapterView.jsx';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.readyState = 0; this.duration = 0; this.paused = true;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}
const el = () => FakeAudio.last;
const emit = (type) => act(() => { el().dispatchEvent(new Event(type)); });

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS', 'Audio', 'BIBLE_AUDIO_MANIFEST', 'BIBLE_AUDIO_BOOKS',
];
let priorScrollIntoView;

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.OT_BOOK_IDS = new Set();
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV', desc: 'x' }];
  globalThis.Audio = FakeAudio;
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:john': [['brm1_john_001', '', 'Chapter 1'], ['brm1_john_002', '', 'Chapter 2'], ['brm1_john_003', '', 'Chapter 3'], ['brm1_john_004', '', 'Chapter 4']],
  };
  globalThis.BIBLE_AUDIO_BOOKS = [['john', 'John']];
  localStorage.removeItem('vot-audio-pos');
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  localStorage.removeItem('vot-audio-pos');
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
});

const JOHN = { id: 'john', title: 'John', chapters: [{ num: 3, title: 'Ch 3', sections: [{ heading: null, verses: [
  { n: 16, text: 'For God so loved' },
] }] }] };
const view = () => (
  <BibleChapterView book={JOHN} chapter={JOHN.chapters[0]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} bibleAudio={{ volKey: 'bible-brm-kjv', label: 'KJV' }} />
);
const hero = () => document.querySelector('.hero-play-row .hero-play-pill');

describe('BibleChapterView — the hero Listen follows its chapter (U04.5, U10.2)', () => {
  it('Listen, then Loading… while the chapter loads, Pause while it plays; that tap pauses it, never a restart', () => {
    render(view());
    expect(hero().textContent).toBe('Listen');
    fireEvent.click(hero());
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].partLabel).toBe('Chapter 3');
    const src = el().src;
    expect(hero().textContent).toBe('Loading…');
    expect(hero().getAttribute('aria-busy')).toBe('true');

    emit('playing');
    expect(hero().textContent).toBe('Pause');
    expect(screen.getByRole('button', { name: 'Pause the reading' })).toBe(hero());
    fireEvent.click(hero());
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(el().src).toBe(src);                        // the same recording, not loaded again
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].partLabel).toBe('Chapter 3');
  });

  it('once the book moves on to the next chapter, this chapter\'s hero is a Listen again', () => {
    render(view());
    fireEvent.click(hero());
    emit('playing');
    act(() => { AudioPlayer.next(); });
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].partLabel).toBe('Chapter 4');
    expect(hero().textContent).toBe('Listen');
  });
});
