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
import { useNavigateToLink, verseAnchorFor } from './use-navigate-to-link.js';
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

  it('a range endpoint (verseEnd) flash-highlights the WHOLE span', () => {
    window.BOOKS = { john: { title: 'John' } };
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'john', chapter: 3, verse: 16, verseEnd: 18 }); });
    expect(p.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [16, 17, 18] });
  });
});

describe('verseAnchorFor — range → highlight-span math', () => {
  it('single verse → single-entry span; no verse → null', () => {
    expect(verseAnchorFor({ verse: 3 })).toEqual({ type: 'verse', verses: [3] });
    expect(verseAnchorFor({ verse: null })).toBeNull();
    expect(verseAnchorFor({})).toBeNull();
  });
  it('ignores a verseEnd at-or-before the start (malformed range)', () => {
    expect(verseAnchorFor({ verse: 9, verseEnd: 9 })).toEqual({ type: 'verse', verses: [9] });
    expect(verseAnchorFor({ verse: 9, verseEnd: 4 })).toEqual({ type: 'verse', verses: [9] });
  });
  it('caps an absurd span at 176 verses (Psalm 119 bound)', () => {
    const anchor = verseAnchorFor({ verse: 1, verseEnd: 10000 });
    expect(anchor.verses.length).toBe(176);
    expect(anchor.verses[0]).toBe(1);
    expect(anchor.verses[175]).toBe(176);
  });
});

describe('useNavigateToLink — every endpoint kind and the prologue', () => {
  afterEach(() => {
    delete window.__loadVotCorpus;
    delete window.__loadMatthewCorpus;
    vi.restoreAllMocks();
  });

  it('keeps one stable navigateToLink identity while the body reads fresh params', () => {
    const first = makeParams({ screen: 'home' });
    const { result, rerender } = renderHook((p) => useNavigateToLink(p), { initialProps: first });
    const shell = result.current.navigateToLink;
    const second = makeParams({ screen: 'letter', letterId: 'L9' });
    rerender(second);
    expect(result.current.navigateToLink).toBe(shell);
    act(() => { result.current.navigateToLink({ type: 'journal', entryId: 'e1' }); });
    // the NEW render's params, not the first render's
    expect(first.pushFromLetter).not.toHaveBeenCalled();
    expect(second.pushFromLetter.mock.calls[0][0]).toMatchObject({ sourceScreen: 'letter', sourceLetterId: 'L9' });
  });

  it.each(['letter', 'wtlb', 'blessed', 'holy-days'])('a %s endpoint with no resolved screen bails before any side effect and kicks the VOT corpus', (type) => {
    window.__loadVotCorpus = vi.fn();
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type, letterId: 'x', key: type + ':x', screen: null }); });
    expect(window.__loadVotCorpus).toHaveBeenCalledTimes(1);
    expect(p.closeLinkSidebar).not.toHaveBeenCalled();
    expect(p.pushFromLetter).not.toHaveBeenCalled(); // no junk back-stack entry
    expect(p.setScreen).not.toHaveBeenCalled();
    expect(navHandoff.peek('pendingScrollHlKey')).toBeNull(); // never set
  });

  it('the no-screen bail is safe when the VOT loader is not installed', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    expect(() => act(() => { result.current.navigateToLink({ type: 'letter', letterId: 'x' }); })).not.toThrow();
    expect(p.setScreen).not.toHaveBeenCalled();
  });

  it('stashes the block-container key (char range stripped) for the destination scroll', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'journal', entryId: 'e1', key: 'letter:v2-l7:p3:12-40' }); });
    expect(navHandoff.peek('pendingScrollHlKey')).toBe('letter:v2-l7:p3');
    expect(p.closeLinkSidebar).toHaveBeenCalledTimes(1);
  });

  it('stashes null when the endpoint has no key (footnote tap-throughs)', () => {
    navHandoff.set('pendingScrollHlKey', 'stale');
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'journal', entryId: 'e1' }); });
    expect(navHandoff.peek('pendingScrollHlKey')).toBeNull();
  });

  it('a study endpoint kicks the Matthew corpus and opens matthew-ch at its verse', () => {
    window.__loadMatthewCorpus = vi.fn();
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'study', bookId: 'matthew', chapter: 5, verse: 12 }); });
    expect(window.__loadMatthewCorpus).toHaveBeenCalledTimes(1);
    expect(p.setBookId).toHaveBeenCalledWith('matthew');
    expect(p.setChapterNum).toHaveBeenCalledWith(5);
    expect(p.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(p.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [12] });
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toEqual(
      { screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5, letterId: null, studyId: null, studyChapterId: null });
  });

  it('a study chapter endpoint with no verse sets no verse anchor', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'study', bookId: 'matthew', chapter: 5, verse: null }); });
    expect(p.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(p.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });

  it('a study-letter endpoint opens the Bible-study chapter and clears the letter/book state', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'study-letter', studyId: 'st1', studyChapterId: 'ch3' }); });
    expect(p.setBookId).toHaveBeenCalledWith(null);
    expect(p.setChapterNum).toHaveBeenCalledWith(null);
    expect(p.setLetterId).toHaveBeenCalledWith(null);
    expect(p.setStudyId).toHaveBeenCalledWith('st1');
    expect(p.setStudyChapterId).toHaveBeenCalledWith('ch3');
    expect(p.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toMatchObject({ screen: 'bible-study-chapter', studyId: 'st1', studyChapterId: 'ch3' });
  });

  it('a study-letter endpoint missing its chapter id matches no branch', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'study-letter', studyId: 'st1' }); });
    expect(p.setScreen).not.toHaveBeenCalled();
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toBeNull();
  });

  it('a journal endpoint routes through setJournalEntryId (never letterId) with a matching snapshot', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'journal', entryId: 'e42', screen: 'journal-viewer' }); });
    expect(p.setJournalEntryId).toHaveBeenCalledWith('e42');
    expect(p.setLetterId).toHaveBeenCalledWith(null);
    expect(p.setLetterId).not.toHaveBeenCalledWith('e42');
    expect(p.setScreen).toHaveBeenCalledWith('journal-viewer');
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toEqual({
      screen: 'journal-viewer', bookId: null, chapterNum: null, letterId: null,
      studyId: null, studyChapterId: null, journalEntryId: 'e42',
    });
  });

  it('a screen-driven endpoint opens that screen with its letterId', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'letter', letterId: 'v2-l7', entryId: 'v2-l7', screen: 'letter' }); });
    expect(p.setLetterId).toHaveBeenCalledWith('v2-l7');
    expect(p.setScreen).toHaveBeenCalledWith('letter');
    expect(p.setStudyId).toHaveBeenCalledWith(null);
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toMatchObject({ screen: 'letter', letterId: 'v2-l7' });
  });

  it('a screen-driven endpoint with only an entryId uses it as the letterId', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'wtlb', entryId: 'w-3', screen: 'wtlb-entry' }); });
    expect(p.setLetterId).toHaveBeenCalledWith('w-3');
    expect(p.setScreen).toHaveBeenCalledWith('wtlb-entry');
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toMatchObject({ letterId: 'w-3' });
  });

  it('a screen-only endpoint with no id leaves letterId alone', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'collection', screen: 'volumes' }); });
    expect(p.setLetterId).not.toHaveBeenCalled();
    expect(p.setScreen).toHaveBeenCalledWith('volumes');
    expect(p.pushFromLetter.mock.calls[0][0].destSnapshot).toMatchObject({ screen: 'volumes', letterId: null });
  });

  it('captures the whole source position and the meta overrides into the back-stack entry', () => {
    const p = makeParams({
      screen: 'bible-study-chapter', bookId: 'b', chapterNum: 4, letterId: 'l',
      studyId: 's', studyChapterId: 'sc', journalEntryId: 'j',
    });
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => {
      result.current.navigateToLink({ type: 'journal', entryId: 'e1' },
        { sourceLetterTitle: 'My Notes', sourceVolumeLabel: 'Vol 2', silent: 1 });
    });
    expect(p.pushFromLetter.mock.calls[0][0]).toMatchObject({
      sourceScreen: 'bible-study-chapter', sourceLetterId: 'l', sourceBookId: 'b',
      sourceChapterNum: 4, sourceStudyId: 's', sourceStudyChapterId: 'sc',
      sourceJournalEntryId: 'j', sourceLetterTitle: 'My Notes',
      sourceVolumeLabel: 'Vol 2', silent: true,
    });
  });

  it('without meta the back-stack entry has null titles and is not silent', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'journal', entryId: 'e1' }); });
    expect(p.pushFromLetter.mock.calls[0][0]).toMatchObject({ sourceLetterTitle: null, sourceVolumeLabel: null, silent: false });
  });

  it('a bible endpoint with no corpus and no loader does not navigate or throw', () => {
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'bible', bookId: 'genesis', chapter: 1 }); });
    expect(p.setScreen).not.toHaveBeenCalled();
    expect(p.pushFromLetter).toHaveBeenCalledTimes(1);
  });

  it('a failed bible corpus load warns instead of throwing or navigating', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.__loadBibleCorpus = vi.fn(() => Promise.reject(new Error('offline')));
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    await act(async () => {
      result.current.navigateToLink({ type: 'bible', bookId: 'genesis', chapter: 1 });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(p.setScreen).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('navigateToLink: bible corpus load failed', expect.any(Error));
  });
});
