// @ts-nocheck — free-var globals stubbed per test (LetterView boundary mock)
/* BibleStudyChapterView — the resolvePeek contract handed to LetterView.
   ─────────────────────────────────────────────────────────────────────
   The study screen wraps LetterView around a letter-shaped chapter shim.
   For the finger-follow swipe to peek the REAL neighbor chapter (not a
   generic boundary card), it must hand LetterView a resolvePeek that maps
   a neighbor {id} → the neighbor's OWN shim (same chapter→study resource
   fallbacks, its own prev/next) + the 'study-<id>-<chId>' scroll key that
   useScrollMemory saves the live screen under. LetterView is the natural
   test boundary here — it's stubbed to capture its props. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BibleStudyChapterView } from './BibleStudyChapterView.jsx';

let captured;

beforeEach(() => {
  captured = null;
  globalThis.LetterView = (props) => { captured = props; return <div data-testid="lv" />; };
  globalThis.COL_BY_LETTER_SC = new Map();
  globalThis.studyShortTitle = (t) => t;
  window.__loadVotCorpus = vi.fn(() => Promise.resolve());
});
afterEach(() => {
  cleanup();
  for (const k of ['LetterView', 'COL_BY_LETTER_SC', 'studyShortTitle']) delete globalThis[k];
  delete window.__loadVotCorpus;
});

const STUDY = {
  id: 's1', slug: 's1', title: 'The Study', locked: false,
  videos: [{ url: 'https://x', label: 'Study-level video' }],
  chapters: [
    { id: 'ch1', num: 1, title: 'One', part: 1, blocks: [{ type: 'para', segments: [] }] },
    { id: 'ch2', num: 2, title: 'Two', part: 1, blocks: [] },
    { id: 'ch3', num: 3, title: 'Three', part: 2, blocks: [], videos: [{ url: 'https://y', label: 'Chapter video' }] },
  ],
};

const noop = () => {};
const renderView = () => render(
  <BibleStudyChapterView
    studyId="s1" studyChapterId="ch2"
    getStudyById={() => STUDY}
    getStudyChapter={(s, id) => s.chapters.find((c) => c.id === id)}
    studiesLoading={false}
    prevChainEntry={() => null} nextChainEntry={() => null}
    goToChainEntryFirst={() => noop} goToChainEntryLast={() => noop}
    setStudyChapterId={noop} setScreen={noop} setBookId={noop} setChapterNum={noop}
    setFromStudies={noop} setLetterId={noop} setActiveReadKey={noop} setSurpriseAnchor={noop}
    markRead={noop} unmarkRead={noop} isRead={() => false} studyReadKey={(s) => 'study-' + s}
    prophecyCardStatesRef={{ current: {} }} saveProphecyCardStates={noop}
    selectStudy={noop} selectStudyChapter={noop}
    goStudiesHome={noop}
    sharedViewProps={{}}
  />,
);

describe('BibleStudyChapterView → LetterView audio identity (ruling (4), 2026-09-11)', () => {
  it('mounts LetterView with volKey "study" — the manifest prefix of study:<chapterId> recordings', () => {
    renderView();
    // Pre-fix volKey was omitted: hasAudio/prewarm/playLetter were asked about
    // 'undefined:ch2' (and short-circuited on studyMode anyway), so the six
    // Purity recordings shipped in AUDIO_MANIFEST had no Listen pill.
    expect(captured.volKey).toBe('study');
    expect(captured.studyMode).toBe(true);
    expect(captured.volumeLabel).toBe('The Study');   // becomes the track's `sub`
  });

  it('kicks the lazy VOT corpus on mount — AUDIO_MANIFEST rides bundle-a-vot, and a study reached cold never loaded it', () => {
    /* Found by tools/e2e-study-audio.mjs on the first built tree (3f921a1c): Home > Studies >
       Purity > ch 1 on a fresh boot showed no pill, because hasAudio answers false for
       "manifest not loaded" exactly as for "no recording". The Listening Library warms the
       same corpus for the same reason (AudioLibraryScreen); App's useLazyBundles re-renders
       the route when it lands, so the kick alone is the fix. */
    renderView();
    expect(window.__loadVotCorpus).toHaveBeenCalledTimes(1);
  });
});

describe('BibleStudyChapterView → LetterView resolvePeek', () => {
  it('builds the current chapter shim with its neighbors (unchanged contract)', () => {
    renderView();
    expect(captured.letter.id).toBe('ch2');
    expect(captured.letter.prevLetter).toEqual({ id: 'ch1', title: 'One' });
    expect(captured.letter.nextLetter).toEqual({ id: 'ch3', title: 'Three' });
    expect(captured.letter.preamble).toBe('Part 1');
    // Resource fallback: ch2 has no videos → inherits the study's.
    expect(captured.letter.videos).toEqual(STUDY.videos);
  });

  it('resolvePeek maps a same-study neighbor to its OWN full shim + study scroll key', () => {
    renderView();
    expect(typeof captured.resolvePeek).toBe('function');
    const peek = captured.resolvePeek({ id: 'ch3', title: 'Three' });
    expect(peek.scrollKey).toBe('study-s1-ch3');
    // The neighbor's shim, not the current chapter's: its own identity,
    // neighbors, preamble, and chapter-level resource override.
    expect(peek.letter.id).toBe('ch3');
    expect(peek.letter.prevLetter).toEqual({ id: 'ch2', title: 'Two' });
    expect(peek.letter.nextLetter).toBeNull();
    expect(peek.letter.preamble).toBe('Part 2');
    expect(peek.letter.videos).toEqual([{ url: 'https://y', label: 'Chapter video' }]);
  });

  it('resolvePeek returns null for an id outside the study (falls back to a boundary card)', () => {
    renderView();
    expect(captured.resolvePeek({ id: 'not-a-chapter', title: 'X' })).toBeNull();
  });
});
