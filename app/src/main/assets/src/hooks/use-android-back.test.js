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
  for (const idx of ['notes-index', 'links-index', 'bookmarks-index', 'highlights-index', 'journal-home', 'audio-library', 'audio-library-volumes', 'audio-library-collection', 'audio-library-saved', 'milestones']) {
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
