/**
 * gen-scripture-web-positions — the node-position buffer for Scripture Web v2.
 *
 *   node tools/gen-scripture-web-positions.mjs [--layout spiral] [--turns 60]
 *   -> app/src/main/assets/src/data/scripture-web-positions.js
 *
 * WHY THIS EXISTS. v2 makes node position a per-node ATTRIBUTE instead of
 * deriving x from the verse index and y from the arc law. That one change turns
 * "canon rail versus 2-D graph" from an architecture fork into a buffer swap,
 * and it is why v2 needs no compute shaders: the canon is static between builds,
 * so the layout is precomputed here and lerped in the vertex shader (~600 ms
 * canon -> graph is the whole "video game" feel).
 *
 * NODE ORDER IS NOT A CHOICE. scripture-web-data.js stores aFrom/aTo as verse
 * indices into a 31,102 space, so position[i] MUST be verse i in corpus canon
 * order. This file therefore builds its index from buildVerseTable() — the same
 * function the edge generator uses — rather than from anything in the edge
 * asset, so the two cannot drift and neither can be re-ordered independently.
 *
 * QUANTISATION. Full Int16 range over a symmetric normalised [-1, 1], centred
 * at 0 so a fit-everything camera is trivial: one multiply in the shader, no
 * magic constants. Int16 is comfortable FOR A GRAPH LAYOUT — 31,102 nodes over
 * the square give a mean nearest-neighbour spacing of ~5.7e-3, about 370
 * quantisation steps, so snapping is invisible wherever a node and its
 * neighbour are both on screen.
 *
 *   *** It is NOT enough for the canon rail at 4000x, where one step is ~6% of
 *   the viewport. The rail is x = verseIndex, y = 0, computed with no buffer at
 *   all. Do NOT "unify" the rail onto this buffer: it would reintroduce visible
 *   snapping at deep zoom. ***
 *
 * DETERMINISTIC by construction: no RNG, no graph traversal, no iteration over
 * the edge asset. Index order comes from the canon and every coordinate is a
 * closed-form function of the index, so the same corpus gives the same bytes.
 *
 * LAYOUTS. `--layout` picks one; adding another is a function in LAYOUTS below.
 *   spiral   an Archimedean-ish coil, r and theta both proportional to sqrt(i),
 *            so density is even AND consecutive verses stay adjacent. That
 *            second property is the point: the unfold from a straight rail into
 *            this reads as the canon COILING, which a golden-angle sunflower
 *            (consecutive points flung across the disc) does not.
 *
 * The positions asset is corpus-cached, so REGENERATING IT REQUIRES A
 * CORPUS_VERSION BUMP — a cached client holding old positions and new edges
 * draws nonsense.
 */
import { readFileSync, writeFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildVerseTable, toBase64 } from './scripture-web-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = resolve(ROOT, 'app/src/main/assets/src/data');
const OUT = resolve(DATA, 'scripture-web-positions.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

/** Each layout maps a verse index to [x, y] in [-1, 1]. Pure, no state. */
export const LAYOUTS = {
  /**
   * r = sqrt(i/(n-1)), theta = k*sqrt(i) with k set by the turn count.
   * Even areal density (r ~ sqrt(i)) and adjacent consecutive verses
   * (dtheta ~ k/(2 sqrt(i)) shrinks as the coil widens).
   */
  spiral(n, opts) {
    const turns = Number(opts.turns) || 60;
    const k = (2 * Math.PI * turns) / Math.sqrt(n - 1);
    return (i) => {
      const r = Math.sqrt(i / (n - 1));
      const t = k * Math.sqrt(i);
      return [r * Math.cos(t), r * Math.sin(t)];
    };
  },
};

const LIMIT = 32767;
const quantise = (v) => {
  // Symmetric: -1 -> -32767, +1 -> +32767. -32768 is never emitted, so the
  // range is symmetric about 0 and the shader's multiply needs no special case.
  const q = Math.round(Math.max(-1, Math.min(1, v)) * LIMIT);
  return q === 0 ? 0 : q;   // normalise -0
};

export function buildPositions(total, layoutName, opts) {
  const make = LAYOUTS[layoutName];
  if (!make) throw new Error(`unknown layout ${layoutName}; have ${Object.keys(LAYOUTS).join(', ')}`);
  const at = make(total, opts);
  const xy = new Int16Array(total * 2);
  for (let i = 0; i < total; i++) {
    const [x, y] = at(i);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`layout ${layoutName} produced a non-finite point at ${i}`);
    xy[i * 2] = quantise(x);
    xy[i * 2 + 1] = quantise(y);
  }
  return xy;
}

/**
 * Nearest-neighbour distance for every node, in NORMALISED units.
 *
 * WHY THE ASSET CARRIES THIS. The camera's maximum zoom is layout-dependent
 * and used to be a screen constant: ScriptureWebScreen's MAX_ZOOM = 4000 is
 * right for the canon rail, where x = verseIndex spreads 31,102 nodes over the
 * whole width. On a 2-D layout a fit-everything camera at 4000x spans 2/4000 =
 * 5e-4 of the space, which is an order of magnitude SMALLER than the gap
 * between two neighbouring verses — the reader gets empty space with no way to
 * know which way to go. That constant was correct while position was a formula
 * and stops being correct the moment position is data, so the layout ships its
 * own minimum meaningful feature size and the camera derives its ceiling from
 * the asset. That deletes a hand-tuned number instead of adding one.
 *
 * Uniform-grid neighbourhood search rather than the O(n^2) pairwise scan:
 * 31,102 nodes would be 967 M pairs, and a 3x3 cell sweep is O(n) for any
 * layout that is not pathologically clustered.
 */
export function spacingStats(xy) {
  const n = xy.length / 2;
  const CELL = 0.02;                       // ~2x the mean spacing at this n
  const cell = new Map();
  const at = (i) => [xy[i * 2] / 32767, xy[i * 2 + 1] / 32767];
  const key = (cx, cy) => cx * 100000 + cy;
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i);
    const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(i);
  }
  const dists = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i);
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of (cell.get(key(cx + dx, cy + dy)) || [])) {
          if (j === i) continue;
          const [u, v] = at(j);
          const d = Math.hypot(u - x, v - y);
          if (d < best) best = d;
        }
      }
    }
    dists[i] = best;                       // Infinity when a cell is isolated
  }
  const finite = Array.from(dists).filter(Number.isFinite).sort((a, b) => a - b);
  const pct = (p) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor((p / 100) * finite.length))] : 0);
  return { p1: pct(1), p50: pct(50), isolated: n - finite.length };
}

/**
 * Node pairs that quantise to the SAME Int16 pair. Coincident nodes are
 * unpickable by construction, so this is the cheap check that a layout which
 * failed to converge cannot ship — layout quality with no human looking.
 */
export function coincidentCount(xy) {
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < xy.length; i += 2) {
    // Key on the two Int16s packed into one number; both are in [-32767, 32767].
    const key = (xy[i] + 32768) * 65536 + (xy[i + 1] + 32768);
    if (seen.has(key)) dup++; else seen.add(key);
  }
  return dup;
}

function main() {
  const layout = arg('layout', 'spiral');
  const turns = arg('turns', '60');

  const loadGlobal = (file, name) => {
    const ctx = {};
    runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
    if (!ctx[name]) throw new Error(`${name} not found in ${file}`);
    return ctx[name];
  };
  const booksById = {};
  for (const [key, book] of Object.entries(loadGlobal('books.js', 'BOOKS'))) booksById[book.id || key] = book;
  booksById['matthew-plain'] = loadGlobal('matthew-plain.js', 'MATTHEW_PLAIN');
  const table = buildVerseTable(booksById);

  const xy = buildPositions(table.total, layout, { turns });
  const dup = coincidentCount(xy);
  const pct = (100 * dup) / table.total;
  const spacing = spacingStats(xy);

  const header = `/* ═══════════════════════════════════════════════════════════════════════
   scripture-web-positions.js — GENERATED by tools/gen-scripture-web-positions.mjs.
   DO NOT EDIT. Regenerate: node tools/gen-scripture-web-positions.mjs

   xy64: Int16Array LE, INTERLEAVED [x0, y0, x1, y1, …], one pair per verse in
   corpus canon order. position[i] IS verse i — scripture-web-data.js stores its
   edges as indices into the same 31,102 space, so this order is required, not a
   preference. Both files derive it from buildVerseTable().

   Normalised [-1, 1] symmetric about 0: decode as (v / 32767). One multiply in
   the shader; no magic constants.

   *** Int16 is enough for a GRAPH layout (~370 quantisation steps between
   neighbours) and NOT enough for the canon rail at 4000x zoom, where one step
   is ~6% of the viewport. The rail is x = verseIndex, y = 0, computed directly.
   Do not "unify" the rail onto this buffer — it would reintroduce visible
   snapping at deep zoom. ***

   Corpus-cached: regenerating this file REQUIRES a CORPUS_VERSION bump, or a
   cached client pairs old positions with new edges and draws nonsense.
   ═══════════════════════════════════════════════════════════════════════ */
`;
  const out = {
    version: 1,
    layout,
    params: layout === 'spiral' ? { turns: Number(turns) } : {},
    total: table.total,
    range: 32767,
    // The camera reads its zoom ceiling from HERE, not from a screen constant.
    // p1 nearest-neighbour distance in normalised units: below this the viewport
    // is smaller than the gap between neighbouring verses and the reader is lost
    // in empty space. minSpacing is the layout's own answer to "how far in is
    // too far", so a different layout carries a different ceiling automatically.
    minSpacing: Number(spacing.p1.toFixed(6)),
    medianSpacing: Number(spacing.p50.toFixed(6)),
    xy64: toBase64(xy),
  };
  writeFileSync(OUT, header + 'var SCRIPTURE_WEB_POSITIONS = ' + JSON.stringify(out) + ';\n');

  console.log(`canon: ${table.books.length} books, ${table.total} verses`);
  console.log(`layout: ${layout}${layout === 'spiral' ? ` (turns=${turns})` : ''}`);
  console.log(`coincident node pairs: ${dup} (${pct.toFixed(3)}%)`);
  console.log(`nearest-neighbour spacing: p1 ${spacing.p1.toFixed(5)}  median ${spacing.p50.toFixed(5)} (normalised)`);
  console.log(`  -> a fit-everything camera should not zoom past ~${Math.floor(2 / spacing.p1)}x on this layout`);
  console.log(`wrote ${OUT} — ${(readFileSync(OUT).length / 1024).toFixed(1)} KB on disk, ${(xy.byteLength / 1024).toFixed(1)} KB raw`);
}

// ── self-check: node tools/gen-scripture-web-positions.mjs --selfcheck ──────
function selfcheck() {
  const n = 1000;
  const a = buildPositions(n, 'spiral', { turns: 10 });
  const b = buildPositions(n, 'spiral', { turns: 10 });
  console.assert(a.length === n * 2, 'two coordinates per node');
  console.assert(Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) === 0,
    'DETERMINISM: same input must give the same bytes');
  const diff = buildPositions(n, 'spiral', { turns: 11 });
  console.assert(Buffer.compare(Buffer.from(a.buffer), Buffer.from(diff.buffer)) !== 0,
    'a different parameter must give different bytes, or the parameter does nothing');
  for (const v of a) console.assert(v >= -32767 && v <= 32767, 'inside the symmetric Int16 range');
  console.assert(Math.max(...a.map(Math.abs)) > 32000, 'the layout must actually use the range');
  // Consecutive verses stay adjacent — the property the unfold depends on.
  let far = 0;
  for (let i = 2; i < n * 2 - 2; i += 2) {
    const d = Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]) / 32767;
    if (d > 0.05) far++;
  }
  console.assert(far === 0, `consecutive verses must stay adjacent (${far} jumps > 5% of the space)`);
  console.assert(coincidentCount(a) === 0, 'no coincident nodes at this size');
  console.log('selfcheck OK — deterministic, in range, parameterised, consecutive-adjacent, no coincidence');
}

if (process.argv.includes('--selfcheck')) selfcheck();
else main();
