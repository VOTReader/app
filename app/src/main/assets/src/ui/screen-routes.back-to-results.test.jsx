// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.bibleaudio.test.jsx
/* Back to results (search200 UX B1).
   ──────────────────────────────────────────────────────────────────
   From a search hit, the reader's ‹ went to the parent index: a letter could
   never get back to its results by the arrows, and a Bible chapter took two taps
   (chapter, then the book index's back). The brief look was also logged as
   reading progress (the frontier "12% · ~4 min left", a completion at the end).
   The system back already returned to the results.

   For a visit the system back would end at the results (searchBackActive), the
   reading routes now hand their view:
     - navBack { onBack, label: 'results' }: the ‹ goes to the results, named so;
     - the back pill as "‹ Back to results" (backHint), with the same target;
     - markAsReadEnabled false on the place the hit opened (searchLanding), so the
       read tracker records nothing for the look. A neighbour reached by the
       arrows is reading again (the landing names one place), and so is the
       place itself once the reader reads it: useReadingPositionNav retires the
       landing on their own scroll or a stay (B1 review).
   These read the elements' props; nothing is mounted. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; }, get colLetterArr() { return /** @type {any} */ (globalThis).colLetterArr; }, get colPreface() { return /** @type {any} */ (globalThis).colPreface; } }; });

const G = /** @type {any} */ (globalThis);
const STUBS = {
  LetterView: () => null,
  WtlbEntryView: () => null,
  BibleChapterView: () => null,
  MatthewChapterView: () => null,
  BibleStudyChapterView: () => null,
  ScreenLayout: ({ children }) => children,
  LibraryNav: () => null,
  MATTHEW: { id: 'matthew', title: 'Matthew', chapters: [{ num: 5 }] },
  colLetterArr: () => [],
  colPreface: () => null,
  COL_BY_KEY: new Map([
    ['two', { volKey: 'two', readKey: 'volume-two', letterScreen: 'vot-letter', indexScreen: 'vot-index', label: 'Volume Two' }],
    ['wtlb1', { volKey: 'wtlb1', readKey: 'wtlb-one', letterScreen: 'wtlb-one-entry', indexScreen: 'wtlb-one-index', label: 'Words To Live By: Part One' }],
  ]),
  AudioPlayer: { collectionHasAudio: () => false, sectionsFor: () => null, hasAudio: () => false },
};

beforeEach(() => {
  for (const [k, v] of Object.entries(STUBS)) G[k] = v;
  window.__votCorpus = { loaded: true, subscribe: () => () => {}, getVersion: () => 1 };
});
afterEach(() => {
  for (const k of Object.keys(STUBS)) delete G[k];
  delete window.__votCorpus;
  vi.restoreAllMocks();
});

const LETTER = { id: 'the-wide-path', title: 'The Wide Path', prevLetter: null, nextLetter: null };
const ENTRY = { id: 'faith-and-works', title: 'Faith AND Works', prevEntry: null, nextEntry: null };
const PILL = { title: 'The Last Trump', volumeLabel: 'Volume Two' };

function makeRoutes(overrides = {}) {
  const props = {
    screen: 'vot-letter', bookId: null, chapterNum: null, letterId: 'the-wide-path',
    studyId: null, studyChapterId: null,
    activeVolKey: 'two', activeLetter: LETTER,
    setScreen: vi.fn(), setLetterId: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(),
    setActiveReadKey: vi.fn(), setLastReadForVol: vi.fn(), setLastReadChapters: vi.fn(),
    fromSearch: true, setFromSearch: vi.fn(), setFromSurprise: vi.fn(), fromSurprise: false,
    fromWtlb: null, setFromWtlb: vi.fn(),
    fromMatthewChRef: { current: null }, setFromMatthewCh: vi.fn(),
    fromLetterRef: { current: [] }, backActive: false,
    backHint: null, tapThroughBack: vi.fn(),
    searchLanding: 'vot-letter:the-wide-path',
    setSurpriseAnchor: vi.fn(), surpriseAnchor: null,
    settings: { markAsRead: true }, activeReadKey: null, lastReadLetterMap: {}, lastReadChapters: {}, readItems: {},
    markRead: vi.fn(), unmarkRead: vi.fn(),
    isRead: () => false, getReadKey: (rk, id) => `${rk}:${id}`,
    boundaryConfig: () => ({}),
    goHome: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goNavOrigin: vi.fn(),
    goVolumesHome: vi.fn(), goColIdx: vi.fn(), goBibleIdx: vi.fn(), goMatthewIdx: vi.fn(), goScripturesHome: vi.fn(),
    selectBibleCh: vi.fn(), selectMatthewCh: vi.fn(),
    getStudyById: (id) => (id === 'purity' ? { slug: 'purity', title: 'Purity', chapters: [{ id: 'purity-ch1' }] } : null),
    getStudyChapter: () => ({ id: 'purity-ch1' }),
    studyReadKey: (slug) => 'bible-study-' + slug,
    openInAppLetter: vi.fn(), navigateToLink: vi.fn(), openLinkSidebar: vi.fn(), pushFromLetter: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    mode: 'pdf', setMode: vi.fn(), showStudy: true, setShowStudy: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    titleFocusHidden: false, setTitleFocusHidden: vi.fn(), headingsFocusHidden: false, setHeadingsFocusHidden: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
    ...overrides,
  };
  return { routes: buildScreenRoutes(props), props };
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

const expectResultsTarget = (fn, props) => {
  fn();
  expect(props.setFromSearch).toHaveBeenCalledWith(false);
  expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  expect(props.setScreen).toHaveBeenCalledWith('search');
};

describe('a letter opened from a search hit backs to the results', () => {
  it('the ‹ names the results and goes there, and so does the pill', () => {
    const { routes, props } = makeRoutes();
    const v = find(routes['vot-letter'](), G.LetterView);
    expect(v, 'the letter route did not render - this measured nothing').toBeTruthy();
    expect(v.props.navBack.label).toBe('results');
    expect(v.props.backHint).toEqual({ title: 'results', volumeLabel: null });
    expectResultsTarget(v.props.navBack.onBack, props);
    props.setScreen.mockClear();
    v.props.onBack();   // the pill
    expect(props.setScreen).toHaveBeenCalledWith('search');
  });

  it('records nothing for the look: the read tracker is off on the place the hit opened', () => {
    const { routes } = makeRoutes();
    expect(find(routes['vot-letter'](), G.LetterView).props.markAsReadEnabled).toBe(false);
  });

  it('once the reader reads the place (the landing retired), the tracker is on and the ‹ still goes to the results', () => {
    const { routes } = makeRoutes({ searchLanding: null });
    const v = find(routes['vot-letter'](), G.LetterView);
    expect(v.props.markAsReadEnabled).toBe(true);
    expect(v.props.navBack.label).toBe('results');
  });

  it('a neighbour reached by the arrows is reading again (the ‹ still goes to the results)', () => {
    const { routes } = makeRoutes({ letterId: 'the-narrow-way', activeLetter: { ...LETTER, id: 'the-narrow-way' } });
    const v = find(routes['vot-letter'](), G.LetterView);
    expect(v.props.markAsReadEnabled).toBe(true);
    expect(v.props.navBack.label).toBe('results');
  });

  it('a WTLB entry does the same', () => {
    const { routes, props } = makeRoutes({ screen: 'wtlb-one-entry', letterId: 'faith-and-works', activeVolKey: 'wtlb1', activeLetter: ENTRY, searchLanding: 'wtlb-one-entry:faith-and-works' });
    const v = find(routes['wtlb-one-entry'](), G.WtlbEntryView);
    expect(v, 'the WTLB route did not render - this measured nothing').toBeTruthy();
    expect(v.props.navBack.label).toBe('results');
    expect(v.props.backHint).toEqual({ title: 'results', volumeLabel: null });
    expect(v.props.markAsReadEnabled).toBe(false);
    expectResultsTarget(v.props.navBack.onBack, props);
  });

  it('a letter reached any other way keeps its own back, pill and tracker', () => {
    const { routes } = makeRoutes({ fromSearch: false, backHint: PILL, searchLanding: null });
    const v = find(routes['vot-letter'](), G.LetterView);
    expect(v.props.navBack).toBe(null);
    expect(v.props.backHint).toBe(PILL);
    expect(v.props.markAsReadEnabled).toBe(true);
  });

  it('a tap-through pill on top of the search visit wins (the system back pops it first)', () => {
    const { routes } = makeRoutes({ fromLetterRef: { current: [{ sourceScreen: 'vot-letter' }] }, backHint: PILL, backActive: true });
    const v = find(routes['vot-letter'](), G.LetterView);
    expect(v.props.navBack).toBe(null);
    expect(v.props.backHint).toBe(PILL);
  });
});

describe('a Bible chapter opened from a search hit backs to the results in one tap', () => {
  const bible = (over = {}) => makeRoutes({
    screen: 'bible-ch', bookId: 'psalms', chapterNum: 23, letterId: null,
    book: { id: 'psalms', title: 'Psalms', chapters: [{ num: 22 }, { num: 23 }] }, chapter: { num: 23 },
    searchLanding: 'bible-ch:psalms:23', ...over,
  });

  it('the ‹ and the pill go to the results; the tracker is off for the look', () => {
    const { routes, props } = bible();
    const v = find(routes['bible-ch'](), G.BibleChapterView);
    expect(v, 'the bible-ch route did not render - this measured nothing').toBeTruthy();
    expect(v.props.navBack.label).toBe('results');
    expect(v.props.backHint).toEqual({ title: 'results', volumeLabel: null });
    expect(v.props.markAsReadEnabled).toBe(false);
    expectResultsTarget(v.props.onTapThroughBack, props);
    expect(props.tapThroughBack).not.toHaveBeenCalled();
  });

  it('a chapter breadcrumbed from a WTLB entry keeps its own back', () => {
    const { routes } = bible({ fromWtlb: 'wtlb-one-entry' });
    const v = find(routes['bible-ch'](), G.BibleChapterView);
    expect(v.props.navBack).toBe(null);
  });
});

describe('a Matthew study chapter and a study chapter do the same', () => {
  it('matthew-ch: the ‹, the pill and the tracker', () => {
    const { routes, props } = makeRoutes({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5, letterId: null, chapter: { num: 5 }, searchLanding: 'matthew-ch:5' });
    const v = find(routes['matthew-ch'](), G.MatthewChapterView);
    expect(v, 'the matthew-ch route did not render - this measured nothing').toBeTruthy();
    expect(v.props.navBack.label).toBe('results');
    expect(v.props.backHint).toEqual({ title: 'results', volumeLabel: null });
    expect(v.props.markAsReadEnabled).toBe(false);
    expectResultsTarget(v.props.tapThroughBack, props);
  });

  it('bible-study-chapter: the shared view props carry it', () => {
    const { routes } = makeRoutes({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: 'purity-ch1', letterId: null, searchLanding: 'bible-study-chapter:purity:purity-ch1' });
    const v = find(routes['bible-study-chapter'](), G.BibleStudyChapterView);
    expect(v, 'the study route did not render - this measured nothing').toBeTruthy();
    const shared = v.props.sharedViewProps;
    expect(shared.navBack.label).toBe('results');
    expect(shared.backHint).toEqual({ title: 'results', volumeLabel: null });
    expect(shared.markAsReadEnabled).toBe(false);
  });
});
