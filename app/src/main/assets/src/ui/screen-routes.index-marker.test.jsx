// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.dead-study.test.jsx
/* Sweep mw12 — the 'you are here' marker in an index answers "where was I in THIS book" and is not tied
   to settings.showReadingDot, which gates only the resume dot in the top nav (Wave 0 decoupled the Bible
   and Matthew indexes; the Bible Study index and the VOT volume indexes still hid it with the dot). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

const G = /** @type {any} */ (globalThis);
const ONE = { volKey: 'one', readKey: 'vot-one', letterScreen: 'vot-one-letter', label: 'Volume One' };

beforeEach(() => {
  G.BibleStudyIndex = () => null;
  G.VolumeLetterIndex = () => null;
  G.ScreenLayout = ({ children }) => children;
  G.LibraryNav = () => null;
  G.BIBLE_STUDIES = [{ id: 'purity', slug: 'purity', chapters: [{ id: 'purity-ch1' }, { id: 'purity-ch2' }] }];
  G.COL_BY_KEY = new Map([['one', ONE]]);
  G.colLetterArr = () => [];
  G.colPreface = () => null;
  window.__screensG = { loaded: true, error: false, subscribe: () => () => {}, getVersion: () => 0 };
  window.__votCorpus = { loaded: true, error: false, subscribe: () => () => {}, getVersion: () => 0 };
});
afterEach(() => {
  ['BibleStudyIndex', 'VolumeLetterIndex', 'ScreenLayout', 'LibraryNav', 'BIBLE_STUDIES', 'COL_BY_KEY', 'colLetterArr', 'colPreface'].forEach((k) => { delete G[k]; });
  delete window.__screensG; delete window.__votCorpus;
  vi.restoreAllMocks();
});

function makeRoutes(overrides = {}) {
  return buildScreenRoutes({
    setScreen: vi.fn(), setLetterId: vi.fn(), setActiveReadKey: vi.fn(),
    settings: { showReadingDot: false }, activeReadKey: null, readItems: {}, lastReadChapters: {}, lastReadLetterMap: {},
    isRead: () => false, getReadKey: (rk, id) => `${rk}:${id}`,
    goHome: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goStudiesHome: vi.fn(),
    retryStudies: vi.fn(), studiesLoading: false, studiesError: false,
    studyId: 'purity', studyChapterId: null,
    getStudyById: (id) => G.BIBLE_STUDIES.find((s) => s.id === id) || null,
    getStudyChapter: (study, chId) => (study && study.chapters.find((c) => c.id === chId)) || null,
    studyReadKey: (slug) => 'bible-study-' + slug,
    setLastReadForVol: vi.fn(),
    UNIFIED_CHAIN: [], bibleAudioFor: () => null, sharedViewProps: {},
    theme: 'dark', setTheme: vi.fn(),
    ...overrides,
  });
}
function find(el, type) {
  if (!el || typeof el !== 'object') return null;
  if (el.type === type) return el;
  const kids = el.props && el.props.children;
  for (const c of Array.isArray(kids) ? kids : [kids]) { const hit = find(c, type); if (hit) return hit; }
  return null;
}

describe("the index 'you are here' marker does not follow the resume-dot setting", () => {
  it('Bible Study index: marks the chapter last read with the dot off', () => {
    const routes = makeRoutes({ activeReadKey: 'bible-study-purity', lastReadChapters: { 'bible-study-purity': 'purity-ch2' } });
    expect(find(routes['bible-study-index'](), G.BibleStudyIndex).props.currentChapter).toBe('purity-ch2');
  });
  it('Bible Study index: no marker when the reader is reading something else', () => {
    const routes = makeRoutes({ activeReadKey: 'vol:one', lastReadChapters: { 'bible-study-purity': 'purity-ch2' } });
    expect(find(routes['bible-study-index'](), G.BibleStudyIndex).props.currentChapter).toBeNull();
  });
  it('a volume letter index: marks the letter last read with the dot off', () => {
    const routes = makeRoutes({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'v1-letter-7' } });
    expect(find(routes['vot-one-index'](), G.VolumeLetterIndex).props.currentLetter).toBe('v1-letter-7');
  });
  it('a volume letter index: no marker when the reader is reading another volume', () => {
    const routes = makeRoutes({ activeReadKey: 'vol:two', lastReadLetterMap: { one: 'v1-letter-7' } });
    expect(find(routes['vot-one-index'](), G.VolumeLetterIndex).props.currentLetter).toBeNull();
  });
});
