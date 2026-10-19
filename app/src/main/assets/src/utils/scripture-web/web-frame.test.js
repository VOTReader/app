/* web-frame — the Scripture Web's frame and render arguments (v15-code-health-06).
   These ran only inside ScriptureWebScreen, witnessed by browser walks. The
   numbers below are the formulas' own, worked by hand, so a change to where
   the dome sits or what the shader is told shows up here first. */
import { describe, it, expect } from 'vitest';
import { webFrame, webViewArgs, webYFrame, maxZoomOf, centreOf, RULER_H, RULER_PC, tapFadeStep, TAP_FADE_MS } from './web-frame.js';
import { MAX_STRETCH, squashFactor, localizeFactor, maxZoomFor } from './geometry.js';
import { focusState, withLit } from './focus-state.js';

const phone = { W: 1080, H: 2340, DPR: 3 };      // 360 x 780 CSS: narrow
const desktop = { W: 1920, H: 1080, DPR: 1 };    // wide

describe('webFrame', () => {
  it('a narrow screen reserves the control strip under the ruler', () => {
    const f = webFrame(phone, false);
    expect(f.ruler).toBe((RULER_H + 104) * 3);
  });

  it('a wide short screen (a phone on its side) reserves only the legend line', () => {
    expect(webFrame({ W: 2317, H: 1069, DPR: 2.6 }, false).ruler).toBeCloseTo((RULER_H + 26) * 2.6, 6);
  });

  /* w4 review 2: the build spec's H - 212 left the overview's band 177 px deep to the legend
     against r2-01a's 134 (black above or below the names wherever they stood); the baseline is at
     r2-01a's depth now, and the deep-zoom band closes its gaps to fit (overlay-canvas.test.js). */
  it("a PC's canon baseline sits at r2-01a's band depth, H - 180 (build spec §3, w4 amendment); My Web keeps the short ruler", () => {
    expect(RULER_PC).toBe(180);
    expect(webFrame(desktop, false).ruler).toBe(180);
    expect(webFrame(desktop, false).base).toBe(1080 - 180);
    expect(webFrame(desktop, true).ruler).toBe(RULER_H + 26);
  });

  it('on a tall phone the dome keeps its stretch and the slack goes mostly above it', () => {
    const f = webFrame(phone, false);
    const avail = phone.H - f.ruler;
    const domeH = (phone.W / 2) * MAX_STRETCH;
    expect(domeH).toBeLessThan(avail);                       // the precondition: there IS slack
    expect(f.ceil).toBeCloseTo(domeH * 0.985, 6);
    expect(f.base).toBeCloseTo(domeH + (avail - domeH) * 0.72, 6);
    expect(f.base).toBeLessThanOrEqual(avail);
  });

  it('on a wide screen the dome fills the height and sits on the ruler', () => {
    const f = webFrame(desktop, false);
    const avail = desktop.H - f.ruler;
    expect(f.base).toBe(avail);
    expect(f.ceil).toBeCloseTo(avail * 0.985, 6);
  });

  it('My Web has no dome: the rails take the frame less the legend strip', () => {
    const f = webFrame(phone, true);
    const base = phone.H - f.ruler - 20 * 3;
    expect(f.base).toBe(base);
    expect(f.ceil).toBeCloseTo(base * 0.985, 6);
  });

  it('a DPR of 0 is read as 1 when deciding narrow', () => {
    expect(webFrame({ W: 500, H: 900, DPR: 0 }, false).ruler).toBe(0);   // narrow, times DPR 0
  });
});

describe('webViewArgs', () => {
  const cam = { ppv: 3, y: 12, total: 360, x: 0 };
  const f = webFrame(desktop, false);

  it('tells the shader the frame, the squash, the localize, the camera height, the dpr and the focus', () => {
    const focus = focusState({ arc: 7, range: [1, 5], hover: 4, hoverProphecy: 6 });
    const a = webViewArgs(desktop, cam, f, 'famous', focus);
    expect(a).toEqual({
      width: 1920, height: 1080, base: f.base, ceil: f.ceil,
      squash: squashFactor(f.ceil, 1920),
      localize: localizeFactor(3 / (1920 / 360)),
      camY: 12, dpr: desktop.DPR, density: 'famous', rulerDepth: f.ruler,
      focusArc: 7, focusRange: [1, 5],
      focusProphecy: -1, hoverArc: 4, hoverProphecy: 6, lit: null, litKey: '',
    });
  });

  it('a camera below the baseline draws at height 0, and there is no second range (retired in w5)', () => {
    const a = webViewArgs(desktop, { ...cam, y: -4 }, f, 'essential', { arc: -1, range: null });
    expect(a.camY).toBe(0);
    expect(a).not.toHaveProperty('focusRange2');
    // an old-shape focus (no hover, no lit) still reads as nothing hovered or lit
    expect(a).toMatchObject({ hoverArc: -1, hoverProphecy: -1, lit: null, litKey: '', focusProphecy: -1 });
  });

  it('a chosen prophecy pair goes over as focusProphecy, never as an OpenBible arc id', () => {
    const a = webViewArgs(desktop, cam, f, 'famous', focusState({ arc: 3, prophecy: true }));
    expect(a.focusArc).toBe(-1);
    expect(a.focusProphecy).toBe(3);
    // prophecy with nothing chosen is nothing
    expect(webViewArgs(desktop, cam, f, 'famous', focusState({ prophecy: true })).focusProphecy).toBe(-1);
  });

  it('hands the lit set and its key through untouched, so the renderer can dirty-check the upload', () => {
    const focus = withLit(focusState({ arc: 2 }), [5, 6, 7]);
    const a = webViewArgs(desktop, cam, f, 'famous', focus);
    expect(a.lit).toBe(focus.lit);
    expect(a.litKey).toBe(focus.litKey);
    expect(a.litKey).not.toBe('');
  });
});

describe('centreOf (the centre chapter, the lens replacement)', () => {
  // two books; chapter 1 of the second book holds verses 10..13
  const g = {
    books: [{ id: 'a' }, { id: 'b' }],
    chapters: [[0, 1, 0, 6], [0, 2, 6, 4], [1, 1, 10, 4]],
    chapterOfVerse: Uint16Array.from([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]),
  };

  it('names the lens chapter: its book, its number and its half-open canon x range', () => {
    expect(centreOf(g, [10, 13], 24)).toEqual({ chapterIndex: 2, book: 1, chapter: 1, x0: 10, x1: 14, t: 1 });
    expect(centreOf(g, [6, 9], 12)).toMatchObject({ chapterIndex: 1, book: 0, chapter: 2, x0: 6, x1: 10 });
  });

  it('eases in over the lens zoom: 0 at 6x, 1 from 24x', () => {
    expect(centreOf(g, [0, 5], 6).t).toBe(0);
    expect(centreOf(g, [0, 5], 12).t).toBeCloseTo(0.5, 10);
    expect(centreOf(g, [0, 5], 200).t).toBe(1);
  });

  it('is null with no lens (below 6x, or My Web)', () => {
    expect(centreOf(g, null, 40)).toBeNull();
    expect(centreOf(g, [5, 4], 40)).toBeNull();
    expect(centreOf(null, [0, 5], 40)).toBeNull();
  });
});

describe('webYFrame and maxZoomOf', () => {
  it('the y frame carries the frame, its squash and the widest span', () => {
    const f = webFrame(desktop, false);
    expect(webYFrame(desktop, f, 900)).toEqual({ base: f.base, ceil: f.ceil, squash: squashFactor(f.ceil, 1920), maxSpan: 900 });
  });

  it('the zoom ceiling reads the CSS width; before the graph lands it is 4000', () => {
    expect(maxZoomOf(null, phone)).toBe(4000);
    expect(maxZoomOf({ total: 31000 }, phone)).toBe(maxZoomFor(31000, 360));
    expect(maxZoomOf({ total: 31000 }, { W: 0, H: 0, DPR: 0 })).toBe(maxZoomFor(31000, 1));
  });
});

/* GL item 5: while a line is chosen the rest of the web recedes to TAP_CONTEXT, over ~180 ms,
   and comes back the same way. Hover is never a target (it dims nothing). */
describe('tapFadeStep (the tap\'s fade, eased)', () => {
  it('the first frame starts where it should be: nothing chosen is 0, a web opened on a choice is 1, neither running', () => {
    expect(tapFadeStep(null, 0, 1000)).toMatchObject({ value: 0, running: false });
    expect(tapFadeStep(null, 1, 1000)).toMatchObject({ value: 1, running: false });
  });

  it('a tap eases 0 -> 1 over TAP_FADE_MS, never stepping backwards, half way at half time', () => {
    expect(TAP_FADE_MS).toBe(180);
    let s = tapFadeStep(null, 0, 0);
    s = tapFadeStep(s, 1, 1000);
    expect(s).toMatchObject({ value: 0, running: true });
    const start = s;
    let prev = 0;
    for (let t = 1000; t <= 1180; t += 15) {
      s = tapFadeStep(s, 1, t);
      expect(s.value).toBeGreaterThanOrEqual(prev);
      prev = s.value;
    }
    expect(tapFadeStep(start, 1, 1090).value).toBeCloseTo(0.5, 6);
    s = tapFadeStep(s, 1, 1181);
    expect(s).toMatchObject({ value: 1, running: false });
    // and it stays put without asking for frames
    expect(tapFadeStep(s, 1, 5000)).toBe(s);
  });

  it('letting go mid-fade turns back from where it is: no jump', () => {
    let s = tapFadeStep(null, 0, 0);
    s = tapFadeStep(s, 1, 0);
    s = tapFadeStep(s, 1, 60);
    const mid = s.value;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    s = tapFadeStep(s, 0, 60);
    expect(s.value).toBeCloseTo(mid, 12);
    expect(s.running).toBe(true);
    s = tapFadeStep(s, 0, 60 + TAP_FADE_MS);
    expect(s).toMatchObject({ value: 0, running: false });
  });

  it('under reduced motion (ms 0) it jumps', () => {
    let s = tapFadeStep(null, 0, 0);
    s = tapFadeStep(s, 1, 10, 0);
    expect(s).toMatchObject({ value: 1, running: false });
  });
});
