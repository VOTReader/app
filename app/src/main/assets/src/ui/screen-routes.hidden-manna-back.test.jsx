// @ts-nocheck
/* Hidden Manna's ‹ names where it goes (reading-flow hunt, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────
   Hidden Manna has no index: it is reached only from a Matthew Study Bible card
   (Matthew 23's "Woe to Dallas"), and its ‹ goes back to that chapter (or Home
   when the reader came some other way, a restored tab). It was labelled with the
   collection, as every other letter's ‹ is ("Back to Hidden Manna", a place that
   does not exist), so a screen reader and the tooltip named the wrong place. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

const WOE = { id: 'woe-to-dallas', title: 'Woe to Dallas', blocks: [], footnotes: {} };

beforeEach(() => {
  globalThis.LetterView = function LetterView() { return null; };   // a free global in screen-routes; the element's props are the subject
  globalThis.COL_BY_INDEX_SC = new Map();
  globalThis.COL_BY_KEY = new Map([['hm', { volKey: 'hm', letterScreen: 'hm-letter', indexScreen: null, readKey: 'hidden-manna' }]]);
  window.__votCorpus = { loaded: true, error: false };
  window.__loadVotCorpus = vi.fn();
});
afterEach(() => {
  delete globalThis.LetterView;
  delete globalThis.COL_BY_INDEX_SC;
  delete globalThis.COL_BY_KEY;
  delete window.__votCorpus;
  delete window.__loadVotCorpus;
});

function hmRoute(fromMatthewCh) {
  const props = {
    activeVolKey: 'hm', activeLetter: WOE, letterId: WOE.id, screen: 'hm-letter',
    settings: {}, boundaryConfig: vi.fn(() => ({})), readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goHome: vi.fn(),
    getStudyById: vi.fn(() => null), studyReadKey: (slug) => 'study:' + slug,
    setActiveReadKey: vi.fn(), setLastReadForVol: vi.fn(), isRead: vi.fn(() => false), getReadKey: vi.fn(() => 'k'),
    markRead: vi.fn(), unmarkRead: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(), setSurpriseAnchor: vi.fn(),
    fromMatthewChRef: { current: fromMatthewCh }, setFromMatthewCh: vi.fn(),
    navOrigin: null, fromSearch: false, setFromSearch: vi.fn(), fromStudies: false, setFromStudies: vi.fn(),
  };
  return { el: buildScreenRoutes(props)['hm-letter'](), props };
}

describe('Hidden Manna: the ‹ names its real destination', () => {
  it('opened from a Matthew card: "Matthew 23", and it goes there', () => {
    const { el, props } = hmRoute({ chapterNum: 23 });
    expect(el.props.letter.id).toBe('woe-to-dallas');
    expect(el.props.navBack.label).toBe('Matthew 23');
    el.props.navBack.onBack();
    expect(props.setFromMatthewCh).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('reached any other way (a restored tab): "Home", and it goes Home', () => {
    const { el, props } = hmRoute(null);
    expect(el.props.navBack.label).toBe('Home');
    el.props.navBack.onBack();
    expect(props.goHome).toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalledWith('matthew-ch');
  });
});
