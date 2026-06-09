/* useNavigateToLink — bible nav corpus-await guard (cold-load link race).
   ─────────────────────────────────────────────────────────────────────
   Locks the fix for the reported "links/search don't work until the target
   is loaded" bug: a bible endpoint tapped before bundle-a-bible (BOOKS) has
   loaded must NOT be silently dropped. It navigates immediately when the
   corpus is ready, or awaits __loadBibleCorpus and navigates on resolve —
   never nothing. Also guards that the back-stack push + destSnapshot are
   built without needing the corpus loaded. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigateToLink } from './use-navigate-to-link.js';
import { navHandoff } from '../utils/nav-handoff.js';

function makeParams(over) {
  return {
    closeLinkSidebar: vi.fn(),
    pushFromLetter: vi.fn(),
    screen: 'home', bookId: null, chapterNum: null, letterId: null,
    studyId: null, studyChapterId: null,
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(),
    setLetterId: vi.fn(), setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setSurpriseAnchor: vi.fn(), setJournalEntryId: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
});

afterEach(() => {
  navHandoff._resetForTests();
  // bare-global BOOKS resolves to window.BOOKS in jsdom (globalThis === window)
  delete window.BOOKS;
  delete window.__loadBibleCorpus;
});

describe('useNavigateToLink — bible nav corpus-await', () => {
  it('navigates immediately when BOOKS is already loaded', () => {
    window.BOOKS = { genesis: { title: 'Genesis' } };
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'genesis', chapter: 1, verse: 3 }); });
    expect(p.setScreen).toHaveBeenCalledWith('bible-ch');
    expect(p.setBookId).toHaveBeenCalledWith('genesis');
    expect(p.setChapterNum).toHaveBeenCalledWith(1);
    expect(p.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [3] });
  });

  it('awaits __loadBibleCorpus then navigates when BOOKS is not loaded yet', async () => {
    // BOOKS undefined at tap time — the cold-boot / direct-entry case that
    // used to silently drop the navigation.
    let resolveLoad;
    window.__loadBibleCorpus = vi.fn(() => new Promise((res) => { resolveLoad = res; }));
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'genesis', chapter: 1 }); });
    // Not dropped — the loader was kicked — but nav is deferred until it resolves.
    expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
    expect(p.setScreen).not.toHaveBeenCalled();
    // Corpus arrives → re-check passes → nav fires.
    window.BOOKS = { genesis: { title: 'Genesis' } };
    await act(async () => { resolveLoad(); await Promise.resolve(); });
    expect(p.setScreen).toHaveBeenCalledWith('bible-ch');
    expect(p.setBookId).toHaveBeenCalledWith('genesis');
  });

  it('does not navigate to a bogus book even after the corpus loads', async () => {
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    window.BOOKS = { genesis: { title: 'Genesis' } }; // 'nowhere' is absent
    await act(async () => {
      result.current.navigateToLink({ type: 'bible', bookId: 'nowhere', chapter: 1 });
      await Promise.resolve();
    });
    expect(p.setScreen).not.toHaveBeenCalled(); // no empty-chapter nav
  });

  it('builds the back-stack destSnapshot without needing the corpus loaded', () => {
    // destSnapshot is pure nav metadata; it must be present so the back-pill
    // can detect "user moved on" even on a pre-load bible jump.
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'genesis', chapter: 2 }); });
    expect(p.pushFromLetter).toHaveBeenCalledTimes(1);
    const entry = p.pushFromLetter.mock.calls[0][0];
    expect(entry.destSnapshot).toEqual(
      expect.objectContaining({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 2 }),
    );
  });

  it('still routes a matthew bible-endpoint to matthew-ch (not bible-ch)', () => {
    window.BOOKS = { matthew: { title: 'Matthew' } };
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'matthew', chapter: 5 }); });
    expect(p.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(p.setBookId).toHaveBeenCalledWith('matthew');
  });
});
