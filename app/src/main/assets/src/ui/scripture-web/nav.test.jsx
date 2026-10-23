/* The navigation stream (w3): the double-tap's way back, the eased flyTo, the journey, the
   go-to and the doors in. The camera, the journey and the selection are wired as the screen wires
   them (contracts.test.jsx's harness), with a frame loop that runs on demand. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection } from './use-web-selection.js';
import { useJourney, pushed, JOURNEY_CAP } from './use-journey.js';
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

describe('the journey (A3): a breadcrumb trail whose top is where the reader is', () => {
  const at = (verse) => ({ verse, label: 'v' + verse });
  const verses = (s) => s.map((e) => e.verse);

  it('the first arrival seeds where the reader set out from; the same place twice is one crumb', () => {
    expect(verses(pushed([], at(100), at(5)))).toEqual([5, 100]);
    expect(verses(pushed([], at(100)))).toEqual([100]);
    expect(verses(pushed([], at(100), at(100))), 'set out from where it arrives: no crumb').toEqual([100]);
    expect(verses(pushed([at(5), at(100)], at(100)))).toEqual([5, 100]);
    expect(verses(pushed([at(5), at(100)], at(300), at(100)))).toEqual([5, 100, 300]);
  });
  it('walking back the way it came steps back; home again empties the trail', () => {
    expect(verses(pushed([at(5), at(100), at(300)], at(100)))).toEqual([5, 100]);
    expect(verses(pushed([at(5), at(100)], at(5)))).toEqual([]);
  });
  it('keeps the last 24', () => {
    let s = [];
    for (let i = 0; i < 40; i++) s = pushed(s, at(i * 10));
    expect(s).toHaveLength(JOURNEY_CAP);
    expect(s[s.length - 1].verse).toBe(390);
  });
  it('ignores what is not a place', () => {
    const s = [at(5), at(100)];
    expect(pushed(s, /** @type {any} */ (null))).toBe(s);
    expect(pushed(s, /** @type {any} */ ({ verse: NaN, label: '' }))).toBe(s);
  });

  it('Follow leaves a trail home: Back flies there, eased, and the line opens again from that end', async () => {
    const { get } = mount({ loop: true });
    get().journey.connect({ openPanel: get().sel.openPanel, closePanel: get().sel.closePanel }); // as useGoTo does
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    expect(get().sel.detail.far).toBe('from');
    act(() => { get().sel.followThread(get().sel.detail); });
    settle();
    // centred on the foot, at its verse's middle (the panel stream's Follow)
    expect(get().cam.camRef.current.x).toBeCloseTo(100.5, 6);
    expect(verses(get().journey.stack), 'the near foot, then the far').toEqual([20100, 100]);
    expect(get().sel.detail.far).toBe('to');
    let to = null;
    act(() => { to = get().journey.back(); });
    expect(to).toMatchObject({ verse: 20100 });
    expect(get().journey.stack, 'home: nothing further back').toEqual([]);
    tick();
    expect(get().cam.camRef.current.x, 'on its way, not jumped').not.toBeCloseTo(20100.5, 0);
    await act(async () => { settle(); await Promise.resolve(); await Promise.resolve(); });
    // home to the foot, at its verse's middle, as Follow lands
    expect(get().cam.camRef.current.x).toBeCloseTo(20100.5, 6);
    expect(get().sel.detail, 'the line is open again').toMatchObject({ kind: 'arc', index: 0 });
    expect(get().sel.detail.far, 'and its Follow names the end it now faces away from').toBe('from');
    expect(get().journey.back()).toBeNull();
  });

  it('Follow back along the same line is a step back, not a longer trail', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    // opening the line framed all 20,000 verses of it (the panel stream's frameFound), a zoom at
    // which the camera's clamp holds it off both feet; the reader zooms back in to walk it
    get().cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
    act(() => { get().sel.followThread(get().sel.detail); });
    act(() => { get().sel.followThread(get().sel.detail); });
    expect(get().cam.camRef.current.x).toBeCloseTo(20100.5, 6);
    expect(get().journey.stack).toEqual([]);
  });

  it('three hops: Back walks them one by one, each a fly; an entry with open null closes the panel', async () => {
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
    // each crumb's verse at its middle, where a foot stands
    expect(get().cam.camRef.current.x).toBe(9000.5);
    expect(closed).toHaveBeenCalledTimes(1);
    act(() => { get().journey.back(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(get().cam.camRef.current.x).toBe(15551.5);
    expect(get().journey.stack).toEqual([]);
  });

  it('a Back whose fly is cut short gives the crumb back; one the trail moved on from does not', async () => {
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
    expect(result.current.stack, 'a second Back went on: the first fly gives nothing back').toEqual([]);
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
