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
import { useGoTo, routeOverlayHit, reopenOf, gotoBoxPlace, hereLabel, GOTO_BOX_W, GOTO_BOX_TOP, GOTO_BOX_MIN, GOTO_HINT } from './goto.jsx';
import { useWebKeys } from './use-web-keys.js';
import { WebPanel } from './web-panel.jsx';
import { verseToX, fitPPV, maxZoomFor, PPV_MAX_CSS } from '../../utils/scripture-web/geometry.js';
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
 * @param {{ start?: any, cam?: { x: number, ppv: number }, keys?: boolean, frame?: { W: number, H: number, DPR: number }, web?: any, sheet?: boolean }} [opts]
 *   keys: the root's onKeyDown is the web's own (use-web-keys.js), not a spy; frame: the canvas in
 *   device px (default an 800x600 PC frame); web: the graph (default graph()); sheet: the panel's
 *   own docked panel (web-panel.jsx) renders for what is open, as the screen renders it (its focus
 *   hand-back with it)
 */
function mountWeb({ start, cam = { x: 15551, ppv: 8 }, keys = false, frame = { W: 800, H: 600, DPR: 1 }, web, sheet = false } = {}) {
  const g = web || graph();
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
    const keepOutRef = React.useRef(null);
    const sel = useWebSelection({
      graph: g, mode: 'canonical', density: 'famous', showUnderlay: false, resumeRef,
      camRef: camera.camRef, viewRef: camera.viewRef, focusRef: camera.focusRef, viewFor: camera.viewFor, yFrameFor: camera.yFrameFor,
      personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo: camera.flyTo, journey, schedule: frames.schedule, setAnnounce,
    });
    const goTo = useGoTo({ graph: g, flyTo: camera.flyTo, openPanel: sel.openPanel, journey, lightThreads: sel.lightThreads, setAnnounce, start,
      closePanel: sel.closeCards, panel: sel.panel, density: 'famous', mode: 'canonical', camRef: camera.camRef, viewRef: camera.viewRef,
      focusRef: camera.focusRef, panelInsetRef: camera.panelInsetRef, viewFor: camera.viewFor, onFrame: frames.onFrame, rootRef,
      keepOutRef, schedule: frames.schedule });
    const none = React.useRef(null);
    const web = useWebKeys({
      graph: g, guideOpen: false, emptyShown: false, listOpen: sel.listOpen, choices: sel.choices, detail: sel.detail, tip: null,
      closeGuide: () => {}, dismissEmpty: () => {}, closeCards: sel.closeCards, camRef: camera.camRef, camVRef: none,
      lastRailRef: none, viewRef: camera.viewRef, modeRef, personalRef, zoomCapFor: () => 1e9, yFrameFor: camera.yFrameFor,
      resetView: () => {}, onBack: rootKeys, dropHover: () => {}, setAnnounce, schedule: frames.schedule,
      cancelFly: camera.cancelFly, goTo: keys ? goTo : null,
    });
    api.current = { cam: camera, sel, journey, goTo, frames, overlayFrameRef, keepOutRef };
    return (
      <div className="sw-root" ref={rootRef} tabIndex={0} onKeyDown={keys ? web.onKeyDown : rootKeys}>
        <div className="sw-controls">{goTo.button}</div>
        {goTo.box}
        {sheet && (sel.detail || sel.choices || sel.listOpen) ? (
          <WebPanel graph={g} mode="canonical" density="famous" listOpen={sel.listOpen} listItems={sel.listItems}
            choices={sel.choices} detail={sel.detail} journey={journey} lensOn={false} onClose={sel.closeCards}
            onChoose={sel.commitFound} openPanel={sel.openPanel} followThread={sel.followThread} followRow={sel.followRow}
            zoomTo={sel.zoomTo} onOpen={() => {}} lightThreads={sel.lightThreads} />
        ) : null}
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

  /* w4 (the phone stream): on the phone in landscape the soft keyboard takes about half of the
     411 px root, and the box with three rows, a hairline and the hint ran 27 px under it (the
     stand-in shot s07k). The hint is there to say what to type, so on the phone it says it until
     there is something to choose; then the rows have the room. PC keeps both (spec 4.5). */
  it('compact: the hint shows until rows come, then the rows have the room; PC keeps the hint under them', () => {
    const phone = { W: Math.round(891 * 2.625), H: Math.round(411 * 2.625), DPR: 2.625 };
    const { container, get } = mountWeb({ frame: phone });
    act(() => { get().goTo.open(); });
    expect(box(container).classList.contains('is-compact')).toBe(true);
    expect(container.querySelector('.sw-goto-hint'), 'nothing typed: the hint says what to type').toBeTruthy();
    fireEvent.change(input(container), { target: { value: 'Gen 1:1' } });
    expect(rowTexts(container).length, 'the phone takes three rows').toBe(3);
    expect(container.querySelector('.sw-goto-hint'), 'rows to choose: the hint gives them its room').toBeNull();
    fireEvent.change(input(container), { target: { value: 'Zzyzx' } });
    expect(rowTexts(container)).toEqual([]);
    expect(container.querySelector('.sw-goto-hint'), 'nothing it can name: the hint again').toBeTruthy();
    cleanup();
    const pc = mountWeb();
    act(() => { pc.get().goTo.open(); });
    fireEvent.change(input(pc.container), { target: { value: 'Gen 1:1' } });
    expect(rowTexts(pc.container).length).toBeGreaterThan(0);
    expect(pc.container.querySelector('.sw-goto-hint').textContent).toBe(GOTO_HINT);
  });

  /* a keyboard taller than the stand-in leaves less than three rows: the list scrolls in the box
     (goto CSS), and the chosen row is kept in view as the arrows move it */
  it('the chosen row is kept in view as the arrows move it (the list scrolls when the keyboard leaves less room)', () => {
    const into = vi.fn();
    const had = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Element.prototype.scrollIntoView = function (o) { into(this, o); };
    try {
      const { container, get } = mountWeb();
      act(() => { get().goTo.open(); });
      fireEvent.change(input(container), { target: { value: 'Gen 1:1' } });
      into.mockClear();
      fireEvent.keyDown(input(container), { key: 'ArrowDown' });
      const rows = container.querySelectorAll('.sw-goto-row');
      expect(into).toHaveBeenCalledWith(rows[1], { block: 'nearest' });
    } finally {
      if (had) Object.defineProperty(Element.prototype, 'scrollIntoView', had);
      else delete Element.prototype.scrollIntoView;
    }
  });

  it('a verse row takes its text when the Bible corpus lands while the box is open (it loads lazily)', () => {
    let version = 0, loaded = false;
    const subs = new Set();
    vi.stubGlobal('__bibleCorpus', {
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      getVersion: () => version, get loaded() { return loaded; },
    });
    vi.stubGlobal('resolveVerseText', (r) => (loaded && r.bookId === 'genesis' && r.chapter === 1 && r.verse === 1 ? 'In the beginning' : ''));
    const { container, get } = mountWeb();
    act(() => { get().goTo.open(); });
    fireEvent.change(input(container), { target: { value: 'Gen 1:1' } });
    expect(rowTexts(container)[0], 'no corpus yet: the reference alone').toBe('Genesis 1:1');
    act(() => { loaded = true; version = 1; for (const cb of subs) cb(); });
    expect(rowTexts(container)[0]).toBe('Genesis 1:1 — In the beginning');
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
    // a sheet tall enough to cover the foot: the PC ruler (RULER_PC, 180 px since the w4 band) puts a
    // 600 px frame's baseline at 420, and a 260 px sheet's top (340) stands well above it
    const sheet = 260;
    expect(footY, 'with no panel: at the verse\'s foot, low in the frame').toBeGreaterThan(600 - sheet);
    // the panel stream's sheet below 560 px writes its height as the bottom inset, then schedules a frame
    get().cam.panelInsetRef.current = { right: 0, bottom: sheet };
    act(() => { get().frames.schedule(); });
    settle();
    expect(chipY(), 'its foot clear of the sheet\'s top edge').toBeLessThanOrEqual(600 - sheet);
    expect(chipEl().style.visibility).toBe('visible');
    get().cam.panelInsetRef.current = { right: 0, bottom: 0 };
    act(() => { get().frames.schedule(); });
    settle();
    expect(chipY(), 'the sheet gone: back at the foot').toBe(footY);
  });

  /* w4 review (major): with the panel docked the canon's end now stands the outer tenth inside the
     canvas area (5cb1d00f1), so a foot there passed the old "40 px short of the area's edge" test
     and the chip grew right, under the panel: "Revelation 22:21 · 3 connections" ran from 866 to
     1108 against an area edge of 960 on PC and read "Revelation 2" at the panel's border. Short of
     room on the foot's right it stands on the foot's left, and it is judged on the box it takes. */
  it('the chip keeps out of a docked panel: short of room on the foot\'s right, it stands on its left', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    const el = () => /** @type {HTMLElement} */ (container.querySelector('.sw-goto-chip'));
    const at = () => /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el().style.transform).slice(1).map(Number);
    // docked: 300 px of the 800 px frame, the 500 px area beside it; the foot at 0.9 of the area
    const cam = get().cam.camRef.current;
    get().cam.panelInsetRef.current = { right: 300, bottom: 0 };
    cam.ppv = 8; cam.x = 100.5 - (450 - 400) / 8;
    act(() => { get().frames.schedule(); });
    settle();
    expect(verseToX(cam, 800, 100.5), 'the foot at 0.9 of the area').toBeCloseTo(450, 6);
    const [tx, ty] = at();
    expect(el().style.visibility).toBe('visible');
    expect(tx + 180, 'its right edge inside the area, clear of the panel').toBeLessThanOrEqual(500);
    expect(tx + 180, 'beside the foot, on its left').toBeLessThan(450);
    expect(tx, 'inside the view').toBeGreaterThanOrEqual(8);
    expect(get().keepOutRef.current, 'the overlay is told the box it takes').toEqual([{ x0: tx, x1: tx + 180, y0: ty - 30, y1: ty }]);
    // the panel gone: room on the foot's right again
    get().cam.panelInsetRef.current = { right: 0, bottom: 0 };
    act(() => { get().frames.schedule(); });
    settle();
    expect(at()[0], 'back on the foot\'s right').toBe(460);
    // a chip that fits neither side of its foot in the area is not shown half under the panel
    get().cam.panelInsetRef.current = { right: 640, bottom: 0 };
    cam.x = 100.5 - (80 - 400) / 8;
    act(() => { get().frames.schedule(); });
    settle();
    expect(verseToX(cam, 800, 100.5)).toBeCloseTo(80, 6);
    expect(el().style.visibility, 'a 180 px chip in a 160 px area: hidden').toBe('hidden');
    expect(get().keepOutRef.current).toBeNull();
  });

  it('the chip tells the overlay where it stands (keepOutRef, CSS px), so the canvas labels keep off it; it lets go when the chip goes', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    const { container, get } = mountWeb();
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    const el = /** @type {HTMLElement} */ (container.querySelector('.sw-goto-chip'));
    const [, tx, ty] = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform).map(Number);
    expect(el.style.visibility).toBe('visible');
    expect(get().keepOutRef.current).toEqual([{ x0: tx, x1: tx + 180, y0: ty - 30, y1: ty }]);
    // a still camera publishes the same box and asks for no further frame: the loop goes quiet
    act(() => { get().frames.schedule(); });
    settle(40);
    expect(rafQueue.length).toBe(0);
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 1 }); });
    act(() => { get().frames.schedule(); });
    settle();
    expect(container.querySelector('.sw-goto-chip')).toBeNull();
    expect(get().keepOutRef.current).toBeNull();
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

  it('a short chapter is framed at the zoom ceiling, centred, not at 70 % (the ceiling wins; CONTRACTS.md deviation)', async () => {
    // Genesis 2 is two verses: 70 % of an 800 px frame would be 280 px a verse, past the 44 CSS
    // px a verse the camera stops at (geometry.js maxZoomFor), so it lands at the ceiling: 88 px,
    // 11 % of the frame, on the chapter's centre
    const g = graph();
    g.chapters = [[0, 1, 0, 15550], [0, 2, 15550, 2], [0, 3, 15552, TOTAL - 15552]];
    g.chapterOfVerse = new Uint16Array(TOTAL).map((_, v) => (v < 15550 ? 0 : v < 15552 ? 1 : 2));
    const { container, get } = mountWeb({ web: g, cam: { x: 3000, ppv: 1 } });
    act(() => { get().goTo.open('Genesis 2'); });
    expect(rowTexts(container)[0]).toBe('Genesis 2 · whole chapter');
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    const cam = get().cam.camRef.current;
    const ceiling = fitPPV(cam, 800) * maxZoomFor(TOTAL, 800);
    expect(ceiling).toBeCloseTo(PPV_MAX_CSS, 9);
    expect(0.7 * 800 / 2, 'what 70 % asks').toBeGreaterThan(ceiling);
    expect(cam.ppv).toBeCloseTo(ceiling, 9);
    expect(cam.x, 'centred on the chapter').toBeCloseTo(15551, 6);
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

  /* w4 interaction hunt: a row's Follow pushed its arrival with no `open`, so the trail filled it
     from what was open at the push: the PREVIOUS connection (setDetail had not rendered). Two row
     Follows, then Back, reopened the line before the first row's. Each arrival now carries the
     row's own connection, as followThread's do; the trail's start keeps what was open there. */
  it('two row Follows, then Back: the first row\'s line opens again, and Back home the line set out from', async () => {
    const { get } = mountWeb({ cam: { x: 150, ppv: 8 } });
    act(() => { get().sel.openPanel({ mode: 'connection', arc: 0 }); });
    settle();
    act(() => { get().sel.followRow({ index: 2, hereVerse: 100, otherVerse: 300 }); });
    settle(); await flush();
    act(() => { get().sel.followRow({ index: 1, hereVerse: 300, otherVerse: 200 }); });
    settle(); await flush();
    expect(get().sel.panel.spec).toMatchObject({ mode: 'connection', arc: 1 });
    await back(get);
    expect(get().sel.panel.spec, 'the first row\'s line').toMatchObject({ mode: 'connection', arc: 2 });
    await back(get);
    expect(get().sel.panel.spec, 'where the trail set out: the line that was open there').toMatchObject({ mode: 'connection', arc: 0 });
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

describe('hereLabel: what a crumb calls where the reader set out from', () => {
  // two books: Genesis of chapters 1 (100 verses) and 2 (50), then Exodus 1, the rest
  const g = graph();
  g.books = [{ id: 'genesis', title: 'Genesis', abbr: 'Gen' }, { id: 'exodus', title: 'Exodus', abbr: 'Exod' }];
  g.chapters = [[0, 1, 0, 100], [0, 2, 100, 50], [1, 1, 150, TOTAL - 150]];
  g.chapterOfVerse = new Uint16Array(TOTAL).map((_, v) => (v < 100 ? 0 : v < 150 ? 1 : 2));
  it('the camera at fit, or nearly the whole canon in view, is the whole web', () => {
    expect(hereLabel(g, [0, TOTAL / 2], 120, true)).toBe('the whole web');
    expect(hereLabel(g, [-50, TOTAL + 50], 15551, false)).toBe('the whole web');
    expect(hereLabel(g, [0, 0.9 * TOTAL], 15551, false)).toBe('the whole web');
  });
  it('else the smallest of the book, the chapter or the verse at the centre that the view holds whole', () => {
    expect(hereLabel(g, [0, 200], 120, false), 'all of Genesis in view').toBe('Genesis');
    expect(hereLabel(g, [95, 155], 120, false), 'Genesis 2 in view, not Genesis').toBe('Genesis 2');
    expect(hereLabel(g, [110, 130], 120, false), 'inside a chapter').toBe('Genesis 2:21');
    expect(hereLabel(g, [10000, 12000], 11000, false), 'inside Exodus 1, its one chapter').toBe('Exodus 1:10851');
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
  // review 2026-10-18: opened from the search button, the box's trap gave focus back to the button
  // after choose had sent it home, so the arrows, Enter and Backspace went to the button; and the
  // panel opening in the same commit took the button as where its own close goes
  it('opened from the search button, Enter on a book: the keyboard is on the web, not the button, and the arrows pan it', async () => {
    const g = graph();
    g.books = [{ id: 'genesis', title: 'Genesis', abbr: 'Gen' }, { id: 'exodus', title: 'Exodus', abbr: 'Exod' }];
    g.chapters = [[0, 1, 0, 15550], [1, 1, 15550, TOTAL - 15550]];
    g.chapterOfVerse = new Uint16Array(TOTAL).map((_, v) => (v < 15550 ? 0 : 1));
    const { container, get } = mountWeb({ keys: true, web: g, cam: { x: 20000, ppv: 1 } });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    const button = /** @type {HTMLElement} */ (container.querySelector('.sw-goto-btn'));
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(input(container));
    fireEvent.change(input(container), { target: { value: 'Genesis' } });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    expect(box(container)).toBeNull();
    expect(get().journey.stack.map((e) => e.label).pop()).toBe('Genesis');
    expect(document.activeElement, 'the web has the keyboard, not the button that opened the box').toBe(root);
    settle(); await flush();
    const x = get().cam.camRef.current.x;
    fireEvent.keyDown(/** @type {HTMLElement} */ (document.activeElement), { key: 'ArrowRight' });
    settle();
    expect(get().cam.camRef.current.x, 'the arrows pan the web').toBeGreaterThan(x);
  });

  it('opened from the search button, Enter on a verse, then its panel closed: the keyboard goes home to the web', async () => {
    const { container, get } = mountWeb({ keys: true, sheet: true });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    const button = /** @type {HTMLElement} */ (container.querySelector('.sw-goto-btn'));
    button.focus();
    fireEvent.click(button);
    fireEvent.change(input(container), { target: { value: 'Gen 1:101' } });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    const sheet = /** @type {HTMLElement} */ (container.querySelector('.sw-sheet'));
    expect(get().sel.detail).toMatchObject({ kind: 'verse', verse: 100 });
    expect(document.activeElement, 'the panel takes the keyboard as it opens').toBe(sheet);
    settle(); await flush();
    fireEvent.click(/** @type {HTMLElement} */ (sheet.querySelector('.sw-sheet-close')));
    expect(container.querySelector('.sw-sheet')).toBeNull();
    expect(document.activeElement, 'its close goes home to the web, not to the search button').toBe(root);
  });

  it('Backspace goes back along the trail: to where the go-to set out, named; nothing further back, said so', async () => {
    const { container, get, setAnnounce } = mountWeb({ keys: true });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(get().journey.stack.map((e) => e.label)).toEqual(['Genesis 1:15552', 'Genesis 1:101']);
    fireEvent.keyDown(root, { key: 'Backspace' });
    settle(); await flush(); settle();
    expect(setAnnounce).toHaveBeenLastCalledWith('Back to Genesis 1:15552');
    expect(get().journey.stack, 'home: the trail is done').toEqual([]);
    expect(get().cam.camRef.current.x, 'where it set out').toBeCloseTo(15551, 6);
    expect(get().sel.panel, 'the overview had nothing open').toBeNull();
    fireEvent.keyDown(root, { key: 'Backspace' });
    expect(setAnnounce).toHaveBeenLastCalledWith('Nothing to go back to');
  });

  // review 2026-10-18: from the rest view the crumb named the verse at the centre, so Back said
  // "Back to Psalms 103:2" on its way to the whole canon
  it('Backspace home to the whole web says so, not the verse at its centre', async () => {
    const { container, get, setAnnounce } = mountWeb({ keys: true, cam: { x: TOTAL / 2, ppv: 800 / TOTAL } });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    act(() => { get().goTo.open('Genesis 1:101'); });
    fireEvent.keyDown(input(container), { key: 'Enter' });
    settle(); await flush();
    expect(get().journey.stack.map((e) => e.label)).toEqual(['the whole web', 'Genesis 1:101']);
    fireEvent.keyDown(root, { key: 'Backspace' });
    settle(); await flush(); settle();
    expect(setAnnounce).toHaveBeenLastCalledWith('Back to the whole web');
  });

  it('Enter on the web takes the line at the centre; ] steps on from it', () => {
    const { container, get } = mountWeb({ keys: true, cam: { x: 300, ppv: 8 } });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1 });
    fireEvent.keyDown(root, { key: ']' });
    expect(get().sel.detail.index, 'the next line at verse 300').toBe(2);
  });

  /* w4 quality hunt: the panel takes focus when it first opens (web-panel.jsx), and the web's keys
     only ran with the root itself focused, so after Enter the [ ] + - and arrows the help text
     promises did nothing. The panel's own container is the web's for its keys; a control inside it
     keeps its own keys (a row's Enter is the row's). */
  it('after Enter opens the panel and the panel has the keyboard, ] still steps and + still zooms', () => {
    const { container, get } = mountWeb({ keys: true, sheet: true, cam: { x: 300, ppv: 8 } });
    const root = /** @type {HTMLElement} */ (container.querySelector('.sw-root'));
    root.focus();
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(get().sel.detail).toMatchObject({ kind: 'arc', index: 1 });
    const panel = /** @type {HTMLElement} */ (container.querySelector('.sw-panel'));
    expect(document.activeElement, 'PRECONDITION: the panel took the keyboard').toBe(panel);
    fireEvent.keyDown(panel, { key: ']' });
    expect(get().sel.detail.index, 'the next line at verse 300').toBe(2);
    const ppv = get().cam.camRef.current.ppv;
    fireEvent.keyDown(document.activeElement, { key: '+' });
    expect(get().cam.camRef.current.ppv).toBeGreaterThan(ppv);
    // a control inside the panel keeps its keys
    const close = /** @type {HTMLElement} */ (container.querySelector('.sw-sheet-close'));
    const at = get().sel.detail.index;
    fireEvent.keyDown(close, { key: ']' });
    expect(get().sel.detail.index).toBe(at);
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
