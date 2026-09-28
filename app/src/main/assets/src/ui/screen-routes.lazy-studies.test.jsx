// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.breadcrumbs.test.jsx
/* The Studies screens and the Matthew chapter view ride the lazy bundle-g (Lighthouse item 5).
   ──────────────────────────────────────────────────────────────────
   docs/perf/lighthouse-2026-09.md item 5: most of bundle-d is not executed at load, and these
   four screens are reached only by navigation. They moved to bundle-g, so their routes must do
   exactly what the other bundle-g routes (My Progress, Notes, the journal …) do while the bundle
   is still loading: render _corpusView's "Loading…", ask __loadScreensG for the bundle, and offer
   "Try again" when it failed. Once the bundle has defined the screen, the route renders it as
   before. tools/bundle-membership.test.js pins the move in the built bytes. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

const G = /** @type {any} */ (globalThis);
const LAZY = ['StudiesHome', 'BibleStudyIndex', 'BibleStudyChapterView', 'MatthewChapterView'];
const ROUTE_OF = {
  StudiesHome: 'studies-home',
  BibleStudyIndex: 'bible-study-index',
  BibleStudyChapterView: 'bible-study-chapter',
  MatthewChapterView: 'matthew-ch',
};

let loadG;
beforeEach(() => {
  loadG = vi.fn();
  window.__screensG = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 };
  window.__loadScreensG = loadG;
  G.MATTHEW = { id: 'matthew', chapters: [] };
  G.ScreenLayout = ({ children }) => children;
});
afterEach(() => {
  for (const k of LAZY) delete G[k];
  delete G.MATTHEW; delete G.ScreenLayout;
  delete window.__screensG; delete window.__loadScreensG;
  delete window.__loadVotCorpus; delete window.__matthewCorpus; delete window.__loadMatthewCorpus;
  vi.restoreAllMocks();
});

function makeRoutes(overrides = {}) {
  const props = {
    setScreen: vi.fn(), setLetterId: vi.fn(), setActiveReadKey: vi.fn(),
    settings: {}, activeReadKey: null, readItems: {}, lastReadChapters: {},
    isRead: () => false, getReadKey: (rk, id) => `${rk}:${id}`,
    goHome: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goStudiesHome: vi.fn(),
    studyId: 'purity', studyChapterId: 'purity-ch1',
    getStudyById: () => ({ id: 'purity', slug: 'purity', chapters: [] }),
    getStudyChapter: () => null,
    studyReadKey: (slug) => 'bible-study-' + slug,
    UNIFIED_CHAIN: [],
    bibleAudioFor: () => null,
    sharedViewProps: {},
    chapter: { num: 1 }, chapterNum: 1,
    theme: 'dark', setTheme: vi.fn(),
    ...overrides,
  };
  return buildScreenRoutes(props);
}

/** Flatten an element tree into its text. */
function text(el) {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  if (Array.isArray(el)) return el.map(text).join('');
  return text(el.props && el.props.children);
}

/** The first element in a (possibly nested) element tree whose type is `type`. */
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

describe('while bundle-g is loading, the Studies and Matthew routes behave as every bundle-g route does', () => {
  for (const name of LAZY) {
    const route = ROUTE_OF[name];
    it(`${route}: "Loading…" and a request for bundle-g`, () => {
      const out = makeRoutes()[route]();
      expect(text(out)).toBe('Loading…');
      expect(out.props.className).toBe('sc-sheet-loading');
      expect(loadG).toHaveBeenCalled();
    });

    it(`${route}: "Try again" when bundle-g failed, and the button asks again`, () => {
      window.__screensG.error = true;
      const out = makeRoutes()[route]();
      expect(text(out)).toContain('Couldn’t load this section.');
      const btn = find(out, 'button');
      loadG.mockClear();
      btn.props.onClick();
      expect(loadG).toHaveBeenCalledTimes(1);
    });

    it(`${route}: renders the screen once bundle-g has defined it`, () => {
      G[name] = () => null;
      loadG.mockClear();
      const out = makeRoutes()[route]();
      expect(find(out, G[name]), `${route} did not render ${name}`).toBeTruthy();
      expect(loadG).not.toHaveBeenCalled();
    });
  }

  it('the output of both kinds of lazy route is the same element', () => {
    // My Progress has been a bundle-g route since landing 21: the new ones must be indistinguishable.
    const r = makeRoutes({ readHistory: [] });
    expect(r['studies-home']()).toEqual(r['my-progress']());
  });

  it('matthew-ch still waits for the Matthew corpus first, and asks for bundle-g alongside it', () => {
    delete G.MATTHEW;
    const loadMatthew = vi.fn();
    window.__matthewCorpus = { loaded: false, error: false };
    window.__loadMatthewCorpus = loadMatthew;
    const out = makeRoutes()['matthew-ch']();
    expect(text(out)).toBe('Loading Matthew…');
    expect(loadMatthew).toHaveBeenCalled();
    expect(loadG).toHaveBeenCalled();
  });
});
