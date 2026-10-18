// @ts-nocheck — free-var globals stubbed per test (the bundle-d module contract)
/**
 * usePersonalWeb — My Web's build, kept honest across rebuilds (w3, the My
 * Web stream, 2026-10-18). REDs first, one per finding:
 *
 *   bug #8  loadBibleStudies() rejecting (offline, a failed script) was an
 *           unhandled rejection: the .then had no catch.
 *   bug #9  every rebuild (a new link, the studies landing) replaced the
 *           Volumes camera with a fresh one: the top rail jumped back to
 *           fit under the reader's fingers.
 *   item 30 the chosen link was kept by INDEX across a rebuild and across
 *           the resume from the reader, so a link deleted before it moved
 *           the spotlight (and the open card's index) onto its neighbour.
 *   counts  the header's counts are state of the build, not a ref read at
 *           render time (the toggle showed 1,314 one render, 2,095 the next).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersonalWeb } from './use-personal-web.js';

const g = /** @type {any} */ (globalThis);
const STUBS = ['LinkStore', 'COLLECTIONS', 'READING_CHAIN', 'colLetterArr', 'colPreface', 'BIBLE_STUDIES', 'loadBibleStudies'];
afterEach(() => { STUBS.forEach((k) => delete g[k]); vi.restoreAllMocks(); });

const GRAPH = {
  total: 60,
  books: [{ id: 'genesis' }],
  chapters: [[0, 1, 0, 60]],
  votEdges: [{ v: 3, kind: 'footnote', volKey: 'one', letterId: 'l1' }, { v: 9, kind: 'study', studyId: 'lamb', chapterId: 'lamb-ch1' }],
};
const link = (id, verse, letter) => ({ id, source: { type: 'bible', bookId: 'genesis', chapter: 1, verse }, target: { type: 'letter', letterId: letter, volKey: 'one' } });

/** A LinkStore whose list the test swaps, bumping the version the hook subscribes to. */
function store(initial) {
  let links = initial, version = 1;
  const subs = new Set();
  return {
    all: () => links,
    getVersion: () => version,
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    set(next) { links = next; version++; subs.forEach((cb) => cb()); },
  };
}

function corpus() {
  g.READING_CHAIN = ['one'];
  g.COLLECTIONS = [{ volKey: 'one', label: 'Volume One' }];
  g.colLetterArr = () => Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, title: 'Letter ' + i }));
  g.colPreface = () => null;
}

function mount(extra) {
  const refs = {
    camRef: { current: { x: 30, y: 0, ppv: 10, total: 60 } },
    camVRef: { current: null },
    viewRef: { current: { W: 100, H: 80, DPR: 1 } },
    chromeRef: { current: {} },
    focusRef: { current: { arc: -1, hover: -1 } },
    resumeRef: { current: null },
  };
  Object.assign(refs, extra || {});
  const schedule = vi.fn();
  const frame = () => ({ base: 60 });
  const hook = renderHook((p) => usePersonalWeb(p), {
    initialProps: { graph: GRAPH, mode: 'personal', showUnderlay: true, frame, schedule, ...refs },
  });
  return { hook, refs };
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('usePersonalWeb railOpts', () => {
  it('carries the top chrome’s bottom edge in device px, so the Volumes rail clears the header (w3 picture)', () => {
    corpus();
    g.LinkStore = store([]);
    g.loadBibleStudies = vi.fn(() => Promise.resolve([]));
    const { hook } = mount({ viewRef: { current: { W: 100, H: 80, DPR: 2 } }, topbarRef: { current: { offsetTop: 10, offsetHeight: 50 } } });
    expect(hook.result.current.railOpts().inset).toBe(120);
    const bare = mount({ topbarRef: { current: null } });
    expect(bare.hook.result.current.railOpts().inset).toBe(0);
  });
});

describe('usePersonalWeb across rebuilds', () => {
  it('bug #8: a Bible-studies load that fails is caught, and the web stays up without the studies', async () => {
    corpus();
    g.LinkStore = store([link('a', 1, 'l1')]);
    const seen = [];
    const onRejection = (r) => seen.push(r);
    g.process.on('unhandledRejection', onRejection);
    g.loadBibleStudies = vi.fn(() => Promise.reject(new Error('offline')));
    try {
      const { hook } = mount();
      await tick(); await tick();
      await new Promise((r) => setTimeout(r, 20));
      expect(g.loadBibleStudies).toHaveBeenCalled();
      expect(hook.result.current.personalCount).toBe(1);
    } finally {
      g.process.off('unhandledRejection', onRejection);
    }
    expect(seen).toEqual([]);
  });

  it('bug #9: the Volumes camera is kept when a link lands and when the studies land, not reset to fit', async () => {
    corpus();
    const s = store([link('a', 1, 'l1')]);
    g.LinkStore = s;
    let resolveStudies;
    g.loadBibleStudies = vi.fn(() => new Promise((r) => { resolveStudies = r; }));
    const { refs } = mount();
    const cam = refs.camVRef.current;
    expect(cam && cam.total).toBe(10);
    // the reader zooms the top rail in on letter 7
    cam.ppv = 40; cam.x = 7;
    act(() => { s.set([link('a', 1, 'l1'), link('b', 2, 'l2')]); });
    expect(refs.camVRef.current).toBe(cam);
    expect(cam).toMatchObject({ x: 7, ppv: 40, total: 10 });
    // the studies land: their segment is appended, so every old position keeps its place
    await tick();
    g.BIBLE_STUDIES = [{ id: 'lamb', slug: 'lamb', title: 'The Lamb of God', chapters: [{ id: 'lamb-ch1' }, { id: 'lamb-ch2' }] }];
    await act(async () => { resolveStudies(true); await Promise.resolve(); });
    await tick();
    expect(refs.camVRef.current).toBe(cam);
    expect(cam).toMatchObject({ x: 7, ppv: 40, total: 12 });
  });

  it('bug #9: a Volumes rail at fit stays at fit as it grows (the new fit, not the old ppv)', async () => {
    corpus();
    g.LinkStore = store([]);
    let resolveStudies;
    g.loadBibleStudies = vi.fn(() => new Promise((r) => { resolveStudies = r; }));
    const { refs } = mount();
    const cam = refs.camVRef.current;
    cam.ppv = 100 / 10; cam.x = 5;            // what the first frame's clamp leaves: fit
    await tick();
    g.BIBLE_STUDIES = [{ id: 'lamb', slug: 'lamb', title: 'The Lamb of God', chapters: [{ id: 'lamb-ch1' }, { id: 'lamb-ch2' }] }];
    await act(async () => { resolveStudies(true); await Promise.resolve(); });
    await tick();
    expect(refs.camVRef.current).toBe(cam);
    expect(cam.total).toBe(12);
    expect(cam.x).toBe(6);
    expect(cam.ppv > 0 ? cam.ppv : 100 / 12).toBeCloseTo(100 / 12, 6);
  });

  it('item 30: a rebuild keeps the chosen link by its id when one before it is deleted', () => {
    corpus();
    const s = store([link('a', 1, 'l1'), link('b', 2, 'l2'), link('c', 3, 'l3')]);
    g.LinkStore = s;
    const { refs } = mount();
    refs.focusRef.current = { arc: 2, hover: -1 };          // the reader chose 'c'
    act(() => { s.set([link('b', 2, 'l2'), link('c', 3, 'l3')]); });
    expect(refs.focusRef.current.arc).toBe(1);
    // a deleted choice is let go, not moved onto a neighbour
    act(() => { s.set([link('b', 2, 'l2')]); });
    expect(refs.focusRef.current.arc).toBe(-1);
  });

  it('item 30: the resume from the reader finds its link by id, in the focus and the open card both', () => {
    corpus();
    g.LinkStore = store([link('b', 2, 'l2'), link('c', 3, 'l3')]);    // 'a' was deleted in the reader
    const detail = { kind: 'link', index: 2, record: { id: 'c' } };
    const resumeRef = { current: { mode: 'personal', cam: { x: 30, y: 0, ppv: 10, total: 60 }, focus: { arc: 2, hover: -1 }, detail } };
    mount({ resumeRef });
    expect(resumeRef.current.focus.arc).toBe(1);
    expect(detail.index).toBe(1);
  });

  it('the header counts are state of the build: links placed, Timothy’s threads placed, links skipped', () => {
    corpus();
    g.LinkStore = store([link('a', 1, 'l1'), { id: 'z', source: link('z', 1, 'l1').source, target: { type: 'letter', letterId: 'gone' } }]);
    const { hook } = mount();
    expect(hook.result.current.personalCount).toBe(1);
    expect(hook.result.current.contextCount).toBe(1);   // the study thread waits for its study
    expect(hook.result.current.skippedCount).toBe(1);
  });
});
