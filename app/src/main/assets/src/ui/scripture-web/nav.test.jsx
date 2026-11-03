/* The navigation stream (w3): the double-tap's way back, the eased flyTo, the journey, the
   go-to and the doors in. The camera, the journey and the selection are wired as the screen wires
   them (contracts.test.jsx's harness), with a frame loop that runs on demand. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection } from './use-web-selection.js';
import {
  useJourney, arrive, moveTo, stopOf, chainTo, pathOf, branchesOf, visitedOf, pathArcsOf, trailForStorage, restoreTrail,
  EMPTY_TRAIL, TRAIL_CAP,
} from './use-journey.js';
import { useFrameScheduler } from './use-frame-scheduler.js';
import { fitPPV } from '../../utils/scripture-web/geometry.js';

/* A frame loop that runs when the test says: requestAnimationFrame queues, tick() runs the queue
   ms later on the clock the scheduler reads. */
let rafQueue = [], clock = 0;
const tick = (ms = 16) => {
  clock += ms;
  const q = rafQueue; rafQueue = [];
  for (const cb of q) cb(clock);
};
/** Run frames until nothing more is asked for (or a cap). */
const settle = (ms = 16, cap = 400) => { let n = 0; while (rafQueue.length && n++ < cap) tick(ms); return n; };
beforeEach(() => {
  rafQueue = []; clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TOTAL = 31102;
const graph = () => ({
  total: TOTAL, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
  books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
  votEdges: [], prophecy: [{ a: 5, b: 9000 }], votLinks: [], chunkSize: 256,
});

function mount({ loop = false } = {}) {
  const g = graph();
  const setAnnounce = vi.fn();
  const draws = vi.fn();
  const fallback = vi.fn();
  const hook = renderHook(() => {
    const frames = useFrameScheduler();
    frames.drawRef.current = draws;
    const schedule = loop ? frames.schedule : fallback;
    const modeRef = React.useRef('canonical');
    const cam = useWebCamera({ graph: g, density: 'famous', modeRef, schedule, animate: loop ? frames.animate : undefined });
    const journey = useJourney({ flyTo: cam.flyTo });
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(null);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(null);
    const railOpts = React.useCallback(() => ({}), []);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef,
      camRef: cam.camRef, viewRef: cam.viewRef, focusRef: cam.focusRef, viewFor: cam.viewFor, yFrameFor: cam.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: cam.flyTo, journey, schedule, setAnnounce,
    });
    return { cam, sel, journey, frames };
  });
  const { cam } = hook.result.current;
  cam.viewRef.current = { W: 800, H: 360, DPR: 1 };
  cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
  return { hook, g, draws, setAnnounce, get: () => hook.result.current };
}

describe('the double-tap takes back its first tap (A1): the selection keeps a way back', () => {
  it('snapshot before a tap, then restore: the card the tap opened goes, and what was open returns', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const before = get().cam.focusRef.current;
    const undo = get().sel.handlersRef.current.snapshot();
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 100 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'verse' });
    act(() => { undo(); });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1 });
    expect(get().cam.focusRef.current, 'the focus is the one before the tap, whole').toBe(before);
  });

  /* w4 a11y hunt: a double-tap that only zoomed left the first tap's "8 connections here. Choose
     one." in the live region, so a screen reader heard a chooser that never stayed */
  it("the way back takes the first tap's words with it: the live region does not keep the chooser's", () => {
    const { get, setAnnounce } = mount();
    const undo = get().sel.handlersRef.current.snapshot();
    act(() => { get().sel.openPanel({ mode: 'group', ids: [0, 1] }); });
    expect(setAnnounce, 'PRECONDITION: the chooser spoke').toHaveBeenLastCalledWith('2 connections here. Choose one.');
    act(() => { undo(); });
    expect(get().sel.choices).toBeNull();
    expect(setAnnounce).toHaveBeenLastCalledWith('');
  });

  it('a first tap on empty sky with nothing open: the way back is nothing open', () => {
    const { get } = mount();
    const undo = get().sel.handlersRef.current.snapshot();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    act(() => { undo(); });
    expect(get().sel.detail).toBeNull();
    expect(get().cam.focusRef.current.arc).toBe(-1);
  });
});

describe('the frame loop\'s one motion (use-frame-scheduler.js animate)', () => {
  it('runs the step inside the frame, before the draw, until it has arrived', () => {
    const order = [];
    const { result } = renderHook(() => useFrameScheduler());
    result.current.drawRef.current = () => order.push('draw');
    let n = 0;
    const onEnd = vi.fn();
    act(() => { result.current.animate((ms) => { order.push('step ' + ms); return ++n < 3; }, onEnd); });
    settle(20);
    expect(order).toEqual(['step 16', 'draw', 'step 20', 'draw', 'step 20', 'draw']);
    expect(onEnd).toHaveBeenCalledWith(true);
  });
  it('a newer motion ends the one running, and stop() ends it where it is', () => {
    const { result } = renderHook(() => useFrameScheduler());
    const first = vi.fn(), second = vi.fn();
    const a = vi.fn(() => true), b = vi.fn(() => true);
    act(() => { result.current.animate(a, first); });
    tick();
    act(() => { result.current.animate(b, second); });
    expect(first).toHaveBeenCalledWith(false);
    tick();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    const third = vi.fn();
    const stop = result.current.animate(b, third);
    expect(second).toHaveBeenCalledWith(false);
    stop();
    expect(third).toHaveBeenCalledWith(false);
    tick();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it('a step that throws ends the motion where it is, not arrived (s26.1), and the frame still draws', () => {
    const { result } = renderHook(() => useFrameScheduler());
    const draw = vi.fn();
    result.current.drawRef.current = draw;
    const onEnd = vi.fn();
    act(() => { result.current.animate(() => { throw new Error('a bad frame'); }, onEnd); });
    settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(false);
    expect(draw).toHaveBeenCalledTimes(1);
  });
  it('a motion running when the screen goes ends there (its promise never hangs)', () => {
    const { result, unmount } = renderHook(() => useFrameScheduler());
    const onEnd = vi.fn();
    act(() => { result.current.animate(() => true, onEnd); });
    unmount();
    expect(onEnd).toHaveBeenCalledWith(false);
  });
});

describe('flyTo eases (A3): through the one frame loop, to exactly where the instant one lands', () => {
  /** Where the instant flyTo puts the camera for this target (no frame loop: it jumps). */
  async function instantly(target, opts) {
    const twin = mount();
    await twin.get().cam.flyTo(target, opts);
    return { ...twin.get().cam.camRef.current };
  }

  it('moves over several frames, resolves true on arrival, and lands where the jump would', async () => {
    const { get, draws } = mount({ loop: true });
    const want = await instantly({ x0: 20000, x1: 20100 });
    let done = null;
    act(() => { get().cam.flyTo({ x0: 20000, x1: 20100 }).then((ok) => { done = ok; }); });
    tick();
    const cam = get().cam.camRef.current;
    expect(Math.abs(cam.x - want.x), 'one frame in, it has left but not arrived').toBeGreaterThan(100);
    const frames = settle();
    expect(frames, 'a 600-900 ms fly at 16 ms a frame').toBeGreaterThan(30);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(cam.x).toBeCloseTo(want.x, 9);
    expect(cam.ppv).toBeCloseTo(want.ppv, 9);
    expect(draws).toHaveBeenCalled();
  });

  it('a long hop zooms out on the way and back in', () => {
    const { get } = mount({ loop: true });
    const cam = get().cam.camRef.current;
    act(() => { get().cam.flyTo({ x: 100 }); });
    let lowest = cam.ppv;
    while (rafQueue.length) { tick(); lowest = Math.min(lowest, cam.ppv); }
    expect(lowest, 'Revelation-ward to Genesis: the camera rose to see both').toBeLessThan(8 / 4);
    expect(cam.ppv).toBeCloseTo(8, 9);
  });

  it('honours the panel inset frame by frame: a panel that opens mid-flight is flown around', async () => {
    const { get } = mount({ loop: true });
    act(() => { get().cam.flyTo({ x0: 20000, x1: 20100 }); });
    for (let i = 0; i < 10; i++) tick();
    get().cam.panelInsetRef.current = { right: 200, bottom: 0 };
    settle();
    const want = await instantly({ x0: 20000, x1: 20100 }, { insetRight: 200 });
    expect(get().cam.camRef.current.x).toBeCloseTo(want.x, 9);
    expect(get().cam.camRef.current.ppv).toBeCloseTo(want.ppv, 9);
  });

  it('under reduced motion it jumps: arrived before any frame runs', async () => {
    const { get } = mount({ loop: true });
    const want = await instantly({ x: 9000, zoom: 4 });
    await expect(get().cam.flyTo({ x: 9000, zoom: 4 }, { reduceMotion: true })).resolves.toBe(true);
    expect(get().cam.camRef.current).toMatchObject({ x: want.x, ppv: want.ppv });
  });

  it('the reader\'s own reduced-motion setting makes it jump too', async () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const { get } = mount({ loop: true });
    await expect(get().cam.flyTo({ x: 9000 })).resolves.toBe(true);
    expect(get().cam.camRef.current.x).toBe(9000);
  });

  it('a newer fly takes over (the old resolves false), and cancelFly stops one where it is', async () => {
    const { get } = mount({ loop: true });
    let first = null, second = null;
    act(() => { get().cam.flyTo({ x: 100 }).then((ok) => { first = ok; }); });
    tick(); tick();
    act(() => { get().cam.flyTo({ x: 20000 }).then((ok) => { second = ok; }); });
    await Promise.resolve();
    expect(first).toBe(false);
    tick(); tick(); tick();
    get().cam.cancelFly();
    await Promise.resolve();
    expect(second).toBe(false);
    const held = { ...get().cam.camRef.current };
    settle();
    expect(get().cam.camRef.current).toEqual(held);
  });

  it('an anchored zoom keeps the verse under the anchor where it is, all the way', () => {
    const { get } = mount({ loop: true });
    const cam = get().cam.camRef.current;
    const W = 800, ax = 300;
    const verseAt = () => cam.x + (ax - W / 2) / cam.ppv;
    const v0 = verseAt();
    const to = { x: v0 - (ax - W / 2) / 20, zoom: 20 / fitPPV(cam, W) };
    act(() => { get().cam.flyTo(to, { insetRight: 0, ms: 280, anchor: ax }); });
    while (rafQueue.length) { tick(); expect(verseAt()).toBeCloseTo(v0, 6); }
    expect(cam.ppv).toBeCloseTo(20, 9);
  });

  it('the double-tap zooms 2.5x about the tap, eased', () => {
    const { get } = mount({ loop: true });
    const cam = get().cam.camRef.current;
    const verseAt = (ax) => cam.x + (ax - 400) / cam.ppv;
    const v0 = verseAt(250);
    act(() => { get().sel.handlersRef.current.doubleTap(250, 100); });
    tick();
    expect(cam.ppv, 'one frame in it is on its way').toBeLessThan(20);
    settle();
    expect(cam.ppv).toBeCloseTo(20, 9);
    expect(verseAt(250)).toBeCloseTo(v0, 6);
  });
});

/* THE TRAIL (2026-11-03, Corbin: "going from link to link to link, to back a couple to a different
   link, and follow any number of paths through the bible"): a tree of stops. The pure rules first,
   then the trail as the screen wires it. */
describe('the trail: a tree of stops, where the reader is on it, and every way they have gone', () => {
  const at = (verse, extra) => Object.assign({ verse, label: 'v' + verse }, extra);
  const verses = (s) => s.map((e) => e.verse);
  const hereOf = (t) => stopOf(t, t.at);
  const stopAt = (t, verse) => t.stops.find((s) => s.verse === verse);
  /** A walk: each verse an arrival along a thread from the one before (arc ids from 1). */
  const walk = (...vs) => {
    let t = arrive(EMPTY_TRAIL, at(vs[1], { via: { arc: 1 } }), at(vs[0]));
    for (let k = 2; k < vs.length; k++) t = arrive(t, at(vs[k], { via: { arc: k } }), at(vs[k - 1]));
    return t;
  };

  it('the first arrival seeds where the reader set out from; the same place twice is one stop', () => {
    expect(verses(chainTo(arrive(EMPTY_TRAIL, at(100), at(5)), 1))).toEqual([5, 100]);
    const one = arrive(EMPTY_TRAIL, at(100));
    expect(verses(one.stops)).toEqual([100]);
    expect(verses(arrive(EMPTY_TRAIL, at(100), at(100)).stops), 'set out from where it arrives: no second stop').toEqual([100]);
    const t = walk(5, 100);
    const again = arrive(t, at(100, { open: { mode: 'verse', verse: 100 } }));
    expect(verses(again.stops)).toEqual([5, 100]);
    expect(hereOf(again).open, 'the stop keeps the panel the arrival names').toEqual({ mode: 'verse', verse: 100 });
  });

  it('walking back the way it came steps back, and the way ahead stays', () => {
    let t = walk(5, 100, 300);
    t = arrive(t, at(100));
    expect(hereOf(t).verse).toBe(100);
    expect(verses(pathOf(t).stops), 'the bar still holds the way ahead').toEqual([5, 100, 300]);
    expect(pathOf(t).here).toBe(1);
    t = arrive(t, at(5));
    expect(hereOf(t).verse, 'home: where the trail set out').toBe(5);
    expect(t.stops, 'nothing is lost by going home').toHaveLength(3);
  });

  it('back a couple, then another way: a branch beside the old path, and every path stays', () => {
    let t = walk(5, 100, 300, 400);
    t = moveTo(t, stopAt(t, 100).id);
    expect(verses(pathOf(t).stops), 'after going back, the way ahead is the way gone').toEqual([5, 100, 300, 400]);
    t = arrive(t, at(700, { via: { arc: 9 } }), at(100));
    expect(verses(chainTo(t, t.at))).toEqual([5, 100, 700]);
    expect(verses(pathOf(t).stops), 'the bar follows the new way').toEqual([5, 100, 700]);
    const b = branchesOf(t);
    expect(b.map((x) => verses(x.stops))).toEqual([[5, 100, 300, 400], [700]]);
    expect(b[1].from.verse, 'the new path leaves from 100').toBe(100);
    expect(b.map((x) => x.current)).toEqual([false, true]);
    // the old path's end, gone to again: the way on from 100 points at it once more
    t = moveTo(t, stopAt(t, 400).id);
    expect(verses(pathOf(t).stops)).toEqual([5, 100, 300, 400]);
    expect(stopAt(t, 100).last).toBe(stopAt(t, 300).id);
    expect(branchesOf(t).map((x) => x.current)).toEqual([true, false]);
    // a third way from where the trail set out
    t = moveTo(t, stopAt(t, 5).id);
    t = arrive(t, at(900, { via: { arc: 11 } }), at(5));
    expect(branchesOf(t).map((x) => verses(x.stops))).toEqual([[5, 100, 300, 400], [700], [900]]);
    expect(branchesOf(t)[2].from.verse).toBe(5);
    expect([...visitedOf(t)].sort((x, y) => x - y)).toEqual([5, 100, 300, 400, 700, 900]);
  });

  it('moving to where the reader already is, on the way they already face, is the same trail', () => {
    const t = walk(5, 100, 300);
    expect(moveTo(t, t.at)).toBe(t);
    expect(moveTo(t, 999), 'no such stop').toBe(t);
  });

  it('arriving where the reader went on to before is that stop again, not a second one', () => {
    let t = walk(5, 100, 300);
    t = moveTo(t, stopAt(t, 100).id);
    t = arrive(t, at(300, { via: { arc: 2 } }), at(100));
    expect(t.stops).toHaveLength(3);
    expect(hereOf(t).verse).toBe(300);
  });

  it('a thread from somewhere else sets out from its own near end, a stop of its own first', () => {
    const t = walk(5, 100);
    const far = arrive(t, at(900, { via: { arc: 7 } }), at(800));
    expect(verses(chainTo(far, far.at))).toEqual([5, 100, 800, 900]);
    expect(stopAt(far, 800).via, 'the near end is a jump').toBeUndefined();
    expect(hereOf(far).via).toEqual({ arc: 7 });
    // a jump (no thread: the go-to, a book's name) never puts its origin in a trail it joins
    expect(verses(chainTo(arrive(t, at(900), at(800)), 2))).toEqual([5, 100, 900]);
  });

  it(`keeps at most ${TRAIL_CAP} stops: the oldest branch ends go first, never the way to where the reader is`, () => {
    let t = arrive(EMPTY_TRAIL, at(2, { via: { arc: 1 } }), at(1));
    for (let v = 3; v <= 100; v++) t = arrive(t, at(v, { via: { arc: v } }), at(v - 1));
    t = moveTo(t, stopAt(t, 50).id);
    for (let v = 1001; v <= 1080; v++) t = arrive(t, at(v, { via: { arc: v } }), at(v === 1001 ? 50 : v - 1));
    expect(t.stops).toHaveLength(TRAIL_CAP);
    const path = verses(pathOf(t).stops);
    expect(path.slice(0, 50)).toEqual(Array.from({ length: 50 }, (_, k) => k + 1));
    expect(path.slice(50)).toEqual(Array.from({ length: 80 }, (_, k) => k + 1001));
    expect(Math.max(...verses(t.stops).filter((v) => v < 1000)), 'the old branch lost its far end first').toBe(80);
  });

  it('ignores what is not a place', () => {
    const t = walk(5, 100);
    expect(arrive(t, /** @type {any} */ (null))).toBe(t);
    expect(arrive(t, /** @type {any} */ ({ verse: NaN, label: '' }))).toBe(t);
  });

  it("the web's path: the threads the bar's path came along, a prophecy pair left to its own class", () => {
    let t = walk(5, 100, 300);
    expect(pathArcsOf(t)).toEqual([1, 2]);
    t = moveTo(t, stopAt(t, 100).id);
    expect(pathArcsOf(t), 'the way ahead is still on the path').toEqual([1, 2]);
    t = arrive(t, at(700, { via: { arc: 5, prophecy: true } }), at(100));
    expect(pathArcsOf(t)).toEqual([1]);
  });

  it('kept and back (the resume point): every stop, its thread, its panel and Forward\'s way; a broken one is nothing', () => {
    let t = walk(5, 100, 300);
    t = moveTo(t, stopAt(t, 100).id);
    t = arrive(t, at(700, { via: { arc: 9 }, open: { mode: 'verse', verse: 700, lit: Int32Array.from([1, 2]) } }), at(100));
    const kept = JSON.parse(JSON.stringify(trailForStorage(t)));
    expect(kept.stops.find((s) => s.verse === 700).open, 'the lit list is not kept').toEqual({ mode: 'verse', verse: 700 });
    const back = /** @type {any} */ (restoreTrail(kept, TOTAL));
    expect(verses(back.stops)).toEqual(verses(t.stops));
    expect(back.at).toBe(t.at);
    expect(branchesOf(back).map((x) => verses(x.stops))).toEqual([[5, 100, 300], [700]]);
    expect(stopAt(back, 100).last, "Forward's way from 100 is the newest").toBe(stopAt(back, 700).id);
    expect(hereOf(back).via).toEqual({ arc: 9 });
    // a new stop after a restore takes a new id
    const on = arrive(back, at(800, { via: { arc: 4 } }), at(700));
    expect(new Set(on.stops.map((s) => s.id)).size).toBe(on.stops.length);
    expect(restoreTrail(null)).toBeNull();
    expect(restoreTrail({ v: 2, stops: kept.stops })).toBeNull();
    expect(restoreTrail({ v: 1, at: 0, stops: [{ id: 0, verse: 5, label: 'a', parent: 3 }] }), 'a parent it never held').toBeNull();
    expect(restoreTrail(kept, 200), 'a verse past the canon').toBeNull();
    expect(trailForStorage(EMPTY_TRAIL)).toBeNull();
  });

  it('a door in sets out a new path beside the kept ones (fresh): the reader stands on none of them', () => {
    const kept = trailForStorage(walk(5, 100, 300));
    const { result } = renderHook(() => useJourney({ initial: kept, fresh: true }));
    expect(result.current.here).toBeNull();
    expect(result.current.trail.stops).toHaveLength(3);
    act(() => { result.current.push(at(2000, { via: { arc: 6 } }), at(1990)); });
    expect(verses(result.current.stack)).toEqual([1990, 2000]);
    expect(branchesOf(result.current.trail).map((x) => verses(x.stops))).toEqual([[5, 100, 300], [1990, 2000]]);
  });

  it('Follow arrives at the far end as a stop: its verse opens with its thread chosen; Back flies home to the verse it came from', async () => {
    const { get } = mount({ loop: true });
    get().journey.connect({ openPanel: get().sel.openPanel, closePanel: get().sel.closePanel }); // as useGoTo does
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    expect(get().sel.detail.far).toBe('from');
    act(() => { get().sel.followThread(get().sel.detail); });
    settle();
    // centred on the foot, at its verse's middle (the panel stream's Follow)
    expect(get().cam.camRef.current.x).toBeCloseTo(100.5, 6);
    expect(verses(get().journey.stack), 'the near foot, then the far').toEqual([20100, 100]);
    expect(get().sel.detail, 'the arrival is the verse, in verse mode').toMatchObject({ kind: 'verse', verse: 100 });
    expect(get().cam.focusRef.current.arc, 'the thread in stays chosen').toBe(0);
    expect(get().journey.here.via).toEqual({ arc: 0 });
    let to = null;
    act(() => { to = get().journey.back(); });
    expect(to).toMatchObject({ verse: 20100 });
    expect(verses(get().journey.stack)).toEqual([20100]);
    expect(verses(get().journey.path.stops), 'the way ahead stays in the bar').toEqual([20100, 100]);
    tick();
    expect(get().cam.camRef.current.x, 'on its way, not jumped').not.toBeCloseTo(20100.5, 0);
    await act(async () => { settle(); await Promise.resolve(); await Promise.resolve(); });
    // home to the foot, at its verse's middle, as Follow lands
    expect(get().cam.camRef.current.x).toBeCloseTo(20100.5, 6);
    expect(get().sel.detail, 'the verse it set out from is open again').toMatchObject({ kind: 'verse', verse: 20100 });
    expect(get().journey.back(), 'home: nothing further back').toBeNull();
    // Forward walks on the way it went
    let on = null;
    act(() => { on = get().journey.forward(); });
    expect(on).toMatchObject({ verse: 100 });
    await act(async () => { settle(); await Promise.resolve(); await Promise.resolve(); });
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 100 });
    expect(get().cam.focusRef.current.arc, 'and its thread in is chosen again').toBe(0);
  });

  it('Follow back along the same line is a step back, not a longer trail', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    get().cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
    act(() => { get().sel.followThread(get().sel.detail); });
    expect(verses(get().journey.stack)).toEqual([20100, 100]);
    // the same line again, from the end the reader now stands on, followed back
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    act(() => { get().sel.followThread(Object.assign({}, get().sel.detail, { far: 'to' })); });
    expect(verses(get().journey.stack)).toEqual([20100]);
    expect(get().journey.trail.stops).toHaveLength(2);
  });

  it('three hops: Back walks them one by one, each a fly; a stop with open null closes the panel', async () => {
    const { get } = mount();
    const closed = vi.fn();
    get().journey.connect({ openPanel: get().sel.openPanel, closePanel: closed });
    act(() => {
      get().journey.push({ verse: 9000, label: 'a', open: null }, { verse: 15551, label: 'home', open: null });
      get().journey.push({ verse: 300, label: 'b' });
    });
    expect(verses(get().journey.stack)).toEqual([15551, 9000, 300]);
    act(() => { get().journey.back(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // each stop's verse at its middle, where a foot stands
    expect(get().cam.camRef.current.x).toBe(9000.5);
    expect(closed).toHaveBeenCalledTimes(1);
    act(() => { get().journey.back(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(get().cam.camRef.current.x).toBe(15551.5);
    expect(verses(get().journey.stack)).toEqual([15551]);
  });

  it('a Back whose fly is cut short puts the reader back; one the trail moved on from does not', async () => {
    let land = null;
    const flyTo = vi.fn(() => new Promise((r) => { land = r; }));
    const { result } = renderHook(() => useJourney({ flyTo }));
    act(() => { result.current.push({ verse: 300, label: 'b' }, { verse: 5, label: 'home' }); });
    act(() => { result.current.push({ verse: 900, label: 'c' }); });
    act(() => { result.current.back(); });
    expect(verses(result.current.stack)).toEqual([5, 300]);
    await act(async () => { land(false); await Promise.resolve(); await Promise.resolve(); });
    expect(verses(result.current.stack), 'a finger took the camera: Back still goes to 300').toEqual([5, 300, 900]);
    act(() => { result.current.back(); });
    const first = land;
    act(() => { result.current.back(); });
    await act(async () => { first(false); await Promise.resolve(); await Promise.resolve(); });
    expect(verses(result.current.stack), 'a second Back went on: the first fly gives nothing back').toEqual([5]);
  });

  it("a crumb is one flight to its stop, and the stop's own panel is what opens", async () => {
    const trail = (j) => {
      j.push({ verse: 200, label: 'b', open: { mode: 'verse', verse: 200 } }, { verse: 100, label: 'a', open: { mode: 'verse', verse: 100 } });
      j.push({ verse: 300, label: 'c', open: { mode: 'verse', verse: 300 } });
      j.push({ verse: 400, label: 'd', open: { mode: 'verse', verse: 400 } });
    };
    const flying = vi.fn(() => Promise.resolve(true));
    const one = renderHook(() => useJourney({ flyTo: flying }));
    const open = vi.fn(() => true);
    one.result.current.connect({ openPanel: open });
    act(() => { trail(one.result.current); });
    expect(verses(one.result.current.stack)).toEqual([100, 200, 300, 400]);
    const two = one.result.current.trail.stops.find((s) => s.verse === 200);
    act(() => { one.result.current.go(two.id); });
    expect(flying, 'one flight, straight there').toHaveBeenCalledTimes(1);
    expect(flying).toHaveBeenLastCalledWith({ x: 200.5 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(verses(one.result.current.stack)).toEqual([100, 200]);
    expect(verses(one.result.current.path.stops), 'the way on stays ahead in the bar').toEqual([100, 200, 300, 400]);
    expect(open).toHaveBeenLastCalledWith({ mode: 'verse', verse: 200 });
  });

  it('away from the stop (a line tapped on the way, the panel closed), Back goes back to it first', async () => {
    const flying = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useJourney({ flyTo: flying }));
    const open = vi.fn(() => true);
    let showing = true;
    result.current.connect({ openPanel: open, isAt: () => showing });
    act(() => { result.current.push({ verse: 300, label: 'b', open: { mode: 'verse', verse: 300 }, via: { arc: 4 } }, { verse: 5, label: 'a', open: { mode: 'verse', verse: 5 } }); });
    showing = false;
    let to = null;
    act(() => { to = result.current.back(); });
    expect(to, 'the stop the reader is at').toMatchObject({ verse: 300 });
    expect(verses(result.current.stack), 'the trail does not move').toEqual([5, 300]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(open, 'its panel opens again, its thread in named').toHaveBeenLastCalledWith({ mode: 'verse', verse: 300, via: { arc: 4 } });
    showing = true;
    act(() => { to = result.current.back(); });
    expect(to).toMatchObject({ verse: 5 });
  });
});

/* Corbin, 2026-10-22: "tapping a line then having it fully zoom all the way out sucks, takes me away
   from the verse I was zoomed into. Would be ok if I had a button that only showed in that moment
   that allowed me to return to my zoomed in vision." */
describe('the way back: a choice that zooms far out keeps the camera it left', () => {
  it('a wide thread chosen at the verse zoom offers the way back, and taking it lands where the reader was', async () => {
    const { get } = mount();
    expect(get().sel.returnTo).toBeNull();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    const r = get().sel.returnTo;
    expect(r).toMatchObject({ x: 15551, ppv: 8, y: 0 });
    expect(r.label).toMatch(/^Genesis 1:\d+$/);
    expect(get().cam.camRef.current.ppv, 'PRECONDITION: the frame zoomed out').toBeLessThan(8 / 1.5);
    // a second choice keeps the first way back: the verse the reader was zoomed into
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    expect(get().sel.returnTo).toBe(r);
    await act(async () => { get().sel.returnBack(); });
    expect(get().sel.returnTo).toBeNull();
    expect(get().cam.camRef.current.x).toBeCloseTo(15551, 3);
    expect(get().cam.camRef.current.ppv).toBeCloseTo(8, 6);
  });

  it('a short thread that keeps the zoom offers nothing; taking the camera drops the offer', () => {
    const { get } = mount();
    get().cam.camRef.current = { x: 250, ppv: 8, total: TOTAL, y: 0 };
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    expect(get().sel.returnTo).toBeNull();
    get().cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    expect(get().sel.returnTo).not.toBeNull();
    act(() => { get().sel.dropReturn(); });
    expect(get().sel.returnTo).toBeNull();
  });
});
