// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LetterView — the page names itself once its hero has gone (search200 UX B10, item 1).
   A search hit lands mid-letter: the hero, with the letter's name, sits above out of sight.
   Once it has scrolled up under the top bar, a band pinned there says the hero's eyebrow
   over the letter's title (mockup ux/mockups/1-sticky-title/PICK.png). */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree', 'IntersectionObserver'];

/* The reading column's observer, driven by the test: `fire` says where the hero is. */
class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; FakeIO.all.push(this); }
  observe(el) { this.els.push(el); }
  disconnect() { this.disconnected = true; }
  fire(isIntersecting, bottom) {
    this.cb(this.els.map((target) => ({ target, isIntersecting, boundingClientRect: { top: bottom - 200, bottom }, rootBounds: { top: 72 } })));
  }
}
FakeIO.all = [];
/* the band's observer: the live one watching the hero (the install card keeps one too) */
const liveIO = () => FakeIO.all.filter((o) => !o.disconnected && o.els.includes(document.querySelector('.hero'))).pop();

let realAudio;
beforeEach(() => {
  FakeIO.all = [];
  realAudio = { hasAudio: AudioPlayer.hasAudio, prewarm: AudioPlayer.prewarm };
  AudioPlayer.hasAudio = () => false;
  AudioPlayer.prewarm = () => {};
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div className="screen-scroll" data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = () => null;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  globalThis.IntersectionObserver = FakeIO;
  window.navHandoff = { peek: () => null, clear: () => {} };
});

afterEach(() => {
  cleanup();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const LETTER = {
  id: 'abide-in-the-doctrine', title: 'Abide in the Doctrine of The Messiah', num: 17,
  blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null,
};

const renderLetter = (props = {}, letter = LETTER) => render(
  <LetterView letter={letter} volKey="three" volumeLabel="Volume Three" theme="dark" markAsReadEnabled={false}
    onNavigate={() => {}} onHome={() => {}} {...props} />,
);
const band = () => document.querySelector('.mini-title');

describe('LetterView — the sticky mini title (B10 item 1)', () => {
  it('names the letter, its eyebrow over its title, and stays hidden while the hero shows', () => {
    renderLetter();
    expect(band()).not.toBeNull();
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('Volume Three \xB7 Letter 17');
    expect(band().querySelector('.mini-title-name').textContent).toBe('Abide in the Doctrine of The Messiah');
    expect(band().getAttribute('aria-hidden')).toBe('true');
    expect(band().classList.contains('shown')).toBe(false);
    // it watches the hero, against the reading column it sits in
    const io = liveIO();
    expect(io).toBeTruthy();
    expect(io.opts.root).toBe(document.querySelector('.screen-scroll'));
    act(() => io.fire(true, 300));
    expect(band().classList.contains('shown')).toBe(false);
  });

  it('shows once the hero has scrolled up under the top bar, and hides when it comes back', () => {
    renderLetter();
    const io = liveIO();
    act(() => io.fire(false, 40));
    expect(band().classList.contains('shown')).toBe(true);
    act(() => io.fire(true, 120));
    expect(band().classList.contains('shown')).toBe(false);
  });

  it('hangs from a zero-height sticky anchor, so it moves nothing in the page', () => {
    renderLetter();
    expect(band().parentElement.className).toBe('mini-title-anchor');
  });

  it('hangs under the "Back to" row when there is one, and reads the hero past it', () => {
    renderLetter({ backHint: { title: 'results' }, onBack: () => {} });
    expect(band().parentElement.classList.contains('back-hint-row')).toBe(true);
    expect(document.querySelectorAll('.mini-title')).toHaveLength(1);
    expect(liveIO().opts.rootMargin).toMatch(/^-\d+px 0px 0px 0px$/);
  });

  it('a study chapter says its chapter, and the preface says Preface', () => {
    renderLetter({ studyMode: true, volumeLabel: 'Grace AND The Law' }, { ...LETTER, num: 3 });
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('Grace AND The Law \xB7 Chapter 3');
    cleanup();
    renderLetter({ volumeLabel: null }, { ...LETTER, num: 0 });
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('Preface');
  });

  it('an inert peek of the next page draws no band', () => {
    renderLetter({ inert: true });
    expect(band()).toBeNull();
  });

  it('starts hidden again on the next letter (the view stays mounted)', () => {
    const { rerender } = renderLetter();
    act(() => liveIO().fire(false, 40));
    expect(band().classList.contains('shown')).toBe(true);
    rerender(<LetterView letter={{ ...LETTER, id: 'next-one', title: 'The Next One', num: 18 }} volKey="three" volumeLabel="Volume Three"
      theme="dark" markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} />);
    expect(band().classList.contains('shown')).toBe(false);
    expect(band().querySelector('.mini-title-name').textContent).toBe('The Next One');
  });
});

/* A02.10: a study chapter says the study's own word for its units, as the Studies list counts them ("6 Parts"):
   the hero, the band and both footers. */
describe('LetterView — a study names its parts (A02.10)', () => {
  it('a study in Parts says Part in the eyebrow, the band and the footers', () => {
    renderLetter({ studyMode: true, volumeLabel: 'Purity' }, { ...LETTER, num: 1, unitWord: 'Part' });
    expect(document.querySelector('.hero-eyebrow').textContent).toBe('Purity \xA0\xB7\xA0 Part 1');
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('Purity \xB7 Part 1');
    const labels = [...document.querySelectorAll('.bottom-nav-label')].map((n) => n.textContent);
    expect(labels).toEqual(['\u2039 Previous Part', 'Next Part \u203A']);
  });

  it('a letter still says Letter', () => {
    renderLetter();
    const labels = [...document.querySelectorAll('.bottom-nav-label')].map((n) => n.textContent);
    expect(labels).toEqual(['\u2039 Previous Letter', 'Next Letter \u203A']);
  });
});
