/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/palette — Cluster F (bundle-d since lz1; lazy bundle-f before)

   Colour in this view always ENCODES something. The canon web has one law,
   distance: how far apart in the canon the two ends sit. This is the
   original Harrison/Römhild reading and the reason the whole picture reads
   as a dome: short local references pool in violet at the feet, the long
   reaches arch overhead in green. (The testament and genre modes were
   retired by Corbin, 2026-09-10: "leave distance as only option".)

   Chrome (labels, ruler, hairlines) is NOT free to invent colour: it reads
   the app's own tokens off :root so the view matches every other screen in
   both themes. Only the data channel is allowed its own spectrum.
   ═══════════════════════════════════════════════════════════════════════ */

import { ink } from './sw-ink.js';

/**
 * The distance ramp, matched to the source visualization: magenta and violet
 * at the feet, through blue and steel, into red, tan, olive and finally green
 * at the top of the dome. Nine stops, each at its own t (DISTANCE_RAMP_AT),
 * linearly interpolated between them in the shader and its JS twin.
 *
 * The stops' positions answer three pictures at once (w4 INK review 2). The
 * overview's feet (r2-01a: magenta-violet, about 71% of the Psalms-Revelation
 * feet band) are the legs of the 300 to 1,000-verse arcs; the deep zoom and
 * the go-to (r3-03, r3-04) are local domes under long legs in red, tan and
 * green. Evenly spaced, eight stops read the feet blue (17% magenta-violet)
 * and ten, with the magenta-violet stretch over three intervals, read the
 * feet right (73%) but laid a magenta cage over the deep zoom (67%, where
 * r3-03 has 15%) and moved red from t .57 to .67; with the span-ink ease at
 * .08 (geometry SHORT_T1) the ten still read the 209x frame 53% and the go-to
 * 43% (r3-04: 21%). Here magenta-violet runs to violet at t .30 (about 1,550
 * verses), blue sits at .37 and red at .585, so the feet read 68%
 * magenta-violet (71% under a .35 prophecy class), the 209x frame 48% and the go-to 35% (w4/ink pairs.md),
 * every scene nearer its picture than either even ramp. The pictures cannot
 * all be met by one span ramp: r3-03's blue domes are spans of 20 to 50
 * verses, which r2-01a's feet glow paints magenta.
 */
export const DISTANCE_RAMP = [
  [0.76, 0.32, 0.72],
  [0.69, 0.33, 0.78],
  [0.56, 0.36, 0.85],
  [0.31, 0.44, 0.83],
  [0.36, 0.62, 0.79],
  [0.71, 0.28, 0.31],
  [0.79, 0.63, 0.42],
  [0.60, 0.66, 0.31],
  [0.33, 0.76, 0.37],
];
/** Each DISTANCE_RAMP stop's t, from 0 to 1, strictly rising (the legend's gradient stops too). */
export const DISTANCE_RAMP_AT = [0, 0.14, 0.30, 0.37, 0.47, 0.585, 0.72, 0.86, 1];

/**
 * distanceRamp's JS twin, for Canvas2D chrome that must match the shader's
 * colour of a span (the altitude ruler): the same stops at the same t, the
 * same linear mix, 0..255 integers.
 * @param {number} t 0..1 (clamped)
 * @returns {number[]} [r, g, b]
 */
export function distanceRampRGB(t) {
  const s = Math.min(1, Math.max(0, t));
  let j = 1;
  while (j < DISTANCE_RAMP_AT.length - 1 && s > DISTANCE_RAMP_AT[j]) j++;
  const i = j - 1, f = (s - DISTANCE_RAMP_AT[i]) / (DISTANCE_RAMP_AT[j] - DISTANCE_RAMP_AT[i]);
  return [0, 1, 2].map((k) => Math.round((DISTANCE_RAMP[i][k] + (DISTANCE_RAMP[j][k] - DISTANCE_RAMP[i][k]) * f) * 255));
}

/* ── My Web's colour law (w3, the r2-05 picture; spec §4.2) ─────────────────
   Two families a reader tells apart at a glance, and a colour-blind reader by
   the warm-versus-cool axis every deficiency keeps. Timothy's threads (the
   Volumes' own citations of scripture) are ONE teal-silver family, a step of
   lightness per SOURCE (sw-ink's myWeb* rows); the reader's links are ONE warm
   gold (myWebReader, #E0B25A, at least 4.5:1 on the canvas), their shape told
   by the pin. Salience (alpha, width) never touches hue. The rgb is sw-ink's,
   read here, so the table and the canvas cannot drift apart; the numbers are
   pinned by palette-myweb-colour.test.js. (The 2026-09-11 four-hue cool family
   and the gold / amber / coral warm one are retired by the w3 picture.) */

/** '#rrggbb' -> 'r,g,b' for an rgba() string. */
const rgbOf = (name) => {
  const hex = ink(name).hex;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
};

/** Timothy's sources in storage-key order; the index is the batch bin the renderer strokes. */
export const MY_WEB_SOURCES = [
  { key: 'footnote', name: 'footnotes', rgb: rgbOf('myWebFootnote') },        // L .40
  { key: 'votNote', name: 'study notes', rgb: rgbOf('myWebStudyNote') },      // L .29
  { key: 'wtlb', name: 'Words To Live By', rgb: rgbOf('myWebWtlb') },         // L .51
  { key: 'study', name: 'studies', rgb: rgbOf('myWebStudy') },                // L .26, the bluest
];
const SOURCE_INDEX = new Map(MY_WEB_SOURCES.map((s, i) => [s.key, i]));
/** Bin for a curated edge's storage kind; a kind the table does not know draws as a study, the commonest. */
export function myWebSourceIndex(kind) {
  const i = SOURCE_INDEX.get(kind);
  return i === undefined ? MY_WEB_SOURCES.length - 1 : i;
}
/** The context is stroked in one colour bin per source (one path per bin and corridor layer, see rail-renderer). */
export const CONTEXT_BINS = MY_WEB_SOURCES.length;

/** The reader's links by shape (personal-graph `kind` 0 / 1 / 2): one gold, the pin says the shape. */
const READER = rgbOf('myWebReader');
export const MY_WEB_LINK_KINDS = [
  { name: 'Within scripture', rgb: READER, pin: 'ring' },
  { name: 'Within the Volumes', rgb: READER, pin: 'dot' },
  { name: 'Scripture ↔ Volumes', rgb: READER, pin: 'ring-dot' },
];
export function myWebLinkColor(kind) { return (MY_WEB_LINK_KINDS[kind] || MY_WEB_LINK_KINDS[2]).rgb; }
export const LINK_KIND_NAMES = MY_WEB_LINK_KINDS.map((k) => k.name);

/**
 * GLSL for the distance ramp, generated from the table above so the two cannot drift: the stops
 * and their t, and a mix per interval, each clamped to 0..1, so the intervals below t are fully
 * crossed, the one holding t is part crossed and those above it add nothing (piecewise linear,
 * no branch).
 */
export function rampGLSL() {
  const n = DISTANCE_RAMP.length;
  const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(',')})`;
  const stops = DISTANCE_RAMP.map(vec3).join(',\n    ');
  const at = DISTANCE_RAMP_AT.map((v) => v.toFixed(4)).join(', ');
  return `
const vec3 RAMP[${n}] = vec3[${n}](
    ${stops});
const float RAMP_AT[${n}] = float[${n}](${at});
vec3 distanceRamp(float t){
  float s = clamp(t, 0., 1.);
  vec3 c = RAMP[0];
  for (int i = 1; i < ${n}; i++) {
    c = mix(c, RAMP[i], clamp((s - RAMP_AT[i - 1])/(RAMP_AT[i] - RAMP_AT[i - 1]), 0., 1.));
  }
  return c;
}`;
}

/**
 * Read the app's chrome tokens so the view matches the rest of the app in
 * both themes. Canvas-drawn text escapes the CSS gates, so it reads the same
 * custom properties every other screen uses rather than inventing hexes —
 * including the type-scale steps.
 *
 * RESOLVE AGAINST <body>, NOT <html>. The dark palette is declared on :root
 * but the light palette is a full token swap on `body.light`, so resolving at
 * the document element returns the DARK values even in light mode — and since
 * the GL surface paints that colour over the CSS background, the whole view
 * would stay black on parchment.
 *
 * @param {Element} [el] element to resolve against (defaults to <body>)
 */
export function readChromeTokens(el) {
  const root = el || (typeof document !== 'undefined'
    ? (document.body || document.documentElement) : null);
  if (!root || typeof getComputedStyle !== 'function') return FALLBACK_CHROME;
  const cs = getComputedStyle(root);
  const get = (name, fallback) => {
    const v = cs.getPropertyValue(name);
    return (v && v.trim()) || fallback;
  };
  /* ONLY THE FONT SIZES ARE READ LIVE. They follow the reader's text-size
     setting, which is not a theme; every colour below is a constant, because
     this screen has one palette and the app's shared tokens flip under
     `body.light`. Reading them would put parchment on the canvas no matter what
     `isLight` claimed -- the two are separate mechanisms and deleting only the
     flag would have produced a screen reporting dark while painting light. */
  return {
    ...SW_PALETTE,
    fsRuler: parseFloat(get('--fsc-10', '10')) || 10,
    fsLabel: parseFloat(get('--fsc-11', '11')) || 11,
  };
}

/* THE Scripture Web palette. One copy: the fallback below is this object, so a
   retune cannot move the live palette and leave the fallback behind. */
const SW_PALETTE = {
  isLight: false, bg: '#000000', ink: '#f2ede5', muted: '#ccc4b4',
  gold: '#e8c050', goldDim: '#d0a838', goldBright: '#f5d86a',
  border: 'rgba(200,164,86,0.16)',
};

const FALLBACK_CHROME = { ...SW_PALETTE, fsRuler: 10, fsLabel: 11 };

/** '#rrggbb' or 'rgb(...)' → [r,g,b] in 0..1, for clearColor. */
export function cssColorToRGB(css) {
  const s = String(css).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(s);
  if (rgb) {
    const parts = rgb[1].split(',').map((n) => parseFloat(n));
    return [(parts[0] || 0) / 255, (parts[1] || 0) / 255, (parts[2] || 0) / 255];
  }
  return [0, 0, 0];
}
