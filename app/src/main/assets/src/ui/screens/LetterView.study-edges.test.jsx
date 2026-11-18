// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LetterView — studies pass 3, part two: a study's end cards do not name the neighbouring study twice, its hero
   eyebrow may wrap, a heading that cites a verse draws the reference, and its pictures go through StudyFigure. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree', 'IntersectionObserver'];

class FakeIO { observe() {} disconnect() {} }

let realAudio;
beforeEach(() => {
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
  /* the reader's own Segments turns a {{ref:…}} marker into a link; here it shows which words it was handed */
  globalThis.Segments = ({ segments }) => <span data-testid="segs">{segments.map((s) => s.v).join('|')}</span>;
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

const CHAPTER = { id: 'intro', title: 'Introduction', num: 1, unitWord: 'Part', blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null };
const renderStudy = (props = {}, letter = CHAPTER) => render(
  <LetterView letter={letter} volKey="study" volumeLabel="The State of the Dead" studyMode theme="dark" markAsReadEnabled={false}
    onNavigate={() => {}} onHome={() => {}} {...props} />,
);
const labels = () => [...document.querySelectorAll('.bottom-nav-label')].map((n) => n.textContent);

describe('LetterView — a study\'s edges (studies pass 3)', () => {
  it('the first part names the study before it once: "Previous study", then its name', () => {
    renderStudy({ prevBoundary: { short: 'Purity', title: 'Purity' }, onPrevBoundary: () => {},
      nextBoundary: { short: 'Grace AND The Law', title: 'Grace AND The Law' }, onNextBoundary: () => {} });
    expect(labels()).toEqual(['Previous study', 'Next study']);
    const titles = [...document.querySelectorAll('.bottom-nav-title')].map((n) => n.textContent);
    expect(titles).toEqual(['Purity', 'Grace AND The Law']);
  });

  it('a neighbour with a short name of its own keeps "Previous · short" (a volume, a book)', () => {
    render(<LetterView letter={{ ...CHAPTER, unitWord: undefined }} volKey="three" volumeLabel="Volume Three" theme="dark"
      markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}}
      prevBoundary={{ short: 'Volume Two', title: 'The Last Letter' }} onPrevBoundary={() => {}} />);
    expect(labels()).toEqual(['Previous · Volume Two']);
  });

  it('a study hero marks its eyebrow as a study\'s, so a long name wraps instead of cutting', () => {
    renderStudy();
    expect(document.querySelector('.hero-eyebrow').classList.contains('is-study')).toBe(true);
    cleanup();
    render(<LetterView letter={{ ...CHAPTER, unitWord: undefined }} volKey="three" volumeLabel="Volume Three" theme="dark"
      markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} />);
    expect(document.querySelector('.hero-eyebrow').classList.contains('is-study')).toBe(false);
  });

  it('a heading that cites a verse is drawn through Segments; a plain heading is its text', () => {
    renderStudy({}, { ...CHAPTER, blocks: [
      { type: 'heading', text: 'The Sign of Jonah ({{ref:Matthew 12:39-40}})' },
      { type: 'heading', text: 'Yahushua Is Risen!', level: 3 },
    ] });
    const hs = [...document.querySelectorAll('.study-heading')];
    expect(hs[0].querySelector('[data-testid="segs"]').textContent).toBe('The Sign of Jonah ({{ref:Matthew 12:39-40}})');
    expect(hs[1].querySelector('[data-testid="segs"]')).toBeNull();
    expect(hs[1].textContent).toBe('Yahushua Is Risen!');
  });

  it('a first heading that only repeats the chapter\'s name is not drawn; a plate may stand before it; a letter keeps its own', () => {
    const blocks = [
      { type: 'study-image', src: 'study-title-part-two-title.jpg', alt: 'Part Two' },
      { type: 'heading', text: 'INTRODUCTION' },
      { type: 'heading', text: 'Introduction', level: 3 },
    ];
    renderStudy({}, { ...CHAPTER, blocks });
    expect([...document.querySelectorAll('.study-heading')].map((n) => n.textContent)).toEqual(['Introduction']);
    cleanup();
    render(<LetterView letter={{ ...CHAPTER, unitWord: undefined, blocks }} volKey="three" volumeLabel="Volume Three" theme="dark"
      markAsReadEnabled={false} onNavigate={() => {}} onHome={() => {}} />);
    expect(document.querySelectorAll('.study-heading')).toHaveLength(2);
  });

  it('a study picture is a StudyFigure: a chart is a button, a plate cover is a plate, a real cover keeps its frame', () => {
    renderStudy({}, { ...CHAPTER, blocks: [
      { type: 'cover-image', src: 'study-cover-lamb.jpg' },
      { type: 'cover-image', src: 'study-cover-mtam.jpg' },
      { type: 'study-image', src: 'study-chart-chronology.jpg', alt: 'Chart: The True Chronology', caption: 'Note: a day begins at sundown.' },
      { type: 'study-image', src: 'study-lamb-supper.jpg', alt: 'The Last Supper' },
    ] });
    expect(document.querySelectorAll('.study-figure.is-plate')).toHaveLength(1);
    expect(document.querySelectorAll('.study-cover-inline img')).toHaveLength(1);
    expect(document.querySelector('button.study-figure.is-chart')).not.toBeNull();
    expect(document.querySelector('.study-image-caption').textContent).toBe('Note: a day begins at sundown.');
    expect(document.querySelectorAll('.study-figure.is-picture')).toHaveLength(1);
    expect(document.querySelector('.study-image-block')).toBeNull();
  });
});
