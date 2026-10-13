// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.breadcrumbs.test.jsx
/* The Studies screens and the Matthew chapter view route straight to their screen (lz1, 2026-10-13).
   ──────────────────────────────────────────────────────────────────
   From 2026-09-28 to lz1 these four rode the lazy bundle-g (Lighthouse item 5), and their routes
   drew "Loading…", asked __loadScreensG and offered "Try again". lz1 folded bundles e-h back into
   bundle-d (D:/AgentBackbone/reports/lazy-loading-2026-10-13/REPORT.md), so a route draws its
   screen at once and asks no loader; only DATA still waits (the Matthew corpus, below). */
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
    // a study and a part that resolve (W28: a route whose part does not resolve shows its own way back)
    getStudyById: () => ({ id: 'purity', slug: 'purity', chapters: [{ id: 'purity-ch1' }] }),
    getStudyChapter: (study, chId) => (study.chapters.find((c) => c.id === chId) || null),
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

describe('the Studies and Matthew routes draw their screen at once (lz1: no screen bundle to wait for)', () => {
  for (const name of LAZY) {
    const route = ROUTE_OF[name];
    it(`${route}: renders ${name} and asks no screen loader`, () => {
      G[name] = () => null;
      const out = makeRoutes()[route]();
      expect(find(out, G[name]), `${route} did not render ${name}`).toBeTruthy();
      expect(loadG).not.toHaveBeenCalled();
    });
  }

  it('matthew-ch still waits for the Matthew corpus first, and asks no screen loader', () => {
    delete G.MATTHEW;
    G.MatthewChapterView = () => null;
    const loadMatthew = vi.fn();
    window.__matthewCorpus = { loaded: false, error: false };
    window.__loadMatthewCorpus = loadMatthew;
    const out = makeRoutes()['matthew-ch']();
    expect(text(out)).toBe('Loading Matthew…');
    expect(loadMatthew).toHaveBeenCalled();
    expect(loadG).not.toHaveBeenCalled();
  });
});
