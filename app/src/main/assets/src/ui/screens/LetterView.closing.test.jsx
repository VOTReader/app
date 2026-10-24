// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract), as excerpt-pieces.test.jsx does
/* mw-close (Corbin 2026-10-24): "format the says the lord breaks nicely so they don't collide with
 * the following text". A closing ("Says The Lord.") with more of the letter after it ran straight
 * into the next block (29 such closings across the letter collections), and V1 Christmas's dated
 * addendum header (also V4 Obey God's) read as one run-on paragraph. Asserted on REAL renders of
 * the real corpus: every mid-letter closing gets clear space, a letter's last closing does not,
 * and the dated header breaks as published while holding exactly the paragraph's text. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { Segments } from '../components/Segments.jsx';
import { renderTextWithScripRefs } from '../../utils/render-text.jsx';
import { segmentRenderText, segmentsDomText } from '../../utils/segment-dom-text.js';
import { addendumHeadLines } from '../../utils/closing-breaks.js';
import { AudioPlayer } from '../../utils/audio-player.js';

vi.mock('../components/ReadAlongHighlight.jsx', () => ({ ReadAlongHighlight: () => null }));

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const FILES = ['volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js', 'volume-five.js',
  'volume-six.js', 'volume-seven.js', 'letters-flock.js', 'lords-rebuke.js', 'hidden-manna.js'];
/** Every letter (an object with blocks) in a corpus file, loaded the way the app loads it. */
function letters(file) {
  const ctx = { window: {} };
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  return Object.values(ctx).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((l) => l && Array.isArray(l.blocks));
}
const ALL = FILES.flatMap((f) => letters(f).map((l) => ({ file: f, letter: l })));
const byId = (id) => ALL.find((x) => x.letter.id === id).letter;

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'FootnoteSheet', 'FootnoteListSection', 'useMarkAsRead', 'useModalRegistry', 'Segments', 'ProphecyGroup', 'ProphecyExpandToggle',
  'StaticSubtree', 'renderTextWithScripRefs', 'segmentRenderText'];
let realAudio;
beforeEach(() => {
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.FootnoteListSection = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = Segments;
  globalThis.renderTextWithScripRefs = renderTextWithScripRefs;
  globalThis.segmentRenderText = segmentRenderText;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
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

function renderLetter(letter) {
  const shim = { footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null, ...letter };
  return render(<LetterView letter={shim} volKey="one" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} />).container;
}
/** The block element LetterView draws for block `bi` (its annotation key ends in ":<bi>"). */
const blockEl = (c, bi) => [...c.querySelectorAll('[data-hl-key][data-hl-dom]')]
  .find((el) => el.getAttribute('data-hl-key').endsWith(':' + bi));
const isClosing = (b) => b.type === 'closing' || b.type === 'closing-fn';
const midClosings = (letter) => letter.blocks.filter((b, i) => isClosing(b) && i < letter.blocks.length - 1).length;

describe('a closing with more of the letter after it gets clear space', () => {
  const mids = ALL.filter(({ letter }) => midClosings(letter) > 0);

  it('the corpus census: 29 closings sit mid-letter (V1 Christmas among them)', () => {
    expect(mids.reduce((s, { letter }) => s + midClosings(letter), 0)).toBe(29);
    expect(mids.some(({ letter }) => letter.id === 'christmas')).toBe(true);
  });

  it.each(mids.map(({ file, letter }) => [file, letter.id]))('%s %s', (file, id) => {
    const letter = byId(id);
    const c = renderLetter(letter);
    letter.blocks.forEach((b, bi) => {
      if (!isClosing(b)) return;
      const next = letter.blocks[bi + 1];
      // Its own footnote line (closing-fn) stays tucked under it; anything else is a new section.
      expect(blockEl(c, bi).classList.contains('letter-closing-mid'), `${id} block ${bi}`).toBe(!!next && next.type !== 'closing-fn');
    });
  });

  it("a letter's final closing carries no extra space (the ornament sits under it)", () => {
    // A letter with a closing mid-letter AND one as its last block (V2 Seven Hills, Lord's Rebuke ...).
    const { letter } = ALL.find(({ letter: l }) => midClosings(l) > 0 && l.blocks[l.blocks.length - 1].type === 'closing');
    const c = renderLetter(letter);
    expect(c.querySelectorAll('.letter-closing-mid').length).toBeGreaterThan(0);
    expect(blockEl(c, letter.blocks.length - 1).className).toBe('letter-closing');
  });
});

describe('a dated addendum header after a closing breaks as published, same characters', () => {
  const CASES = {
    christmas: ['10/7/04', 'From The Lord, Our God and Savior', 'The Word of The Lord Spoken to Timothy',
      'For Timothy and His Wife, and For All Those Who Have Ears to Hear', 'Addendum to “Christmas”'],
    'obey-god': ['2/4/10', 'From YahuShua HaMashiach, Our Lord and Savior', 'The Word of The Lord Spoken to Timothy',
      'For The Lord’s Little Flock, and For All Those Who Have Ears to Hear'],
  };
  it.each(Object.keys(CASES))('%s', (id) => {
    const letter = byId(id);
    const bi = letter.blocks.findIndex((b, i) => i > 0 && b.type === 'para' && isClosing(letter.blocks[i - 1]));
    const p = blockEl(renderLetter(letter), bi);
    expect(p.classList.contains('letter-addendum-head')).toBe(true);
    const lines = [...p.querySelectorAll('.addendum-head-line')];
    expect(lines.map((l) => l.textContent.trim())).toEqual(CASES[id]);
    expect(lines.map((l) => l.className.replace('addendum-head-line ', ''))).toEqual(
      ['meta-date', 'meta-from', 'meta-spoken', 'meta-for', 'meta-addendum'].slice(0, CASES[id].length));
    // Not one character added or taken away: highlights, notes and excerpts key on these offsets.
    expect(p.textContent).toBe(segmentsDomText(letter.blocks[bi].segments));
  });

  it('only those two qualify; any other paragraph after a closing renders as before', () => {
    const hits = [];
    ALL.forEach(({ letter }) => letter.blocks.forEach((b, i) => {
      if (i > 0 && b.type === 'para' && isClosing(letter.blocks[i - 1]) && addendumHeadLines(b.segments)) hits.push(letter.id);
    }));
    expect(hits).toEqual(['christmas', 'obey-god']);
    expect(renderLetter(byId('ears-to-hear')).querySelector('.letter-addendum-head')).toBeNull();
  });
});
