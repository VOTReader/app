/* The shared contracts the Scripture Web's feature streams build on (CONTRACTS.md, the spine,
   2026-10-18): the camera's flyTo, the panel API, the lit set, the journey, the overlay's tap
   targets and the go-to's slot. Each stub does today's behaviour; these pin the signatures and the
   mapping onto today's cards, so a stream that fills one in keeps what the others call. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection, panelOf } from './use-web-selection.js';
import { useJourney } from './use-journey.js';
import { useGoTo, routeOverlayHit } from './goto.jsx';
import { hitOverlay } from './overlay-renderer.js';
import { railFrame } from './rail-renderer.js';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { verseToX, fitPPV } from '../../utils/scripture-web/geometry.js';

const TOTAL = 31102;
// one chapter (the whole canon, as the screen's Nearby fixture) and two threads
const graph = () => ({
  total: TOTAL, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
  books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
  votEdges: [], prophecy: [{ a: 5, b: 9000 }], votLinks: [], chunkSize: 256,
});

/** The camera, the journey and the selection wired as the screen wires them. */
function mount({ withCamera = true, mode = 'canonical', personal = null, rails = null } = {}) {
  const g = graph();
  const schedule = vi.fn();
  const setAnnounce = vi.fn();
  const hook = renderHook(() => {
    const modeRef = React.useRef(mode);
    const cam = useWebCamera({ graph: g, density: 'famous', modeRef, schedule });
    const journey = useJourney();
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(personal);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(null);
    const railOpts = React.useCallback(() => rails || {}, []);
    const sel = useWebSelection({
      graph: g, mode, density: 'famous', showUnderlay: false, resumeRef,
      camRef: cam.camRef, viewRef: cam.viewRef, focusRef: cam.focusRef, viewFor: cam.viewFor, yFrameFor: cam.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: cam.flyTo, journey, schedule, setAnnounce,
    });
    return { cam, sel, journey, overlayFrameRef };
  });
  const { cam } = hook.result.current;
  cam.viewRef.current = { W: 800, H: 360, DPR: 1 };
  // zoomed in (8 px a verse), so a centre is not clamped back to the canon's middle
  if (withCamera) cam.camRef.current = { x: 15551, ppv: 8, total: TOTAL, y: 0 };
  return { hook, g, schedule, setAnnounce, get: () => hook.result.current };
}

describe('flyTo (CONTRACTS.md section 3): the stub is instant', () => {
  it('frames an x range across the whole canvas, resolves true and draws a frame', async () => {
    const { get, schedule } = mount();
    const { camRef, flyTo } = get().cam;
    await expect(flyTo({ x0: 100, x1: 200 })).resolves.toBe(true);
    const c = camRef.current;
    expect(c.ppv).toBeCloseTo(8, 6);
    expect(verseToX(c, 800, 100)).toBeCloseTo(0, 6);
    expect(verseToX(c, 800, 200)).toBeCloseTo(800, 6);
    expect(schedule).toHaveBeenCalled();
  });

  it('frames inside the canvas area: the panel inset (opts, else panelInsetRef) is left out on the right', async () => {
    const { get } = mount();
    const { camRef, flyTo, panelInsetRef } = get().cam;
    await flyTo({ x0: 100, x1: 200 }, { insetRight: 200 });
    expect(verseToX(camRef.current, 800, 100)).toBeCloseTo(0, 6);
    expect(verseToX(camRef.current, 800, 200)).toBeCloseTo(600, 6);
    expect(panelInsetRef.current).toEqual({ right: 0, bottom: 0 });
    panelInsetRef.current.right = 300;
    await flyTo({ x0: 1000, x1: 1100 });
    expect(verseToX(camRef.current, 800, 1000)).toBeCloseTo(0, 6);
    expect(verseToX(camRef.current, 800, 1100)).toBeCloseTo(500, 6);
  });

  it('centres an x at the same zoom, or at a zoom given as a multiple of fit', async () => {
    const { get } = mount();
    const { camRef, flyTo } = get().cam;
    await flyTo({ x: 20100 });
    expect(camRef.current).toMatchObject({ x: 20100, ppv: 8 });
    await flyTo({ x: 9000, zoom: 4 });
    expect(camRef.current.ppv).toBeCloseTo(fitPPV(camRef.current, 800) * 4, 9);
    expect(camRef.current.x).toBe(9000);
  });

  it('resolves false with nowhere to go, and cancelFly is safe to call with nothing running', async () => {
    const bare = mount({ withCamera: false });
    await expect(bare.get().cam.flyTo({ x: 10 })).resolves.toBe(false);
    const { get } = mount();
    await expect(get().cam.flyTo(/** @type {any} */ ({}))).resolves.toBe(false);
    expect(() => get().cam.cancelFly()).not.toThrow();
  });
});

describe('the panel API (CONTRACTS.md section 6): each mode opens today\'s card', () => {
  it('connection opens the connection sheet and chooses the thread', () => {
    const { get } = mount();
    let opened;
    act(() => { opened = get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    expect(opened).toBe(true);
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1, from: 200, to: 300 });
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1 });
    expect(get().cam.focusRef.current).toMatchObject({ arc: 1, prophecy: false, range: null, hover: -1, lit: null });
  });

  it('verse opens the verse sheet and keeps the verse lit as a range', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 100 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 100 });
    expect(get().sel.panel.spec).toEqual({ mode: 'verse', verse: 100 });
    expect(get().cam.focusRef.current.range).toEqual([100, 100]);
  });

  it('group with ids opens the chooser (its rows), with nothing chosen while it asks', () => {
    const { get, setAnnounce } = mount();
    act(() => { get().sel.openPanel({ mode: 'group', ids: [1, 0, 7], label: 'Genesis 1' }); });
    expect(get().sel.detail).toBeNull();
    expect(get().sel.choices.map((c) => c.index)).toEqual([1, 0]);
    expect(get().sel.panel.spec).toMatchObject({ mode: 'group', ids: [1, 0] });
    expect(get().cam.focusRef.current.arc).toBe(-1);
    expect(setAnnounce).toHaveBeenLastCalledWith(expect.stringMatching(/2/));
  });

  it('group with only a chapter opens the chapter sheet', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'group', ids: [], label: 'Genesis 1', chapter: 0 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'chapter', chapterIndex: 0 });
    expect(get().sel.panel.spec).toMatchObject({ mode: 'group', chapter: 0, label: 'Genesis 1' });
  });

  it('a letter, a prophecy pair and an unknown arc have no card yet: nothing opens', () => {
    const { get } = mount();
    for (const spec of [{ mode: 'letter', letterKey: 'two/the-wide-path' }, { mode: 'connection', arc: 0, prophecy: true },
      { mode: 'connection', arc: 9 }, { mode: 'verse', verse: TOTAL }, { mode: 'group', ids: [], label: '' }]) {
      let opened;
      act(() => { opened = get().sel.openPanel(/** @type {any} */ (spec)); });
      expect(opened, JSON.stringify(spec)).toBe(false);
    }
    expect(get().sel.panel).toBeNull();
  });

  it('closePanel is the one close: the card goes and the focus is let go whole', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    act(() => { get().sel.lightThreads([0, 1]); });
    expect(get().sel.closePanel).toBe(get().sel.closeCards);
    act(() => { get().sel.closePanel(); });
    expect(get().sel.panel).toBeNull();
    expect(get().cam.focusRef.current).toMatchObject({ arc: -1, range: null, range2: null, lit: null, litKey: '' });
  });
});

describe('panelOf: today\'s open card in the panel\'s terms', () => {
  it('maps every card kind, the chooser, and nothing open', () => {
    expect(panelOf({ kind: 'arc', index: 3 }, null).spec).toEqual({ mode: 'connection', arc: 3 });
    expect(panelOf({ kind: 'link', index: 2 }, null).spec).toEqual({ mode: 'connection', arc: 2, myWeb: 'link' });
    expect(panelOf({ kind: 'underlay', index: 4 }, null).spec).toEqual({ mode: 'connection', arc: 4, myWeb: 'underlay' });
    expect(panelOf({ kind: 'verse', verse: 12 }, null).spec).toEqual({ mode: 'verse', verse: 12 });
    expect(panelOf({ kind: 'chapter', chapterIndex: 5, book: { title: 'Isaiah' }, chapter: 53 }, null).spec)
      .toEqual({ mode: 'group', ids: [], label: 'Isaiah 53', chapter: 5 });
    expect(panelOf({ kind: 'bundle', label: 'Isaiah 53' }, null).spec).toEqual({ mode: 'group', ids: [], label: 'Isaiah 53' });
    expect(panelOf(null, [{ index: 4 }, { index: 9 }]).spec).toEqual({ mode: 'group', ids: [4, 9], label: '' });
    expect(panelOf(null, null)).toBeNull();
    expect(panelOf(null, [])).toBeNull();
  });

  /* GL review 2026-10-18 (finding 6): a chooser row for a prophecy pair that is no OpenBible arc
     reads index -1, and the group's ids are arc ids: -1 handed on is an id no reader can index. */
  it('a group names only OpenBible arcs: a chooser row for a lone prophecy pair is in its rows, not its ids', () => {
    const rows = [{ index: 4 }, { index: -1, prophecy: true, prophecyIndex: 2 }, { index: 9 }];
    const p = panelOf(null, rows);
    expect(p.spec).toEqual({ mode: 'group', ids: [4, 9], label: '' });
    expect(p.info).toBe(rows);
    // a chooser of lone pairs only: no arc to name, the rows still say what it holds
    expect(panelOf(null, [{ index: -1, prophecy: true, prophecyIndex: 0 }]).spec).toEqual({ mode: 'group', ids: [], label: '' });
    // the card of one: the pair by its index, flagged (the panel's connection spec)
    expect(panelOf({ kind: 'arc', index: -1, prophecy: true, prophecyIndex: 2 }, null).spec)
      .toEqual({ mode: 'connection', arc: 2, prophecy: true });
  });
});

describe('the lit set (CONTRACTS.md section 2): lightThreads is its one writer', () => {
  it('lights ids over the chosen thread and hover, and a new choice clears it', () => {
    const { get, schedule } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    schedule.mockClear();
    act(() => { get().sel.lightThreads([0, 1]); });
    const f = get().cam.focusRef.current;
    expect(f.arc).toBe(1);
    expect(Array.from(f.lit)).toEqual([0, 1]);
    expect(f.litKey).not.toBe('');
    expect(schedule).toHaveBeenCalled();
    expect(get().cam.viewFor()).toMatchObject({ focusArc: 1, focusProphecy: -1, litKey: f.litKey });
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 200 }); });
    expect(get().cam.focusRef.current).toMatchObject({ lit: null, litKey: '' });
    act(() => { get().sel.lightThreads([1]); });
    act(() => { get().sel.lightThreads(null); });
    expect(get().cam.focusRef.current).toMatchObject({ lit: null, litKey: '', range: [200, 200] });
  });
});

describe("My Web's focus names its list (fix-review #4, #11)", () => {
  it("a chosen Timothy thread is chosen in its own list, a reader's link in theirs", () => {
    const { get } = mount();
    act(() => { get().sel.commitFound({ kind: 'underlay', index: 3, source: { label: 'Genesis 1:1' }, target: { label: 'A letter' } }); });
    expect(get().cam.focusRef.current).toMatchObject({ arc: 3, underlay: true, hover: -1, hoverUnderlay: false });
    act(() => { get().sel.commitFound({ kind: 'link', index: 1, source: { label: 'Genesis 1:1' }, target: { label: 'A letter' } }); });
    expect(get().cam.focusRef.current).toMatchObject({ arc: 1, underlay: false });
  });
  it("a reader's link under the pointer is the hover, and dropping the hover lets go of either list", () => {
    vi.stubGlobal('requestAnimationFrame', (f) => { f(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    try {
      // one plumb link from mid-canon on the Bible rail to mid-rail on the Volumes
      const votRail = buildVotRail([{ volKey: 'one', label: 'Volume One', items: Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, title: 'L' + i })) }]);
      const W = 800, H = 360, base = 300;
      const links = {
        count: 1, aRail: new Uint8Array([0]), bRail: new Uint8Array([1]),
        aPos: new Float32Array([TOTAL / 2]), bPos: new Float32Array([votRail.total / 2 - 0.5]), kind: new Uint8Array([2]),
        records: [{ id: 'r1', source: { type: 'letter', label: 'A letter' }, target: { type: 'letter', label: 'Another' } }],
      };
      const rails = { width: W, height: H, DPR: 1, base, votRail, verseTotal: TOTAL,
        verseX: (v) => (v / TOTAL) * W, votX: (q) => (q / votRail.total) * W };
      const { get, schedule } = mount({ mode: 'personal', personal: { graph: links, underlay: null, votRail }, rails });
      const frame = railFrame({ H, DPR: 1 }, base);
      schedule.mockClear();
      act(() => { get().sel.handlersRef.current.hover(W / 2, (frame.topY + frame.bottomY) / 2); });
      expect(get().cam.focusRef.current).toMatchObject({ hover: 0, hoverUnderlay: false });
      expect(schedule).toHaveBeenCalled();
      get().cam.focusRef.current.hoverUnderlay = true;
      act(() => { get().sel.dropHover(); });
      expect(get().cam.focusRef.current).toMatchObject({ hover: -1, hoverUnderlay: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the journey (CONTRACTS.md section 7): the stub keeps nothing', () => {
  it('is empty, stable across renders, and reached through the selection hook', () => {
    const { hook, get } = mount();
    const j = get().journey;
    expect(j.stack).toEqual([]);
    j.push({ verse: 100, label: 'Genesis 1:101' });
    expect(j.stack).toEqual([]);
    expect(j.back()).toBeNull();
    expect(() => j.clear()).not.toThrow();
    hook.rerender();
    expect(get().journey).toBe(j);
    expect(get().sel.journey).toBe(j);
  });

  it('Follow still lands on the far foot at the same zoom, through flyTo, and offers the way back', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    const info = get().sel.detail;
    expect(info.far).toBe('from'); // the camera sits nearer verse 20100
    act(() => { get().sel.followThread(info); });
    expect(get().cam.camRef.current).toMatchObject({ x: 100, ppv: 8 });
    expect(get().sel.detail.far).toBe('to');
  });
});

describe('the overlay\'s tap targets (CONTRACTS.md section 4)', () => {
  const book = { kind: 'book', book: 0 };
  const pill = { kind: 'pill', ids: [1], label: 'Genesis 1' };

  it('hitOverlay is null with nothing recorded (today), and finds the top box in device px when there is', () => {
    expect(hitOverlay(null, 10, 10)).toBeNull();
    expect(hitOverlay(/** @type {any} */ ({ v: { DPR: 2 }, hits: [] }), 10, 10)).toBeNull();
    const fs = /** @type {any} */ ({ v: { DPR: 2 }, hits: [
      { x0: 0, y0: 0, x1: 100, y1: 40, hit: book },
      { x0: 20, y0: 0, x1: 60, y1: 40, hit: pill },
    ] });
    expect(hitOverlay(fs, 15, 10)).toBe(pill); // css 15 is device 30, inside both: the later box wins
    expect(hitOverlay(fs, 5, 10)).toBe(book);
    expect(hitOverlay(fs, 5, 30)).toBeNull();
  });

  it('routeOverlayHit routes nothing yet, so a tap on a recorded target still picks the line under it', () => {
    expect(routeOverlayHit(/** @type {any} */ (book), /** @type {any} */ ({}))).toBe(false);
    expect(routeOverlayHit(null, null)).toBe(false);
    const { get } = mount();
    get().overlayFrameRef.current = { v: { DPR: 1 }, hits: [{ x0: 0, y0: 0, x1: 800, y1: 360, hit: book }] };
    // empty sky: the tap clears, as it always has
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    act(() => { get().sel.handlersRef.current.tap(400, 5); });
    expect(get().sel.detail).toBeNull();
  });
});

describe('the go-to (CONTRACTS.md sections 8 and 9)', () => {
  it('fills the header slot with nothing today, the same object every render', () => {
    const { result, rerender } = renderHook(() => useGoTo({ start: { verse: { bookId: 'john', chapter: 3, verse: 16 } } }));
    const first = result.current;
    expect(first).toMatchObject({ button: null, box: null, isOpen: false });
    expect(() => { first.open('John 3:16'); first.close(); }).not.toThrow();
    rerender();
    expect(result.current).toBe(first);
  });
});
