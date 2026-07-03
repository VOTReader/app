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
