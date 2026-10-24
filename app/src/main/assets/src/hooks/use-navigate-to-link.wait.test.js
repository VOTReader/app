/* useNavigateToLink — a letter link tapped before the letters load (s03.2, n141). It said nothing and did nothing;
   a re-tap worked. It now says it is loading, and once the letters land it finds the entry's screen and finishes the
   jump, unless the reader moved meanwhile. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigateToLink } from './use-navigate-to-link.js';
import { navHandoff } from '../utils/nav-handoff.js';
import { _resetToasts } from '../utils/toast.js';
import { WAIT_TOAST_ID } from '../utils/wait-notice.js';

vi.mock('../data/scripture-resolution.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, findEntryContext: (id, kind) => (/** @type {any} */ (globalThis).__testFec ? /** @type {any} */ (globalThis).__testFec(id, kind) : null) };
});

function makeParams(over) {
  return {
    closeLinkSidebar: vi.fn(), pushFromLetter: vi.fn(),
    screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null,
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(), setStudyId: vi.fn(),
    setStudyChapterId: vi.fn(), setSurpriseAnchor: vi.fn(), setJournalEntryId: vi.fn(),
    ...over,
  };
}
const toast = () => document.getElementById(WAIT_TOAST_ID);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  _resetToasts();
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
});
afterEach(() => {
  navHandoff._resetForTests();
  delete window.__loadVotCorpus;
  delete (/** @type {any} */ (globalThis).__testFec);
});

describe('useNavigateToLink — a letter link before the letters load (s03.2)', () => {
  it('says it is loading, then finishes the jump on the entry’s screen', async () => {
    let land;
    window.__loadVotCorpus = vi.fn(() => new Promise((res) => { land = res; }));
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'letter', letterId: 'v3-l17', key: 'letter:v3-l17', screen: null }); });
    expect(toast().textContent).toBe('Loading the letters…');
    expect(p.setScreen).not.toHaveBeenCalled();
    /** @type {any} */ (globalThis).__testFec = (id, kind) => (id === 'v3-l17' && kind === 'letter' ? { screen: 'vot-three-letter' } : null);
    land();
    await flush();
    expect(p.setScreen).toHaveBeenCalledWith('vot-three-letter');
    expect(p.setLetterId).toHaveBeenCalledWith('v3-l17');
    expect(p.closeLinkSidebar).toHaveBeenCalledTimes(1);
    expect(toast().classList.contains('show')).toBe(false);
  });

  it('drops the jump when the reader moved while the letters loaded', async () => {
    let land;
    window.__loadVotCorpus = vi.fn(() => new Promise((res) => { land = res; }));
    /** @type {any} */ (globalThis).__testFec = () => ({ screen: 'vot-three-letter' });
    const { result, rerender } = renderHook((p) => useNavigateToLink(p), { initialProps: makeParams() });
    act(() => { result.current.navigateToLink({ type: 'letter', letterId: 'x', screen: null }); });
    const moved = makeParams({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    rerender(moved);
    land();
    await flush();
    expect(moved.setScreen).not.toHaveBeenCalled();
    expect(toast().classList.contains('show')).toBe(false);
  });

  it('says so when the letters cannot load', async () => {
    window.__loadVotCorpus = vi.fn(() => Promise.reject(new Error('offline')));
    const p = makeParams();
    const { result } = renderHook(() => useNavigateToLink(p));
    act(() => { result.current.navigateToLink({ type: 'wtlb', letterId: 'w1', screen: null }); });
    await flush();
    expect(toast().textContent).toContain('Couldn’t load the letters');
    expect(p.setScreen).not.toHaveBeenCalled();
  });
});
