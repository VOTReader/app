// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* LetterView — pager peek resolution (the resolvePeek host override).
   ──────────────────────────────────────────────────────────────────
   LetterView's swipe peek resolves a neighbor {id} → full letter through
   resolveNeighborLetter, which only knows the VOT collections (COL_BY_KEY).
   BibleStudyChapterView renders LetterView over a letter-shaped study-chapter
   shim, so its neighbors are NOT in any collection — pre-fix every same-study
   swipe degraded to a generic "Continue" boundary card instead of the real
   rendered page. The host now passes resolvePeek(nb) → { letter, scrollKey },
   and LetterView must (a) build a kind:'screen' peek from it, (b) restore the
   neighbor's saved scroll from the HOST's key (the 'study-…' branch), and
   (c) keep degrading to a boundary card when no resolver matches. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';

let capturedPager;

beforeEach(() => {
  capturedPager = null;
  // LetterView resolves these as free-var window globals (bundle-d convention).
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = (props) => { capturedPager = props.pager; return <div data-testid="sl" />; };
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  window.navHandoff = { peek: () => null, clear: () => {} };
});
afterEach(() => {
  cleanup();
  for (const k of ['ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry']) delete globalThis[k];
});

const LETTER = {
  id: 'ch2', title: 'Section Two', num: 2, blocks: [], footnotes: {}, nkjv: {},
  prevLetter: { id: 'ch1', title: 'Section One' },
  nextLetter: { id: 'ch3', title: 'Section Three' },
};

const renderLetter = (extra) => render(
  <LetterView
    letter={LETTER}
    volumeLabel="Study Title"
    studyMode={true}
    theme="dark"
    showProgressBar={false}
    markAsReadEnabled={false}
    onNavigate={() => {}}
    {...extra}
  />,
);

describe('LetterView pager.peek with a host resolvePeek', () => {
  it('peeks the REAL neighbor screen from the host resolver, at the host scroll key', () => {
    const prevPos = window.__scrollPositions;
    window.__scrollPositions = { 'study-s1-ch3': { y: 640 } };
    const shim = { id: 'ch3', title: 'Section Three', num: 3, blocks: [], footnotes: {}, nkjv: {}, prevLetter: { id: 'ch2', title: 'Section Two' }, nextLetter: null };
    renderLetter({
      resolvePeek: (nb) => (nb.id === 'ch3' ? { letter: shim, scrollKey: 'study-s1-ch3' } : null),
    });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.letter).toBe(shim);
    expect(desc.el.props.inert).toBe(true);
    expect(desc.el.props.studyMode).toBe(true);
    // The saved scroll came from the HOST's key, not letterScrollKey(volKey,…).
    expect(desc.el.props.restoreScroll).toEqual({ y: 640 });
    window.__scrollPositions = prevPos;
  });

  it('degrades to a boundary card when the resolver has no match (and no collection resolves)', () => {
    renderLetter({ resolvePeek: () => null });
    const desc = capturedPager.peek('prev');
    expect(desc).toEqual({ kind: 'boundary', eyebrow: 'Continue', title: 'Section One' });
  });

  it('without a resolver behaves as before (boundary card when COL_BY_KEY is absent)', () => {
    renderLetter({});
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('boundary');
    expect(desc.title).toBe('Section Three');
  });
});

/* ── Cross-VOLUME chain peek (2026-07-19, owner-directed native feel) ────
   At a reading-chain boundary whose destination is another LetterView
   collection, the peek is the REAL first/last letter of that volume —
   not a card. Only different-component destinations keep the card. */
describe('LetterView pager.peek across a volume boundary', () => {
  const V2_FIRST = { id: 'the-wide-path', title: 'The Wide Path', num: 1, blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null };
  const LAST_LETTER = { ...LETTER, nextLetter: null }; // end of the current volume

  beforeEach(() => {
    globalThis.COL_BY_KEY = new Map([
      ['two', { volKey: 'two', kind: 'letter', label: 'Volume Two', letterScreen: 'vot-letter' }],
      ['wtlb1', { volKey: 'wtlb1', kind: 'wtlb', label: 'Words To Live By: Part One', letterScreen: 'wtlb-one-entry' }],
    ]);
    globalThis.colLetterArr = (col) => (col.volKey === 'two' ? [V2_FIRST] : []);
    globalThis.colPreface = () => null;
  });
  afterEach(() => {
    for (const k of ['COL_BY_KEY', 'colLetterArr', 'colPreface']) delete globalThis[k];
  });

  it('peeks the REAL first letter of the next volume (annotated screen, not a card)', () => {
    renderLetter({
      letter: LAST_LETTER, volKey: 'one',
      nextBoundary: { short: 'Volume Two', title: 'The Wide Path', volKey: 'two', letterId: 'the-wide-path' },
    });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.letter).toBe(V2_FIRST);
    expect(desc.el.props.volKey).toBe('two');
    expect(desc.el.props.volumeLabel).toBe('Volume Two');
    expect(desc.el.props.inert).toBe(true);
  });

  it('keeps the card when the destination is a different component family (WTLB)', () => {
    renderLetter({
      letter: LAST_LETTER, volKey: 'rebuke',
      nextBoundary: { short: 'Words To Live By', title: 'Impasse', volKey: 'wtlb1', letterId: 'impasse' },
    });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('boundary');
    expect(desc.eyebrow).toBe('Next \xB7 Words To Live By');
  });

  it('keeps the card when the destination letter cannot resolve (corpus not loaded)', () => {
    globalThis.colLetterArr = () => []; // volume two's corpus absent
    renderLetter({
      letter: LAST_LETTER, volKey: 'one',
      nextBoundary: { short: 'Volume Two', title: 'The Wide Path', volKey: 'two', letterId: 'the-wide-path' },
    });
    expect(capturedPager.peek('next').kind).toBe('boundary');
  });

  it('keeps the card for special edges that carry no destination (the Revelation bridge)', () => {
    renderLetter({
      letter: { ...LETTER, prevLetter: null }, volKey: 'one',
      prevBoundary: { short: 'Revelation', title: 'Revelation \xB7 Chapter 22' },
    });
    expect(capturedPager.peek('prev').kind).toBe('boundary');
  });
});

/* ── FORMAT GATE (regression, 2026-07-21) ───────────────────────────────
   Holy Days is a MIXED collection: its ghost entries carry type 'letter'
   (Format A, `blocks`) or 'wtlb' (Format B, `paragraphs`), and the route
   branches on that. The peek did NOT — it only checked that the neighbor
   RESOLVED — so a cross-format neighbor was rendered through the wrong
   component and threw on arrival ("Cannot read properties of undefined
   (reading 'forEach')"), wedging the screen behind an ErrorBoundary. */
describe('LetterView pager.peek format gate (mixed Holy Days collection)', () => {
  const FORMAT_B_NEIGHBOR = {
    id: 'consider-my-love', title: 'Consider My Love', num: 4, type: 'wtlb',
    paragraphs: [{ align: 'justify', text: 'Consider My love…' }],
    prevEntry: null, nextEntry: null,
  };

  beforeEach(() => {
    globalThis.COL_BY_KEY = new Map([
      ['holydays', { volKey: 'holydays', kind: 'letter', label: 'Regarding The Holy Days', letterScreen: 'holy-days-entry' }],
    ]);
    globalThis.colLetterArr = () => [FORMAT_B_NEIGHBOR];
    globalThis.colPreface = () => null;
  });
  afterEach(() => {
    for (const k of ['COL_BY_KEY', 'colLetterArr', 'colPreface']) delete globalThis[k];
  });

  it('degrades to a boundary card when the neighbor is the OTHER format', () => {
    renderLetter({
      letter: { ...LETTER, nextLetter: { id: 'consider-my-love', title: 'Consider My Love' } },
      volKey: 'holydays',
    });
    const desc = capturedPager.peek('next');
    // Pre-fix this was kind:'screen' wrapping a paragraphs-only entry, which
    // threw the moment LetterView's block memo ran.
    expect(desc.kind).toBe('boundary');
    expect(desc.title).toBe('Consider My Love');
  });

  it('still peeks a real screen when the neighbor IS Format A', () => {
    const formatA = { id: 'keep-the-passover', title: 'Keep the Passover', num: 8, type: 'letter', blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null };
    globalThis.colLetterArr = () => [formatA];
    renderLetter({
      letter: { ...LETTER, nextLetter: { id: 'keep-the-passover', title: 'Keep the Passover' } },
      volKey: 'holydays',
    });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.letter).toBe(formatA);
  });
});
