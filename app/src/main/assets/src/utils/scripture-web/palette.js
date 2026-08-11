/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/palette — Cluster F (esbuild bundle-f.js)

   Colour in this view always ENCODES something. Three modes, each answering
   a different question about the same 301,539 connections:

     distance   — how far apart in the canon the two ends sit. This is the
                  original Harrison/Römhild reading and the reason the whole
                  picture reads as a dome: short local references pool in
                  violet at the feet, the long reaches arch overhead in green.
     testament  — whether a reference stays inside the Old, inside the New, or
                  bridges the two. The bridge is the theologically loaded set,
                  so it gets the one warm hue and everything else recedes.
     genre      — the law/history/poetry/prophets/gospels/epistles grouping the
                  app already uses in search (GENRE_GROUPS), so a reader can
                  see which kind of book a thread leaves from.

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

/** Old↔Old, the prophecy bridge, New↔New. */
export const TESTAMENT_COLORS = {
  ot: [0.816, 0.659, 0.220],      // gold — the app's own accent family
  bridge: [0.957, 0.561, 0.694],  // rose — what the reader is here to see
  nt: [0.424, 0.706, 0.863],      // blue
};

/** The ten GENRE_GROUPS, in canonical order. */
export const GENRE_COLORS = [
  [0.816, 0.659, 0.220],  // law
  [0.855, 0.514, 0.235],  // history
  [0.906, 0.769, 0.361],  // poetry
  [0.937, 0.427, 0.404],  // major prophets
  [0.957, 0.561, 0.694],  // minor prophets
  [0.482, 0.796, 0.639],  // gospels
  [0.400, 0.749, 0.847],  // acts
  [0.424, 0.596, 0.878],  // pauline epistles
  [0.643, 0.502, 0.886],  // general epistles
  [0.804, 0.404, 0.812],  // revelation
];

export const GENRE_NAMES = [
  'Law', 'History', 'Poetry', 'Major Prophets', 'Minor Prophets',
  'Gospels', 'Acts', 'Pauline Epistles', 'General Epistles', 'Revelation',
];

/** Exclusive upper book-index bound of each genre, canonical order. */
export const GENRE_BOOK_ENDS = [5, 17, 22, 27, 39, 43, 44, 57, 65, 66];

/** Genre bucket for a canonical book index. */
export function genreOfBook(bookIndex) {
  for (let g = 0; g < GENRE_BOOK_ENDS.length; g++) {
    if (bookIndex < GENRE_BOOK_ENDS[g]) return g;
  }
  return GENRE_BOOK_ENDS.length - 1;
}

/** Personal-web link colours, by what the link joins. */
export const LINK_KIND_COLORS = [
  [0.906, 0.769, 0.361],  // 0 — within scripture
  [0.643, 0.502, 0.886],  // 1 — within the Volumes
  [0.957, 0.561, 0.694],  // 2 — a bridge between them
];

export const LINK_KIND_NAMES = ['Within scripture', 'Within the Volumes', 'Scripture ↔ Volumes'];

/** GLSL for the ramps, generated from the tables above so they cannot drift. */
export function rampGLSL() {
  const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(',')})`;
  const stops = DISTANCE_RAMP.map(vec3).join(',\n    ');
  const genres = GENRE_COLORS.map(vec3).join(',\n    ');
  return `
const vec3 RAMP[${DISTANCE_RAMP.length}] = vec3[${DISTANCE_RAMP.length}](
    ${stops});
const vec3 GENRE[${GENRE_COLORS.length}] = vec3[${GENRE_COLORS.length}](
    ${genres});
vec3 distanceRamp(float t){
  float s = clamp(t, 0., 1.) * ${(DISTANCE_RAMP.length - 1).toFixed(1)};
  int i = int(floor(s));
  int j = min(i + 1, ${DISTANCE_RAMP.length - 1});
  return mix(RAMP[i], RAMP[j], s - float(i));
}
vec3 testamentColor(float crossings){
  if (crossings < .5) return ${vec3(TESTAMENT_COLORS.ot)};
  if (crossings < 1.5) return ${vec3(TESTAMENT_COLORS.bridge)};
  return ${vec3(TESTAMENT_COLORS.nt)};
}
vec3 genreColor(float g){ return GENRE[int(g + .5)]; }`;
}

/**
 * Read the app's chrome tokens off :root so the view matches the rest of the
 * app in both themes. Canvas-drawn text escapes the CSS gates, so it reads
 * the same custom properties every other screen uses rather than inventing
 * hexes — including the type-scale steps.
 *
 * @param {Element} [el] — element to resolve against (defaults to <html>)
 */
export function readChromeTokens(el) {
  const root = el || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root || typeof getComputedStyle !== 'function') return FALLBACK_CHROME;
  const cs = getComputedStyle(root);
  const get = (name, fallback) => {
    const v = cs.getPropertyValue(name);
    return (v && v.trim()) || fallback;
  };
  const isLight = typeof document !== 'undefined' &&
    document.body && document.body.classList.contains('light');
  return {
    isLight,
    bg: get('--bg', isLight ? '#f7f2e8' : '#000000'),
    ink: get('--cream-dim', isLight ? '#150a04' : '#f2ede5'),
    muted: get('--cream-muted', isLight ? '#3a2510' : '#ccc4b4'),
    gold: get('--gold', isLight ? '#7a5c10' : '#e8c050'),
    goldDim: get('--gold-dim', isLight ? '#a8832a' : '#d0a838'),
    goldBright: get('--gold-bright', isLight ? '#9b7418' : '#f5d86a'),
    border: get('--border', 'rgba(200,164,86,0.16)'),
    fsRuler: parseFloat(get('--fsc-10', '10')) || 10,
    fsLabel: parseFloat(get('--fsc-11', '11')) || 11,
  };
}

const FALLBACK_CHROME = {
  isLight: false, bg: '#000000', ink: '#f2ede5', muted: '#ccc4b4',
  gold: '#e8c050', goldDim: '#d0a838', goldBright: '#f5d86a',
  border: 'rgba(200,164,86,0.16)', fsRuler: 10, fsLabel: 11,
};

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
