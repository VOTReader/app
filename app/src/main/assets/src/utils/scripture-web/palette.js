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

/**
 * The distance ramp, matched to the source visualization: magenta and violet
 * at the feet, through blue and steel, into red, tan, olive and finally green
 * at the top of the dome. Eight stops, linearly interpolated in the shader.
 */
export const DISTANCE_RAMP = [
  [0.76, 0.32, 0.72],
  [0.56, 0.36, 0.85],
  [0.31, 0.44, 0.83],
  [0.36, 0.62, 0.79],
  [0.71, 0.28, 0.31],
  [0.79, 0.63, 0.42],
  [0.60, 0.66, 0.31],
  [0.33, 0.76, 0.37],
];

/**
 * distanceRamp's JS twin, for Canvas2D chrome that must match the shader's
 * colour of a span (the altitude ruler): the same stops, the same linear
 * mix, 0..255 integers.
 * @param {number} t 0..1 (clamped)
 * @returns {number[]} [r, g, b]
 */
export function distanceRampRGB(t) {
  const n = DISTANCE_RAMP.length - 1;
  const s = Math.min(1, Math.max(0, t)) * n;
  const i = Math.floor(s), j = Math.min(i + 1, n), f = s - i;
  return [0, 1, 2].map((k) => Math.round((DISTANCE_RAMP[i][k] + (DISTANCE_RAMP[j][k] - DISTANCE_RAMP[i][k]) * f) * 255));
}

/* ── My Web's colour law (design-myweb-colour.md, 2026-09-11) ──────────────
   Two families a reader tells apart at a glance, and a colour-blind reader by
   lightness, width and pin. Timothy's threads (the Volumes' own citations of
   scripture) are a COOL family, hue by SOURCE, four steps 0.07 apart in WCAG
   luminance so the source survives a deuteranope's collapse of the hues; the
   reader's links are a WARM family, hue by SHAPE, pin by shape. The families
   sit on opposite sides of Lab b* under every deficiency (warm-versus-cool is
   the axis red-green blindness keeps). Salience (alpha, width) never touches
   hue. Canon hue on My Web was retired by Corbin ("My web color yes replaces
   canon"). Every number is measured in sessions/2026-09-11-orchestrator/
   myweb-colour/contrast-v2.md and pinned by palette-myweb-colour.test.js. */

/** Timothy's sources, brightest first; the index is the batch bin the renderer strokes. */
export const MY_WEB_SOURCES = [
  { key: 'footnote', name: 'footnotes', rgb: '74,195,210' },        // teal,   L .45 (cyan-leaning: keeps b* -13 under protanopia)
  { key: 'votNote', name: 'study notes', rgb: '106,166,255' },      // sky,    L .38
  { key: 'wtlb', name: 'Words To Live By', rgb: '139,149,173' },    // slate,  L .30
  { key: 'study', name: 'studies', rgb: '148,108,222' },            // violet, L .22
];
const SOURCE_INDEX = new Map(MY_WEB_SOURCES.map((s, i) => [s.key, i]));
/** Bin for a curated edge's storage kind; a kind the table does not know draws as a study, the commonest. */
export function myWebSourceIndex(kind) {
  const i = SOURCE_INDEX.get(kind);
  return i === undefined ? MY_WEB_SOURCES.length - 1 : i;
}
/** The context is stroked in one colour bin per source (one path per bin and corridor layer, see rail-renderer). */
export const CONTEXT_BINS = MY_WEB_SOURCES.length;

/** The reader's links by shape (personal-graph `kind` 0 / 1 / 2): colour and pin. */
export const MY_WEB_LINK_KINDS = [
  { name: 'Within scripture', rgb: '232,192,80', pin: 'ring' },        // gold (--gold), L .55
  { name: 'Within the Volumes', rgb: '236,150,70', pin: 'dot' },       // amber, L .40
  { name: 'Scripture ↔ Volumes', rgb: '236,120,96', pin: 'ring-dot' }, // coral, L .32
];
export function myWebLinkColor(kind) { return (MY_WEB_LINK_KINDS[kind] || MY_WEB_LINK_KINDS[2]).rgb; }
export const LINK_KIND_NAMES = MY_WEB_LINK_KINDS.map((k) => k.name);

/** GLSL for the distance ramp, generated from the table above so the two cannot drift. */
export function rampGLSL() {
  const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(',')})`;
  const stops = DISTANCE_RAMP.map(vec3).join(',\n    ');
  return `
const vec3 RAMP[${DISTANCE_RAMP.length}] = vec3[${DISTANCE_RAMP.length}](
    ${stops});
vec3 distanceRamp(float t){
  float s = clamp(t, 0., 1.) * ${(DISTANCE_RAMP.length - 1).toFixed(1)};
  int i = int(floor(s));
  int j = min(i + 1, ${DISTANCE_RAMP.length - 1});
  return mix(RAMP[i], RAMP[j], s - float(i));
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
