/* The go-to (A2, spec section 4.5, r3-04) wired as the screen wires it: the camera, the frame
   loop, the journey, the selection and useGoTo, rendered into a root, with a frame loop the test
   steps (requestAnimationFrame queued, tick() runs it). The words are read by the app's own
   parser over its own tables (search-data.js). */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, fireEvent, cleanup } from '@testing-library/react';
import { useWebCamera } from './use-web-camera.js';
import { useWebSelection } from './use-web-selection.js';
import { useJourney } from './use-journey.js';
import { useFrameScheduler } from './use-frame-scheduler.js';
import { useGoTo, routeOverlayHit, reopenOf, gotoBoxPlace, GOTO_BOX_W, GOTO_BOX_TOP, GOTO_BOX_MIN, GOTO_HINT } from './goto.jsx';
import { useWebKeys } from './use-web-keys.js';
import { verseToX, fitPPV } from '../../utils/scripture-web/geometry.js';
import { focusState } from '../../utils/scripture-web/focus-state.js';

let prevData;
beforeAll(async () => {
  prevData = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData
  await import('../../../search-data.js');
});
afterAll(() => { window.VotSearchData = prevData; });

let rafQueue = [], clock = 0;
const tick = (ms = 16) => {
  clock += ms;
  const q = rafQueue; rafQueue = [];
  act(() => { for (const cb of q) cb(clock); });
};
const settle = (cap = 400) => { let n = 0; while (rafQueue.length && n++ < cap) tick(); };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
beforeEach(() => {
  rafQueue = []; clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TOTAL = 31102;
/* One book of one chapter (the whole canon) and three threads: 0 joins verse 100 to 20100, 1 joins
   200 to 300 (the strongest), 2 joins 100 to 300. */
const graph = () => ({
  total: TOTAL, count: 3, buckets: [{ off: 0, len: 3, off20: 3, off10: 3, segments: 8, chunks: [[100, 20100]] }],
  books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen' }],
  chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL),
  from: new Uint16Array([100, 200, 100]), to: new Uint16Array([20100, 300, 300]), votes: new Int16Array([7, 30, 12]),
  votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
});

/**
 * The web, as the screen wires it; `api.current` is every hook's latest answer.
 * @param {{ start?: any, cam?: { x: number, ppv: number }, keys?: boolean, frame?: { W: number, H: number, DPR: number } }} [opts]
 *   keys: the root's onKeyDown is the web's own (use-web-keys.js), not a spy; frame: the canvas in
 *   device px (default an 800x600 PC frame)
 */
function mountWeb({ start, cam = { x: 15551, ppv: 8 }, keys = false, frame = { W: 800, H: 600, DPR: 1 } } = {}) {
  const g = graph();
  const api = { current: /** @type {any} */ (null) };
  const setAnnounce = vi.fn();
  const rootKeys = vi.fn();
  function Web() {
    const frames = useFrameScheduler();
    const modeRef = React.useRef('canonical');
    const camera = useWebCamera({ graph: g, density: 'famous', modeRef, schedule: frames.schedule, animate: frames.animate });
    if (!camera.camRef.current) {
      camera.viewRef.current = { ...frame };
      camera.camRef.current = { x: cam.x, ppv: cam.ppv, total: TOTAL, y: 0 };
    }
    const journey = useJourney({ flyTo: camera.flyTo });
    const resumeRef = React.useRef(null);
    const personalRef = React.useRef(null);
    const elevatorRef = React.useRef(null);
    const badgeBoxesRef = React.useRef([]);
    const overlayFrameRef = React.useRef(null);
    const rootRef = React.useRef(null);
    const railOpts = React.useCallback(() => ({}), []);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef,
      camRef: camera.camRef, viewRef: camera.viewRef, focusRef: camera.focusRef, viewFor: camera.viewFor, yFrameFor: camera.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: camera.flyTo, journey, schedule: frames.schedule, setAnnounce,
    });
    const goTo = useGoTo({ graph: g, flyTo: camera.flyTo, openPanel: sel.openPanel, journey, lightThreads: sel.lightThreads, setAnnounce, start,
      closePanel: sel.closeCards, panel: sel.panel, density: 'famous', mode: 'canonical', camRef: camera.camRef, viewRef: camera.viewRef,
      focusRef: camera.focusRef, panelInsetRef: camera.panelInsetRef, viewFor: camera.viewFor, onFrame: frames.onFrame, rootRef });
    const none = React.useRef(null);
    const web = useWebKeys({
      graph: g, guideOpen: false, emptyShown: false, listOpen: sel.listOpen, choices: sel.choices, detail: sel.detail, tip: null,
      closeGuide: () => {}, dismissEmpty: () => {}, closeCards: sel.closeCards, camRef: camera.camRef, camVRef: none,
      lastRailRef: none, viewRef: camera.viewRef, modeRef, personalRef, zoomCapFor: () => 1e9, yFrameFor: camera.yFrameFor,
      resetView: () => {}, onBack: rootKeys, dropHover: () => {}, setAnnounce, schedule: frames.schedule,
      cancelFly: camera.cancelFly, goTo: keys ? goTo : null,
    });
    api.current = { cam: camera, sel, journey, goTo, frames, overlayFrameRef };
    return (
      <div className="sw-root" ref={rootRef} tabIndex={0} onKeyDown={keys ? web.onKeyDown : rootKeys}>
        <div className="sw-controls">{goTo.button}</div>
        {goTo.box}
      </div>
    );
  }
  const view = render(<Web />);
  return { ...view, g, api, setAnnounce, rootKeys, get: () => api.current };
}

const box = (c) => c.querySelector('.sw-goto');
const input = (c) => /** @type {HTMLInputElement} */ (c.querySelector('.sw-goto-input'));
const rowTexts = (c) => Array.from(c.querySelectorAll('.sw-goto-row')).map((r) => r.textContent);

describe('the go-to box (spec 4.5)', () => {
  it('the search button opens it, with the keyboard in it and the hint under it; nothing typed, no rows', () => {
    const { container, getByRole } = mountWeb();
    expect(box(container), 'at rest: no box').toBeNull();
    fireEvent.click(getByRole('button', { name: /go to a book, chapter or verse/i }));
    expect(box(container)).toBeTruthy();
    expect(document.activeElement).toBe(input(container));
    expect(container.querySelector('.sw-goto-hint').textContent).toBe(GOTO_HINT);
    expect(rowTexts(container)).toEqual([]);
  });

  it('suggests live as it is typed, through the app\'s own parser; the arrows move the choice', () => {
    const { container, get } = mountWeb();
    act(() => { get().goTo.open(); });
    fireEvent.change(input(container), { target: { value: 'Gen 1:1' } });
    const rows = rowTexts(container);
    expect(rows[0]).toBe('Genesis 1:1');
    expect(rows[rows.length - 1]).toBe('Genesis 1 · whole chapter');
    expect(rows.length).toBeLessThanOrEqual(5);
    const sel = () => Array.from(container.querySelectorAll('.sw-goto-row')).findIndex((r) => r.classList.contains('is-sel'));
    expect(sel()).toBe(0);
    expect(input(container).getAttribute('aria-activedescendant')).toBe('sw-goto-opt-0');
    fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    expect(sel()).toBe(1);
    fireEvent.keyDown(input(container), { key: 'ArrowUp' });
    fireEvent.keyDown(input(container), { key: 'ArrowUp' });
    expect(sel(), 'up from the first is the last').toBe(rows.length - 1);
  });

  it('Enter on a verse: the box closes, the camera frames it, its threads light, verse mode opens, the chip names it', async () => {
    const { container, get, setAnnounce } = mountWeb();
    act(() => { get().goTo.open(); });
    fireEvent.change(input(container), { target: { value: 'Genesis 1:101' } });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    expect(box(container)).toBeNull();
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 100 });
    expect(Array.from(get().cam.focusRef.current.lit).sort()).toEqual([0, 2]);
    expect(setAnnounce).toHaveBeenLastCalledWith('Genesis 1:101, 2 connections');
    settle();
    await flush();
    const cam = get().cam.camRef.current;
    // the fixture's five chapters around it are the whole canon: the canon at fit
    expect(cam.ppv).toBeCloseTo(fitPPV(cam, 800), 9);
    const chip = container.querySelector('.sw-goto-chip');
    expect(chip && chip.textContent).toBe('Genesis 1:101 · 2 connections');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(get().journey.stack.map((e) => e.label)).toEqual(['Genesis 1:15552', 'Genesis 1:101']);
  });

  it('the chip keeps out of the panel (CONTRACTS.md section 5): over a bottom sheet it stands on the sheet, not under it', async () => {
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    const chipEl = () => /** @type {HTMLElement} */ (container.querySelector('.sw-goto-chip'));
    const chipY = () => Number(/translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(chipEl().style.transform)[1]);
    const footY = chipY();
    expect(footY, 'with no panel: at the verse\'s foot, low in the frame').toBeGreaterThan(600 - 215);
    // the panel stream's sheet below 560 px writes its height as the bottom inset, then schedules a frame
    get().cam.panelInsetRef.current = { right: 0, bottom: 215 };
    act(() => { get().frames.schedule(); });
    settle();
    expect(chipY(), 'its foot clear of the sheet\'s top edge').toBeLessThanOrEqual(600 - 215);
    expect(chipEl().style.visibility).toBe('visible');
    get().cam.panelInsetRef.current = { right: 0, bottom: 0 };
    act(() => { get().frames.schedule(); });
    settle();
    expect(chipY(), 'the sheet gone: back at the foot').toBe(footY);
  });

  it('the chip goes when the verse is no longer what is lit', async () => {
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(container.querySelector('.sw-goto-chip')).toBeTruthy();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    act(() => { get().frames.schedule(); });
    settle();
    expect(container.querySelector('.sw-goto-chip')).toBeNull();
  });

  it('Enter on a chapter frames it at about 70 % with its group open; on a book, the book fills the frame', async () => {
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1'); });
    expect(rowTexts(container)[0]).toBe('Genesis 1 · whole chapter');
    fireEvent.keyDown(input(container), { key: 'Enter' });
    expect(get().sel.detail).toMatchObject({ kind: 'chapter', chapterIndex: 0 });
    settle(); await flush();
    const cam = get().cam.camRef.current;
    // 70 % of the frame is the chapter: the camera is zoomed OUT past fit, clamped back to fit
    expect(cam.ppv).toBeCloseTo(fitPPV(cam, 800), 9);
  });

  it('Escape in the box closes it and goes no further; a press outside closes it too', () => {
    const { container, get, rootKeys } = mountWeb();
    act(() => { get().goTo.open(); });
    fireEvent.keyDown(input(container), { key: 'Escape' });
    expect(box(container)).toBeNull();
    expect(rootKeys, 'the root never saw the Escape the box took').not.toHaveBeenCalled();
    act(() => { get().goTo.open(); });
    expect(box(container)).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(box(container)).toBeNull();
  });

  it('a dialog that keeps the keyboard (dialog-focus-contract): Tab stays in the box, and focus goes home on close', () => {
    const { container, get, getByRole } = mountWeb();
    const button = getByRole('button', { name: /go to a book, chapter or verse/i });
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(input(container));
    expect(fireEvent.keyDown(input(container), { key: 'Tab' }), 'Tab does not walk out of the box').toBe(false);
    expect(fireEvent.keyDown(input(container), { key: 'Tab', shiftKey: true })).toBe(false);
    // focus that got out (a stray .focus() behind the box) is pulled back on the next Tab
    button.focus();
    fireEvent.keyDown(button, { key: 'Tab' });
    expect(document.activeElement, 'pulled back into the box').toBe(input(container));
    fireEvent.keyDown(input(container), { key: 'Escape' });
    expect(document.activeElement, 'back to the button that opened it').toBe(button);
    // opened from nowhere (the page had no focus): home is the web itself
    /** @type {HTMLElement} */ (document.activeElement).blur();
    act(() => { get().goTo.open(); });
    fireEvent.keyDown(input(container), { key: 'Escape' });
    expect(document.activeElement).toBe(container.querySelector('.sw-root'));
  });

  it('nothing it can name: no rows, and Enter says so', () => {
    const { container, get, setAnnounce } = mountWeb();
    act(() => { get().goTo.open('love one another'); });
    expect(rowTexts(container)).toEqual([]);
    fireEvent.keyDown(input(container), { key: 'Enter' });
    expect(setAnnounce).toHaveBeenLastCalledWith('No book, chapter or verse called love one another');
    expect(box(container)).toBeTruthy();
  });
});

/* Where the PC box sits (the review of 2026-10-18): centred over the canvas area at every width, it
   covered the search button that opens it and half of "Scripture" below about 1900 px. The rects
   are the real ones, read by tools/e2e-sw-goto.mjs in headless Chrome: the topbar (Back and the
   title) from x 14 to 287, the control row from x 1041 at 1600, 807 at 1366, 1361 at 1920, both
   from y 10 to 70. */
describe('the PC box keeps clear of the title and the control row', () => {
  const TOPBAR = { l: 14, t: 10, r: 287, b: 70 };
  const controls = (W, l) => ({ l, t: 10, r: W - 14, b: 70 });
  const meets = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
  const boxOf = (p) => ({ l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.top, b: p.top + 56 });

  it("1600x900: in the gap, the spec's 640 px at top 24, moved left of the control row", () => {
    const p = gotoBoxPlace({ W: 1600, chrome: [TOPBAR, controls(1600, 1041)] });
    expect(p).toEqual({ x: 697, w: GOTO_BOX_W, top: GOTO_BOX_TOP });
    expect(meets(boxOf(p), controls(1600, 1041))).toBe(false);
    expect(meets(boxOf(p), TOPBAR)).toBe(false);
  });

  it('1366x768: the gap is under 480 px, so it drops under the chrome, centred, 8 px below it', () => {
    expect(1041 - 287 - 48).toBeGreaterThanOrEqual(GOTO_BOX_MIN);
    expect(807 - 287 - 48).toBeLessThan(GOTO_BOX_MIN);
    const p = gotoBoxPlace({ W: 1366, chrome: [TOPBAR, controls(1366, 807)] });
    expect(p).toEqual({ x: 683, w: GOTO_BOX_W, top: 78 });
    expect(meets(boxOf(p), controls(1366, 807))).toBe(false);
    expect(meets(boxOf(p), TOPBAR)).toBe(false);
  });

  it("1920x1080: wide enough that the canvas area's centre is clear, so the spec's place stands", () => {
    expect(gotoBoxPlace({ W: 1920, chrome: [TOPBAR, controls(1920, 1361)] })).toEqual({ x: 960, w: 640, top: 24 });
  });

  it('a side panel narrows the canvas area: the centre moves left, the box keeps right of the title', () => {
    const p = gotoBoxPlace({ W: 1600, inset: 420, chrome: [TOPBAR, controls(1600, 1041)] });
    expect(p).toEqual({ x: 631, w: 640, top: 24 });
    expect(boxOf(p).l).toBe(TOPBAR.r + 24);
  });

  it('a gap between 480 and 640 px takes a narrower box rather than dropping', () => {
    const p = gotoBoxPlace({ W: 1440, chrome: [TOPBAR, controls(1440, 880)] });
    expect(p.top).toBe(GOTO_BOX_TOP);
    expect(p.w).toBe(880 - 287 - 48);
    expect(meets(boxOf(p), controls(1440, 880))).toBe(false);
  });

  it("chrome not laid out (null) or out of the top band (a narrow root's row at the bottom) is not in the way", () => {
    expect(gotoBoxPlace({ W: 1366, chrome: [null, null] })).toEqual({ x: 683, w: 640, top: 24 });
    expect(gotoBoxPlace({ W: 1366, chrome: [TOPBAR, { l: 14, t: 700, r: 900, b: 758 }] })).toEqual({ x: 683, w: 640, top: 24 });
    expect(gotoBoxPlace({ W: 600, chrome: [] })).toEqual({ x: 300, w: 552, top: 24 });
  });
});

/* Back restores the panel as it was where the reader set out (the review of 2026-10-18): a trail's
   crumb records what is OPEN there, so Back closes a panel the trail opened later, and reopens one
   that was open, with its lit threads. */
describe('Back puts the panel back as it was', () => {
  it('reopenOf: what is open as a spec to reopen, its lit threads with it; nothing, or a card no spec opens, is null', () => {
    const lit = Int32Array.from([3, 4]);
    expect(reopenOf(null, null)).toBeNull();
    expect(reopenOf({ spec: { mode: 'verse', verse: 7 } }, lit)).toEqual({ mode: 'verse', verse: 7, lit });
    expect(reopenOf({ spec: { mode: 'connection', arc: 2 } }, null)).toEqual({ mode: 'connection', arc: 2 });
    expect(reopenOf({ spec: { mode: 'group', ids: [1, 2], label: '' } }, new Int32Array(0))).toEqual({ mode: 'group', ids: [1, 2], label: '' });
    expect(reopenOf({ spec: { mode: 'group', ids: [], label: 'Isaiah 53', chapter: 4 } }, null)).toMatchObject({ chapter: 4 });
    expect(reopenOf({ spec: { mode: 'group', ids: [], label: 'a bundle' } }, null), "a bundle's sheet").toBeNull();
    expect(reopenOf({ spec: { mode: 'connection', arc: 0, myWeb: 'link' } }, null), 'a My Web card').toBeNull();
  });

  const back = async (get) => {
    act(() => { get().journey.back(); });
    // the fly, its landing's reopen, then the frame that reopen asked for
    settle(); await flush(); settle();
  };
  const litOf = (get) => Array.from(get().cam.focusRef.current.lit || []);

  it('a go-to from the overview, then Back: the go-to\'s panel closes and its threads let go', async () => {
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(get().sel.panel.spec).toMatchObject({ mode: 'verse', verse: 100 });
    await back(get);
    expect(get().cam.camRef.current.x, 'home').toBeCloseTo(15551, 0);
    expect(get().sel.panel, 'nothing was open at home').toBeNull();
    expect(litOf(get)).toEqual([]);
    expect(container.querySelector('.sw-goto-chip')).toBeNull();
  });

  it('a panel open where the go-to set out opens again on Back (report gap 5)', async () => {
    const { container, get } = mountWeb();
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    await back(get);
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 1 });
    expect(litOf(get)).toEqual([]);
  });

  it('an edge chip\'s Follow from a go-to: Back reopens the verse with its threads lit', async () => {
    const { container, get } = mountWeb({ cam: { x: 120, ppv: 8 } });
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(litOf(get).sort()).toEqual([0, 2]);
    // Genesis 1:101 framed at the fixture's fit: zoom in on its foot so its threads leave the frame
    act(() => { get().cam.camRef.current.ppv = 8; get().cam.camRef.current.x = 120; get().frames.schedule(); });
    settle();
    fireEvent.click(container.querySelector('.sw-goto-edge-right'));
    settle(); await flush();
    // the view holds verses 70-170: 2 (100-300) and 0 (100-20100) leave on the right; 2 is the stronger
    expect(get().sel.panel.spec).toEqual({ mode: 'connection', arc: 2 });
    await back(get);
    expect(get().sel.panel.spec).toEqual({ mode: 'verse', verse: 100 });
    expect(litOf(get).sort(), 'its threads lit again').toEqual([0, 2]);
  });

  it('a book name\'s crumb keeps what was open when it was tapped, not the go-to\'s panel after it', async () => {
    const { container, get } = mountWeb({ cam: { x: 9000, ppv: 8 } });
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    const nav = () => ({ graph: graph(), flyTo: get().cam.flyTo, openPanel: get().sel.openPanel, journey: get().journey });
    act(() => { routeOverlayHit({ kind: 'book', book: 0 }, nav()); });
    settle(); await flush();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(get().journey.stack.map((e) => e.label)).toEqual(['Genesis 1:9001', 'Genesis', 'Genesis 1:101']);
    await back(get);
    expect(get().sel.panel.spec, 'the book, with the line that was open there').toEqual({ mode: 'connection', arc: 1 });
    await back(get);
    expect(get().sel.panel.spec, 'home, with the same line').toEqual({ mode: 'connection', arc: 1 });
  });
});

describe('the edge chips (spec 4.5): where lit threads leave the frame, and Follow', () => {
  it('a lit thread whose far end is off the frame is named at that side; a tap follows it there', async () => {
    const { container, get } = mountWeb({ cam: { x: 120, ppv: 8 } });
    act(() => { get().sel.lightThreads([0]); });
    settle();
    const right = /** @type {HTMLButtonElement} */ (container.querySelector('.sw-goto-edge-right'));
    expect(right && right.textContent).toBe('Genesis 1:20101 ›');
    expect(container.querySelector('.sw-goto-edge-left')).toBeNull();
    right.focus();
    fireEvent.click(right);
    settle(); await flush();
    // the chip it was on is gone (that end is in view now): the keyboard is on the web, not the body
    expect(container.querySelector('.sw-goto-edge-right')).toBeNull();
    expect(document.activeElement, 'focus goes home to the root').toBe(container.querySelector('.sw-root'));
    expect(get().cam.camRef.current.x).toBeCloseTo(20100.5, 6);
    expect(get().cam.camRef.current.ppv, 'the same zoom').toBeCloseTo(8, 9);
    expect(get().sel.detail, 'the line opens where it landed').toMatchObject({ kind: 'arc', index: 0, far: 'from' });
    expect(get().journey.stack.map((e) => e.verse)).toEqual([120, 20100]);
  });

  it('compact (a root 500 px tall or less, not a narrow one) takes the compact chips: 13 px edge chips at a 16 px gutter, a 14 px verse chip', async () => {
    // the phone in landscape: 891x411 CSS px at 2.625, wider than any narrow root, but compact
    const phone = { W: Math.round(891 * 2.625), H: Math.round(411 * 2.625), DPR: 2.625 };
    const { container, get } = mountWeb({ cam: { x: 120, ppv: 8 }, frame: phone });
    act(() => { get().sel.lightThreads([0]); });
    settle();
    expect(container.querySelector('.sw-goto-edge-right').classList.contains('is-compact')).toBe(true);
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(container.querySelector('.sw-goto-chip').classList.contains('is-compact')).toBe(true);
    cleanup();
    const pc = mountWeb({ cam: { x: 120, ppv: 8 } });
    act(() => { pc.get().sel.lightThreads([0]); });
    settle();
    expect(pc.container.querySelector('.sw-goto-edge-right').classList.contains('is-compact')).toBe(false);
  });

  it('at most one a side, the strongest; none when both ends are in view or both are out', () => {
    const { container, get } = mountWeb({ cam: { x: 250, ppv: 4 } });
    // the view holds verses 150-350: thread 1 (200-300) is wholly in it, 2 (100-300) leaves on the
    // left, and 0 (100-20100) has both ends out (it only passes over)
    act(() => { get().sel.lightThreads([0, 1, 2]); });
    settle();
    expect(container.querySelector('.sw-goto-edge-left').textContent).toBe('‹ Genesis 1:101');
    expect(container.querySelector('.sw-goto-edge-right')).toBeNull();
    act(() => { get().sel.lightThreads([0, 2]); });
    get().cam.camRef.current.x = 350;
    settle();
    act(() => { get().frames.schedule(); });
    settle();
    expect(container.querySelector('.sw-goto-edge-left').textContent, 'two leave left: the stronger (2) names it').toBe('‹ Genesis 1:101');
    get().cam.camRef.current.x = 250;
    act(() => { get().sel.lightThreads([1]); });
    settle();
    expect(container.querySelector('.sw-goto-edge'), 'wholly in view: no chip').toBeNull();
  });
});

describe('the start prop (CONTRACTS.md section 8): the web opens on a place, once', () => {
  it('a verse: framed, instantly; its threads lit; verse mode open; the chip; no trail', async () => {
    const { container, get } = mountWeb({ start: { verse: { bookId: 'genesis', chapter: 1, verse: 201 } } });
    await flush();
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 200 });
    expect(Array.from(get().cam.focusRef.current.lit)).toEqual([1]);
    expect(container.querySelector('.sw-goto-chip').textContent).toBe('Genesis 1:201 · 1 connection');
    expect(get().journey.stack).toEqual([]);
    act(() => { get().sel.closePanel(); });
    act(() => { get().frames.schedule(); });
    settle();
    expect(get().sel.detail, 'consumed once: a later frame does not reopen it').toBeNull();
  });
  it('a letter asks the panel for letter mode (the panel stream builds it; the ask is pinned here)', () => {
    const openPanel = vi.fn(() => true);
    const camRef = { current: { x: 100, ppv: 8, total: TOTAL, y: 0 } };
    const viewRef = { current: { W: 800, H: 600, DPR: 1 } };
    renderHook(() => useGoTo({ graph: graph(), flyTo: vi.fn(() => Promise.resolve(true)), openPanel,
      start: { letterKey: 'two/the-wide-path' }, camRef, viewRef, focusRef: { current: focusState() } }));
    expect(openPanel).toHaveBeenCalledTimes(1);
    expect(openPanel).toHaveBeenCalledWith({ mode: 'letter', letterKey: 'two/the-wide-path' });
  });
});

describe('the keys\' halves (G2): Enter or Space, and [ ]', () => {
  it('selectCentre chooses the thread with a foot nearest the centre, the strongest among the nearest', () => {
    const { get, setAnnounce } = mountWeb({ cam: { x: 15551, ppv: 8 } });
    let chose;
    act(() => { chose = get().goTo.selectCentre(); });
    expect(chose, 'no foot in view: nothing to choose').toBe(false);
    expect(setAnnounce).toHaveBeenLastCalledWith('No line in view');
    const mid = mountWeb({ cam: { x: 20080, ppv: 8 } });
    act(() => { mid.get().goTo.selectCentre(); });
    expect(mid.get().sel.detail).toMatchObject({ kind: 'arc', index: 0 });
    const near = mountWeb({ cam: { x: 300, ppv: 8 } });
    act(() => { near.get().goTo.selectCentre(); });
    expect(near.get().sel.detail, 'feet at 300: threads 1 and 2; 1 is the stronger').toMatchObject({ kind: 'arc', index: 1 });
  });
  it('[ and ] step through the threads at the chosen verse, strongest first, round and round', () => {
    const { get } = mountWeb({ cam: { x: 100, ppv: 8 } });
    act(() => { get().sel.openPanel({ mode: 'verse', verse: 100 }); });
    const step = (d) => { act(() => { get().goTo.step(d); }); return get().sel.detail.index; };
    expect(step(1)).toBe(2);
    expect(step(1)).toBe(0);
    expect(step(1)).toBe(2);
    expect(step(-1)).toBe(0);
  });
});

describe("through the web's own keys (use-web-keys.js)", () => {
  it('/ opens the box, Enter goes, the keyboard comes home; Escape closes the box before the panel', () => {
    const { container, get } = mountWeb({ keys: true });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    root.focus();
    fireEvent.keyDown(root, { key: '/' });
    expect(box(container)).toBeTruthy();
    expect(document.activeElement).toBe(input(container));
    fireEvent.change(input(container), { target: { value: 'Gen 1:101' } });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    expect(box(container)).toBeNull();
    expect(document.activeElement, 'the web has the keyboard again').toBe(root);
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 100 });
    fireEvent.keyDown(root, { key: 'k', ctrlKey: true });
    expect(box(container)).toBeTruthy();
    root.focus();
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(box(container), 'the box went first').toBeNull();
    expect(get().sel.detail, 'the panel stays for the next press').toMatchObject({ kind: 'verse' });
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(get().sel.detail).toBeNull();
  });
  it('Enter on the web takes the line at the centre; ] steps on from it', () => {
    const { container, get } = mountWeb({ keys: true, cam: { x: 300, ppv: 8 } });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1 });
    fireEvent.keyDown(root, { key: ']' });
    expect(get().sel.detail.index, 'the next line at verse 300').toBe(2);
  });
});

describe('routeOverlayHit (CONTRACTS.md section 4): what a tap on a drawn name does', () => {
  it('a book name frames its book; a chapter numeral its chapter, its group open; a pill its group', async () => {
    const { get } = mountWeb({ cam: { x: 9000, ppv: 8 } });
    const nav = () => ({ graph: graph(), flyTo: get().cam.flyTo, openPanel: get().sel.openPanel, journey: get().journey });
    let handled;
    act(() => { handled = routeOverlayHit({ kind: 'book', book: 0 }, nav()); });
    expect(handled).toBe(true);
    settle(); await flush();
    const cam = get().cam.camRef.current;
    expect(verseToX(cam, 800, 0)).toBeCloseTo(0, 6);
    expect(verseToX(cam, 800, TOTAL)).toBeCloseTo(800, 6);
    expect(get().journey.stack.map((e) => e.label), 'the trail sets out from where the reader was').toEqual(['Genesis 1:9001', 'Genesis']);
    act(() => { handled = routeOverlayHit({ kind: 'chapter', book: 0, chapter: 1 }, nav()); });
    expect(handled).toBe(true);
    expect(get().sel.detail).toMatchObject({ kind: 'chapter', chapterIndex: 0 });
    act(() => { handled = routeOverlayHit({ kind: 'pill', ids: [1, 2], label: 'Genesis 1' }, nav()); });
    expect(handled).toBe(true);
    expect(get().sel.choices.map((c) => c.index)).toEqual([1, 2]);
  });
  it('nothing it can route: no graph, an unknown chapter, an unknown kind', () => {
    expect(routeOverlayHit({ kind: 'book', book: 0 }, /** @type {any} */ ({}))).toBe(false);
    expect(routeOverlayHit(null, null)).toBe(false);
    const nav = /** @type {any} */ ({ graph: graph(), flyTo: vi.fn(), openPanel: vi.fn(), journey: null });
    expect(routeOverlayHit({ kind: 'chapter', book: 0, chapter: 9 }, nav)).toBe(false);
    expect(routeOverlayHit(/** @type {any} */ ({ kind: 'nope' }), nav)).toBe(false);
    expect(nav.flyTo).not.toHaveBeenCalled();
  });
});
