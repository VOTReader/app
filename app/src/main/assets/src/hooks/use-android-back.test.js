/* use-android-back tests — UX1 (surprise-back → Home) + UX2 (search-anchor clear).
   ──────────────────────────────────────────────────────────────────────────
   Renders useAndroidBack with the wide param bag (all setters as spies),
   then drives the installed window.handleAndroidBack() in each scenario. The
   handler reads nav state through useRefMirror refs, so the rendered prop
   values are what it sees. Free globals the handler touches are stubbed.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAndroidBack } from './use-android-back.js';
import { modalRegistry } from './use-modal-registry.js';
import { useHistorySync, suppressNextHistoryPush, clearSuppressNextHistoryPush } from './use-history-sync.js';
import { PlatformBridge } from '../utils/platform-bridge.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('./use-history-sync.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get clearSuppressNextHistoryPush() { return 'clearSuppressNextHistoryPush' in globalThis ? /** @type {any} */ (globalThis).clearSuppressNextHistoryPush : real.clearSuppressNextHistoryPush; }, get suppressNextHistoryPush() { return 'suppressNextHistoryPush' in globalThis ? /** @type {any} */ (globalThis).suppressNextHistoryPush : real.suppressNextHistoryPush; } }; });
vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_INDEX_SC() { return /** @type {any} */ (globalThis).COL_BY_INDEX_SC; }, get COL_BY_LETTER_SC() { return /** @type {any} */ (globalThis).COL_BY_LETTER_SC; }, get LETTER_SCREEN_SET() { return /** @type {any} */ (globalThis).LETTER_SCREEN_SET; } }; });
vi.mock('../stores/app-flag-stores.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get AboutSeenFlagStore() { return /** @type {any} */ (globalThis).AboutSeenFlagStore; } }; });

beforeEach(() => {
  modalRegistry._reset(); // module-level singleton — clear between runs (NAV1)
  /** @type {any} */ (globalThis).LETTER_SCREEN_SET = new Set(['vot-one-letter', 'vot-letter']);
  /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map([
    ['vot-one-letter', { indexScreen: 'vot-one-index', volKey: 'one' }],
  ]);
  /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map();
  /** @type {any} */ (globalThis).AboutSeenFlagStore = { set: vi.fn() };
  /** @type {any} */ (window).navHandoff = { clear: vi.fn() };
  // vitest.setup stubs __closeSheet as a no-op FUNCTION, which the handler's
  // first guard would treat as an open sheet and short-circuit. Null it.
  /** @type {any} */ (window).__closeSheet = null;
});
afterEach(() => {
  delete window.handleAndroidBack;
  delete window.__screenBack;
  vi.restoreAllMocks();
});

function baseProps(overrides) {
  return {
    screen: 'home', bookId: null, genreId: null,
    fromSearch: false, fromStudies: false, fromMatthewCh: null, studyId: null, fromWtlb: null, fromSurprise: false,
    tabsOverviewOpen: false, journalEntryId: null, fromLetterRef: { current: [] },
    tapThroughBack: vi.fn(), backActive: false,
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(), setJournalEntryId: vi.fn(),
    setFromLetterStack: vi.fn(), setFromSearch: vi.fn(), setFromStudies: vi.fn(),
    setFromWtlb: vi.fn(), setFromMatthewCh: vi.fn(), setFromSurprise: vi.fn(),
    setTabsOverviewOpen: vi.fn(), setSurpriseAnchor: vi.fn(),
    cancelDwell: vi.fn(), goNavOrigin: vi.fn(), goHome: vi.fn(), goSearchOrigin: vi.fn(),
    goScripturesHome: vi.fn(), goStudiesHome: vi.fn(), goVolumesHome: vi.fn(), goJournalViewer: vi.fn(),
    getStudyById: vi.fn(),
    ...overrides,
  };
}

describe('useAndroidBack — UX1 surprise-back', () => {
  it('back from a surprise bible-ch jump goes Home (not the book index)', () => {
    const props = baseProps({ screen: 'bible-ch', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-idx');
  });

  it('back from a surprise matthew-ch jump goes Home', () => {
    const props = baseProps({ screen: 'matthew-ch', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('matthew-idx');
  });

  it('back from a surprise letter jump goes Home', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('vot-one-index');
  });

  it('a NON-surprise bible-ch still backs to the book index', () => {
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).not.toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');
  });
});

describe('useAndroidBack — UX2 search-anchor clear', () => {
  it('back-to-search from a bible-ch verse hit clears the surprise anchor', () => {
    const props = baseProps({ screen: 'bible-ch', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('back-to-search from a matthew-ch verse hit clears the surprise anchor', () => {
    const props = baseProps({ screen: 'matthew-ch', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });
});

describe('useAndroidBack — UX3 index-screen origin + safe fallthrough', () => {
  for (const idx of ['notes-index', 'links-index', 'bookmarks-index', 'highlights-index', 'journal-home', 'audio-library', 'audio-library-volumes', 'audio-library-collection', 'audio-library-saved', 'audio-library-offline', 'milestones']) {
    it(`back from ${idx} restores navOrigin (not a hardcoded Library)`, () => {
      const props = baseProps({ screen: idx });
      renderHook(() => useAndroidBack(props));
      const res = window.handleAndroidBack();
      expect(res).toBe('true');
      expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
      expect(props.setScreen).not.toHaveBeenCalledWith('library');
    });
  }

  it('a registered window.__screenBack consumes the press (drilled-in level) — no parent skip', () => {
    const props = baseProps({ screen: 'notes-index' });
    renderHook(() => useAndroidBack(props));
    const interceptor = vi.fn(() => true);
    window.__screenBack = interceptor;
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(interceptor).toHaveBeenCalledTimes(1);
    expect(props.goNavOrigin).not.toHaveBeenCalled();   // did NOT skip out to the parent
    expect(props.setScreen).not.toHaveBeenCalledWith('library');
  });

  it('a window.__screenBack that returns false lets the normal route proceed', () => {
    const props = baseProps({ screen: 'notes-index' });
    renderHook(() => useAndroidBack(props));
    window.__screenBack = vi.fn(() => false);   // not drilled in — nothing to unwind
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);   // fell through to notes-index → origin
  });

  it('at the root (home), Back returns "false" so the platform exits / shows the root toast', () => {
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('false');
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('an unlisted (non-home) screen falls back to Home instead of exiting the app', () => {
    const props = baseProps({ screen: 'some-future-screen' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
  });
});

describe('useAndroidBack — "Back to …" pill parity on chapter tap-throughs', () => {
  // Library/deep-link tap-throughs land on bible-ch / matthew-ch (NOT in
  // LETTER_SCREEN_SET) and show the cross-screen back-pill. Hardware-back must
  // match the pill: call tapThroughBack (the pill's own handler), not the
  // chapter-index route.
  // The gate is `backActive`, not `backHint` — a History-pushed entry is
  // `silent` (no pill) but is still a live back target, and back from a
  // History-entered chapter must still return to History.
  const pillStack = [{ sourceScreen: 'notes-index', sourceLetterTitle: 'My Notes' }];

  it('bible-ch with the pill showing pops the tap-through stack (not bible-idx)', () => {
    const props = baseProps({
      screen: 'bible-ch', bookId: 'genesis',
      fromLetterRef: { current: pillStack }, backActive: true,
    });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-idx');
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });

  it('matthew-ch with the pill showing pops the tap-through stack (not matthew-idx)', () => {
    const props = baseProps({
      screen: 'matthew-ch',
      fromLetterRef: { current: pillStack }, backActive: true,
    });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('matthew-idx');
  });

  it('bible-ch with NO pill still backs to the book index (regression guard)', () => {
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis', backActive: false });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.tapThroughBack).not.toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');
  });

  // Item 4b (2026-09-24): the Listening Library's Studies screen opens a study
  // with no recording yet on its INDEX as a tap-through; the index shows the pill.
  it('bible-study-index with the pill showing pops the tap-through stack (not the Studies home)', () => {
    const props = baseProps({
      screen: 'bible-study-index', studyId: 'grace-and-law',
      fromLetterRef: { current: [{ sourceScreen: 'audio-library-studies', sourceLetterTitle: 'Studies' }] }, backActive: true,
    });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.goStudiesHome).not.toHaveBeenCalled();
  });

  it('bible-study-index with NO pill still backs to the Studies home (regression guard)', () => {
    const props = baseProps({ screen: 'bible-study-index', studyId: 'grace-and-law', backActive: false });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.tapThroughBack).not.toHaveBeenCalled();
    expect(props.goStudiesHome).toHaveBeenCalledTimes(1);
  });

  it('the pill wins over a stale fromSearch on bible-ch (pill is the user intent)', () => {
    const props = baseProps({
      screen: 'bible-ch', fromSearch: true,
      fromLetterRef: { current: pillStack }, backActive: true,
    });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('search');
  });
});

describe('useAndroidBack — P1-13 fromSearch consumed on index backs', () => {
  // fromSearch is armed by handleSearchSelect for EVERY result kind — including
  // ref-book, which lands on bible-idx / matthew-idx. Pre-fix those index
  // branches never consumed the flag, so a later chapter-level Back teleported
  // into a long-stale search session. The index branches now consume it first.
  it('back from bible-idx with fromSearch armed returns to search (not the genre hub)', () => {
    const props = baseProps({ screen: 'bible-idx', fromSearch: true, genreId: 'the-law' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setScreen).not.toHaveBeenCalledWith('scripture-genre');
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });

  it('back from matthew-idx with fromSearch armed returns to search', () => {
    const props = baseProps({ screen: 'matthew-idx', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('fromSearch beats fromStudies on matthew-idx (most recent intent wins)', () => {
    const props = baseProps({ screen: 'matthew-idx', fromSearch: true, fromStudies: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.goStudiesHome).not.toHaveBeenCalled();
  });
});

describe('useAndroidBack — matthew-idx back matches the bible-idx hub pattern', () => {
  it('plain matthew-idx back goes to Scriptures (its parent hub), not Home', () => {
    const props = baseProps({ screen: 'matthew-idx' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('matthew-idx back with an active genre returns to scripture-genre', () => {
    const props = baseProps({ screen: 'matthew-idx', genreId: 'gospels' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('scripture-genre');
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });

  it('matthew-idx back from a study still goes to Studies (regression guard)', () => {
    const props = baseProps({ screen: 'matthew-idx', fromStudies: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setFromStudies).toHaveBeenCalledWith(false);
    expect(props.goStudiesHome).toHaveBeenCalledTimes(1);
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });

  it('bible-idx back with an active genre returns to scripture-genre (regression guard)', () => {
    const props = baseProps({ screen: 'bible-idx', genreId: 'the-law' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('scripture-genre');
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });
});

describe('useAndroidBack — P1-12 History tap-through return path', () => {
  // History onSelect routes through navigateToLink, which pushes a
  // { sourceScreen: 'history' } entry onto the fromLetter stack. Back from
  // the destination must unwind it — the same machinery the Library index
  // screens already use (step 3 for letters, step 3b for chapters).
  it('back from a letter entered via History pops the stack and returns to history', () => {
    const stack = [{ sourceScreen: 'history', sourceLetterTitle: 'History', sourceBookId: 'john', sourceChapterNum: 3 }];
    const props = baseProps({ screen: 'vot-one-letter', fromLetterRef: { current: stack } });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.setFromLetterStack).toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('history');
  });

  // journalEntryId is the 7th tracked field — step 3's source-restore must
  // put it back, or a letter reached FROM a journal entry backs into the
  // viewer with the wrong entry loaded.
  it('step 3 restores a captured sourceJournalEntryId', () => {
    const stack = [{ sourceScreen: 'journal-viewer', sourceJournalEntryId: 'e7' }];
    const props = baseProps({ screen: 'vot-one-letter', fromLetterRef: { current: stack } });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setJournalEntryId).toHaveBeenCalledWith('e7');
    expect(props.setScreen).toHaveBeenCalledWith('journal-viewer');
  });

  // Phase 3: History entries are now `silent` (no pill), so backHint is null
  // for them — backActive is what keeps this return path alive.
  it('back from a chapter entered via History defers to the back-pill handler (tapThroughBack)', () => {
    const props = baseProps({
      screen: 'bible-ch', bookId: 'john',
      fromLetterRef: { current: [{ sourceScreen: 'history', sourceLetterTitle: 'History', silent: true }] },
      backActive: true,
    });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-idx');
  });
});

describe('useAndroidBack — journal-viewer back mirrors the viewer’s one pill', () => {
  // The viewer renders ONE pill with a fixed precedence: its private
  // journal→journal stack (window.__journalBackStack) first, then the
  // cross-screen back target. Hardware back walks the same order — before
  // Phase 3 it unconditionally went to the journal hub, stranding anyone who
  // arrived from a notebook note.
  afterEach(() => { delete window.__journalBackStack; });

  it('pops the journal→journal stack when its top targets the open entry', () => {
    window.__journalBackStack = [{ destId: 'e2', fromId: 'e1', fromTitle: 'Morning' }];
    const props = baseProps({ screen: 'journal-viewer', journalEntryId: 'e2', backActive: true });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goJournalViewer).toHaveBeenCalledWith('e1');
    expect(window.__journalBackStack).toHaveLength(0);
    expect(props.tapThroughBack).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalledWith('journal-home');
  });

  it('a journal→journal top for a DIFFERENT entry is ignored (matches jrnBack’s destId gate)', () => {
    window.__journalBackStack = [{ destId: 'other', fromId: 'e1', fromTitle: 'Morning' }];
    const props = baseProps({ screen: 'journal-viewer', journalEntryId: 'e2' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goJournalViewer).not.toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('journal-home');
  });

  it('with no journal stack but a live back target, pops the cross-screen stack', () => {
    const props = baseProps({ screen: 'journal-viewer', journalEntryId: 'e2', backActive: true });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.tapThroughBack).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('journal-home');
  });

  it('with neither, still falls back to the journal hub (regression guard)', () => {
    const props = baseProps({ screen: 'journal-viewer', journalEntryId: 'e2' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setScreen).toHaveBeenCalledWith('journal-home');
  });
});

describe('useAndroidBack — NAV1 modal registry consumes hardware-back', () => {
  it('an open registered modal is dismissed by Back and does NOT navigate the screen underneath', () => {
    // bible-ch WOULD route to bible-idx — prove the registered modal wins first.
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    const dismiss = vi.fn();
    modalRegistry.register({ id: 'note-sheet', dismiss });
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalled();   // did NOT dismiss-AND-navigate
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('with no modal open, Back routes normally (empty registry falls through)', () => {
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');   // normal route
  });

  it('dismisses the TOPMOST modal when several are registered (z-order)', () => {
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    const lower = vi.fn(), upper = vi.fn();
    modalRegistry.register({ id: 'a', dismiss: lower });
    modalRegistry.register({ id: 'b', dismiss: upper });   // b registered last = topmost
    window.handleAndroidBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });
});

describe('useAndroidBack — history-push suppress flag (navigation-tabs-2)', () => {
  // handleAndroidBack has several branches that consume the press (return
  // "true") without touching any of the 8 fields useHistorySync watches:
  // the modal-registry dismiss, window.__closeSheet, the tabs-overview
  // close, window.__screenBack, and the journal-viewer-to-journal-viewer
  // stack pop. Escape/popstate (W1.5(c)/(d)) arm suppressNextHistoryPush()
  // BEFORE calling handleAndroidBack, expecting useHistorySync's effect to
  // consume it — but that effect is gated on the nav-key dependency array,
  // so it never runs when the key doesn't move, and the flag strands onto
  // whatever real navigation happens next, silently eating its pushState.
  const _origPushState = history.pushState;
  let _pushCalls = [];

  beforeEach(() => {
    _pushCalls = [];
    history.pushState = function (state, title, url) {
      _pushCalls.push({ state, title, url });
      return _origPushState.call(history, state, title, url);
    };
    PlatformBridge.isAndroid = false;
    delete window.__historyReady;
    clearSuppressNextHistoryPush();
  });
  afterEach(() => {
    history.pushState = _origPushState;
  });

  function navKey(screen) {
    return {
      screen, bookId: null, chapterNum: null, letterId: null,
      studyId: null, studyChapterId: null, genreId: null, gardenPage: null,
    };
  }

  it('closing the Tabs overview does not strand the flag onto the next real navigation', () => {
    const sync = renderHook(({ k }) => useHistorySync(k), { initialProps: { k: navKey('library') } });
    const props = baseProps({ screen: 'library', tabsOverviewOpen: true });
    renderHook(() => useAndroidBack(props));

    // Escape/popstate handshake: arm, then consume a press that closes the
    // overview only — none of the 8 watched fields move.
    suppressNextHistoryPush();
    const result = window.handleAndroidBack();
    expect(result).toBe('true');
    expect(props.setTabsOverviewOpen).toHaveBeenCalledWith(false);

    // A LATER, real navigation must still push — the flag must not have
    // stranded onto it.
    sync.rerender({ k: navKey('home') });
    expect(_pushCalls.length).toBe(1);
  });

  it('a registered modal dismiss does not strand the flag either', () => {
    const sync = renderHook(({ k }) => useHistorySync(k), { initialProps: { k: navKey('library') } });
    const props = baseProps({ screen: 'library' });
    renderHook(() => useAndroidBack(props));
    modalRegistry.register({ id: 'note-sheet', dismiss: vi.fn() });

    suppressNextHistoryPush();
    expect(window.handleAndroidBack()).toBe('true');

    sync.rerender({ k: navKey('home') });
    expect(_pushCalls.length).toBe(1);
  });
});

describe('useAndroidBack — Answers Only God Can Give', () => {
  it('the landing backs to Home, even though it is also the collection\'s index screen', () => {
    /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map([['answers-home', { volKey: 'answers' }]]);
    const props = baseProps({ screen: 'answers-home' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.goVolumesHome).not.toHaveBeenCalled();
  });

  it.each(['answers-subject', 'answers-az'])('%s steps back to the landing', (screen) => {
    const props = baseProps({ screen });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setScreen).toHaveBeenCalledWith('answers-home');
  });

  it('a topic opened from a list unwinds to that list by the tap-through stack', () => {
    /** @type {any} */ (globalThis).LETTER_SCREEN_SET = new Set(['answers-entry']);
    const props = baseProps({
      screen: 'answers-entry',
      fromLetterRef: { current: [{ sourceScreen: 'answers-subject', sourceLetterId: 'the-end-of-this-age' }] },
    });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setLetterId).toHaveBeenCalledWith('the-end-of-this-age');
    expect(props.setScreen).toHaveBeenCalledWith('answers-subject');
  });
});

describe('useAndroidBack — the dismiss-first gates', () => {
  it('an open sheet (window.__closeSheet) is closed, its slot cleared, and nothing navigates', () => {
    const close = vi.fn();
    window.__closeSheet = close;
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(close).toHaveBeenCalledTimes(1);
    expect(window.__closeSheet).toBeNull();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
    expect(props.cancelDwell).not.toHaveBeenCalled();
  });

  it('screen routing cancels any dwell timer first', () => {
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.cancelDwell).toHaveBeenCalledTimes(1);
  });

  it('the tap-through pop restores every captured source field', () => {
    const props = baseProps({
      screen: 'vot-letter',
      fromLetterRef: { current: [
        { sourceScreen: 'old', sourceLetterId: 'nope' },
        { sourceScreen: 'bible-study-chapter', sourceBookId: 'b', sourceChapterNum: 3, sourceLetterId: null, sourceStudyId: 'st', sourceStudyChapterId: 'sc' },
      ] },
    });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    // pops only the TOP entry
    const updater = props.setFromLetterStack.mock.calls[0][0];
    expect(updater([1, 2, 3])).toEqual([1, 2]);
    expect(window.navHandoff.clear).toHaveBeenCalledWith('pendingHighlight');
    expect(props.setBookId).toHaveBeenCalledWith('b');
    expect(props.setChapterNum).toHaveBeenCalledWith(3);
    expect(props.setLetterId).toHaveBeenCalledWith(null);
    expect(props.setStudyId).toHaveBeenCalledWith('st');
    expect(props.setStudyChapterId).toHaveBeenCalledWith('sc');
    expect(props.setJournalEntryId).not.toHaveBeenCalled(); // not captured → untouched
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('a letter screen with an empty tap-through stack falls to the collection route', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromLetterRef: { current: [] } });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setFromLetterStack).not.toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('vot-one-index');
  });
});

describe('useAndroidBack — hub and index screens', () => {
  it.each(['settings', 'history', 'audio-library-studies', 'reading-plans', 'scripture-web', 'my-progress'])('%s backs through goNavOrigin', (screen) => {
    const props = baseProps({ screen });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
  });

  it('about marks itself seen before backing out', () => {
    const props = baseProps({ screen: 'about' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(/** @type {any} */ (globalThis).AboutSeenFlagStore.set).toHaveBeenCalledTimes(1);
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
  });

  it('Songs pops its own stack when the screen registered one', () => {
    const songsBack = vi.fn();
    window.__songsBack = songsBack;
    try {
      const props = baseProps({ screen: 'audio-library-songs' });
      renderHook(() => useAndroidBack(props));
      expect(window.handleAndroidBack()).toBe('true');
      expect(songsBack).toHaveBeenCalledTimes(1);
      expect(props.goNavOrigin).not.toHaveBeenCalled();
    } finally { delete window.__songsBack; }
  });

  it('Songs leaves by its origin when no Songs stack is registered', () => {
    const props = baseProps({ screen: 'audio-library-songs' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
  });

  it('the journal editor returns to the viewer of the entry being edited', () => {
    const props = baseProps({ screen: 'journal-editor', journalEntryId: 'e5' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goJournalViewer).toHaveBeenCalledWith('e5');
  });

  it.each(['library', 'scriptures-home', 'volumes-home', 'studies-home'])('%s backs to Home', (screen) => {
    const props = baseProps({ screen });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
  });

  it('search backs to its own origin', () => {
    const props = baseProps({ screen: 'search' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goSearchOrigin).toHaveBeenCalledTimes(1);
  });

  it('a scripture genre backs to the Scriptures hub', () => {
    const props = baseProps({ screen: 'scripture-genre' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('a collection index screen and the garden both back to Volumes', () => {
    /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map([['vot-one-index', {}]]);
    for (const screen of ['vot-one-index', 'garden-view']) {
      const props = baseProps({ screen });
      const h = renderHook(() => useAndroidBack(props));
      expect(window.handleAndroidBack()).toBe('true');
      expect(props.goVolumesHome).toHaveBeenCalledTimes(1);
      h.unmount();
    }
  });

  it('unmount removes the installed handler', () => {
    const h = renderHook(() => useAndroidBack(baseProps()));
    expect(typeof window.handleAndroidBack).toBe('function');
    h.unmount();
    expect(window.handleAndroidBack).toBeUndefined();
  });
});

describe('useAndroidBack — chapter and study routes', () => {
  afterEach(() => { delete window.BOOKS; });

  it('plain matthew-ch backs to the Matthew index and clears the chapter', () => {
    const props = baseProps({ screen: 'matthew-ch' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setChapterNum).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-idx');
  });

  it('bible-ch entered from WTLB returns to that WTLB screen and consumes the flag', () => {
    const props = baseProps({ screen: 'bible-ch', fromWtlb: 'wtlb-entry' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setFromWtlb).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('wtlb-entry');
  });

  it('a single-chapter book skips its one-row index and goes to the genre', () => {
    window.BOOKS = { jude: { chapters: [{}] } };
    const props = baseProps({ screen: 'bible-ch', bookId: 'jude', genreId: 'epistles' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('scripture-genre');
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-idx');
  });

  it('a single-chapter book with no genre goes to the Scriptures hub', () => {
    window.BOOKS = { jude: { chapters: [{}] } };
    const props = baseProps({ screen: 'bible-ch', bookId: 'jude' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('a multi-chapter book (corpus loaded) backs to its index', () => {
    window.BOOKS = { genesis: { chapters: [{}, {}] } };
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setChapterNum).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');
  });

  it('plain bible-idx with no genre goes to the Scriptures hub', () => {
    const props = baseProps({ screen: 'bible-idx' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('a surprise study chapter backs to Home', () => {
    const props = baseProps({ screen: 'bible-study-chapter', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.goHome).toHaveBeenCalledTimes(1);
  });

  it('a study chapter from search returns to search and clears the anchor', () => {
    const props = baseProps({ screen: 'bible-study-chapter', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
  });

  it('a chapter of a multi-chapter study backs to the study index', () => {
    const getStudyById = vi.fn(() => ({ chapters: [{}, {}] }));
    const props = baseProps({ screen: 'bible-study-chapter', studyId: 'st1', getStudyById });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(getStudyById).toHaveBeenCalledWith('st1');
    expect(props.setStudyChapterId).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-index');
  });

  it('a one-chapter (or unknown) study backs straight to the Studies home', () => {
    for (const study of [{ chapters: [{}] }, null]) {
      const props = baseProps({ screen: 'bible-study-chapter', studyId: 'st1', getStudyById: () => study });
      const h = renderHook(() => useAndroidBack(props));
      window.handleAndroidBack();
      expect(props.goStudiesHome).toHaveBeenCalledTimes(1);
      expect(props.setScreen).not.toHaveBeenCalledWith('bible-study-index');
      h.unmount();
    }
  });
});

describe('useAndroidBack — letter screens via the COLLECTIONS registry', () => {
  it('a letter opened from a Matthew chapter returns there', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromMatthewCh: 5 });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.setFromMatthewCh).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('a letter opened from search returns to search and clears the anchor', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
  });

  it('a letter opened from a study returns to the study chapter', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromStudies: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setFromStudies).toHaveBeenCalledWith(false);
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('a collection with no index screen backs to Home', () => {
    /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map([['solo-letter', { volKey: 'solo' }]]);
    const props = baseProps({ screen: 'solo-letter' });
    renderHook(() => useAndroidBack(props));
    expect(window.handleAndroidBack()).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
  });
});

describe('useAndroidBack — W1.5(c) Escape key (web only)', () => {
  let suppress, clear;
  beforeEach(() => {
    PlatformBridge.isAndroid = false;
    suppress = vi.fn(); clear = vi.fn();
    /** @type {any} */ (globalThis).__origSuppress = /** @type {any} */ (globalThis).suppressNextHistoryPush;
    /** @type {any} */ (globalThis).__origClear = /** @type {any} */ (globalThis).clearSuppressNextHistoryPush;
    /** @type {any} */ (globalThis).suppressNextHistoryPush = suppress;
    /** @type {any} */ (globalThis).clearSuppressNextHistoryPush = clear;
  });
  afterEach(() => {
    /** @type {any} */ (globalThis).suppressNextHistoryPush = /** @type {any} */ (globalThis).__origSuppress;
    /** @type {any} */ (globalThis).clearSuppressNextHistoryPush = /** @type {any} */ (globalThis).__origClear;
    delete /** @type {any} */ (globalThis).__origSuppress; delete /** @type {any} */ (globalThis).__origClear;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.innerHTML = '';
  });

  function press(init) {
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...init });
    document.dispatchEvent(e);
    return e;
  }

  it('routes Escape to the back handler with the suppress handshake and consumes it', () => {
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    const e = press();
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Escape at the root clears the suppress flag and leaves the key alone', () => {
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    const e = press();
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('Escape with no back handler installed is a root no-op', () => {
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    delete window.handleAndroidBack;
    const e = press();
    expect(clear).toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('other keys and IME composition are ignored', () => {
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    press({ isComposing: true });
    expect(suppress).not.toHaveBeenCalled();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
  });

  it('fullscreen lets the browser exit natively (no dismiss, no nav, no preventDefault)', () => {
    const dismiss = vi.fn();
    modalRegistry.register({ id: 'sheet', dismiss });
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true });
    try {
      const e = press();
      expect(e.defaultPrevented).toBe(false);
      expect(dismiss).not.toHaveBeenCalled();
      expect(props.goNavOrigin).not.toHaveBeenCalled();
    } finally { delete /** @type {any} */ (document).fullscreenElement; }
  });

  it('an open modal is dismissed alone — never dismiss-AND-navigate', () => {
    const dismiss = vi.fn();
    modalRegistry.register({ id: 'sheet', dismiss });
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    const e = press();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    expect(suppress).not.toHaveBeenCalled();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
  });

  it.each([
    ['an input', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    ['a contenteditable', () => { const d = document.createElement('div'); d.contentEditable = 'true'; d.tabIndex = 0; Object.defineProperty(d, 'isContentEditable', { value: true }); return d; }],
  ])('a focused %s keeps Escape for itself (blur, not navigate)', (_label, make) => {
    const el = make();
    document.body.appendChild(el);
    el.focus();
    expect(document.activeElement).toBe(el);
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    press();
    expect(suppress).not.toHaveBeenCalled();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
  });

  it('is not installed on Android, and is removed on unmount', () => {
    PlatformBridge.isAndroid = true;
    try {
      const props = baseProps({ screen: 'settings' });
      const h = renderHook(() => useAndroidBack(props));
      press();
      expect(props.goNavOrigin).not.toHaveBeenCalled();
      h.unmount();
    } finally { PlatformBridge.isAndroid = false; }
    const props2 = baseProps({ screen: 'settings' });
    const h2 = renderHook(() => useAndroidBack(props2));
    h2.unmount();
    press();
    expect(props2.goNavOrigin).not.toHaveBeenCalled();
  });
});

describe('useAndroidBack — W1.5(d) popstate + root double-tap exit (web only)', () => {
  let suppress, clear, pushSpy;
  beforeEach(async () => {
    PlatformBridge.isAndroid = false;
    const toast = await import('../utils/root-exit-toast.js');
    toast._reset();
    suppress = vi.fn(); clear = vi.fn();
    /** @type {any} */ (globalThis).__origSuppress = /** @type {any} */ (globalThis).suppressNextHistoryPush;
    /** @type {any} */ (globalThis).__origClear = /** @type {any} */ (globalThis).clearSuppressNextHistoryPush;
    /** @type {any} */ (globalThis).suppressNextHistoryPush = suppress;
    /** @type {any} */ (globalThis).clearSuppressNextHistoryPush = clear;
    pushSpy = vi.spyOn(history, 'pushState');
    window.__historyReady = true;
  });
  afterEach(async () => {
    (await import('../utils/root-exit-toast.js'))._reset();
    /** @type {any} */ (globalThis).suppressNextHistoryPush = /** @type {any} */ (globalThis).__origSuppress;
    /** @type {any} */ (globalThis).clearSuppressNextHistoryPush = /** @type {any} */ (globalThis).__origClear;
    delete /** @type {any} */ (globalThis).__origSuppress; delete /** @type {any} */ (globalThis).__origClear;
    delete window.__historyReady;
  });

  const pop = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

  it('ignores a load-time popstate before history sync is ready (Firefox)', () => {
    delete window.__historyReady;
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    pop();
    expect(suppress).not.toHaveBeenCalled();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
  });

  it('a navigating back arms suppress and pushes nothing', () => {
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    pop();
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('first back at root pushes a replacement entry and arms the exit toast; the second lets the exit happen', async () => {
    const { isArmed } = await import('../utils/root-exit-toast.js');
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    pop();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(isArmed()).toBe(true);
    pop();
    expect(pushSpy).toHaveBeenCalledTimes(1); // no second replacement
    expect(isArmed()).toBe(false);
  });

  it('a blocked pushState at root still arms the toast', async () => {
    const { isArmed } = await import('../utils/root-exit-toast.js');
    pushSpy.mockImplementation(() => { throw new Error('sandboxed'); });
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    expect(() => pop()).not.toThrow();
    expect(isArmed()).toBe(true);
  });

  it('with no back handler installed the press is treated as root', async () => {
    const { isArmed } = await import('../utils/root-exit-toast.js');
    const props = baseProps({ screen: 'settings' });
    renderHook(() => useAndroidBack(props));
    delete window.handleAndroidBack;
    pop();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(isArmed()).toBe(true);
  });

  it('is not installed on Android', () => {
    PlatformBridge.isAndroid = true;
    try {
      const props = baseProps({ screen: 'settings' });
      renderHook(() => useAndroidBack(props));
      pop();
      expect(suppress).not.toHaveBeenCalled();
    } finally { PlatformBridge.isAndroid = false; }
  });
});
