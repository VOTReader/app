/* A "+n" pill's fan, as the selection drives it (use-web-selection.js, exits.js): what a hover and a
   tap on a pill or on a fan's chip light, ask and open. The overlay's frame is a stand-in holding the
   tap targets the overlay would draw (hitOverlay reads them), so these run without a canvas.

   The laws: a pill hover raises the fan and lights nothing (the lit set stays as it was; the
   prototype lit the whole column, 239 legs in gold); a chip hover lights exactly the chip's lines;
   leaving puts back the lit set and the ask from before; nothing else's ink changes (C3: no range, no
   chosen line, so nothing recedes). A pill tap opens today's group panel and keeps the fan up while
   that card is open; a fan chip's tap opens the exits panel without moving the camera. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection, PANEL_MODES, panelOf } from './use-web-selection.js';
import { useJourney } from './use-journey.js';
import { useFrameScheduler } from './use-frame-scheduler.js';

let rafQueue = [], clock = 0;
const tick = (ms = 16) => {
  clock += ms;
  const q = rafQueue; rafQueue = [];
  act(() => { for (const cb of q) cb(clock); });
};
beforeEach(() => {
  rafQueue = []; clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TOTAL = 31102;
/* One book of one chapter and five threads standing on verses 100-110 (a "+n" pill's cell). */
const graph = () => ({
  total: TOTAL, count: 5, buckets: [{ off: 0, len: 5, off20: 5, off10: 5, segments: 8, chunks: [] }],
  books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 101, 102, 105, 3000]), to: new Uint16Array([20100, 25000, 9000, 30000, 3100]),
  votes: new Int16Array([30, 20, 12, 8, 40]),
  votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
});

const CELL = { lo: 100, hi: 110 };
/** The overlay's tap targets, device px = CSS px (DPR 1): a pill, and two chips of its fan. */
const PILL = { kind: 'pill', ids: [0, 1, 2, 3], label: 'Genesis 1:101-111', cell: CELL };
const CHIP_A = { kind: 'exit', ids: [0, 1], label: 'Genesis', key: 'c100-110:r:0-0', side: 'right', lo: 0, hi: 0, count: 2,
  cell: CELL, area: { label: 'Genesis 1:101-111', lo: 100, hi: 110 } };
const CHIP_B = { kind: 'exit', ids: [3], label: 'Genesis', key: 'c100-110:l:0-0', side: 'left', lo: 0, hi: 0, count: 1,
  cell: CELL, area: { label: 'Genesis 1:101-111', lo: 100, hi: 110 } };
const box = (x0, y0, hit) => ({ x0, y0, x1: x0 + 44, y1: y0 + 44, hit });
const overlay = (extra = {}) => ({
  v: { W: 800, H: 600, DPR: 1 },
  hits: [box(380, 500, PILL), box(420, 300, CHIP_A), box(300, 300, CHIP_B)],
  fanZone: { x0: 290, x1: 480, y0: 290, y1: 560 },
  ...extra,
});
const AT = { pill: [400, 520], chipA: [440, 320], chipB: [320, 320], ground: [400, 400], empty: [700, 100] };

function mount({ withCell = true } = {}) {
  const g = graph();
  const api = { current: /** @type {any} */ (null) };
  const flyTo = vi.fn();
  function Web() {
    const frames = useFrameScheduler();
    const modeRef = React.useRef('canonical');
    const camera = useWebCamera({ graph: g, density: 'famous', modeRef, schedule: frames.schedule, animate: frames.animate });
    if (!camera.camRef.current) {
      camera.viewRef.current = { W: 800, H: 600, DPR: 1 };
      camera.camRef.current = { x: 105, ppv: 40, total: TOTAL, y: 0 };
    }
    const journey = useJourney({ flyTo });
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(null);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(/** @type {any} */ (null));
    if (!overlayFrameRef.current) {
      const fs = overlay();
      if (!withCell) fs.hits = [box(380, 500, { ...PILL, cell: undefined })];
      overlayFrameRef.current = fs;
    }
    const railOpts = React.useCallback(() => ({}), []);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef,
      camRef: camera.camRef, viewRef: camera.viewRef, focusRef: camera.focusRef, viewFor: camera.viewFor, yFrameFor: camera.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo, journey, schedule: frames.schedule,
      setAnnounce: () => {},
    });
    api.current = { cam: camera, sel, overlayFrameRef };
    return null;
  }
  render(<Web />);
  const get = () => api.current;
  const focus = () => get().cam.focusRef.current;
  /** @param {number[]} p  CSS px */
  const hover = (p) => { act(() => { get().sel.handlersRef.current.hover(p[0], p[1]); }); tick(); };
  /** @param {number[]} p  CSS px */
  const tap = (p) => { act(() => { get().sel.handlersRef.current.tap(p[0], p[1]); }); tick(); };
  const leave = () => { act(() => { get().sel.handlersRef.current.leave(); }); tick(); };
  return { g, get, focus, hover, tap, leave, flyTo };
}

const ids = (lit) => (lit ? Array.from(lit) : null);

describe("the fan's hover (PC): a pill raises it, a chip lights its lines, nothing else's ink changes", () => {
  it('a pill hover sets the ask (its cell) and leaves the lit set as it was', () => {
    const w = mount();
    act(() => { w.get().sel.lightThreads([4]); });
    w.hover(AT.pill);
    expect(w.focus().ask).toMatchObject({ cell: CELL, side: null, books: null, hover: true });
    expect(ids(w.focus().lit), 'the pill lights nothing').toEqual([4]);
    expect(w.focus().range).toBe(null);
    expect(w.focus().arc).toBe(-1);
  });

  it("a chip hover lights exactly the chip's lines, and keeps the fan's cell asked", () => {
    const w = mount();
    w.hover(AT.pill);
    w.hover(AT.chipA);
    expect(ids(w.focus().lit)).toEqual([0, 1]);
    expect(w.focus().ask).toMatchObject({ cell: CELL, side: 'right', books: [0, 0], hover: true });
    w.hover(AT.chipB);
    expect(ids(w.focus().lit)).toEqual([3]);
  });

  it('leaving puts back the lit set and the ask from before', () => {
    const w = mount();
    act(() => { w.get().sel.lightThreads([4]); });
    const before = w.focus();
    w.hover(AT.chipA);
    expect(ids(w.focus().lit)).toEqual([0, 1]);
    w.leave();
    expect(ids(w.focus().lit)).toEqual([4]);
    expect(w.focus().ask || null).toBe(before.ask || null);
    // and from a pill
    w.hover(AT.pill);
    w.hover(AT.empty);
    expect(w.focus().ask || null).toBe(null);
    expect(ids(w.focus().lit)).toEqual([4]);
  });

  it("no other thread's ink changes (C3): no range, no chosen line, no hover, at every step", () => {
    const w = mount();
    for (const at of [AT.pill, AT.chipA, AT.ground, AT.chipB]) {
      w.hover(at);
      const f = w.focus();
      expect(f.range, String(at)).toBe(null);
      expect(f.arc, String(at)).toBe(-1);
      expect(f.hover, String(at)).toBe(-1);
      expect(f.hoverProphecy, String(at)).toBe(-1);
    }
  });

  it("on the fan's ground the fan stays up: the pointer on its way from the pill to the chips", () => {
    const w = mount();
    w.hover(AT.pill);
    w.hover(AT.ground);
    expect(w.focus().ask).toMatchObject({ cell: CELL, hover: true });
  });
});

describe('the taps: a pill opens its group as today, with the fan up; a chip opens its lines', () => {
  it("a pill tap opens today's group panel and keeps the fan up while that card is open", () => {
    const w = mount();
    w.tap(AT.pill);
    expect(w.get().sel.choices.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(w.get().sel.detail).toBe(null);
    expect(w.focus().ask).toMatchObject({ cell: CELL, side: null, books: null });
    expect(w.focus().ask.hover).toBeFalsy();
    expect(w.focus().lit, 'the group lights nothing on its own').toBe(null);
    // the panel closes: the fan goes
    act(() => { w.get().sel.closeCards(); });
    expect(w.focus().ask || null).toBe(null);
  });

  it('the fan goes on the empty-space clear, and when another card replaces the group', () => {
    const w = mount();
    w.tap(AT.pill);
    w.tap(AT.empty);
    expect(w.focus().ask || null).toBe(null);
    w.tap(AT.pill);
    act(() => { w.get().sel.openPanel({ mode: 'connection', arc: 4 }); });
    expect(w.focus().ask || null).toBe(null);
  });

  it('a pill with no cell opens its group as before, with no fan', () => {
    const w = mount({ withCell: false });
    w.tap(AT.pill);
    expect(w.get().sel.choices.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(w.focus().ask || null).toBe(null);
  });

  it("off the chips' targets a leg of the fan is picked as today: the line itself", () => {
    const w = mount();
    w.tap(AT.pill);
    // thread 0 stands on verse 100: its foot at (100.5 - 105) x 40 + 400 = 220 CSS px, its leg near
    // vertical up from the baseline, away from every target the overlay drew
    const base = w.get().cam.viewFor().base;
    w.tap([220, base - 60]);
    expect(w.get().sel.detail).toMatchObject({ kind: 'arc', index: 0 });
    expect(w.focus().ask || null, 'a line chosen lets the fan go').toBe(null);
  });

  it("a fan chip's tap opens the exits panel with its lines, keeps the fan, and moves no camera", () => {
    const w = mount();
    w.tap(AT.pill);
    const cam = { ...w.get().cam.camRef.current };
    w.tap(AT.chipA);
    const d = w.get().sel.detail;
    expect(d).toMatchObject({ kind: 'exits', key: CHIP_A.key, side: 'right', books: [0, 0], cell: CELL });
    expect(Array.from(d.ids)).toEqual([0, 1]);
    expect(d.ids.length, "the chip's count is the panel's").toBe(CHIP_A.count);
    expect(ids(w.focus().lit)).toEqual([0, 1]);
    expect(w.focus().ask).toMatchObject({ cell: CELL, side: 'right', books: [0, 0] });
    expect(w.focus().range).toBe(null);
    expect(w.flyTo).not.toHaveBeenCalled();
    expect(w.get().cam.camRef.current).toEqual(cam);
    expect(panelOf(d, null).spec).toMatchObject({ mode: 'exits', key: CHIP_A.key });
    expect(PANEL_MODES.exits).toBe(true);
  });
});
