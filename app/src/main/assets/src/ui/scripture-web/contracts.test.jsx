/* The shared contracts the Scripture Web's feature streams build on (CONTRACTS.md, the spine,
   2026-10-18): the camera's flyTo, the panel API, the lit set, the journey, the overlay's tap
   targets and the go-to's slot. Each stub does today's behaviour; these pin the signatures and the
   mapping onto today's cards, so a stream that fills one in keeps what the others call. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection, panelOf, PANEL_MODES, CHOOSER_MOST, isTie } from './use-web-selection.js';
import { pickThreads } from '../../utils/scripture-web/pick.js';
import { useJourney } from './use-journey.js';
import { useGoTo, routeOverlayHit } from './goto.jsx';
import { hitOverlay } from './overlay-renderer.js';
import { railFrame } from './rail-renderer.js';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { verseToX, fitPPV, clampCamera, END_MARGIN } from '../../utils/scripture-web/geometry.js';

const TOTAL = 31102;
// one chapter (the whole canon, as the screen's Nearby fixture) and two threads
const graph = () => ({
  total: TOTAL, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
  books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
  votEdges: [], prophecy: [{ a: 5, b: 9000 }], votLinks: [], chunkSize: 256,
});

/** The fixture with more threads after its two, each [from, to, votes]. */
const graphWith = (more) => {
  const g = graph();
  const all = [[100, 20100, 7], [200, 300, 30], ...more];
  g.count = all.length;
  g.buckets = [{ off: 0, len: all.length, off20: all.length, off10: all.length, segments: 8, chunks: [[100, 20100]] }];
  g.from = new Uint16Array(all.map((a) => a[0]));
  g.to = new Uint16Array(all.map((a) => a[1]));
  g.votes = new Int16Array(all.map((a) => a[2]));
  return g;
};

/** The camera, the journey and the selection wired as the screen wires them. */
function mount({ withCamera = true, mode = 'canonical', personal = null, rails = null, topbar = null, insetFor = undefined, make = graph, animate = undefined, underlay = false } = {}) {
  const g = make();
  const schedule = vi.fn();
  const setAnnounce = vi.fn();
  // `underlay`: Timothy's notes shown at the mount; hook.rerender({ showUnderlay }) flips them
  const hook = renderHook((/** @type {{ showUnderlay: boolean }} */ p) => {
    const modeRef = React.useRef(mode);
    const topbarRef = React.useRef(topbar);
    const cam = useWebCamera({ graph: g, density: 'famous', modeRef, schedule, topbarRef, animate });
    const journey = useJourney();
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(personal);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(null);
    const railOpts = React.useCallback(() => rails || {}, []);
    const sel = useWebSelection({
      graph: g, mode, density: 'famous', showUnderlay: !!(p && p.showUnderlay), resumeRef,
      camRef: cam.camRef, viewRef: cam.viewRef, focusRef: cam.focusRef, viewFor: cam.viewFor, yFrameFor: cam.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: cam.flyTo, journey, schedule, setAnnounce,
      insetFor,
    });
    return { cam, sel, journey, overlayFrameRef };
  }, { initialProps: { showUnderlay: underlay } });
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

  it("group with ids carries the chapter it was opened at, for the chooser's zoom row (w3 review)", () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'group', ids: [1, 0], label: '', chapter: 0 }); });
    expect(get().sel.panel.spec).toMatchObject({ mode: 'group', ids: [1, 0], chapter: 0 });
    expect(get().sel.choiceChapter).toBe(0);
    act(() => { get().sel.openPanel({ mode: 'group', ids: [1, 0], label: '' }); });
    expect(get().sel.panel.spec).not.toHaveProperty('chapter');
    expect(get().sel.choiceChapter).toBe(-1);
  });

  it('group with only a chapter opens the chapter sheet', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'group', ids: [], label: 'Genesis 1', chapter: 0 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'chapter', chapterIndex: 0 });
    expect(get().sel.panel.spec).toMatchObject({ mode: 'group', chapter: 0, label: 'Genesis 1' });
  });

  it('a prophecy pair opens as a connection, chosen as the pair (no OpenBible arc joins it here)', () => {
    const { get } = mount();
    let opened;
    act(() => { opened = get().sel.openPanel({ mode: 'connection', arc: 0, prophecy: true }); });
    expect(opened).toBe(true);
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: -1, prophecyIndex: 0, prophecy: true, from: 5, to: 9000 });
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 0, prophecy: true });
    expect(get().cam.focusRef.current).toMatchObject({ arc: 0, prophecy: true });
  });

  it('a letter opens with the verses it cites; one no curated edge carries opens nothing', () => {
    const { get, g } = mount();
    g.votEdges.push({ v: 300, key: 'two/the-wide-path', title: 'The Wide Path', volKey: 'two', letterId: 'the-wide-path', at: [{ p: 2 }] },
      { v: 100, key: 'two/the-wide-path', title: 'The Wide Path', volKey: 'two', letterId: 'the-wide-path', at: [{ p: 5 }] });
    let opened;
    act(() => { opened = get().sel.openPanel({ mode: 'letter', letterKey: 'two/the-wide-path' }); });
    expect(opened).toBe(true);
    expect(get().sel.detail).toMatchObject({ kind: 'letter', letterKey: 'two/the-wide-path', title: 'The Wide Path', verses: [100, 300] });
    expect(get().sel.panel.spec).toEqual({ mode: 'letter', letterKey: 'two/the-wide-path' });
    act(() => { opened = get().sel.openPanel({ mode: 'letter', letterKey: 'two/no-such-letter' }); });
    expect(opened).toBe(false);
  });

  it('an unknown arc, an out-of-range verse and an empty group still open nothing', () => {
    const { get } = mount();
    for (const spec of [{ mode: 'connection', arc: 9 }, { mode: 'connection', arc: 3, prophecy: true },
      { mode: 'verse', verse: TOTAL }, { mode: 'group', ids: [], label: '' }]) {
      let opened;
      act(() => { opened = get().sel.openPanel(/** @type {any} */ (spec)); });
      expect(opened, JSON.stringify(spec)).toBe(false);
    }
    expect(get().sel.panel).toBeNull();
  });

  it("PANEL_MODES says which modes openPanel opens: the reader's doors offer only what opens (screen-routes.jsx)", () => {
    // letter mode is in (the panel stream), so every mode opens and the reader's "See this letter's
    // scriptures" door appears; the case holds each flag to the behaviour, on a fixture that has the
    // letter's citations (a key no curated edge carries opens nothing, in any mode's terms)
    const valid = {
      connection: { mode: 'connection', arc: 1 }, verse: { mode: 'verse', verse: 100 },
      group: { mode: 'group', ids: [1], label: '' }, letter: { mode: 'letter', letterKey: 'two/the-wide-path' },
    };
    expect(Object.keys(PANEL_MODES).sort()).toEqual(Object.keys(valid).sort());
    expect(PANEL_MODES.letter, 'letter mode landed with the panel stream').toBe(true);
    const withLetter = () => {
      const g = graph();
      g.votEdges.push({ v: 100, key: 'two/the-wide-path', title: 'The Wide Path', volKey: 'two', letterId: 'the-wide-path', at: [{ p: 5 }] });
      return g;
    };
    for (const [mode, spec] of Object.entries(valid)) {
      const { get } = mount({ make: withLetter });
      let opened;
      act(() => { opened = get().sel.openPanel(/** @type {any} */ (spec)); });
      expect(opened, mode).toBe(PANEL_MODES[mode]);
    }
  });

  it('opts.back keeps the open card as the new one\'s parent (the panel\'s way back)', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const first = get().sel.detail;
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 100 }, { back: true }); });
    expect(get().sel.detail.parent).toBe(first);
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 200 }); });
    expect(get().sel.detail.parent).toBeUndefined();
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

  it('a prophecy pair with no arc names the pair; a letter names its key', () => {
    expect(panelOf({ kind: 'arc', index: -1, prophecyIndex: 2 }, null).spec).toEqual({ mode: 'connection', arc: 2, prophecy: true });
    expect(panelOf({ kind: 'letter', letterKey: 'three/i-am-risen' }, null).spec).toEqual({ mode: 'letter', letterKey: 'three/i-am-risen' });
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
    // a new choice replaces the set: verse mode lights the verse's own threads (arc 1, 200-300)
    const v = get().cam.focusRef.current;
    expect(Array.from(v.lit)).toEqual([1]);
    expect(v.litKey).not.toBe(f.litKey);
    act(() => { get().sel.lightThreads([1]); });
    act(() => { get().sel.lightThreads(null); });
    expect(get().cam.focusRef.current).toMatchObject({ lit: null, litKey: '', range: [200, 200] });
  });
});

describe("My Web's focus names its list (fix-review #4, #11)", () => {
  /* w4 interaction hunt: Timothy's notes turned off with one of their threads open left the card
     ("TIMOTHY'S NOTE Genesis 35:10 ...") and the focus on a thread no longer drawn */
  it("Timothy's notes turned off: a card on one of their threads closes, the focus lets go; a reader's link stays", () => {
    const { get, hook } = mount({ underlay: true });
    act(() => { get().sel.commitFound({ kind: 'underlay', index: 3, source: { label: 'Genesis 1:1' }, target: { label: 'A letter' } }); });
    expect(get().sel.detail, 'PRECONDITION: the note is open').toMatchObject({ kind: 'underlay' });
    act(() => { hook.rerender({ showUnderlay: false }); });
    expect(get().sel.detail).toBeNull();
    expect(get().cam.focusRef.current).toMatchObject({ arc: -1, underlay: false });
    act(() => { hook.rerender({ showUnderlay: true }); });
    act(() => { get().sel.commitFound({ kind: 'link', index: 1, source: { label: 'Genesis 1:1' }, target: { label: 'A letter' } }); });
    act(() => { hook.rerender({ showUnderlay: false }); });
    expect(get().sel.detail, "the reader's own link is still drawn: it stays open").toMatchObject({ kind: 'link', index: 1 });
  });

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

describe("camFor: My Web splits its two cameras at the gap's midline (fix-review #7)", () => {
  it("reads the rails as the draw places them, the top chrome's inset included", () => {
    const topbar = { offsetTop: 0, offsetHeight: 140 };
    const { get } = mount({ mode: 'personal', topbar });
    const { cam } = get();
    cam.viewRef.current = { W: 1600, H: 900, DPR: 1 };
    const bible = cam.camRef.current, vols = { x: 5, ppv: 10, total: 10, y: 0 };
    cam.camVRef.current = vols;
    const base = cam.frame().base;
    const drawn = railFrame({ H: 900, DPR: 1, inset: 140 }, base), bare = railFrame({ H: 900, DPR: 1 }, base);
    const mid = (drawn.topY + drawn.bottomY) / 2, midBare = (bare.topY + bare.bottomY) / 2;
    expect(mid).toBeGreaterThan(midBare + 10);    // the inset moves the split: the test can tell
    expect(cam.camFor(mid - 1)).toBe(vols);
    expect(cam.camFor(mid + 1)).toBe(bible);
    // between the two midlines: the Volumes half as drawn, not the bare frame's Bible half
    expect(cam.camFor((mid + midBare) / 2)).toBe(vols);
  });
});

describe('the journey (CONTRACTS.md section 7): a real trail since the navigation stream (w3)', () => {
  // was "the stub keeps nothing" (the spine's stub); the law it pinned is now the real trail's:
  // the stack re-renders when it changes, and the panel still reaches it through the selection hook
  it('keeps the trail, re-renders on it, and is reached through the selection hook', () => {
    const { hook, get } = mount();
    const j = get().journey;
    expect(j.stack).toEqual([]);
    expect(j.back()).toBeNull();
    act(() => { j.push({ verse: 100, label: 'Genesis 1:101' }, { verse: 5, label: 'Genesis 1:6' }); });
    expect(get().journey.stack.map((e) => e.verse)).toEqual([5, 100]);
    expect(get().sel.journey).toBe(get().journey);
    const now = get().journey;
    hook.rerender();
    expect(get().journey, 'identity-stable while the trail is').toBe(now);
    act(() => { get().journey.clear(); });
    expect(get().journey.stack).toEqual([]);
  });

  it('Follow still lands on the far foot at the same zoom, through flyTo, and offers the way back', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const info = get().sel.detail;
    expect(info.far).toBe('from'); // the camera sat nearer verse 300 when it opened
    const ppv = get().cam.camRef.current.ppv; // the zoom the opening framed
    act(() => { get().sel.followThread(info); });
    // the camera centres the far foot, which stands at the verse's middle (w3 review, round 2)
    expect(get().cam.camRef.current.x).toBeCloseTo(200.5, 6);
    expect(get().cam.camRef.current.ppv).toBe(ppv);
    expect(get().sel.detail.far).toBe('to');
  });
});

describe('the panel frames what it opens (spec section 3)', () => {
  it('a connection is framed inside the canvas area the panel leaves, both feet in, 10 % margins', () => {
    const { get } = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const c = get().cam.camRef.current;
    const a = verseToX(c, 800, 200), b = verseToX(c, 800, 300 + 1);
    expect(a).toBeGreaterThan(0.09 * 500);
    expect(b).toBeLessThan(500 - 0.09 * 500);
    expect(a).toBeCloseTo(500 - b, 0); // centred in the 500 px area, not the 800 px canvas
  });

  it('a verse already in the area stays put; one under the panel is brought out, same zoom', () => {
    const { get } = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
    const before = { ...get().cam.camRef.current };
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 15540 }); }); // 84 px left of centre: in the area
    expect(get().cam.camRef.current).toMatchObject({ x: before.x, ppv: before.ppv });
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 15580 }); }); // 232 px right of centre: under the panel
    const c = get().cam.camRef.current;
    expect(c.ppv).toBe(before.ppv);
    const x = verseToX(c, 800, 15580.5);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(500);
  });

  it('a verse in the area\'s outer tenth is brought in too: its threads fan out on both sides', () => {
    // the w3 PC shot: John 3:16 opened 24 px left of the panel and every thread it lit ran under it
    const right = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
    act(() => { right.get().sel.openPanel({ mode: 'verse', verse: 15558 }); }); // 460 of 500: the right tenth
    let c = right.get().cam.camRef.current;
    let x = verseToX(c, 800, 15558.5);
    expect(x).toBeGreaterThan(0.1 * 500);
    expect(x).toBeLessThan(0.9 * 500);
    const left = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
    act(() => { left.get().sel.openPanel({ mode: 'verse', verse: 15506 }); }); // 44 of 500: the left tenth
    c = left.get().cam.camRef.current;
    x = verseToX(c, 800, 15506.5);
    expect(x).toBeGreaterThan(0.1 * 500);
    expect(x).toBeLessThan(0.9 * 500);
  });
});

/* w3 review (major): the camera's clamp keeps the VIEW inside the canon, so near the canon's end
   flyTo stopped before what the panel opened reached the canvas area's centre. John 3:16 opened
   with its foot at 888 of a 960 px area, and anything in Revelation sat under the panel. The PC
   frame here is the review's, 1600x900 (DPR 2): the docked panel covers 640 CSS px, 40 %. */
describe("the panel brings what it opens out from under itself, even at the canon's end", () => {
  const W = 3200, AREA = 960, FIT = W / TOTAL;
  const pc = (cam, more = []) => {
    const m = mount({ insetFor: () => ({ right: 640, bottom: 0 }), make: () => graphWith(more) });
    m.get().cam.viewRef.current = { W, H: 1800, DPR: 2 };
    m.get().cam.camRef.current = Object.assign({ total: TOTAL, y: 0 }, cam);
    return m;
  };
  // where verse v's foot stands across the canvas area: 0 its left edge, 1 the panel's
  const across = (m, v) => verseToX(m.get().cam.camRef.current, W, v + 0.5) / 2 / AREA;

  // where the canon's end stands in the canvas area, CSS px: the area's outer tenth inside its right
  // edge at most (the clamp's slack and END_MARGIN, no further)
  const areaEnd = (m) => verseToX(m.get().cam.camRef.current, W, TOTAL) / 2;

  /* w3 review, round 2 (major): this case once pinned the cure that was worse than the defect. To
     centre Revelation 21:4 from the overview the camera dived to 489x (65 device px a verse), and
     Follow kept that zoom: a curtain of vertical legs, no lit thread's way readable. The dive was
     bounded (the reader's zoom x 4) while the camera's clamp kept the VIEW inside the canon. That
     clamp now leaves the panel room (geometry.clampCamera's right slack: the canon's end stops the
     outer tenth inside the canvas area's right edge), so nothing dives: the reader's zoom is kept,
     and the bound's cases read that law now. */
  it("a verse in Revelation 21 opened at the overview stands in the area at the overview's zoom", () => {
    const REV_21_4 = TOTAL - 45;
    const m = pc({ x: TOTAL / 2, ppv: FIT });
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: REV_21_4 }); });
    expect(m.get().cam.camRef.current.ppv).toBeCloseTo(FIT, 12);
    const f = across(m, REV_21_4);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThanOrEqual(0.9);
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
  });

  it("a verse in Revelation stands in the area at the reader's zoom, the canon's end at the area's edge", () => {
    const REV = TOTAL - 300;
    const m = pc({ x: 18000, ppv: 2 });
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: REV }); });
    const f = across(m, REV);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.9); // 300 verses from the end at 1 CSS px a verse: 0.69
    expect(m.get().cam.camRef.current.ppv).toBe(2);
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
  });

  it('John 3:16 at the zoom the review measured is centred in the area, not left at 888 of 960', () => {
    const JOHN_3_16 = 26137;
    const m = pc({ x: 24000, ppv: 0.286 });
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: JOHN_3_16 }); });
    expect(across(m, JOHN_3_16)).toBeCloseTo(0.5, 2);
    expect(m.get().cam.camRef.current.ppv).toBe(0.286); // the reader's own zoom
  });

  it('Isaiah to Revelation 13 frames whole now the clamp leaves the panel room; Follow keeps the far foot in', () => {
    // the clamp once kept this frame from the area's centre, and only the near foot was kept in
    const m = pc({ x: 18000, ppv: 2 }, [[18000, TOTAL - 300, 50]]);
    act(() => { m.get().sel.openPanel({ mode: 'connection', arc: 2 }); });
    const info = m.get().sel.detail;
    expect(info.far).toBe('to');
    const near = across(m, 18000);
    expect(near).toBeGreaterThan(0.1);
    expect(near).toBeLessThan(0.9);
    const whole = across(m, TOTAL - 300);
    expect(whole).toBeGreaterThan(0.1);
    expect(whole).toBeLessThanOrEqual(0.9);
    act(() => { m.get().sel.followThread(info); });
    const far = across(m, TOTAL - 300);
    expect(far).toBeGreaterThan(0.1);
    expect(far).toBeLessThanOrEqual(0.9); // short of the area's centre at the canon's end, clear of the panel
    expect(m.get().cam.camRef.current.ppv).toBeLessThanOrEqual(8);
  });

  it('a thread wider than the area at fit, tapped deep in Revelation, keeps the tapped foot in view', () => {
    // Genesis 3 to Revelation 13 with the reader at Revelation 12: the whole frame needs less than
    // fit, and fit put the foot the reader was looking at under the panel
    const m = pc({ x: 30800, ppv: 4 }, [[60, 30900, 90]]);
    act(() => { m.get().sel.openPanel({ mode: 'connection', arc: 2 }); });
    expect(m.get().sel.detail.far).toBe('from');
    const f = across(m, 30900);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.9);
    expect(m.get().cam.camRef.current.ppv).toBeGreaterThanOrEqual(4); // never zoomed out from the reader
  });

  it("a row's Follow to Revelation lands in the area as well", () => {
    const m = pc({ x: 18000, ppv: 2 }, [[18000, TOTAL - 300, 50]]);
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: 18000 }); });
    act(() => { m.get().sel.followRow({ index: 2, hereVerse: 18000, otherVerse: TOTAL - 300 }); });
    const f = across(m, TOTAL - 300);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.9);
  });

  /* w3 review, round 2: Follow handed bringIn the bare verse index, the left edge of the verse's
     cell, while the foot stands at its middle (v + 0.5, as frameFound has it). At deep zoom the
     followed foot landed half a verse right of the area's centre: 15 CSS px at 30 a verse. */
  it("Follow and a row's Follow centre the far foot itself at deep zoom", () => {
    const m = pc({ x: 5000, ppv: 60 }, [[5000, 9000, 40]]);
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: 5000 }); });
    act(() => { m.get().sel.followRow({ index: 2, hereVerse: 5000, otherVerse: 9000 }); });
    expect(m.get().cam.camRef.current.ppv).toBe(60);
    expect(across(m, 9000)).toBeCloseTo(0.5, 2);
    // the connection's own Follow walks it back, as deep
    const info = m.get().sel.detail;
    expect(info.far).toBe('from');
    act(() => { m.get().sel.followThread(info); });
    expect(m.get().cam.camRef.current.ppv).toBe(60);
    expect(across(m, 5000)).toBeCloseTo(0.5, 2);
  });

  /* Once a KNOWN GAP (w3 review, round 2): the camera's clamp (geometry.js clampCamera, called by
     flyTo and the gestures) held the VIEW's right edge at the canon's end, so with the panel docked
     the canon's last 640 / ppv verses could never stand in the canvas area. The clamp now has a
     right slack of what the panel covers, and these were it.fails. Each read "0.1 < f < 0.9" of the
     area. With the canon's end stopped AT the area's edge they could only read f < 1, and the w4
     phone review found Revelation 22:16's foot on the panel's border; the slack now adds the area's
     outer tenth (END_MARGIN, connectionFrame's margin), so they read their first intent again:
     inside 0.9 of the area, the canon's end the outer tenth inside it, the reader's zoom kept.
     Genesis 1:1 stands at the left edge, which the panel never covers. */
  it("Revelation 22:21 opened with the panel open stands in the area at the reader's zoom", () => {
    const m = pc({ x: 18000, ppv: 2 });
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: TOTAL - 1 }); });
    const f = across(m, TOTAL - 1);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThanOrEqual(0.9);
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
    expect(m.get().cam.camRef.current.ppv).toBe(2);
  });

  it("Follow to Revelation 22:21 with the panel open lands in the area at the reader's zoom", () => {
    const m = pc({ x: 18000, ppv: 2 }, [[18000, TOTAL - 1, 50]]);
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: 18000 }); });
    act(() => { m.get().sel.followRow({ index: 2, hereVerse: 18000, otherVerse: TOTAL - 1 }); });
    const f = across(m, TOTAL - 1);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThanOrEqual(0.9);
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
    expect(m.get().cam.camRef.current.ppv).toBe(2);
  });

  it('the camera clamp leaves the panel room only while it covers the right: closing it eases the camera back inside the view', () => {
    const m = pc({ x: 18000, ppv: 2 });
    const cam = m.get().cam;
    act(() => { m.get().sel.openPanel({ mode: 'verse', verse: TOTAL - 1 }); });
    cam.panelInsetRef.current = { right: 640, bottom: 0 }; // the panel rendered (usePanelInset)
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
    // nothing to settle while the panel still covers the right
    cam.settleInset();
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
    // closed: the view's own edge is the bound again (no frame loop here, so the ease is a jump)
    cam.panelInsetRef.current = { right: 0, bottom: 0 };
    cam.settleInset();
    expect(verseToX(cam.camRef.current, W, TOTAL)).toBeCloseTo(W, 6);
    expect(cam.camRef.current.ppv).toBe(2);
  });

  it("Follow to Revelation 22:13 lands in the area at the reader's zoom", () => {
    const m = pc({ x: 18000, ppv: 2 }, [[18000, TOTAL - 9, 50]]);
    act(() => { m.get().sel.openPanel({ mode: 'connection', arc: 2 }); });
    const info = m.get().sel.detail;
    m.get().cam.camRef.current = Object.assign({}, m.get().cam.camRef.current, { x: 18000, ppv: 2 });
    act(() => { m.get().sel.followThread(info); });
    const f = across(m, TOTAL - 9);
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThanOrEqual(0.9);
    expect(areaEnd(m)).toBeCloseTo(0.9 * AREA, 6);
    expect(m.get().cam.camRef.current.ppv).toBe(2);
  });
});

/* w4 item 5: My Web's two cameras take the canon's panel-aware clamp (ac8bc709a). Through w3 slackFor
   gave My Web's rails none, so with the panel docked on a PC the Bible rail's last right / ppv verses
   and the Volumes rail's last collections could never stand in the canvas area: they stayed under the
   panel at any zoom. The same frame as the canon's case: 1600x900 at DPR 2, the panel 640 CSS px. */
describe("My Web's two cameras leave the docked panel room at the rails' ends (w4)", () => {
  // the Volumes rail in rail units (21 equal slots of 100), so 4x fit is under its own ceiling
  const W = 3200, SPAN = 2100;
  const myWeb = () => {
    const m = mount({ mode: 'personal' });
    const { cam } = m.get();
    cam.viewRef.current = { W, H: 1800, DPR: 2 };
    cam.camRef.current = { x: 15551, ppv: 4 * (W / TOTAL), total: TOTAL, y: 0 };
    cam.camVRef.current = { x: SPAN / 2, ppv: 4 * (W / SPAN), total: SPAN, y: 0 };
    return m;
  };

  it('slackFor gives both rails what the docked panel covers, device px; a bottom sheet or no panel gives none', () => {
    const { cam } = myWeb().get();
    const bible = cam.camRef.current, vols = cam.camVRef.current;
    expect(cam.slackFor(bible)).toBe(0);
    expect(cam.slackFor(vols)).toBe(0);
    cam.panelInsetRef.current = { right: 640, bottom: 0 };
    expect(cam.slackFor(bible)).toBe(1280);
    expect(cam.slackFor(vols)).toBe(1280);
    // a camera the screen does not hold has no slack
    expect(cam.slackFor({ x: 1, ppv: 1, total: 2, y: 0 })).toBe(0);
    cam.panelInsetRef.current = { right: 0, bottom: 300 };
    expect(cam.slackFor(bible)).toBe(0);
    expect(cam.slackFor(vols)).toBe(0);
  });

  // w4 integration: the docked end stands the canvas area's outer tenth inside its right edge
  // (geometry END_MARGIN, the phone stream's law for the canon's ends), not on the panel's border
  it("with the panel docked each rail's end can stand the area's outer tenth inside the canvas area's right edge; closing it settles both back inside the view", () => {
    const { cam } = myWeb().get();
    const bible = cam.camRef.current, vols = cam.camVRef.current;
    cam.panelInsetRef.current = { right: 640, bottom: 0 };
    // the gestures clamp with slackFor (ScriptureWebScreen's clampWithSlack): pan both rails to their ends
    bible.x = TOTAL; vols.x = SPAN;
    clampCamera(bible, W, 5000, undefined, cam.slackFor(bible));
    clampCamera(vols, W, 5000, undefined, cam.slackFor(vols));
    const docked = (W - 1280) * (1 - END_MARGIN);
    expect(verseToX(bible, W, TOTAL)).toBeCloseTo(docked, 6);
    expect(verseToX(vols, W, SPAN)).toBeCloseTo(docked, 6);
    // still docked: nothing to settle
    cam.settleInset();
    expect(verseToX(cam.camRef.current, W, TOTAL)).toBeCloseTo(docked, 6);
    expect(verseToX(cam.camVRef.current, W, SPAN)).toBeCloseTo(docked, 6);
    // closed: the view's own edge is each rail's bound again, at the same zoom (no frame loop here)
    cam.panelInsetRef.current = { right: 0, bottom: 0 };
    cam.settleInset();
    expect(verseToX(cam.camRef.current, W, TOTAL)).toBeCloseTo(W, 6);
    expect(verseToX(cam.camVRef.current, W, SPAN)).toBeCloseTo(W, 6);
    expect(cam.camRef.current.ppv).toBeCloseTo(4 * (W / TOTAL), 9);
    expect(cam.camVRef.current.ppv).toBeCloseTo(4 * (W / SPAN), 9);
  });
});

/* w4 fix round 2 (review, minor 5): closing the panel at a rail's end snapped both rails back inside
   the view. settleInset clamped My Web's Volumes camera at once ("steps back inside at once"), and
   the Bible camera's flyTo clamped its first frame with the shrunk slack, so its "ease" was a jump
   too. Now the slack itself eases from the panel's old edge to the view's, and each camera is
   clamped with it every frame: a rail's end glides back. Sampled frame by frame through a frame loop's
   animate (16 ms a frame), as use-frame-scheduler runs it. */
describe("closing the docked panel at a rail's end eases both rails back inside the view (w4 fix round 2)", () => {
  const W = 3200, SPAN = 2100, PANEL = 640, DPR = 2;
  /** A frame loop's one motion, run by hand: a newer motion ends the one running. */
  const loop = () => {
    const motions = [];
    const animate = (step, onEnd) => {
      const prev = motions.find((m) => m.live);
      const m = { step, onEnd, live: true };
      motions.push(m);
      if (prev) { prev.live = false; if (prev.onEnd) prev.onEnd(false); }
      return () => { if (m.live) { m.live = false; if (m.onEnd) m.onEnd(false); } };
    };
    /** One frame: false once nothing is moving. */
    const frame = (dt = 16) => {
      const m = motions.find((x) => x.live);
      if (!m) return false;
      if (m.step(dt) === false) { m.live = false; if (m.onEnd) m.onEnd(true); }
      return true;
    };
    return { animate, frame };
  };
  const atEnds = (mode) => {
    const l = loop();
    const m = mount({ mode, animate: l.animate });
    const { cam } = m.get();
    cam.viewRef.current = { W, H: 1800, DPR };
    cam.camRef.current = { x: 15551, ppv: 4 * (W / TOTAL), total: TOTAL, y: 0 };
    if (mode === 'personal') cam.camVRef.current = { x: SPAN / 2, ppv: 4 * (W / SPAN), total: SPAN, y: 0 };
    cam.panelInsetRef.current = { right: PANEL, bottom: 0 };
    const cams = mode === 'personal' ? [[cam.camRef.current, TOTAL], [cam.camVRef.current, SPAN]] : [[cam.camRef.current, TOTAL]];
    for (const [c, total] of cams) { c.x = total; clampCamera(c, W, 5000, undefined, cam.slackFor(c)); }
    return { cam, l, ends: () => cams.map(([c, total]) => verseToX(c, W, total)) };
  };
  for (const mode of ['personal', 'canonical']) {
    it(`${mode === 'personal' ? 'My Web, both rails' : 'the canon'}: the end glides from the panel's old edge to the view's over about 250 ms, no frame a jump`, () => {
      const { cam, l, ends } = atEnds(mode);
      // w4 integration: docked, the end stands END_MARGIN of the canvas area inside its edge
      const edge = (W - PANEL * DPR) * (1 - END_MARGIN);
      for (const x of ends()) expect(x).toBeCloseTo(edge, 6);
      cam.panelInsetRef.current = { right: 0, bottom: 0 };   // usePanelInset wrote the shrunk inset, then:
      cam.settleInset(PANEL);
      // nothing moves until the frame loop runs
      for (const x of ends()) expect(x).toBeCloseTo(edge, 6);
      const seen = [ends()];
      let frames = 0;
      while (l.frame(16) && frames < 100) { frames++; seen.push(ends()); }
      const dist = W - edge;
      seen[0].forEach((_, r) => {
        const xs = seen.map((e) => e[r]);
        const steps = xs.slice(1).map((x, i) => x - xs[i]);
        // it moves outward only, each frame a part of the way (an ease in and out over 250 ms peaks at
        // 3 x 16 / 250, about a fifth; the jump was all of it), the first one far smaller
        for (const d of steps) expect(d).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.max(...steps), `rail ${r}: ${xs.map((x) => Math.round(x)).join(',')}`).toBeLessThan(0.25 * dist);
        expect(steps[0]).toBeLessThan(0.05 * dist);
        // and the last one too: an ease out, no snap as the panel's END_MARGIN lets go (w4
        // integration: the eased slack kept the margin to its last frame, then the end jumped 320 px)
        expect(steps[steps.length - 1], `rail ${r}: ${xs.map((x) => Math.round(x)).join(',')}`).toBeLessThan(0.05 * dist);
        // and lands at the view's own edge
        expect(xs[xs.length - 1]).toBeCloseTo(W, 6);
      });
      // about 250 ms of frames, then the motion ends
      expect(frames).toBeGreaterThanOrEqual(12);
      expect(frames).toBeLessThanOrEqual(20);
      // the zoom is untouched
      expect(cam.camRef.current.ppv).toBeCloseTo(4 * (W / TOTAL), 9);
    });
  }

  it('a camera already inside the new bound is left where it stands, and no motion starts', () => {
    const { cam, l } = atEnds('personal');
    const bible = cam.camRef.current, vols = cam.camVRef.current;
    bible.x = 15551; vols.x = SPAN / 2;
    cam.panelInsetRef.current = { right: 0, bottom: 0 };
    cam.settleInset(PANEL);
    expect(l.frame()).toBe(false);
    expect(bible.x).toBe(15551);
    expect(vols.x).toBe(SPAN / 2);
  });
});

describe('a resting mouse over the open panel hovers nothing under it (spec section 3)', () => {
  // The gesture surface is the root, so a mouse resting on the docked panel (its text, its padding)
  // reached the web's hover: the chip named the chapter under the panel and the thread under it lit
  // (the w3 PC shot, the chip "Romans 9" over Matthew while the pointer read the credit).
  it('no chip and no hovered thread under the panel; the canvas area still hovers, and leaving it drops the chip', () => {
    const queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const flush = () => act(() => { while (queue.length) queue.shift()(0); });
    try {
      const { get } = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
      const y = get().cam.viewFor().base + 6; // the ruler: a chapter under any x of the canon
      // closed, the point the panel will cover hovers the web
      get().sel.handlersRef.current.hover(700, y); flush();
      expect(get().sel.tip).toMatchObject({ info: { kind: 'chapter' } });
      act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
      // open: over the panel, nothing
      get().sel.handlersRef.current.hover(700, y); flush();
      expect(get().sel.tip).toBeNull();
      expect(get().cam.focusRef.current.hover).toBe(-1);
      // the canvas area it leaves still hovers
      get().sel.handlersRef.current.hover(100, y); flush();
      expect(get().sel.tip).toMatchObject({ info: { kind: 'chapter' } });
      // and moving from there onto the panel drops the chip
      act(() => { get().sel.handlersRef.current.hover(520, y); }); flush();
      expect(get().sel.tip).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the mouse leaving the web, or resting on the chrome, hovers nothing (gestures.js leave)', () => {
  it('leave drops the chip and the hovered thread, and a second leave is a no-op', () => {
    const queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const flush = () => act(() => { while (queue.length) queue.shift()(0); });
    try {
      const { get } = mount();
      const y = get().cam.viewFor().base + 6;
      get().sel.handlersRef.current.hover(100, y); flush();
      expect(get().sel.tip).toMatchObject({ info: { kind: 'chapter' } });
      act(() => { get().sel.handlersRef.current.leave(); }); flush();
      expect(get().sel.tip).toBeNull();
      expect(get().cam.focusRef.current.hover).toBe(-1);
      act(() => { get().sel.handlersRef.current.leave(); }); flush();
      expect(get().sel.tip).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a row\'s Follow and the zoom row (the panel stream)', () => {
  it('followRow swaps to that connection and goes to the end the row names', () => {
    const { get } = mount();
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 200 }); });
    act(() => { get().sel.followRow({ index: 1, hereVerse: 200, otherVerse: 300 }); });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1, far: 'from' });
    expect(get().cam.camRef.current.x).toBeCloseTo(300.5, 6); // the foot, at the verse's middle
    expect(get().cam.focusRef.current).toMatchObject({ arc: 1, lit: null });
    // a row that names no thread does nothing
    act(() => { get().sel.followRow({ index: 99, hereVerse: 0, otherVerse: 1 }); });
    expect(get().sel.detail).toMatchObject({ index: 1 });
  });

  it('zoomTo closes the panel and fits the chapter across the canvas, ignoring the inset', () => {
    const { get } = mount({ insetFor: () => ({ right: 300, bottom: 0 }) });
    act(() => { get().sel.openPanel({ mode: 'group', ids: [1, 0], label: '' }); });
    expect(get().sel.choices).toHaveLength(2);
    act(() => { get().sel.zoomTo(0); });
    expect(get().sel.choices).toBeNull();
    expect(get().sel.detail).toBeNull();
    expect(get().cam.focusRef.current).toMatchObject({ arc: -1, range: null, lit: null });
    act(() => { get().sel.zoomTo(99); }); // no such chapter: nothing moves, nothing throws
  });
});

/** The fixture cut into chapters of 100 verses (chapter c holds verses 100c to 100c + 99). */
const graphChapters = (more) => () => {
  const g = graphWith(more);
  const n = Math.ceil(TOTAL / 100);
  g.chapters = Array.from({ length: n }, (_, c) => [0, c + 1, c * 100, Math.min(100, TOTAL - c * 100)]);
  g.chapterOfVerse = Uint16Array.from({ length: TOTAL }, (_, v) => Math.floor(v / 100));
  return g;
};

/* w3 review, round 2: the chooser's "Zoom to" took the chapter under the tap's x, and a tap high
   on long threads is over a chapter none of them touches: zooming there sent them all off screen. */
describe("the chooser's Zoom to, from a tap", () => {
  const cam = { x: 2520, ppv: 0.2 };
  /** Tap down the column at x until the chooser opens; y -1 when it never did. Every tap is made
   *  from the same untouched frame: a tap that finds one thread opens it and frames it (frameFound
   *  flies the camera), and while it is chosen only its lit threads are targets (pick.js
   *  focusedPickFilter, A1), so the scan closes it and puts the camera back before the next tap. */
  const tapAt = (more, x, ys) => {
    const m = mount({ make: graphChapters(more) });
    for (const y of ys) {
      act(() => { m.get().sel.closeCards(); });
      m.get().cam.camRef.current = Object.assign({ total: TOTAL, y: 0 }, cam);
      act(() => { m.get().sel.handlersRef.current.tap(x, y); });
      if (m.get().sel.choices) return { m, y };
    }
    return { m, y: -1 };
  };

  it('a tap high over a chapter the threads do not touch zooms where their feet stand, the nearer first', () => {
    // two threads a few verses apart, from chapter 10 to chapter 39, crossing high over chapter 25
    const { m, y } = tapAt([[1050, 3990, 10], [1060, 3980, 9]], 400, Array.from({ length: 300 }, (_, i) => 2 + i));
    expect(y, 'the tap found the crossing').toBeGreaterThan(0);
    expect(m.get().cam.viewFor().base - y, 'high over the baseline').toBeGreaterThan(100);
    expect(m.get().sel.choices.map((c) => c.index).sort()).toEqual([2, 3]);
    // under the tap is chapter 25; chapters 10 and 39 hold two feet each, and 39 is the nearer
    expect(m.get().sel.choiceChapter).toBe(39);
  });

  /* w3 review, round 2: the tap asked the pick for 4 threads, so a dense crossing always read "4
     threads close together" and "Strongest first" sorted only the 4 nearest. */
  it('a tap lists up to CHOOSER_MOST threads under it, and says when the list is the nearest of more', () => {
    const fan = (n) => Array.from({ length: n }, (_, k) => [1050 + k, 3990 - k, 10 + k]);
    const ys = Array.from({ length: 300 }, (_, i) => 2 + i);
    const six = tapAt(fan(6), 400, ys).m.get().sel;
    expect(six.choices).toHaveLength(6);
    expect(six.choiceCut).toBe(false);
    const ten = tapAt(fan(10), 400, ys).m.get().sel;
    expect(CHOOSER_MOST).toBe(8);
    expect(ten.choices).toHaveLength(CHOOSER_MOST);
    expect(ten.choiceCut).toBe(true);
  });

  it('a tap down among the feet zooms to the chapter under it', () => {
    // the feet stand at the end of chapter 39; the tap is a fraction of a verse into chapter 40
    const x = (4000.3 - cam.x) * cam.ppv + 400;
    const base = mount().get().cam.viewFor().base;
    const { m, y } = tapAt([[1050, 3999, 10], [1060, 3998, 9]], x, [base - 12, base - 8, base - 5]);
    expect(y, 'the tap opened the chooser').toBeGreaterThan(0);
    expect(m.get().sel.choiceChapter).toBe(40);
  });
});

/* w4 device check (finding 7): on a dense field under a fingertip a second thread was within 8 px
   of almost every tap, so a dozen taps at the overview, 30x and 40x all opened "The 8 nearest
   threads" and none chose its line. A tap clearly nearer one line chooses it; a real tie asks.
   C5 holds: every line is still tappable, nearer to it than to any other, or from the chooser. */
describe('a tap clearly nearest one line chooses it; a tie asks (w4)', () => {
  it('isTie: a second within 8 px is a tie unless the nearest is twice as near and 3 px nearer', () => {
    expect(isTie(1, 3, 1), '2 px apart').toBe(true);
    expect(isTie(0, 2, 1), 'on one line, the other 2 px off').toBe(true);
    expect(isTie(1, 5, 1)).toBe(false);
    expect(isTie(2, 9, 1), 'no second within 8 px').toBe(false);
    expect(isTie(3 * 2.6, 7 * 2.6, 2.6), 'device px on a phone: 3 and 7 CSS px').toBe(false);
    expect(isTie(4 * 2.6, 7 * 2.6, 2.6), '4 and 7: not twice as near').toBe(true);
  });

  it('down a column over two threads: a tap clearly nearer one chooses it outright, a tie opens the chooser', () => {
    // two threads 40 verses apart at each foot, their crowns over the same column 8 px apart
    const m = mount({ make: graphChapters([[1050, 3990, 10], [1090, 3950, 9]]) });
    const cam = { x: 2520, ppv: 0.2 };
    let direct = 0, asked = 0;
    for (let y = 2; y < 302; y++) {
      act(() => { m.get().sel.closeCards(); });
      m.get().cam.camRef.current = Object.assign({ total: TOTAL, y: 0 }, cam);
      const near = pickThreads(/** @type {any} */ (m.g), m.get().cam.camRef.current, m.get().cam.viewFor(), 400, y, 14, CHOOSER_MOST);
      if (near.length < 2 || near[1].distance > 8) continue;
      const tie = isTie(near[0].distance, near[1].distance, 1);
      act(() => { m.get().sel.handlersRef.current.tap(400, y); });
      const { choices, detail } = m.get().sel;
      if (tie) {
        asked++;
        expect(choices && choices.length, 'y ' + y + ': a tie asks').toBe(2);
      } else {
        direct++;
        expect(choices, 'y ' + y + ': ' + near[0].distance.toFixed(1) + ' against ' + near[1].distance.toFixed(1)).toBeNull();
        expect(detail && detail.index, 'y ' + y + ': the nearest is chosen').toBe(near[0].index);
      }
    }
    expect(direct, 'taps clearly nearer one line (the chooser opened on every one before)').toBeGreaterThan(0);
    expect(asked, 'taps at the crossing').toBeGreaterThan(0);
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

  // was "routeOverlayHit routes nothing yet" (the spine's stub); the navigation stream routes it
  // now, and the law it pinned keeps its intent: the tap reaches routeOverlayHit before the line
  // picking, and whatever it handles stops there (goto.test.jsx has each route's own cases)
  it('a tap on a recorded target is routed before the line picking: a book name frames its book', () => {
    expect(routeOverlayHit(/** @type {any} */ (book), /** @type {any} */ ({}))).toBe(false);
    expect(routeOverlayHit(null, null)).toBe(false);
    const { get } = mount();
    get().overlayFrameRef.current = { v: { DPR: 1 }, hits: [{ x0: 0, y0: 0, x1: 800, y1: 360, hit: book }] };
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    act(() => { get().sel.handlersRef.current.tap(400, 5); });
    // the fixture's one book is the whole canon: the canon at fit, and the tap went no further
    const c = get().cam.camRef.current;
    expect(verseToX(c, 800, 0)).toBeCloseTo(0, 6);
    expect(verseToX(c, 800, TOTAL)).toBeCloseTo(800, 6);
    expect(get().sel.detail, "the open line stays: the tap was the name's").toMatchObject({ kind: 'arc', index: 1 });
    expect(get().journey.stack.map((e) => e.label)).toEqual(['Genesis']);
  });
});

describe('the go-to (CONTRACTS.md sections 8 and 9)', () => {
  // was "fills the header slot with nothing today" (the spine's stub); the go-to is real now
  // (goto.test.jsx), and the law this keeps is its edge: a host without the web's camera gets the
  // same frozen nothing every render, with every call safe
  it('without the camera there is no go-to: nothing in the slot, the same object every render', () => {
    const { result, rerender } = renderHook(() => useGoTo({ start: { verse: { bookId: 'john', chapter: 3, verse: 16 } } }));
    const first = result.current;
    expect(first).toMatchObject({ button: null, box: null, isOpen: false });
    expect(() => { first.open('John 3:16'); first.close(); }).not.toThrow();
    rerender();
    expect(result.current).toBe(first);
  });
});
