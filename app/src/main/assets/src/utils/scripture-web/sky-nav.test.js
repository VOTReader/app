// @ts-nocheck
/**
 * Sky navigation (lanes/myweb/out/structure-law.md, landing 9). Corbin,
 * 2026-09-21: see every line, zoom way in, "someway somehow navigate them".
 * Panned up, the frame is a slice of the dome: curves at every angle,
 * sparse, each the subject. Three things make the sky navigable:
 *  - the fly-over law lets go as the reader rises (skyLocalize): a thread
 *    whose feet are both off-frame is what the sky is made of;
 *  - an altitude ruler names the height in verses of span (a chapter, a
 *    book, a testament, the canon) in the canon ramp's own colour;
 *  - an elevator on the right edge jumps the camera's height.
 * Every case reads the exports off the module objects, so this file LOADS on
 * the tree before the landing and is RED there for the landing's reason.
 */
import { describe, it, expect } from 'vitest';
import * as geo from './geometry.js';
import * as pal from './palette.js';
import { SHADER_SOURCE } from '../../ui/scripture-web/web-renderer.js';

describe('the fly-over law lets go as the reader rises', () => {
  it('skyLocalize: unchanged at the baseline, gone at the ceiling, linear between', () => {
    expect(typeof geo.skyLocalize).toBe('function');
    expect(geo.skyLocalize(0.8, 0, 512)).toBe(0.8);
    expect(geo.skyLocalize(0.8, 512, 512)).toBe(0);
    expect(geo.skyLocalize(0.8, 2000, 512)).toBe(0);
    expect(geo.skyLocalize(1, 256, 512)).toBeCloseTo(0.5, 9);
    expect(geo.skyLocalize(0.8, -3, 512)).toBe(0.8);
    expect(geo.skyLocalize(0.8, 100, 0)).toBe(0.8);
  });

  it('a fly-over at the ceiling of the sky keeps its full alpha; at the baseline the floor', () => {
    expect(geo.flyOverDim(0, geo.skyLocalize(1, 512, 512))).toBe(1);
    expect(geo.flyOverDim(0, geo.skyLocalize(1, 0, 512))).toBeCloseTo(geo.FLYOVER_FLOOR, 9);
  });

  it('the vertex shader dims fly-overs by uFlyLocalize, not the tessellation\'s uLocalize', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uFlyLocalize;/);
    expect(SHADER_SOURCE.vertex).toMatch(/flyOverDim\(arcAnchored\(x0, x1, uRes\.x\), uFlyLocalize\)/);
    // the clip of the samples onto the viewport still reads uLocalize: the
    // sky must not draw a visible piece as one chord
    expect(SHADER_SOURCE.vertex).toMatch(/mix\(left,\s+max\(left,\s+-m\),\s+uLocalize\)/);
  });
});

describe('the altitude ruler: height in verses of span, the inverse of arcShape', () => {
  it('ALTITUDE_MARKS name a chapter, a book, a testament and the canon', () => {
    expect(geo.ALTITUDE_MARKS.map((m) => m.span)).toEqual([30, 1000, 15000, 31102]);
    for (const m of geo.ALTITUDE_MARKS) expect(typeof m.name).toBe('string');
  });

  it('spanAtHeight inverts arcShape for every mark at three cameras', () => {
    for (const [ppv, squash] of [[0.5, 0.64], [44, 0.64], [3, 1.2]]) {
      for (const m of geo.ALTITUDE_MARKS) {
        const h = geo.arcShape((m.span * ppv) / 2, squash).A;
        expect(geo.spanAtHeight(h, ppv, squash)).toBeCloseTo(m.span, 6);
      }
    }
    expect(geo.spanAtHeight(0, 44, 0.64)).toBe(0);
    expect(geo.spanAtHeight(-5, 44, 0.64)).toBe(0);
    expect(geo.spanAtHeight(100, 0, 0.64)).toBe(0);
  });

  it('the ramp has a JS twin: distanceRampRGB reads the same stops the shader does, 0..255', () => {
    const first = pal.DISTANCE_RAMP[0], last = pal.DISTANCE_RAMP[pal.DISTANCE_RAMP.length - 1];
    expect(pal.distanceRampRGB(0)).toEqual(first.map((c) => Math.round(c * 255)));
    expect(pal.distanceRampRGB(1)).toEqual(last.map((c) => Math.round(c * 255)));
    expect(pal.distanceRampRGB(7)).toEqual(last.map((c) => Math.round(c * 255)));
    // half way between two stops is their mean
    const n = pal.DISTANCE_RAMP.length - 1;
    const mid = pal.distanceRampRGB(0.5 / n);
    for (let k = 0; k < 3; k++) {
      expect(mid[k]).toBe(Math.round(((pal.DISTANCE_RAMP[0][k] + pal.DISTANCE_RAMP[1][k]) / 2) * 255));
    }
  });
});
