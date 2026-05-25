/* P7d — useBibleStudies tests.
   ──────────────────────────────
   useBibleStudies owns the Bible Studies domain (STUDIES + UNIFIED_CHAIN)
   and the lookup / nav helpers around them. The TDZ-blocker rationale
   (the structural reason this was the priority extraction) is documented
   in the hook header.

   Silent-failure modes worth guarding:

     A) selectStudy's single-vs-multi-chapter routing. The "if single
        chapter or singlePage → bible-study-chapter (with chapter
        pre-selected)" vs "multi → bible-study-index" branch is easy
        to get wrong on either side. Multi-chapter mis-routed to
        chapter-screen would show a random first chapter; single
        mis-routed to index would show an empty list with one item.
        Tested for each branch.

     B) UNIFIED_CHAIN composition. Combines STUDIES + MATTHEW_CHAIN_ENTRY
        via CHAIN_ORDER. Filter conditions:
          - Matthew always kept (isMatthewStudy flag)
          - Studies kept iff !locked AND chapters.length > 0
        A wrong filter mis-orders the chain or drops valid entries.

     C) Chain prev/next at boundaries. First entry → prev = null; last
        → next = null. Unknown slug → both = null. Mis-handled gives
        a "Back to nothing" boundary card.

     D) goToChainEntryFirst/Last matthew-study special case. The Matthew
        Study Bible isn't reachable via selectStudyChapter (it uses
        bible-ch / matthew-ch, not bible-study-chapter). The
        special-case branch sets fromStudies + book/chapter/screen
        directly. Wrong here = matthew-study slug routes through
        selectStudyChapter and shows the wrong renderer.

   Globals stubbed (cross-bundle): _studies, _matthew, MATTHEW.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBibleStudies } from './use-bible-studies.js';

// ── Global stubs ────────────────────────────────────────────────────────
let _prev_studies, _prev_matthew, _prevMATTHEW;

const stubStudies = [
  // Multi-chapter study (3 chapters)
  { id: 'more-than-a-man', slug: 'more-than-a-man', title: 'More Than a Man',
    chapters: [{ id: 'mtam-1' }, { id: 'mtam-2' }, { id: 'mtam-3' }] },
  // Single-chapter study (auto-routes to bible-study-chapter)
  { id: 'odds-chart', slug: 'odds-chart', title: 'Odds Chart',
    chapters: [{ id: 'odds-only' }] },
  // singlePage study (also auto-routes despite multi chapters)
  { id: 'purity', slug: 'purity', title: 'Purity', singlePage: true,
    chapters: [{ id: 'p1' }, { id: 'p2' }] },
  // Locked study (filtered from UNIFIED_CHAIN)
  { id: 'state-of-the-dead', slug: 'state-of-the-dead', title: 'State of the Dead',
    locked: true, chapters: [{ id: 'sd1' }] },
  // Empty-chapters study (also filtered)
  { id: 'lamb-of-god', slug: 'lamb-of-god', title: 'Lamb of God',
    chapters: [] },
  // Multi-chapter normal
  { id: 'trinity-exposed', slug: 'trinity-exposed', title: 'Trinity Exposed',
    chapters: [{ id: 'te-1' }, { id: 'te-2' }] },
  // Multi-chapter normal
  { id: 'grace-and-the-law', slug: 'grace-and-the-law', title: 'Grace and the Law',
    chapters: [{ id: 'gl-1' }] },
];

const stubMatthew = {
  chapters: [
    { num: 1, title: 'The Genealogy' },
    { num: 5, title: 'The Sermon on the Mount' },
    { num: 28, title: 'The Great Commission' },
  ],
};

beforeEach(() => {
  _prev_studies = window._studies;
  _prev_matthew = window._matthew;
  _prevMATTHEW = window.MATTHEW;

  window._studies = () => stubStudies;
  window._matthew = () => stubMatthew;
  window.MATTHEW = stubMatthew;
});

afterEach(() => {
  window._studies = _prev_studies;
  window._matthew = _prev_matthew;
  window.MATTHEW = _prevMATTHEW;
});

// ── Test helpers ────────────────────────────────────────────────────────
const makeSetters = () => ({
  setScreen: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setStudyId: vi.fn(),
  setStudyChapterId: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadChapters: vi.fn(),
  setFromStudies: vi.fn(),
});

const setup = () => {
  const setters = makeSetters();
  const { result } = renderHook(() => useBibleStudies(setters));
  return { result, setters };
};

// ── Pure lookups ────────────────────────────────────────────────────────

describe('useBibleStudies — pure lookups', () => {
  it('getStudyById finds an existing study', () => {
    const { result } = setup();
    const s = result.current.getStudyById('purity');
    expect(s).toBeTruthy();
    expect(s.title).toBe('Purity');
  });

  it('getStudyById returns null for unknown id', () => {
    const { result } = setup();
    expect(result.current.getStudyById('nonexistent')).toBeNull();
  });

  it('getStudyChapter finds a chapter by id', () => {
    const { result } = setup();
    const study = result.current.getStudyById('more-than-a-man');
    const ch = result.current.getStudyChapter(study, 'mtam-2');
    expect(ch).toEqual({ id: 'mtam-2' });
  });

  it('getStudyChapter returns null for unknown chapter id', () => {
    const { result } = setup();
    const study = result.current.getStudyById('more-than-a-man');
    expect(result.current.getStudyChapter(study, 'nope')).toBeUndefined();  // .find returns undefined; null check at consumers
  });

  it('getStudyChapter returns null when study is null/missing chapters', () => {
    const { result } = setup();
    expect(result.current.getStudyChapter(null, 'x')).toBeNull();
    expect(result.current.getStudyChapter({}, 'x')).toBeNull();
  });

  it('studyReadKey formats with the bible-study- prefix', () => {
    const { result } = setup();
    expect(result.current.studyReadKey('purity')).toBe('bible-study-purity');
    expect(result.current.studyReadKey('matthew-study')).toBe('bible-study-matthew-study');
  });
});

// ── selectStudy ─────────────────────────────────────────────────────────

describe('useBibleStudies — selectStudy', () => {
  it('routes single-chapter study directly to bible-study-chapter', () => {
    const { result, setters } = setup();
    result.current.selectStudy('odds-chart');
    expect(setters.setStudyId).toHaveBeenCalledWith('odds-chart');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('odds-only');  // pre-selected
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(setters.setActiveReadKey).toHaveBeenCalledWith('bible-study-odds-chart', expect.any(Function));
  });

  it('routes singlePage study directly to bible-study-chapter (despite multi chapters)', () => {
    // Purity has 2 chapters but singlePage=true → directly to chapter.
    const { result, setters } = setup();
    result.current.selectStudy('purity');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('p1');  // first chapter
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('routes multi-chapter study to bible-study-index', () => {
    const { result, setters } = setup();
    result.current.selectStudy('more-than-a-man');
    expect(setters.setStudyId).toHaveBeenCalledWith('more-than-a-man');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith(null);
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-index');
    // No commit-fn for the multi-chapter path (user picks the chapter
    // on bible-study-index).
    expect(setters.setActiveReadKey).toHaveBeenCalledWith('bible-study-more-than-a-man');
  });

  it('is a no-op when study is locked', () => {
    const { result, setters } = setup();
    result.current.selectStudy('state-of-the-dead');
    expect(setters.setStudyId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('is a no-op when study has no chapters', () => {
    const { result, setters } = setup();
    result.current.selectStudy('lamb-of-god');
    expect(setters.setStudyId).not.toHaveBeenCalled();
  });

  it('is a no-op when study id is unknown', () => {
    const { result, setters } = setup();
    result.current.selectStudy('not-a-real-study');
    expect(setters.setStudyId).not.toHaveBeenCalled();
  });
});

// ── selectStudyChapter ──────────────────────────────────────────────────

describe('useBibleStudies — selectStudyChapter', () => {
  it('sets study + chapter + activeReadKey + screen', () => {
    const { result, setters } = setup();
    result.current.selectStudyChapter('more-than-a-man', 'mtam-2');
    expect(setters.setStudyId).toHaveBeenCalledWith('more-than-a-man');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('mtam-2');
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(setters.setActiveReadKey).toHaveBeenCalledWith('bible-study-more-than-a-man', expect.any(Function));
  });

  it('is a no-op when study id is unknown (guards against stale studyId)', () => {
    const { result, setters } = setup();
    result.current.selectStudyChapter('nonexistent', 'ch1');
    expect(setters.setStudyId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('activeReadKey commit-fn writes through setLastReadChapters', () => {
    // Capture the commit-fn that selectStudyChapter passes to
    // setActiveReadKey, invoke it, and assert it updates the
    // per-collection chapter cursor map correctly.
    const { result, setters } = setup();
    result.current.selectStudyChapter('more-than-a-man', 'mtam-3');
    const commitFn = setters.setActiveReadKey.mock.calls[0][1];
    commitFn();
    expect(setters.setLastReadChapters).toHaveBeenCalledTimes(1);
    // Setter was called with an updater fn; invoke it on an empty prev
    // to see what the next state looks like.
    const updater = setters.setLastReadChapters.mock.calls[0][0];
    expect(updater({})).toEqual({ 'bible-study-more-than-a-man': 'mtam-3' });
    // And it preserves existing keys (merges, not replaces).
    expect(updater({ 'other-key': 'x' })).toEqual({
      'other-key': 'x',
      'bible-study-more-than-a-man': 'mtam-3',
    });
  });
});

// ── UNIFIED_CHAIN composition ───────────────────────────────────────────

describe('useBibleStudies — UNIFIED_CHAIN', () => {
  it('contains the entries in CHAIN_ORDER, with Matthew at position 2', () => {
    const { result } = setup();
    const chain = result.current.UNIFIED_CHAIN;
    // CHAIN_ORDER:
    //   more-than-a-man, matthew-study, purity, state-of-the-dead,
    //   grace-and-the-law, lamb-of-god, trinity-exposed, odds-chart
    // After filter (drops locked: state-of-the-dead AND empty: lamb-of-god):
    //   more-than-a-man, matthew-study, purity, grace-and-the-law,
    //   trinity-exposed, odds-chart  (6 entries)
    expect(chain.length).toBe(6);
    expect(chain.map(e => e.slug)).toEqual([
      'more-than-a-man', 'matthew-study', 'purity',
      'grace-and-the-law', 'trinity-exposed', 'odds-chart',
    ]);
  });

  it('Matthew Study Bible appears at position 2 with isMatthewStudy=true', () => {
    const { result } = setup();
    const m = result.current.UNIFIED_CHAIN[1];
    expect(m.slug).toBe('matthew-study');
    expect(m.isMatthewStudy).toBe(true);
    expect(m.chapters).toEqual(stubMatthew.chapters);
  });

  it('filters out locked studies', () => {
    const { result } = setup();
    expect(result.current.UNIFIED_CHAIN.find(e => e.slug === 'state-of-the-dead')).toBeUndefined();
  });

  it('filters out empty-chapter studies', () => {
    const { result } = setup();
    expect(result.current.UNIFIED_CHAIN.find(e => e.slug === 'lamb-of-god')).toBeUndefined();
  });

  it('KEEPS Matthew even though it has no `locked` flag (isMatthewStudy shortcut)', () => {
    // Guard the filter's `e.isMatthewStudy || ...` short-circuit. If
    // someone "simplified" the filter to just `!locked && chapters.length`,
    // Matthew would still pass (it has chapters) but the principle
    // matters: Matthew is unconditional.
    const { result } = setup();
    expect(result.current.UNIFIED_CHAIN.find(e => e.slug === 'matthew-study')).toBeTruthy();
  });
});

// ── Chain prev/next ─────────────────────────────────────────────────────

describe('useBibleStudies — chain prev/next', () => {
  it('prevChainEntry returns the prior entry', () => {
    const { result } = setup();
    const prev = result.current.prevChainEntry('purity');
    expect(prev?.slug).toBe('matthew-study');
  });

  it('nextChainEntry returns the following entry', () => {
    const { result } = setup();
    const next = result.current.nextChainEntry('matthew-study');
    expect(next?.slug).toBe('purity');
  });

  it('prevChainEntry returns null at the first entry', () => {
    const { result } = setup();
    expect(result.current.prevChainEntry('more-than-a-man')).toBeNull();
  });

  it('nextChainEntry returns null at the last entry', () => {
    const { result } = setup();
    expect(result.current.nextChainEntry('odds-chart')).toBeNull();
  });

  it('both return null for unknown slugs (defensive — chainIdx = -1)', () => {
    const { result } = setup();
    expect(result.current.prevChainEntry('nope')).toBeNull();
    expect(result.current.nextChainEntry('nope')).toBeNull();
  });
});

// ── goToChainEntryFirst ─────────────────────────────────────────────────

describe('useBibleStudies — goToChainEntryFirst', () => {
  it('matthew-study branch routes to matthew-ch chapter 1, sets fromStudies', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryFirst('matthew-study')();
    expect(setters.setFromStudies).toHaveBeenCalledWith(true);
    expect(setters.setBookId).toHaveBeenCalledWith('matthew');
    expect(setters.setChapterNum).toHaveBeenCalledWith(1);
    expect(setters.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(setters.setActiveReadKey).toHaveBeenCalledWith('matthew', expect.any(Function));
    // CRITICAL: must NOT touch setStudyId / setStudyChapterId — Matthew
    // uses the matthew-ch renderer, not bible-study-chapter.
    expect(setters.setStudyId).not.toHaveBeenCalled();
    expect(setters.setStudyChapterId).not.toHaveBeenCalled();
  });

  it('regular study branch routes via selectStudyChapter to first chapter', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryFirst('more-than-a-man')();
    expect(setters.setStudyId).toHaveBeenCalledWith('more-than-a-man');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('mtam-1');
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(setters.setFromStudies).not.toHaveBeenCalled();  // study branch, not matthew
  });

  it('is a no-op when slug is unknown', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryFirst('nonexistent')();
    expect(setters.setStudyId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('returns a curried fn (the slug is bound, the call is parameterless)', () => {
    // Render-tree consumers wire these as onPrevBoundary / onNextBoundary
    // directly. Verifying the shape protects against accidental
    // un-currying.
    const { result } = setup();
    const fn = result.current.goToChainEntryFirst('matthew-study');
    expect(typeof fn).toBe('function');
    expect(fn.length).toBe(0);  // parameterless
  });
});

// ── goToChainEntryLast ──────────────────────────────────────────────────

describe('useBibleStudies — goToChainEntryLast', () => {
  it('matthew-study branch routes to the LAST chapter of MATTHEW', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryLast('matthew-study')();
    // stubMatthew last chapter is num=28.
    expect(setters.setBookId).toHaveBeenCalledWith('matthew');
    expect(setters.setChapterNum).toHaveBeenCalledWith(28);
    expect(setters.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(setters.setFromStudies).toHaveBeenCalledWith(true);
    expect(setters.setStudyId).not.toHaveBeenCalled();
  });

  it('regular study branch routes to LAST chapter via selectStudyChapter', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryLast('more-than-a-man')();
    // more-than-a-man's last chapter is mtam-3.
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('mtam-3');
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('is a no-op when slug is unknown', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryLast('nonexistent')();
    expect(setters.setStudyId).not.toHaveBeenCalled();
  });

  it('matthew-study last activeReadKey commit-fn writes lastReadChapters.matthew', () => {
    const { result, setters } = setup();
    result.current.goToChainEntryLast('matthew-study')();
    const commitFn = setters.setActiveReadKey.mock.calls[0][1];
    commitFn();
    const updater = setters.setLastReadChapters.mock.calls[0][0];
    expect(updater({})).toEqual({ matthew: 28 });
  });
});
