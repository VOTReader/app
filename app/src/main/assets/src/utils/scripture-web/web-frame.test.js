/* web-frame — the Scripture Web's frame and render arguments (v15-code-health-06).
   These ran only inside ScriptureWebScreen, witnessed by browser walks. The
   numbers below are the formulas' own, worked by hand, so a change to where
   the dome sits or what the shader is told shows up here first. */
import { describe, it, expect } from 'vitest';
import { webFrame, webViewArgs, webYFrame, maxZoomOf, RULER_H } from './web-frame.js';
import { MAX_STRETCH, squashFactor, localizeFactor, maxZoomFor } from './geometry.js';

const phone = { W: 1080, H: 2340, DPR: 3 };      // 360 x 780 CSS: narrow
const desktop = { W: 1920, H: 1080, DPR: 1 };    // wide

describe('webFrame', () => {
  it('a narrow screen reserves the control strip under the ruler', () => {
    const f = webFrame(phone, false);
    expect(f.ruler).toBe((RULER_H + 104) * 3);
  });

  it('a wide screen reserves only the legend line', () => {
    expect(webFrame(desktop, false).ruler).toBe(RULER_H + 26);
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

  it('tells the shader the frame, the squash, the localize, the camera height and the focus', () => {
    const focus = { arc: 7, range: [1, 5], range2: /** @type {[number, number]} */ ([2, 3]) };
    const a = webViewArgs(desktop, cam, f, 'famous', focus);
    expect(a).toEqual({
      width: 1920, height: 1080, base: f.base, ceil: f.ceil,
      squash: squashFactor(f.ceil, 1920),
      localize: localizeFactor(3 / (1920 / 360)),
      camY: 12, density: 'famous', rulerDepth: f.ruler,
      focusArc: 7, focusRange: [1, 5], focusRange2: [2, 3],
    });
  });

  it('a camera below the baseline draws at height 0, and no second band is null', () => {
    const a = webViewArgs(desktop, { ...cam, y: -4 }, f, 'essential', { arc: -1, range: null });
    expect(a.camY).toBe(0);
    expect(a.focusRange2).toBeNull();
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
