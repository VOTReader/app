// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LetterView — honest labels + the Videos presence guard (C2-C [C2] + [C5]).
   ═══════════════════════════════════════════════════════════════════════
   [C2] Three sites read `volumeLabel || "Volume Two"`: the back tooltip +
        TalkBack label, the hero eyebrow, and the collectionLabel handed to
        AudioPlayer.playLetter — which becomes the track's `sub` and OUTLIVES
        the screen in the Listening Library, the shelves and the native media
        card. A fallback that names a real collection is the misattribution
        class: it is not "unknown", it is a confident wrong answer.

        Only one route ever relied on it (`vot-letter`, Volume Two), which is
        why it looked harmless; that route now says its own name, so the
        fallback is free to be honest.

   [C5] The Videos related-card rendered for EVERY letter. Its four siblings
        (Also Read / Related Topics / Bible Study / Audio) each guard on their
        own data; Videos did not, so a letter with no video at all still got a
        "Videos" heading over one link to the channel's front page.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree'];

let playCalls;
let hadAudio;
let realAudio;

beforeEach(() => {
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  playCalls = [];
  hadAudio = false;
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;      // the REAL nav — the back label is its contract
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = () => null;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  // Intercept the two AudioPlayer calls the hero pill makes, so the assertion
  // is on what the PLAYER is told (which is what persists), not on the DOM.
  AudioPlayer.hasAudio = () => hadAudio;
  AudioPlayer.playLetter = (opts) => { playCalls.push(opts); };
  AudioPlayer.prewarm = () => {};
});

afterEach(() => {
  cleanup();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const LETTER = {
  id: 'the-wide-path', title: 'The Wide Path', num: 1,
  blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null,
};

const renderLetter = (props = {}, letter = LETTER) => render(
  <LetterView
    letter={letter}
    volKey="two"
    theme="dark"
    markAsReadEnabled={false}
    onNavigate={() => {}}
    onHome={() => {}}
    {...props}
  />,
);

const backBtn = () => document.querySelector('.nav-back-icon');
const eyebrow = () => document.querySelector('.hero-eyebrow').textContent;
const videoCard = () => [...document.querySelectorAll('.related-card-title')]
  .find((t) => t.textContent === 'Videos');

describe('LetterView — the collection label is never invented [C2]', () => {
  it('names the collection everywhere when it is given', () => {
    renderLetter({ volumeLabel: 'Volume Five' });
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Volume Five');
    expect(eyebrow()).toContain('Volume Five');
    expect(eyebrow()).toContain('Letter 1');
  });

  it('says "Library" — not "Volume Two" — when no collection is known', () => {
    renderLetter();
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Library');
    expect(backBtn().getAttribute('title')).toBe('← Library');
  });

  it('omits the collection half of the eyebrow rather than guessing it', () => {
    renderLetter();
    expect(eyebrow()).toBe('Letter 1');
    expect(eyebrow()).not.toContain('Volume');
  });

  it('keeps the separator + position label intact when it does know', () => {
    renderLetter({ volumeLabel: 'The Lord’s Rebuke' }, { ...LETTER, num: 0 });
    expect(eyebrow()).toBe('The Lord’s Rebuke \xA0\xB7\xA0 Preface');
  });

  it('hands the audio queue a NULL sub instead of a wrong collection', () => {
    hadAudio = true;
    renderLetter();
    fireEvent.click(document.querySelector('.hero-play-row button'));
    expect(playCalls).toHaveLength(1);
    // Pre-fix this was the string 'Volume Two', which then persisted into the
    // Listening Library as the recording's second line.
    expect(playCalls[0].collectionLabel).toBe(null);
  });

  it('still hands it the real collection when one is known', () => {
    hadAudio = true;
    renderLetter({ volumeLabel: 'Letters from Timothy' });
    fireEvent.click(document.querySelector('.hero-play-row button'));
    expect(playCalls[0].collectionLabel).toBe('Letters from Timothy');
  });
});

describe('LetterView — the Videos card appears only when there are videos [C5]', () => {
  it('does not render the card for a letter with no video at all', () => {
    renderLetter();
    // Pre-fix: a "Videos" heading over a single link to the channel front page.
    expect(videoCard()).toBeUndefined();
    expect(document.body.textContent).not.toContain('Official YouTube Channel');
  });

  it('renders it for a letter with a voice-over video', () => {
    renderLetter({}, { ...LETTER, videoVoiceUrl: 'https://youtube.com/watch?v=a' });
    expect(videoCard()).toBeTruthy();
    expect(document.body.textContent).toContain('Video (with voice over)');
    // The channel link belongs to the card and rides along with it.
    expect(document.body.textContent).toContain('Official YouTube Channel');
  });

  it('renders it for a letter with a set-to-music video', () => {
    renderLetter({}, { ...LETTER, videoMusicUrl: 'https://youtube.com/watch?v=b' });
    expect(videoCard()).toBeTruthy();
  });

  it('renders it for a letter carrying a videos[] list', () => {
    renderLetter({}, { ...LETTER, videos: [{ label: 'Reading', url: 'https://youtube.com/watch?v=c' }] });
    expect(videoCard()).toBeTruthy();
    expect(document.body.textContent).toContain('Reading');
  });

  it('treats an EMPTY videos[] as no videos', () => {
    renderLetter({}, { ...LETTER, videos: [] });
    expect(videoCard()).toBeUndefined();
  });

  it('leaves the sibling cards untouched', () => {
    renderLetter({}, { ...LETTER, audioUrl: 'https://example.org/a.mp3' });
    const titles = [...document.querySelectorAll('.related-card-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Audio']);   // Audio present, Videos absent
  });
});
