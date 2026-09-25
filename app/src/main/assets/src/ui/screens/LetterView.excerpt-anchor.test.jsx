// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract), as LetterView.labels.test.jsx does
/* THE EXCERPT ANCHOR WAS DEAD CODE (2026-09-20): LetterView consumed `{type:'excerpt'}` by looking up
   `#letter-block-<i>` — an id nothing renders (blocks carry data-hl-key) — and nothing produced one.
   Search now produces it (the matched words), so the consumer has to work: find the block whose text
   holds the excerpt's head (whitespace-squashed, shorter heads tried, poetry lines walked like the
   index walks them), scroll it, and hand its hl-key to ReadAlongHighlight as `seekTo`. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const seekToSeen = [];
const seekOffsetSeen = [];
vi.mock('../components/ReadAlongHighlight.jsx', () => ({
  ReadAlongHighlight: (props) => { seekToSeen.push(props.seekTo); seekOffsetSeen.push(props.seekOffset); return null; },
}));

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree'];
let realAudio;
const scrolled = [];

beforeEach(() => {
  vi.useFakeTimers();
  seekToSeen.length = 0; seekOffsetSeen.length = 0; scrolled.length = 0;
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = ({ segments }) => <>{(segments || []).map((s, i) => <span key={i}>{s.v}</span>)}</>;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  AudioPlayer.hasAudio = () => false;
  AudioPlayer.playLetter = () => {};
  AudioPlayer.prewarm = () => {};
  Element.prototype.scrollIntoView = function () { scrolled.push(this.getAttribute('data-hl-key')); };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  delete Element.prototype.scrollIntoView;
});

const LETTER = {
  id: 'the-wide-path', title: 'The Wide Path', num: 1, footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null,
  blocks: [
    { type: 'para', segments: [{ v: 'Beloved, the wide path is  crowded' }, { v: 'and its gate is broad.' }] },
    { type: 'heading', level: 2, text: 'A word about the narrow way' },
    { type: 'para', segments: [{ v: 'But the still small voice' }, { v: 'spoke to him in the cave, and he listened.' }] },
    { type: 'poetry', lines: [[{ v: 'Come unto Me,' }], [{ v: 'all ye that labour and are heavy laden.' }]] },
  ],
};
const renderLetter = (props = {}) => render(
  <LetterView letter={LETTER} volKey="two" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} {...props} />,
);

describe('LetterView — an excerpt anchor lands on the block that holds it', () => {
  it('scrolls the block whose text holds the excerpt and hands its hl-key to the read-along as seekTo', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'still small voice spoke to him in the cave, and he listened. But' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['letter:the-wide-path:2']);
    expect(seekToSeen.at(-1)).toBe('letter:the-wide-path:2');
  });

  it('hands the read-along WHERE in the block the words start (seekOffset), so the seek lands on the clause', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'spoke to him in the cave' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(seekToSeen.at(-1)).toBe('letter:the-wide-path:2');
    expect(seekOffsetSeen.at(-1)).toBe('But the still small voice spoke to him in the cave, and he listened.'.indexOf('spoke'));
  });

  it('an excerpt cut across a block boundary lands on the block that holds its TAIL, not the one its first words trail out of', () => {
    // The engine cuts 48 chars from the FIRST occurrence that still fits every
    // term, so "written in The Law" came back as "The Passover. For as it is
    // written in The Law, a" — its head is the previous block's last words, and
    // the shortest head ("The Passover") matched THAT block (study find,
    // 2026-09-22). The tail is tried at every length before the head shrinks.
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'gate is broad. But the still small voice spoke to him' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['letter:the-wide-path:2']);
    expect(seekToSeen.at(-1)).toBe('letter:the-wide-path:2');
    expect(seekOffsetSeen.at(-1)).toBe('But the still small voice spoke to him in the cave, and he listened.'.indexOf('small voice spoke to him'));
  });

  it('matches across the index whitespace domain (the index squashes runs of spaces; the block does not)', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'wide path is crowded and its gate' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['letter:the-wide-path:0']);
  });

  it('walks poetry lines the way the index flattens them', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'all ye that labour and are heavy laden.' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['letter:the-wide-path:3']);
  });

  it('an excerpt found nowhere scrolls nothing and seeks nothing', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'zebra crossing at dawn' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual([]);
    expect(seekToSeen.every((v) => v == null)).toBe(true);
  });

  it('an anchor made for ANOTHER letter is ignored: the follower turning the page must not re-land a stale search', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'still small voice', letterId: 'some-other-letter' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual([]);
    expect(seekToSeen.every((v) => v == null)).toBe(true);
  });

  it('an anchor made for THIS letter lands (letterId named)', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'still small voice', letterId: 'the-wide-path' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['letter:the-wide-path:2']);
  });

  it('the landing fades: seekTo is withdrawn after the flash so a later Listen does not re-seek', () => {
    renderLetter({ surpriseAnchor: { type: 'excerpt', text: 'still small voice' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(seekToSeen.at(-1)).toBe('letter:the-wide-path:2');
    act(() => { vi.advanceTimersByTime(4100); });
    expect(seekToSeen.at(-1)).toBe(null);
  });
});

describe('LetterView — the body names its marks for the corpus remap (n4-02)', () => {
  it('carries the key prefix and the block count, and every block key sits under it', () => {
    renderLetter();
    const body = document.querySelector('[data-mark-entry]');
    expect(body.getAttribute('data-mark-entry')).toBe('letter:the-wide-path:');
    expect(body.getAttribute('data-mark-blocks')).toBe('4');
    const keys = Array.from(body.querySelectorAll('[data-hl-key]'), (el) => el.getAttribute('data-hl-key'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => /^letter:the-wide-path:\d+$/.test(k))).toBe(true);
  });
});
