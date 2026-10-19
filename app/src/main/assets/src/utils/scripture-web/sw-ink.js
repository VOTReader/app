/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/sw-ink — THE ink table. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   Every colour the Scripture Web paints outside the distance ramp, in one
   table that feeds the shader (rgba01, inkGLSL) and Canvas2D / inline style
   (css) alike, so a retune moves both at once (digest C6; the build spec,
   D:/Swarm/lanes/sweb/out/w2/mockups/README.md §4). The spec's numbers win
   over the mockup pictures; this table is those numbers.

   What is NOT here:
   - the ordinary threads: palette.js DISTANCE_RAMP, by span only, unchanged
     (C7; spec §4.2 "Ordinary threads");
   - geometry (tick heights, pill radii, gutters): the stream that draws a
     thing owns its geometry; the comment on each row repeats the spec's
     size so it is not hunted for.

   Units: `alpha` is straight (not premultiplied) 0..1; `width` is CSS px on
   PC and `widthCompact` the phone / `.sw-compact` value where the spec gives
   one (inkWidth picks). Multiply by the view's DPR at the draw.

   The CSS side (app.css's `.sw` panel and chrome block, v2's copy) cannot
   import this file; the panel stream writes the same hexes there and a test
   holds the two together. A colour the spec does not name is added here
   first, then used. */

import { glslFloat } from './geometry.js';

/** @typedef {{ hex: string, alpha: number, width?: number, widthCompact?: number }} Ink */

/** @type {Record<string, Ink>} */
const TABLE = {
  // ── the canvas and the ruler (§4.2) ─────────────────────────────────────
  canvas: { hex: '#000000', alpha: 1 },                          // Q4: always night
  baseline: { hex: '#6B7577', alpha: 1, width: 1 },
  chapterBar: { hex: '#6B7577', alpha: 0.8 },                    // chapter-length bars, +12..+42 / +9..+25
  bookLabel: { hex: '#B7BFC1', alpha: 1 },                       // 13 / 11.5 px caps, tracked .10em
  bookLabelMajor: { hex: '#E0E6E7', alpha: 1 },                  // GEN, PSALMS, ISAIAH, MATT, JOHN, REV, the bigger books
  labelRule: { hex: '#2C3537', alpha: 1, width: 1 },             // label cell separators, 14 px tall

  // ── the Volumes in the flagship view (Q1 a: always on) ──────────────────
  cited: { hex: '#C4A469', alpha: 0.70 },                        // cited-in-the-Volumes ticks: 1 DEVICE px wide (min), 5 / 4 px tall, baseline +4..+9
  // the prophecy class: every pair in one pale-gold encoding over the web (r2-01a's gold). The spec's
  // .80 / 1.25 px / .12 glow were set for 51 pairs; the asset carries 131 distinct, clustered on a few
  // feet (Matthew 1:1 x5, Isaiah 7:14 x4), and at those numbers Psalms/Isaiah to the Gospels became a
  // solid cream tangle (GL review 2026-10-18). A 1 device px core with no glow (a glow fogged a
  // phone's field round every pair), in r2-01a's gold, not the cream #EADFC4 that sank into the
  // field's tan (w4 INK item 5). At .45 (w4 INK review 2: the pairs at .35, .45 and .55, w4/ink
  // pairs.md): .35 was a haze no reader could pick out, .55 veiled Psalms to Revelation in gold.
  // Which pairs ARE the class (131, or r2-01a's dozen-odd) is the data owner's call, never the ink's:
  // a lead-per-chapter rule drew 11 gold and named the other 120 prophecy in the field's ramp colours.
  prophecy: { hex: '#EFD18A', alpha: 0.45 },                     // core: 1 DEVICE px (no CSS width, as cited), no glow; top pass, every density
  prophecyKey: { hex: '#EFD18A', alpha: 0.90 },                  // the legend's arc (app.css --sw-prophecy): the canvas's gold at legend size

  // ── the chosen, hovered and lit lines: the top pass (C1, C3) ────────────
  // In the pictures' gold (r2-02, r3-03, r3-04; w4 INK item 3): the spec's #E6D3A3 read as cream on
  // the canvas, at every zoom. A light gold core under a deeper amber halo, sampled from the pictures
  // (hue 37-45 degrees); the lit lines a step warmer. The spec's alphas and widths stand: My Web's
  // threads read them (rail-renderer), in their own colour.
  chosen: { hex: '#F2D38A', alpha: 1, width: 3, widthCompact: 2.5 },   // adaptive tessellation, no facets
  chosenHalo: { hex: '#E0A84E', alpha: 0.22, width: 10 },
  // a dark keyline under the chosen core, in the foot ring's black (w4 INK review, finding 5): the
  // field keeps .60 of its ink (TAP_CONTEXT), and the line still reads first. At .70 and 1 CSS px each
  // side the line read as a dark tube that r2-02 and r2-06 do not draw (w4 INK review 2, finding 6);
  // at .50, 1 CSS px each side on PC and half of one on the phone, it is a thin gold line in its glow
  chosenKey: { hex: '#000000', alpha: 0.50, width: 5, widthCompact: 3.5 },
  chosenFoot: { hex: '#F2D38A', alpha: 1, width: 8 },            // the foot dot's diameter
  chosenFootRing: { hex: '#000000', alpha: 1, width: 2 },
  chosenLabel: { hex: '#F2D38A', alpha: 1 },                     // 16 / 14 px, 10 px below the baseline
  // the hover: the chosen line's gold, lighter, on the chosen line's keyline (w4 readdown item 1). At
  // #F2D38A with no keyline a hovered line sank into the pale-gold mass from Psalms to John (the
  // field's ramp and the prophecy class alike), where w3's white hover had read; the keyline cuts it
  // out (its lead over the threads round it 1.34 to 1.47, w5/final s03). It still dims nothing (C3)
  hover: { hex: '#FFE7A8', alpha: 1, width: 2 },
  hoverKey: { hex: '#000000', alpha: 0.50, width: 4, widthCompact: 3 },   // 1 CSS px each side, half of one on the phone
  hoverHalo: { hex: '#E0A84E', alpha: 0.22, width: 10 },
  lit: { hex: '#E8BE6E', alpha: 0.85, width: 1.5 },              // focus.lit rows: go-to, verse mode, a chooser row under hover or focus

  // ── deep zoom wayfinding (§4.3) ─────────────────────────────────────────
  chapterNumeral: { hex: '#B7BFC1', alpha: 1 },                  // 28 / 20 px
  chapterTick: { hex: '#5A6567', alpha: 1, width: 1 },           // 40 / 24 px tall
  verseTick: { hex: '#6B7577', alpha: 1, width: 1 },             // 6 px tall, every 5th 12 px
  verseNumeral: { hex: '#959DA0', alpha: 1 },                    // 13 / 11 px
  citedDot: { hex: '#C4A469', alpha: 1, width: 4 },              // the dot's diameter, under a cited verse's tick
  stickyBook: { hex: '#B7BFC1', alpha: 1 },                      // "‹ ISAIAH", 16 / 13 px caps, tracked .12em
  chipText: { hex: '#E0E6E7', alpha: 1 },                        // label chips at thread feet, 14 / 12.5 px
  chipFill: { hex: '#1C2527', alpha: 0.92 },
  chipBorder: { hex: '#3A4547', alpha: 1, width: 1 },
  pillText: { hex: '#B7BFC1', alpha: 1 },                        // "+n" pills, 12 / 11 px
  pillFill: { hex: '#1C2527', alpha: 1 },
  pillBorder: { hex: '#3A4547', alpha: 1, width: 1 },

  // ── the centre chapter (§4.4, Q2: emphasis, nothing dims) ───────────────
  centreWash: { hex: '#C4A469', alpha: 0.10 },                   // baseline to ruler bottom, no hard sides
  centreEdge: { hex: '#C4A469', alpha: 0.60, width: 1 },         // the wash's top edge
  centreNumeral: { hex: '#C4A469', alpha: 1 },

  // ── roots (Q1 b, opt-in, waits on Corbin's look) and the Volumes rail ───
  roots: { hex: '#C4A469', alpha: 0.25 },                        // additive S-curves, vertical tangents both ends
  volumesRail: { hex: '#5A6567', alpha: 1, width: 1 },
  volumesTick: { hex: '#6B7577', alpha: 1 },                     // letter ticks, 4 px
  volumesLabel: { hex: '#B7BFC1', alpha: 1 },                    // 13 / 11 px caps
  volumesOverline: { hex: '#A9A188', alpha: 1 },                 // "THE VOLUMES OF TRUTH", 14 / 12 px tracked .15em

  // ── My Web (Q8; C13 two families, C14 the .30 plateau) ──────────────────
  myWebFootnote: { hex: '#7FB3B0', alpha: 0.30 },                // Timothy's notes: one teal-silver family
  myWebStudyNote: { hex: '#5E9C9A', alpha: 0.30 },
  myWebWtlb: { hex: '#A3C4C1', alpha: 0.30 },
  myWebStudy: { hex: '#55949E', alpha: 0.30 },                  // w4 review: lifted from #6C8FA8 (hue 205) into the teal
  myWebReader: { hex: '#E0B25A', alpha: 0.95, width: 1.5 },      // the reader's links: warm gold, >= 4.5:1 on the canvas

  // ── chrome (§4.1), go-to (§4.5), the panel (§4.6) ───────────────────────
  gold: { hex: '#C4A469', alpha: 1 },                            // the one gold: active text, verse refs, text links, Open
  title: { hex: '#F5F5F3', alpha: 1 },                           // titles, the go-to input, excerpt letter titles
  text: { hex: '#E9EEEF', alpha: 1 },                            // control text and icons, group headers, Follow
  textBody: { hex: '#E0E6E7', alpha: 1 },                        // verse text, row refs, quotes
  textMeta: { hex: '#B7BFC1', alpha: 1 },                        // meta lines, previews in the go-to rows
  textMuted: { hex: '#959DA0', alpha: 1 },                       // counts, legend, credit, row previews, sources
  overline: { hex: '#A9A188', alpha: 1 },                        // tracked caps overlines
  controlFill: { hex: '#1C2527', alpha: 0.88 },                  // controls, round buttons, Back
  controlBorder: { hex: '#3A4547', alpha: 1, width: 1 },
  controlBorderHover: { hex: '#4A5658', alpha: 1, width: 1 },
  activeFill: { hex: '#242D2F', alpha: 1 },                      // the active segment
  activeBorder: { hex: '#C4A469', alpha: 0.70, width: 1 },       // the active segment; the go-to result chip
  scrim: { hex: '#000000', alpha: 0.65 },                        // the top scrim's dark end (#000000A6), to transparent
  gotoFill: { hex: '#242D2F', alpha: 0.96 },
  gotoRow: { hex: '#2C3537', alpha: 1 },                         // the keyboard-selected suggestion
  panel: { hex: '#1C2527', alpha: 1 },                           // opaque, pinned under .sw-root: never cream (#18)
  panelEdge: { hex: '#3A4547', alpha: 1, width: 1 },
  hairline: { hex: '#2C3537', alpha: 1, width: 1 },              // section rules in the panel
  citeRule: { hex: '#C4A469', alpha: 0.60, width: 2 },           // CITED IN THE VOLUMES left rule
};

for (const k of Object.keys(TABLE)) Object.freeze(TABLE[k]);
/** The table itself, frozen. Read it through ink() so a misspelt name throws. */
export const INK = Object.freeze(TABLE);

/** What the rest of the web keeps of its alpha while a line is tapped: it RECEDES, never to
 * black (Corbin 08-10: other lines may disappear "only if it is tapped"; hover dims nothing).
 * Replaces today's near-black isolation (.05) and the spec's x0.80. The one named constant
 * (w4 INK item 4, bounded .30-.60), from pairs at .30, .45 and .60 on PC and phone: at .30 the
 * field sank to a brown haze, and at .45 it still read as one (w4 INK review, finding 5), against
 * r2-02's field that keeps its hues round the chosen line. At .60 it keeps them; the bright upper
 * threads that crowded the line there are held off it by its dark keyline (chosenKey).
 * The labels recede two thirds as far (overlay-renderer LABEL_RECEDE); My Web by its own
 * (MYWEB_TAP_CONTEXT). */
export const TAP_CONTEXT = 0.60;
/** My Web's own recede (rail-renderer), from TAP_CONTEXT's .45 (w4 INK review, finding 6): the
 * reader's other links share the chosen one's gold, so at .60 the chosen link's lead over them fell
 * from 3.2:1 to 2.2:1 (w4/ink pairs.md); My Web's field is sparse, with no haze to lift.
 * The value is the w4 myweb stream's own pair too, at .30 and .45 with the receded links drawn core
 * only (w4/myweb/fix2): at .30 the rest sank near black and the reader lost what lies round the
 * chosen link; at .45 Timothy's strands and the other links still read, and the chosen link reads
 * first by its width, its halo and 2.1 times their alpha. Bounded .30-.60 as TAP_CONTEXT is. */
export const MYWEB_TAP_CONTEXT = 0.45;
/** The centre chapter's own arcs (a foot inside it), in their own ramp colours (§4.4). */
export const CENTRE_BRIGHT = 1.35;
export const CENTRE_WIDTH = 1.25;
/** Q3 (ii): a thread with neither foot on screen draws at this share of its width, alpha unchanged. */
export const FLYOVER_LEG_WIDTH = 0.7;
/** The web's one face, canvas text included (Cinzel is retired from the web). */
export const FONT = "'EB Garamond', Georgia, serif";

/**
 * One ink by name.
 * @param {string} name
 * @returns {Ink}
 */
export function ink(name) {
  const entry = Object.prototype.hasOwnProperty.call(TABLE, name) ? TABLE[name] : null;
  if (!entry) throw new Error('sw-ink: no ink named ' + String(name));
  return entry;
}

/** '#rrggbb' -> [r, g, b] 0..255. */
function rgb255(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The ink as floats for a uniform or a GLSL constant: [r, g, b, a], each 0..1, straight alpha.
 * @param {string} name
 * @param {number} [alphaScale]  multiplies the table's alpha (a fade, TAP_CONTEXT), clamped
 * @returns {[number, number, number, number]}
 */
export function rgba01(name, alphaScale) {
  const e = ink(name);
  const [r, g, b] = rgb255(e.hex);
  return [r / 255, g / 255, b / 255, clamp01(e.alpha * (alphaScale == null ? 1 : alphaScale))];
}

/**
 * The ink as a CSS colour for Canvas2D (fillStyle, strokeStyle) or an inline style.
 * @param {string} name
 * @param {number} [alphaScale]
 * @returns {string}  'rgba(r,g,b,a)'
 */
export function css(name, alphaScale) {
  const e = ink(name);
  const a = clamp01(e.alpha * (alphaScale == null ? 1 : alphaScale));
  return 'rgba(' + rgb255(e.hex).join(',') + ',' + String(Math.round(a * 1000) / 1000) + ')';
}

/**
 * The ink's width, CSS px: the compact value on a phone (`.sw-compact`) where the spec gives one.
 * 0 for an ink the spec gives no width.
 * @param {string} name
 * @param {boolean} [compact]
 */
export function inkWidth(name, compact) {
  const e = ink(name);
  if (compact && e.widthCompact != null) return e.widthCompact;
  return e.width != null ? e.width : 0;
}

/**
 * The ink as a GLSL ES 3.00 vec4 literal, every component through glslFloat
 * (the shader-hygiene law: a bare `1` is an int and fails to compile).
 * @param {string} name
 * @returns {string}
 */
export function inkGLSL(name) {
  return 'vec4(' + rgba01(name).map((c) => glslFloat(Math.round(c * 10000) / 10000)).join(', ') + ')';
}
