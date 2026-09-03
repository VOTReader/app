import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

function makeRoutes() {
  return buildScreenRoutes(/** @type {any} */ ({
    settings: {},
    activeVolKey: 'three',
    activeLetter: null,
    // The route must be able to recover to this collection index when a
    // restored letter id no longer exists.
    COL_BY_KEY: new Map([['three', { indexScreen: 'vot-three-index' }]]),
    setScreen: vi.fn(), setLetterId: vi.fn(), setActiveReadKey: vi.fn(),
    setLastReadForVol: vi.fn(), setSurpriseAnchor: vi.fn(),
    goVolumesHome: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goSearch: vi.fn(),
    markRead: vi.fn(), unmarkRead: vi.fn(), isRead: vi.fn(() => false),
    getReadKey: vi.fn(), readItems: {}, lastReadLetterMap: {}, activeReadKey: null,
    lastReadChapters: {}, readHistory: [],
    goHome: vi.fn(), goNavOrigin: vi.fn(), goAbout: vi.fn(), goVolumesHome: vi.fn(),
    goScripturesHome: vi.fn(), goScriptureGenre: vi.fn(), goBibleIdx: vi.fn(),
    goMatthewIdx: vi.fn(), goStudiesHome: vi.fn(), goNotesIndex: vi.fn(),
    goLinksIndex: vi.fn(), goBookmarksIndex: vi.fn(), goJournalHub: vi.fn(),
    goHighlightsIndex: vi.fn(), goProgress: vi.fn(), goJournalViewer: vi.fn(),
    goJournalEditor: vi.fn(), goSearchOrigin: vi.fn(), goColIdx: vi.fn(),
  }));
}

beforeEach(() => {
  window.__votCorpus = { loaded: true, error: false };
  globalThis.COL_BY_KEY = new Map([['three', { indexScreen: 'vot-three-index' }]]);
  globalThis.ScreenLayout = () => null;
});

afterEach(() => {
  delete window.__votCorpus;
  delete globalThis.COL_BY_KEY;
  delete globalThis.ScreenLayout;
});

describe('REPRO navigation-tabs-4: dead restored letter', () => {
  it('does not return a blank route when the restored letter no longer resolves', () => {
    const routes = makeRoutes();

    const rendered = routes['vot-three-letter']();

    expect(rendered).not.toBeNull();
  });
});
