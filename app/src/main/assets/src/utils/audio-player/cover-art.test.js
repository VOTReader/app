import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCoverArt, coverArt } from './cover-art.js';

/** The canvas prototype, loosely typed so a test can stand in a fake context. */
const canvasProto = /** @type {any} */ (HTMLCanvasElement.prototype);

/** A 2d context that records what it was asked to write, measuring every glyph at half its px. */
function fakeContext() {
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '', letterSpacing: '',
    texts: /** @type {{ text: string, font: string }[]} */ ([]),
    fillRect() {}, strokeRect() {},
    measureText(t) { return { width: t.length * (Number(/(\d+)px/.exec(ctx.font)?.[1]) || 10) * 0.5 }; },
    fillText(text) { ctx.texts.push({ text, font: ctx.font }); },
  };
  return ctx;
}

describe('cover-art - a collection cover for the lock screen (pl-l5)', () => {
  /** @type {ReturnType<typeof fakeContext>[]} */
  let drawn;
  let origGet; let origUrl;
  beforeEach(() => {
    _resetCoverArt();
    drawn = [];
    origGet = HTMLCanvasElement.prototype.getContext;
    origUrl = HTMLCanvasElement.prototype.toDataURL;
    canvasProto.getContext = function () { const c = fakeContext(); drawn.push(c); return c; };
    canvasProto.toDataURL = function () { return 'data:image/png;base64,COVER' + drawn.length; };
  });
  afterEach(() => {
    canvasProto.getContext = origGet;
    canvasProto.toDataURL = origUrl;
    delete /** @type {any} */ (document).fonts;
  });

  it('draws the collection name, a rule and the app name, once per collection', () => {
    const a = coverArt('Volume One');
    expect(a).toBe('data:image/png;base64,COVER1');
    expect(drawn[0].texts.map((t) => t.text)).toEqual(['Volume', 'One', 'VOTREADER']);   // as the mockup sets it
    expect(coverArt('Volume One')).toBe(a);        // kept
    expect(drawn).toHaveLength(1);
    expect(coverArt('Words to Live By')).toBe('data:image/png;base64,COVER2');
  });

  it('a long name steps down and wraps to at most three lines inside the frame', () => {
    coverArt('NKJV · The Word of Promise (Dramatized) Complete Audio Bible Edition');
    const lines = drawn[0].texts.slice(0, -1);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    const px = Number(/(\d+)px/.exec(lines[0].font)[1]);
    expect(px).toBeLessThan(92);
  });

  it('no name is the app\'s; no canvas is no picture', () => {
    coverArt('');
    expect(drawn[0].texts.slice(0, -1).map((t) => t.text).join(' ')).toBe('The Volumes of Truth');
    _resetCoverArt();
    canvasProto.getContext = function () { return null; };
    expect(coverArt('Volume One')).toBe('');
  });

  it('a cover drawn before the fonts load is used once and drawn again later', () => {
    let ready = false;
    const load = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fonts', { configurable: true, value: { check: () => ready, load } });
    expect(coverArt('Volume One')).toBe('data:image/png;base64,COVER1');
    expect(load).toHaveBeenCalled();
    ready = true;
    expect(coverArt('Volume One')).toBe('data:image/png;base64,COVER2');
    expect(coverArt('Volume One')).toBe('data:image/png;base64,COVER2');
  });
});
