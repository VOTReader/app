/* sw-ink: the one ink table the shader and Canvas2D both read (digest C6, the build spec §4).
   The spec's numbers are pinned here by name, so a stream that retunes a colour does it in the
   table and says so in its commit, and the GLSL and 2D sides cannot drift apart. */
import { describe, it, expect } from 'vitest';
import {
  INK, ink, rgba01, css, inkWidth, inkGLSL,
  TAP_CONTEXT, MYWEB_TAP_CONTEXT, CENTRE_BRIGHT, CENTRE_WIDTH, FLYOVER_LEG_WIDTH, FONT,
} from './sw-ink.js';

/** WCAG 2 relative luminance of '#rrggbb'. */
function luminance(hex) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** '#rrggbb' -> { h: degrees, s, l } (HSL). */
function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

describe('the ink table', () => {
  it('every row is a #rrggbb hex, a straight alpha in (0, 1], and a positive width where it has one', () => {
    const names = Object.keys(INK);
    expect(names.length, 'PRECONDITION: the table is not empty').toBeGreaterThan(40);
    for (const name of names) {
      const e = INK[name];
      expect(e.hex, name).toMatch(/^#[0-9A-F]{6}$/);
      expect(e.alpha > 0 && e.alpha <= 1, name + ' alpha').toBe(true);
      if (e.width != null) expect(e.width, name + ' width').toBeGreaterThan(0);
      if (e.widthCompact != null) {
        expect(e.width, name + ': a compact width needs the PC one').toBeGreaterThan(0);
        expect(e.widthCompact, name + ' compact is never wider').toBeLessThanOrEqual(e.width);
      }
    }
  });

  it('is frozen, row by row, so nobody retunes it at runtime', () => {
    expect(Object.isFrozen(INK)).toBe(true);
    for (const name of Object.keys(INK)) expect(Object.isFrozen(INK[name]), name).toBe(true);
  });

  it('holds the spec §4.2 inks by name', () => {
    expect(INK.canvas).toEqual({ hex: '#000000', alpha: 1 });
    expect(INK.cited).toEqual({ hex: '#C4A469', alpha: 0.70 });
    // the prophecy class, retuned from the spec's .80 / 1.25 px / .12 (set for 51 pairs) to its
    // pale-constellation intent over the asset's 131 (GL review 2026-10-18): a 1 device px core,
    // in r2-01a's pale gold and with no glow (w4 INK item 5), at .45 (w4 INK review 2's pairs);
    // the legend's arc in the same gold
    expect(INK.prophecy).toEqual({ hex: '#EFD18A', alpha: 0.45 });
    expect(INK.prophecyKey).toEqual({ hex: '#EFD18A', alpha: 0.90 });
    expect(INK.prophecyGlow, 'the class has no glow').toBeUndefined();
    // the chosen, hovered and lit lines in the pictures' gold (w4 INK item 3; the spec's #E6D3A3 read
    // cream): the spec's alphas and widths, which My Web's threads read too (rail-renderer)
    expect(INK.chosen).toEqual({ hex: '#F2D38A', alpha: 1, width: 3, widthCompact: 2.5 });
    expect(INK.chosenHalo).toEqual({ hex: '#E0A84E', alpha: 0.22, width: 10 });
    expect(INK.chosenFoot).toEqual({ hex: '#F2D38A', alpha: 1, width: 8 });
    expect(INK.chosenFootRing).toEqual({ hex: '#000000', alpha: 1, width: 2 });
    // w4 INK review, finding 5: a dark keyline under the chosen core (the foot ring's black), so the
    // line reads first over a field that keeps .60 of its ink; review 2, finding 6: at .50, 1 CSS px
    // each side on PC and half of one on the phone, not r2-02's absent dark tube
    expect(INK.chosenKey).toEqual({ hex: '#000000', alpha: 0.50, width: 5, widthCompact: 3.5 });
    expect(inkWidth('chosenKey') - inkWidth('chosen')).toBe(2);
    expect(inkWidth('chosenKey', true) - inkWidth('chosen', true)).toBe(1);
    expect(ink('chosenKey').alpha).toBeGreaterThanOrEqual(0.45);
    expect(ink('chosenKey').alpha).toBeLessThanOrEqual(0.55);
    expect(inkWidth('chosenKey')).toBeLessThan(inkWidth('chosenHalo'));
    expect(INK.chosenLabel).toEqual({ hex: '#F2D38A', alpha: 1 });
    // w4 readdown item 1: the chosen line's gold at 2 px hid in the pale-gold mass from Psalms to
    // John; lighter, on the chosen line's keyline, it is cut out of it
    expect(INK.hover).toEqual({ hex: '#FFE7A8', alpha: 1, width: 2 });
    expect(INK.hoverKey).toEqual({ hex: '#000000', alpha: 0.50, width: 4, widthCompact: 3 });
    expect(inkWidth('hoverKey') - inkWidth('hover')).toBe(2);
    expect(inkWidth('hoverKey', true) - inkWidth('hover', true)).toBe(1);
    expect(inkWidth('hoverKey')).toBeLessThan(inkWidth('hoverHalo'));
    expect(INK.hoverHalo).toEqual({ hex: '#E0A84E', alpha: 0.22, width: 10 });
    expect(INK.lit).toEqual({ hex: '#E8BE6E', alpha: 0.85, width: 1.5 });
    expect(INK.roots).toEqual({ hex: '#C4A469', alpha: 0.25 });
    expect(INK.myWebReader).toEqual({ hex: '#E0B25A', alpha: 0.95, width: 1.5 });
    expect(INK.panel).toEqual({ hex: '#1C2527', alpha: 1 });
    expect(INK.bookLabel.hex).toBe('#B7BFC1');
    expect(INK.bookLabelMajor.hex).toBe('#E0E6E7');
    expect(INK.gold.hex).toBe('#C4A469');
    expect(INK.centreWash).toEqual({ hex: '#C4A469', alpha: 0.10 });
  });

  it("My Web's two families: Timothy's notes one cool family at the .30 plateau (C13, C14), the reader's links warm and at least 4.5:1 on the canvas", () => {
    const timothy = ['myWebFootnote', 'myWebStudyNote', 'myWebWtlb', 'myWebStudy'];
    for (const name of timothy) {
      expect(INK[name].alpha, name).toBe(0.30);
      const [r, , b] = rgba01(name);
      expect(b, name + ' is cool: blue over red').toBeGreaterThan(r);
    }
    const [r, , b] = rgba01('myWebReader');
    expect(r, 'the reader is warm: red over blue').toBeGreaterThan(b);
    expect(contrast(INK.myWebReader.hex, INK.canvas.hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('the chosen, hovered and lit lines read GOLD, not cream, and the halo is the deeper amber under the core (r2-02, r3-03, r3-04)', () => {
    for (const name of ['chosen', 'chosenFoot', 'chosenLabel', 'hover', 'lit', 'chosenHalo', 'hoverHalo']) {
      const { h, s } = hsl(INK[name].hex);
      expect(h, name + ' hue: the gold family').toBeGreaterThanOrEqual(35);
      expect(h, name + ' hue: the gold family').toBeLessThanOrEqual(48);
      // the spec's #E6D3A3 is .57 saturated at .77 lightness: on the black canvas a cream
      expect(s, name + ' saturation: gold, not cream').toBeGreaterThanOrEqual(0.65);
    }
    expect(hsl(INK.chosenHalo.hex).l, 'the halo is deeper than the core it lies under').toBeLessThan(hsl(INK.chosen.hex).l);
    expect(INK.hoverHalo.hex).toBe(INK.chosenHalo.hex);
    // the hover is the chosen line's gold, lighter, and lighter than the prophecy class it crosses in
    // Psalms-John (w4 readdown item 1), on the chosen line's keyline
    expect(Math.abs(hsl(INK.hover.hex).h - hsl(INK.chosen.hex).h)).toBeLessThanOrEqual(3);
    expect(hsl(INK.hover.hex).l - hsl(INK.chosen.hex).l).toBeGreaterThanOrEqual(0.05);
    expect(hsl(INK.hover.hex).l - hsl(INK.prophecy.hex).l).toBeGreaterThanOrEqual(0.05);
    expect([INK.hoverKey.hex, INK.hoverKey.alpha]).toEqual([INK.chosenKey.hex, INK.chosenKey.alpha]);
    // the label is text on the canvas: AAA
    expect(contrast(INK.chosenLabel.hex, INK.canvas.hex)).toBeGreaterThanOrEqual(7);
  });

  it('the prophecy class is r2-01a\'s pale gold: distinct from the field, told from the chosen line by weight, keyed in the legend in its own gold', () => {
    const { h, s } = hsl(INK.prophecy.hex);
    expect(h, 'hue: the gold family').toBeGreaterThanOrEqual(35);
    expect(h, 'hue: the gold family').toBeLessThanOrEqual(48);
    // the old #EADFC4 (.53 saturated) read as the field's own tan; r2-01a's arcs are gold
    expect(s, 'saturation: gold, not cream').toBeGreaterThanOrEqual(0.65);
    // pale by its ink, not its colour: under half the chosen line's, on a 1 device px core, so
    // the 131 pairs never knot into the cream tangle; legible over the field, not a haze
    expect(INK.prophecy.alpha).toBeLessThan(INK.chosen.alpha * 0.5);
    expect(INK.prophecy.alpha).toBeGreaterThan(0.35);
    expect(INK.prophecy.width, '1 device px, the renderer\'s floor').toBeUndefined();
    // the legend draws the canvas's mark (the spec's legend: "[pale arc] prophecy fulfilled"),
    // at a weight a 1.5 px stroke can be seen by
    expect(INK.prophecyKey.hex).toBe(INK.prophecy.hex);
    expect(INK.prophecyKey.alpha).toBeGreaterThanOrEqual(0.85);
  });

  it('the panel and every chrome fill are night slate, never cream (#18, Q4)', () => {
    for (const name of ['panel', 'controlFill', 'activeFill', 'gotoFill', 'chipFill', 'pillFill']) {
      expect(luminance(INK[name].hex), name).toBeLessThan(0.05);
    }
    expect(INK.panel.alpha, 'the panel is opaque').toBe(1);
  });

  it('a tapped line makes the rest RECEDE, never vanish (C3, dead end 3): TAP_CONTEXT is .60, inside the .30-.60 the pictures allow', () => {
    // w4 INK item 4: one named constant in .30-.60; .60 since the w4 INK review (finding 5): at .45
    // the field was a brown haze against r2-02's, and the chosen line keeps its lead by a keyline
    expect(TAP_CONTEXT).toBe(0.60);
    expect(TAP_CONTEXT).toBeGreaterThanOrEqual(0.30);   // below, the field sinks to a haze
    expect(TAP_CONTEXT).toBeLessThanOrEqual(0.60);      // above, it crowds the chosen line
    expect(TAP_CONTEXT).toBeGreaterThan(0.05);   // today's near-black isolation is what it replaces
    expect(TAP_CONTEXT).toBeLessThan(1);
    // My Web's own (w4 INK review, finding 6): its other links share the chosen one's gold, so at
    // .60 the chosen link's lead over them fell from 3.2:1 to 2.2:1 (w4/ink pairs.md); it keeps .45
    expect(MYWEB_TAP_CONTEXT).toBe(0.45);
    expect(MYWEB_TAP_CONTEXT).toBeGreaterThanOrEqual(0.30);
    expect(MYWEB_TAP_CONTEXT).toBeLessThanOrEqual(TAP_CONTEXT);
  });

  it('both recedes, the Scripture Web\'s and My Web\'s, lie in .30-.60 and never take a line to 0', () => {
    // w4 INK review 2, finding 7: two named recedes, one per view (the split is the hub's call; the
    // reasons are above and in the README's "Rest of web" row). Each is a recede, never an erase
    for (const [name, k] of Object.entries({ TAP_CONTEXT, MYWEB_TAP_CONTEXT })) {
      expect(k, name).toBeGreaterThanOrEqual(0.30);
      expect(k, name).toBeLessThanOrEqual(0.60);
      for (const kind of ['lit', 'prophecy', 'cited', 'myWebReader', 'myWebStudy']) {
        expect(rgba01(kind, k)[3], `${name} x ${kind}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the other named constants', () => {
    expect(CENTRE_BRIGHT).toBe(1.35);
    expect(CENTRE_WIDTH).toBe(1.25);
    expect(FLYOVER_LEG_WIDTH).toBe(0.7);
    expect(FONT).toMatch(/^'EB Garamond'/);
  });

  it('My Web recedes by its own constant, MYWEB_TAP_CONTEXT .45, inside .30-.60 and never to 0', () => {
    // w4 myweb fix round 2: the pair at .30 and .45 with the receded links core only; at .30 the rest
    // sank near black, at .45 it still reads and the chosen link reads first (w4/myweb/pairs.md).
    // The INK stream's name and value, so the branches meet on one constant
    expect(MYWEB_TAP_CONTEXT).toBe(0.45);
    expect(MYWEB_TAP_CONTEXT).toBeGreaterThanOrEqual(0.30);
    expect(MYWEB_TAP_CONTEXT).toBeLessThanOrEqual(0.60);
    for (const kind of ['myWebReader', 'myWebStudy']) expect(rgba01(kind, MYWEB_TAP_CONTEXT)[3], kind).toBeGreaterThan(0);
  });
});

describe('the helpers', () => {
  it('ink() returns a row and throws on a name the table does not have, so a typo is loud', () => {
    expect(ink('gold')).toBe(INK.gold);
    expect(() => ink('golden')).toThrow(/no ink named golden/);
    expect(() => ink('toString')).toThrow(/no ink named/);
  });

  it('rgba01 gives straight-alpha floats for GLSL, scaled and clamped', () => {
    expect(rgba01('panel')).toEqual([28 / 255, 37 / 255, 39 / 255, 1]);
    expect(rgba01('cited')).toEqual([196 / 255, 164 / 255, 105 / 255, 0.70]);
    expect(rgba01('lit', TAP_CONTEXT)[3]).toBeCloseTo(0.85 * 0.60, 10);
    expect(rgba01('gold', 3)[3]).toBe(1);
    expect(rgba01('gold', -1)[3]).toBe(0);
  });

  it('css gives an rgba() string for Canvas2D with the same numbers', () => {
    expect(css('cited')).toBe('rgba(196,164,105,0.7)');
    expect(css('panel')).toBe('rgba(28,37,39,1)');
    expect(css('chipFill')).toBe('rgba(28,37,39,0.92)');
    expect(css('scrim')).toBe('rgba(0,0,0,0.65)');
    expect(css('chosenHalo', 0.5)).toBe('rgba(224,168,78,0.11)');
    // the two sides agree: the 2D string is the GLSL floats, x255
    const [r, g, b, a] = rgba01('prophecy');
    expect(css('prophecy')).toBe(`rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`);
  });

  it('inkWidth picks the compact width on a phone, the PC one otherwise, 0 for an ink with none', () => {
    expect(inkWidth('chosen')).toBe(3);
    expect(inkWidth('chosen', true)).toBe(2.5);
    expect(inkWidth('lit', true)).toBe(1.5);   // no compact width: the PC one
    expect(inkWidth('cited')).toBe(0);
    expect(inkWidth('prophecy', true)).toBe(0);   // 1 device px, the renderer's floor
  });

  it('inkGLSL is a vec4 whose every component carries a fraction (the shader-hygiene law)', () => {
    const src = inkGLSL('canvas');
    expect(src).toBe('vec4(0.0, 0.0, 0.0, 1.0)');
    const prophecy = inkGLSL('prophecy');
    expect(prophecy).toMatch(/^vec4\(([0-9]+\.[0-9]+, ){3}[0-9]+\.[0-9]+\)$/);
    expect(prophecy.endsWith('0.45)')).toBe(true);
  });
});
