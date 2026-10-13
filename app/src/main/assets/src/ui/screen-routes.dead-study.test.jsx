// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.lazy-studies.test.jsx
/* W28 (sweep 2026-10-13) — a study route never renders nothing.
   ──────────────────────────────────────────────────────────────────
   'bible-study-index' and BibleStudyChapterView returned null when the study (or
   the part) did not resolve: a restored or linked study tab showed an empty
   screen with no header, no back and no retry, and because the tab is persisted
   a reload repeated it. Two causes, two ways out, both with chrome (the rule
   _deadLetter set for letters, navigation-tabs-4):
     - bible-studies.js failed to load -> "Couldn't load studies." + Try again;
     - the studies loaded and the id is stale -> "no longer available" + a way back.
   While the studies are still loading (or not asked for yet: the first render
   comes before App's effect starts the load) the route still says Loading. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

const G = /** @type {any} */ (globalThis);

beforeEach(() => {
  G.BibleStudyIndex = () => null;
  G.BibleStudyChapterView = () => null;
  G.ScreenLayout = ({ children }) => children;
  G.BIBLE_STUDIES = [{ id: 'purity', slug: 'purity', chapters: [{ id: 'purity-ch1' }] }];
  window.__screensG = { loaded: true, error: false, subscribe: () => () => {}, getVersion: () => 0 };
  window.__loadScreensG = vi.fn();
});
afterEach(() => {
  delete G.BibleStudyIndex; delete G.BibleStudyChapterView; delete G.ScreenLayout; delete G.BIBLE_STUDIES;
  delete window.__screensG; delete window.__loadScreensG;
  vi.restoreAllMocks();
});

const PURITY = { id: 'purity', slug: 'purity', chapters: [{ id: 'purity-ch1' }] };
function makeRoutes(overrides = {}) {
  const props = {
    setScreen: vi.fn(), setLetterId: vi.fn(), setActiveReadKey: vi.fn(),
    settings: {}, activeReadKey: null, readItems: {}, lastReadChapters: {},
    isRead: () => false, getReadKey: (rk, id) => `${rk}:${id}`,
    goHome: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goStudiesHome: vi.fn(),
    retryStudies: vi.fn(), studiesLoading: false, studiesError: false,
    studyId: 'gone', studyChapterId: 'gone-ch1',
    // as use-bible-studies: nothing resolves until bible-studies.js has defined BIBLE_STUDIES
    getStudyById: (id) => (typeof BIBLE_STUDIES !== 'undefined' && id === 'purity' ? PURITY : null),
    getStudyChapter: (study, chId) => (study && study.chapters.find((c) => c.id === chId)) || null,
    studyReadKey: (slug) => 'bible-study-' + slug,
    UNIFIED_CHAIN: [],
    bibleAudioFor: () => null,
    sharedViewProps: {},
    chapter: { num: 1 }, chapterNum: 1,
    theme: 'dark', setTheme: vi.fn(),
    ...overrides,
  };
  return { routes: buildScreenRoutes(props), props };
}

function text(el) {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  if (Array.isArray(el)) return el.map(text).join('');
  return text(el.props && el.props.children);
}
function find(el, type) {
  if (!el || typeof el !== 'object') return null;
  if (el.type === type) return el;
  const kids = el.props && el.props.children;
  for (const c of Array.isArray(kids) ? kids : [kids]) {
    const hit = find(c, type);
    if (hit) return hit;
  }
  return null;
}

describe('W28: a study tab whose study is gone shows a way back, never nothing', () => {
  it('bible-study-index, stale study id: "no longer available" and a button back to Studies', () => {
    const { routes, props } = makeRoutes({ studyId: 'gone' });
    const out = routes['bible-study-index']();
    expect(out).not.toBeNull();
    expect(text(out)).toContain('This study is no longer available.');
    find(out, 'button').props.onClick();
    expect(props.goStudiesHome).toHaveBeenCalled();
  });

  it('bible-study-index with no study id at all: the same way back', () => {
    const out = makeRoutes({ studyId: null }).routes['bible-study-index']();
    expect(text(out)).toContain('This study is no longer available.');
  });

  it('bible-study-chapter, stale study id: "no longer available" and a button back to Studies', () => {
    const { routes, props } = makeRoutes({ studyId: 'gone', studyChapterId: 'x' });
    const out = routes['bible-study-chapter']();
    expect(text(out)).toContain('This study is no longer available.');
    find(out, 'button').props.onClick();
    expect(props.goStudiesHome).toHaveBeenCalled();
  });

  it('bible-study-chapter, the study is there but the part is gone: a button back to the study', () => {
    const { routes, props } = makeRoutes({ studyId: 'purity', studyChapterId: 'purity-ch9' });
    const out = routes['bible-study-chapter']();
    expect(text(out)).toContain('This part is no longer available.');
    find(out, 'button').props.onClick();
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-index');
  });

  it('a resolvable part still renders the chapter view', () => {
    const out = makeRoutes({ studyId: 'purity', studyChapterId: 'purity-ch1' }).routes['bible-study-chapter']();
    expect(find(out, G.BibleStudyChapterView)).toBeTruthy();
  });
});

describe('W28: when the studies failed to load, both routes offer Try again', () => {
  for (const route of ['bible-study-index', 'bible-study-chapter']) {
    it(`${route}: "Couldn't load studies." and Try again calls retryStudies`, () => {
      delete G.BIBLE_STUDIES;
      const { routes, props } = makeRoutes({ studyId: 'purity', studyChapterId: 'purity-ch1', studiesError: true });
      const out = routes[route]();
      expect(text(out)).toContain('Couldn’t load studies.');
      find(out, 'button').props.onClick();
      expect(props.retryStudies).toHaveBeenCalledTimes(1);
    });
  }
});

describe('W28: while the studies are loading, or not asked for yet, the routes still say Loading', () => {
  for (const route of ['bible-study-index', 'bible-study-chapter']) {
    it(`${route}: loading`, () => {
      delete G.BIBLE_STUDIES;
      const out = makeRoutes({ studyId: 'purity', studyChapterId: 'purity-ch1', studiesLoading: true }).routes[route]();
      expect(text(out)).toBe('Loading…');
    });
    it(`${route}: the first render, before App's effect starts the load`, () => {
      delete G.BIBLE_STUDIES;
      const out = makeRoutes({ studyId: 'purity', studyChapterId: 'purity-ch1' }).routes[route]();
      expect(text(out)).toBe('Loading…');
    });
  }
});
