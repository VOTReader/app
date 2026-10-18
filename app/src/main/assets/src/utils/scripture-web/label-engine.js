/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/label-engine — where the web's canvas text may go.
   Canvas stream, w3 (digest C2; build spec §4.3).
   ═══════════════════════════════════════════════════════════════════════

   The overlay (ui/scripture-web/overlay-renderer.js) writes book names,
   chapter and verse numerals, label chips at thread feet, the far ends of
   threads beside their legs and "+n" pills, every frame, over a web that
   can hold thousands of lines on one screen. What it needs from here:

   - the face: the app's own EB Garamond, registered under a family name of
     the web's own ('SW Garamond') from the font file the app already ships
     and precaches (fonts/, same origin), so the canvas never waits on the
     reader's font setting and never fetches a font from the network. The
     'EB Garamond' @font-face in index.html is switched off with the reading
     fonts by default, so a canvas asking for it by that name got Georgia;
   - a measureText cache: a frame measures the same few hundred strings it
     measured last frame;
   - a spatial-hash collision grid: placing a label asks only the boxes in
     its own cells, so a frame with hundreds of candidates stays cheap;
   - ranked placement with hysteresis: candidates go in tier order (chosen,
     then anchored, then by votes), and within a tier the ones placed last
     frame go first and try last frame's slot first, so a label does not
     flicker between two neighbours as the camera moves a pixel.

   Pure apart from ensureWebFont, which registers the face once (a no-op
   where there is no FontFace, as in jsdom). */

import { FONT } from './sw-ink.js';

/** No canvas text is smaller than this, CSS px (w3 canvas brief). */
export const TEXT_MIN_CSS = 12;
/** The web's own family name for the shipped EB Garamond file. */
export const WEB_FACE = 'SW Garamond';
/** The canvas font family: the shipped face first, then the table's (sw-ink FONT). */
export const WEB_FONT_FAMILY = "'" + WEB_FACE + "', " + FONT;
/** The shipped file, relative to the document (index.html sits at the assets root). */
export const WEB_FONT_URL = 'fonts/eb-garamond-latin-wght-normal.woff2';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A canvas font string at full DPR, never under TEXT_MIN_CSS.
 * @param {number} sizeCss
 * @param {number} dpr
 * @param {number|string} [weight]
 * @returns {string}
 */
export function canvasFont(sizeCss, dpr, weight) {
  const px = Math.max(TEXT_MIN_CSS, sizeCss > 0 ? sizeCss : TEXT_MIN_CSS) * (dpr > 0 ? dpr : 1);
  return (weight ? String(weight) + ' ' : '') + round2(px) + 'px ' + WEB_FONT_FAMILY;
}

/** The size a canvasFont() call draws at, device px (for line heights). */
export function fontPx(sizeCss, dpr) {
  return Math.max(TEXT_MIN_CSS, sizeCss > 0 ? sizeCss : TEXT_MIN_CSS) * (dpr > 0 ? dpr : 1);
}

/**
 * Set a font and its tracking on a 2D context. Tracking (letterSpacing,
 * Chrome 99+) is left alone where the context has none: the text is then
 * drawn untracked, never wrongly measured.
 * @param {any} ctx @param {string} font @param {number} [spacing] device px
 */
export function setFont(ctx, font, spacing) {
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing > 0 ? round2(spacing) : 0) + 'px';
}

/**
 * A measureText cache, one per 2D context (a test's fake context measures
 * differently from the next one's), bounded: past `limit` entries the
 * context's map starts over. Cleared when the web's face loads, since every
 * width changes then.
 * @param {number} [limit]
 */
export function createMeasure(limit = 4096) {
  /** @type {WeakMap<object, Map<string, number>>} */
  let byCtx = new WeakMap();
  let entries = 0;
  return {
    /**
     * The drawn width of `text`, device px. Sets the font (and the tracking)
     * on a miss only, so the caller sets them again before it draws.
     * @param {any} ctx @param {string} font @param {string} text @param {number} [spacing]
     */
    width(ctx, font, text, spacing) {
      let map = byCtx.get(ctx);
      if (!map) { map = new Map(); byCtx.set(ctx, map); }
      const key = font + '|' + (spacing > 0 ? round2(spacing) : 0) + '|' + text;
      const hit = map.get(key);
      if (hit !== undefined) return hit;
      setFont(ctx, font, spacing);
      const m = ctx.measureText(text);
      // tracking adds its gap after the last glyph too; the box ends at the glyph
      let w = (m && m.width) || 0;
      if (spacing > 0 && 'letterSpacing' in ctx && w > spacing) w -= spacing;
      if (map.size >= limit) { entries -= map.size; map.clear(); }
      map.set(key, w);
      entries++;
      return w;
    },
    clear() { byCtx = new WeakMap(); entries = 0; },
    /** entries cached across every context since the last clear (a test reads it) */
    get size() { return entries; },
  };
}

/** The overlay's one cache. */
export const measure = createMeasure();

/** @typedef {{ x0:number, y0:number, x1:number, y1:number }} Box  device px */

/**
 * Two boxes overlap, each grown by `pad`.
 * @param {Box} a @param {Box} b @param {number} [pad]
 */
export function boxesMeet(a, b, pad = 0) {
  return a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;
}

/** The collision grid's cell, device px. */
export const LABEL_GRID_CELL = 64;

/**
 * A spatial-hash collision grid: boxes indexed by the cells they cover, so
 * a test reads only its neighbours.
 * @param {number} [cell]
 */
export function createGrid(cell = LABEL_GRID_CELL) {
  /** @type {Map<number, Box[]>} */
  const cells = new Map();
  /** @type {Box[]} */
  const all = [];
  const c = cell > 0 ? cell : LABEL_GRID_CELL;
  const OFF = 4096, SPAN = 8192;
  const cellOf = (v) => Math.max(-OFF, Math.min(OFF - 1, Math.floor(v / c)));
  const each = (b, pad, fn) => {
    const cx0 = cellOf(b.x0 - pad), cx1 = cellOf(b.x1 + pad);
    const cy0 = cellOf(b.y0 - pad), cy1 = cellOf(b.y1 + pad);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        if (fn((cx + OFF) * SPAN + (cy + OFF)) === true) return true;
      }
    }
    return false;
  };
  return {
    /** @param {Box} b */
    add(b) {
      if (!b || !(b.x1 >= b.x0) || !(b.y1 >= b.y0)) return;
      all.push(b);
      each(b, 0, (k) => {
        const list = cells.get(k);
        if (list) list.push(b); else cells.set(k, [b]);
        return false;
      });
    },
    /** Does `b`, grown by `pad`, meet any box added so far? @param {Box} b @param {number} [pad] */
    hits(b, pad = 0) {
      return each(b, pad, (k) => {
        const list = cells.get(k);
        if (!list) return false;
        for (let i = 0; i < list.length; i++) if (boxesMeet(b, list[i], pad)) return true;
        return false;
      });
    },
    get count() { return all.length; },
    /** every box added, in order (a test reads it) */
    get boxes() { return all; },
  };
}

/**
 * @typedef {{ key: number|string, tier: number, score: number,
 *   slots: Array<Box|null> | (() => Array<Box|null>) }} LabelCandidate
 *   tier: 0 the chosen line, then lower is stronger; score: higher first within a tier
 *   (votes); slots: the boxes it may take, in preference order (a chip over its foot,
 *   a leg label at rising heights), or a function that builds them, called once and
 *   only for a candidate that is tried (a frame can rank thousands and measure few)
 */

/**
 * Ranked placement with hysteresis. Candidates go in tier order; within a
 * tier, the ones `memory` placed last frame go first, then by score (higher
 * first), then by key. Each tries last frame's slot first, then its slots in
 * order, and takes the first one `fits` accepts; `commit` records it.
 * Returns what was placed and the memory for the next frame.
 * @template {LabelCandidate} C
 * @param {C[]} cands  sorted in place
 * @param {Map<number|string, number>|null} memory  key -> the slot placed last frame
 * @param {(box: Box, cand: C, slot: number) => boolean} fits
 * @param {(box: Box, cand: C, slot: number) => void} commit
 * @returns {{ placed: Array<{ cand: C, box: Box, slot: number }>, memory: Map<number|string, number> }}
 */
export function placeRanked(cands, memory, fits, commit) {
  const mem = memory || new Map();
  cands.sort((a, b) => (a.tier - b.tier)
    || ((mem.has(a.key) ? 0 : 1) - (mem.has(b.key) ? 0 : 1))
    || (b.score - a.score)
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  /** @type {Map<number|string, number>} */
  const next = new Map();
  const placed = [];
  for (const cand of cands) {
    const prev = mem.get(cand.key);
    const slots = typeof cand.slots === 'function' ? cand.slots() : cand.slots;
    const n = slots ? slots.length : 0;
    for (let k = -1; k < n; k++) {
      const s = k < 0 ? (prev != null && prev < n ? prev : -1) : k;
      if (s < 0 || (k >= 0 && s === prev)) continue;
      const box = slots[s];
      if (!box || !fits(box, cand, s)) continue;
      commit(box, cand, s);
      next.set(cand.key, s);
      placed.push({ cand, box, slot: s });
      break;
    }
  }
  return { placed, memory: next };
}

/* ── the face ─────────────────────────────────────────────────────────── */

/** @type {any} */
let face = null;
let faceReady = false;
/** @type {(() => void)|null} */
let onFaceReady = null;

/** True once the web's face has loaded (until then the canvas draws in the fallbacks). */
export function webFontReady() { return faceReady; }

/**
 * Register the web's face once and call `onReady` when it (or any font the
 * document waits on) has loaded: the overlay clears the measure cache and
 * repaints. The last `onReady` given wins (the overlay passes one repaint).
 * Same-origin and precached: no network fetch, no CDN.
 * @param {() => void} [onReady]
 * @returns {boolean} the face is ready
 */
export function ensureWebFont(onReady) {
  if (onReady) onFaceReady = onReady;
  if (face) return faceReady;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) { face = {}; return false; }
  try {
    face = new FontFace(WEB_FACE, "url('" + WEB_FONT_URL + "') format('woff2')", { weight: '400 800', style: 'normal' });
    document.fonts.add(face);
    const done = () => {
      if (face.status !== 'loaded') return;
      faceReady = true;
      measure.clear();
      if (onFaceReady) onFaceReady();
    };
    face.load().then(done, () => {});
    if (document.fonts.ready) document.fonts.ready.then(done, () => {});
  } catch (_e) {
    face = {};
  }
  return faceReady;
}
