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
import { useWebSelection } from './use-web-selection.js';
import { useJourney } from './use-journey.js';
import { underlayKey } from '../../utils/scripture-web/personal-graph.js';

const g = /** @type {any} */ (globalThis);
const STUBS = ['LinkStore', 'COLLECTIONS', 'READING_CHAIN', 'colLetterArr', 'colPreface', 'BIBLE_STUDIES', 'loadBibleStudies', '__votCorpus'];
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

/** usePersonalWeb and the selection wired as the screen wires them: the open card is the selection's. */
function mountWithSelection(extra) {
  const refs = {
    camRef: { current: { x: 30, y: 0, ppv: 10, total: 60 } },
    camVRef: { current: null },
    viewRef: { current: { W: 100, H: 80, DPR: 1 } },
    chromeRef: { current: {} },
    focusRef: { current: { arc: -1, hover: -1 } },
    resumeRef: { current: null },
    elevatorRef: { current: null }, badgeBoxesRef: { current: [] }, overlayFrameRef: { current: null },
  };
  Object.assign(refs, extra || {});
  const schedule = vi.fn();
  const frame = () => ({ base: 60 });
  const hook = renderHook((p) => {
    const web = usePersonalWeb(p);
    const journey = useJourney();
    const sel = useWebSelection({
      graph: p.graph, mode: p.mode, density: 'famous', showUnderlay: true, resumeRef: p.resumeRef,
      camRef: p.camRef, viewRef: p.viewRef, focusRef: p.focusRef, viewFor: () => ({}), yFrameFor: () => null,
      personalRef: web.personalRef, railOpts: web.railOpts, elevatorRef: p.elevatorRef, badgeBoxesRef: p.badgeBoxesRef,
      overlayFrameRef: p.overlayFrameRef, flyTo: () => Promise.resolve(false), journey, schedule: p.schedule,
      setAnnounce: () => {}, relink: web.relink,
    });
    return { web, sel };
  }, { initialProps: { graph: GRAPH, mode: 'personal', showUnderlay: true, frame, schedule, ...refs } });
  return { hook, refs, get: () => hook.result.current };
}
const recordAt = (get, i) => get().web.personalRef.current.graph.records[i];

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
    // w4 (the slots): the camera's axis is the rail's own unit; the study
    // takes an equal slot (10 units for its 2 chapters), so the span is 20
    // and Volume One's letters keep their units: letter 7 stays put
    expect(refs.camVRef.current).toBe(cam);
    expect(cam).toMatchObject({ x: 7, ppv: 40, total: 20 });
  });

  it('w4: a rebuild that re-shares the rail keeps the letter at the middle and its pitch on screen', async () => {
    corpus();
    g.LinkStore = store([]);
    let resolveStudies;
    g.loadBibleStudies = vi.fn(() => new Promise((r) => { resolveStudies = r; }));
    const { refs } = mount();
    const cam = refs.camVRef.current;
    // the reader zooms the top rail in on letter 7 (its middle, 7.5)
    cam.ppv = 40; cam.x = 7.5;
    await tick();
    // a study with 12 chapters lands: the densest collection's letter is the
    // rail's unit, so Volume One's slot widens to 12 units, 1.2 a letter
    g.BIBLE_STUDIES = [{ id: 'lamb', slug: 'lamb', title: 'The Lamb of God', chapters: Array.from({ length: 12 }, (_, i) => ({ id: 'lamb-ch' + i })) }];
    await act(async () => { resolveStudies(true); await Promise.resolve(); });
    await tick();
    expect(refs.camVRef.current).toBe(cam);
    expect(cam.total).toBe(24);
    expect(cam.x).toBeCloseTo(7.5 * 1.2, 9);
    expect(cam.ppv * 1.2).toBeCloseTo(40, 9);
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
    // w4: the new fit is the new span's (the study's equal slot: 20 units)
    expect(refs.camVRef.current).toBe(cam);
    expect(cam.total).toBe(20);
    expect(cam.x).toBe(10);
    expect(cam.ppv > 0 ? cam.ppv : 100 / 20).toBeCloseTo(100 / 20, 6);
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
    const { get } = mountWithSelection({ resumeRef });
    expect(resumeRef.current.focus.arc).toBe(1);
    // the open card is the selection's, found again by id (fix-review #8:
    // it was the resume's object, patched in place under the selection)
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1, myWeb: 'link' });
    expect(recordAt(get, get().sel.panel.spec.arc).id).toBe('c');
    expect(detail.index).toBe(2);
  });

  it('fix-review #8: deleting an earlier link keeps the open card on the same record, and the focus is replaced, not written', () => {
    corpus();
    const s = store([link('a', 1, 'l1'), link('b', 2, 'l2'), link('c', 3, 'l3')]);
    g.LinkStore = s;
    const { get, refs } = mountWithSelection();
    act(() => { get().sel.commitFound({ kind: 'link', index: 2, record: recordAt(get, 2), source: { label: 'Genesis 1:3' }, target: { label: 'Letter 3' } }); });
    const before = refs.focusRef.current;
    expect(get().sel.panel.spec.arc).toBe(2);
    act(() => { s.set([link('b', 2, 'l2'), link('c', 3, 'l3')]); });
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1, myWeb: 'link' });
    expect(recordAt(get, get().sel.panel.spec.arc).id).toBe('c');
    expect(refs.focusRef.current.arc).toBe(1);
    expect(refs.focusRef.current).not.toBe(before);
    expect(before.arc).toBe(2);
  });

  it('fix-review #8: deleting the chosen link closes its card and lets go of the focus', () => {
    corpus();
    const s = store([link('a', 1, 'l1'), link('b', 2, 'l2')]);
    g.LinkStore = s;
    const { get, refs } = mountWithSelection();
    act(() => { get().sel.commitFound({ kind: 'link', index: 1, record: recordAt(get, 1), source: { label: 'Genesis 1:2' }, target: { label: 'Letter 2' } }); });
    act(() => { s.set([link('a', 1, 'l1')]); });
    expect(get().sel.panel).toBeNull();
    expect(refs.focusRef.current).toMatchObject({ arc: -1, underlay: false, range: null, lit: null });
  });

  it('fix-review #8: a chosen Timothy thread is not a link: a rebuild leaves its focus and card as they are', () => {
    corpus();
    const s = store([link('a', 1, 'l1'), link('b', 2, 'l2')]);
    g.LinkStore = s;
    const { get, refs } = mountWithSelection();
    act(() => { get().sel.commitFound({ kind: 'underlay', index: 0, source: { label: 'Genesis 1:4' }, target: { label: 'Letter 1' } }); });
    const before = refs.focusRef.current;
    act(() => { s.set([link('b', 2, 'l2')]); });
    expect(refs.focusRef.current).toBe(before);
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 0, myWeb: 'underlay' });
  });

  // the study thread comes first in the asset: until its study lands, the footnote thread is row 0
  const STUDY_FIRST = Object.assign({}, GRAPH, { votEdges: [GRAPH.votEdges[1], GRAPH.votEdges[0]] });
  const LAMB = [{ id: 'lamb', slug: 'lamb', title: 'The Lamb of God', chapters: [{ id: 'lamb-ch1' }, { id: 'lamb-ch2' }] }];
  it('fix-review 2 #4: a chosen Timothy thread is found again by what it is when the studies land before it', async () => {
    corpus();
    g.LinkStore = store([]);
    let resolveStudies;
    g.loadBibleStudies = vi.fn(() => new Promise((r) => { resolveStudies = r; }));
    const { get, refs } = mountWithSelection({ graph: STUDY_FIRST });
    const u = () => get().web.personalRef.current.underlay;
    expect(u().count).toBe(1);
    // the reader taps the one thread there is (Genesis 1:4 to Letter 1); the card is describe's, with the thread's key
    act(() => { get().sel.commitFound({ kind: 'underlay', index: 0, key: u().keys && u().keys[0], source: { label: 'Genesis 1:4' }, target: { label: 'Letter 1' } }); });
    await tick();
    g.BIBLE_STUDIES = LAMB;
    await act(async () => { resolveStudies(true); await Promise.resolve(); });
    await tick();
    // the study's thread is row 0 now; the chosen one moved to row 1, and the spotlight and the card follow it
    expect(u().count).toBe(2);
    const at = u().records.findIndex((e) => e.letterId === 'l1');
    expect(at).toBe(1);
    expect(refs.focusRef.current).toMatchObject({ arc: 1, underlay: true });
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1, myWeb: 'underlay' });
  });

  it('fix-review 2 #4: the resume from the reader finds its Timothy thread by key, in the focus and the open card both', () => {
    corpus();
    g.LinkStore = store([]);
    g.BIBLE_STUDIES = LAMB;                  // landed in the reader, after the thread was chosen
    g.loadBibleStudies = vi.fn(() => Promise.resolve(true));
    const key = underlayKey(GRAPH.votEdges[0]);
    const detail = { kind: 'underlay', index: 0, key };
    const resumeRef = { current: { mode: 'personal', cam: { x: 30, y: 0, ppv: 10, total: 60 }, focus: { arc: 0, hover: -1, underlay: true }, detail } };
    const { get } = mountWithSelection({ graph: STUDY_FIRST, resumeRef });
    expect(resumeRef.current.focus).toMatchObject({ arc: 1, underlay: true });
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1, myWeb: 'underlay' });
    expect(get().web.personalRef.current.underlay.keys[1]).toBe(key);
  });

  it('fix-review #9: the web rebuilds when the VOT corpus lands, so a link into it is placed, not left skipped', () => {
    corpus();
    const letters = [];
    g.colLetterArr = () => letters;
    const subs = new Set();
    let version = 1;
    g.__votCorpus = { subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => version };
    g.LinkStore = store([link('a', 1, 'l1')]);
    g.loadBibleStudies = vi.fn(() => Promise.resolve(false));
    const { hook } = mount();
    expect(hook.result.current.personalCount).toBe(0);
    expect(hook.result.current.skippedCount).toBe(1);
    act(() => {
      for (let i = 0; i < 10; i++) letters.push({ id: 'l' + i, title: 'Letter ' + i });
      version++;
      subs.forEach((cb) => cb());
    });
    expect(hook.result.current.personalCount).toBe(1);
    expect(hook.result.current.skippedCount).toBe(0);
  });

  it('the header counts are state of the build: links placed, Timothy’s threads placed, links skipped', () => {
    corpus();
    g.LinkStore = store([link('a', 1, 'l1'), { id: 'z', source: link('z', 1, 'l1').source, target: { type: 'letter', letterId: 'gone' } }]);
    const { hook } = mount();
    expect(hook.result.current.personalCount).toBe(1);
    expect(hook.result.current.contextCount).toBe(1);   // the study thread waits for its study
    expect(hook.result.current.skippedCount).toBe(1);
    // the corpus is loaded and has no 'gone': that link is not waiting for anything (fix-review 2 #6)
    expect(hook.result.current.pendingCount).toBe(0);
  });
});
