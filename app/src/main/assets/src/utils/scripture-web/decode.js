/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/decode — Cluster F (esbuild bundle-f.js)

   Turns the shipped SCRIPTURE_WEB_DATA global into typed arrays the renderer
   can hand straight to WebGL.

   The asset stores base64 of little-endian Uint16/Int16, pre-sorted into the
   baked layout (span bucket → density tier → x) and delta-encoded per TIER
   RUN — `from` restarts at every tier boundary, so accumulating per bucket
   would wrap. This decoder MUST stay identical to deltaDecode()/deltaRuns()
   in tools/scripture-web-lib.mjs; tools/validate-schemas.js proves the asset
   against that same pair on every commit.

   Chromium-108 floor: atob + a charCode loop. NOT Uint8Array.fromBase64
   (Chrome ~140) — see Permanent Rule 6.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  levelOf, PPV_MAX_CSS, LOD_INK, LOD_REF_CSS, LOD_REF_HEIGHT_CSS, LOD_STROKE_CSS, LOD_LEN_CAP,
  LOD_LEN_MIN, LOD_STEP, LOD_MIN_LEVEL, LOD_QUANT, LOD_SPAN_CELLS,
} from './geometry.js';

/**
 * One span bucket of the baked layout.
 * @typedef {{ off:number, len:number, off20:number, off10:number,
 *   segments:number, chunks:Array<[number, number]> }} GraphBucket
 */

/**
 * The decoded graph — what every other module in this feature consumes.
 * @typedef {{
 *   total:number, count:number,
 *   from:Uint16Array, to:Uint16Array, votes:Int16Array,
 *   buckets:GraphBucket[],
 *   books:Array<{id:string, title:string, abbr:string, start:number}>,
 *   chapters:Array<number[]>,
 *   chapterOfVerse:Uint16Array,
 *   densityTiers:number[], attribution:string,
 *   votEdges:Array<any>, prophecy:Array<any>, votLinks:Array<any>,
 *   chunkSize?:number
 * }} ScriptureGraph
 */

/** @typedef {'essential'|'famous'} Density */

/**
 * base64 → Uint8Array.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The runs `from` ascends within — one per density tier inside each bucket.
 * Mirrors deltaRuns() in tools/scripture-web-lib.mjs.
 * @param {GraphBucket} bucket
 * @returns {Array<[number, number]>} [start, length] pairs
 */
export function deltaRuns(bucket) {
  const { off, len, off20, off10 } = bucket;
  const runs = [];
  if (off20 > 0) runs.push([off, off20]);
  if (off10 - off20 > 0) runs.push([off + off20, off10 - off20]);
  if (len - off10 > 0) runs.push([off + off10, len - off10]);
  return runs;
}

/**
 * Decode the whole graph asset.
 *
 * @param {any} data — the SCRIPTURE_WEB_DATA global
 * @returns {ScriptureGraph}
 */
export function decodeGraph(data) {
  if (!data || !data.count) throw new Error('scripture-web: data missing or empty');
  const n = data.count;
  const view = (b64, Ctor) => {
    const bytes = base64ToBytes(b64);
    return new Ctor(bytes.buffer, bytes.byteOffset, n);
  };
  const dfrom = view(data.dfrom64, Uint16Array);
  const span = view(data.span64, Uint16Array);
  const votes = view(data.votes64, Int16Array);

  const from = new Uint16Array(n);
  const to = new Uint16Array(n);
  for (const b of data.buckets) {
    for (const run of deltaRuns(b)) {
      let acc = 0;
      const start = run[0], end = run[0] + run[1];
      for (let i = start; i < end; i++) {
        acc += dfrom[i];
        from[i] = acc;
        to[i] = acc + span[i];
      }
    }
  }

  // Verse → chapter index, built once. 1,189 chapters fits Uint16 with room.
  const chapterOfVerse = new Uint16Array(data.total);
  for (let ci = 0; ci < data.chapters.length; ci++) {
    const start = data.chapters[ci][2], verses = data.chapters[ci][3];
    for (let v = 0; v < verses; v++) chapterOfVerse[start + v] = ci;
  }

  return {
    total: data.total,
    count: n,
    from,
    to,
    votes,
    buckets: data.buckets,
    books: data.books,
    chapters: data.chapters,
    chapterOfVerse,
    densityTiers: data.densityTiers || [20, 7],
    attribution: data.attribution || '',
    votEdges: data.votEdges || [],
    prophecy: data.prophecy || [],
    votLinks: data.votLinks || [],
  };
}

/**
 * Departure slots (phase 1's assignSlots, ported for the bent re-cut): at
 * every verse the incident threads — arriving or leaving — are ranked by
 * their OTHER end ascending, ties by position, and the k-th of N takes
 * (k + 1) / (N + 1) of the cell. A lone thread stands in the middle (1/2,
 * exactly: no byte rounding, so its quarter is today's to the bit), a
 * leftward thread ranks before every rightward one. The bent law reads the
 * rank as a FAN (fansOf): it sets the quarter the foot leaves on, so a
 * verse's N threads leave in N quarters instead of one bundle (Corbin,
 * 2026-09-11: at the ceiling "one foot per verse, bundles inseparable").
 * The shipped asset's busiest verse carries 102 threads.
 *
 * @param {Uint16Array} from @param {Uint16Array} to
 * @param {number} count @param {number} total
 * @returns {{slotA:Float32Array, slotB:Float32Array}} slotA at `from`, slotB at `to`, 0..1
 */
export function assignSlots(from, to, count, total) {
  // counting sort of the 2·count feet by verse
  const start = new Uint32Array(total + 1);
  for (let i = 0; i < count; i++) { start[from[i] + 1]++; start[to[i] + 1]++; }
  for (let v = 0; v < total; v++) start[v + 1] += start[v];
  // one key per foot: (other end, position, side) packed so a numeric sort
  // ranks them. Float64 with a 2^24 stride, not Uint32 with 2^17: the old
  // packing passed 2^32 at 32,768 verses and folded the position into the
  // other end at 65,536 threads (the shipped asset is 31,102 / 63,418, a
  // regen away from either) and would have mis-ranked SILENTLY; a double is
  // exact to 2^53, so 65,535 x 2^24 + 2 x 8,388,607 + 1 is.
  const STRIDE = 16777216;
  const fill = new Uint32Array(total);
  const keys = new Float64Array(2 * count);
  for (let i = 0; i < count; i++) {
    keys[start[from[i]] + fill[from[i]]++] = to[i] * STRIDE + i * 2;
    keys[start[to[i]] + fill[to[i]]++] = from[i] * STRIDE + i * 2 + 1;
  }
  const slotA = new Float32Array(count), slotB = new Float32Array(count);
  for (let v = 0; v < total; v++) {
    const s = start[v], n = start[v + 1] - s;
    if (n === 0) continue;
    if (n > 1) keys.subarray(s, s + n).sort();
    for (let k = 0; k < n; k++) {
      const key = keys[s + k];
      const i = Math.floor((key % STRIDE) / 2);
      const slot = (k + 1) / (n + 1);
      if (key & 1) slotB[i] = slot; else slotA[i] = slot;
    }
  }
  return { slotA, slotB };
}

/** One fan table per graph object, built on first use — the renderer and the hit test share it. */
const FANS = new WeakMap();
/**
 * Each foot's departure rank, centred: slot − 1/2, so −0.5..0.5 with 0 for
 * a lone thread (today's quarter exactly). Float32 so the renderer can hand
 * it to the GPU as it is.
 * @param {{from:Uint16Array, to:Uint16Array, count:number, total:number}} g
 * @returns {{fanA:Float32Array, fanB:Float32Array}} fanA at `from`, fanB at `to`
 */
export function fansOf(g) {
  let f = FANS.get(g);
  if (!f) {
    const { slotA, slotB } = assignSlots(g.from, g.to, g.count, g.total);
    const fanA = new Float32Array(g.count), fanB = new Float32Array(g.count);
    for (let i = 0; i < g.count; i++) { fanA[i] = slotA[i] - 0.5; fanB[i] = slotB[i] - 0.5; }
    f = { fanA, fanB };
    FANS.set(g, f);
  }
  return f;
}

/** One LOD table per graph object, built on first use — the renderer and the hit test share it. */
const LOD = new WeakMap();

/**
 * The density law's table (geometry.js, "The density law, part 1"): per
 * thread, the REVEAL level at which it is drawn while anchored, for each
 * density, and whether it is its fly-over group's REPRESENTATIVE, for each
 * density - packed into one Uint32 the shader reads as `aLod` and the hit
 * test reads through geometry.lodShown.
 *
 * Reveal, per density: the levels LOD_MIN_LEVEL..ceiling in LOD_STEP steps;
 * at each, the canon is cut into cells of total / 2^(L+1) verses with an ink
 * budget of LOD_INK x the reference frame's area / stroke / 2 px of thread
 * length each. Threads already revealed charge their on-screen length (a
 * half-ellipse's, capped and floored) to the cell of each foot first; then
 * the rest are walked in vote order (ties by index, the draw order) and a
 * thread is revealed at this level when either foot's cell still has room,
 * charging both. Essential admits only threads at or above the Essential
 * tier. A thread no cell ever took is revealed at the ceiling: every
 * anchored thread draws there.
 *
 * Representatives, per density: a group is (span cell, centre cell) - span
 * on the log axis in LOD_SPAN_CELLS cells, the centre in cells half the
 * group's shortest span wide - and its representative is the first of its
 * members in vote order. `groupOf` is that key per thread (the badge pass
 * counts a representative's members with it).
 *
 * @param {{from:Uint16Array, to:Uint16Array, votes:Int16Array, count:number,
 *   total:number, densityTiers?:number[]}} g
 * @returns {{lod:Uint32Array, groupOf:Uint32Array}}
 */
export function lodOf(g) {
  let t = LOD.get(g);
  if (!t) {
    t = buildLod(g);
    LOD.set(g, t);
  }
  return t;
}

/**
 * Threads in vote order, strongest first, ties by index. The order both
 * fills of lodOf walk.
 * @param {{votes:Int16Array, count:number}} g
 * @returns {Uint32Array}
 */
export function voteOrder(g) {
  const order = new Uint32Array(g.count);
  for (let i = 0; i < g.count; i++) order[i] = i;
  // a stable sort on votes descending: JS sort is stable, so equal votes keep index order
  return order.sort((a, b) => g.votes[b] - g.votes[a] || a - b);
}

function buildLod(g) {
  const N = g.count, T = g.total > 1 ? g.total : 2;
  const tiers = g.densityTiers || [20, 7];
  const order = voteOrder(g);
  const ceiling = levelOf(PPV_MAX_CSS, T);
  const budgetPerCell = (LOD_INK * LOD_REF_CSS * LOD_REF_HEIGHT_CSS) / LOD_STROKE_CSS / 2;
  const span = new Float64Array(N);
  for (let i = 0; i < N; i++) span[i] = Math.abs(g.to[i] - g.from[i]);

  /** @param {number} minVotes @returns {Uint8Array} quantized reveal per thread */
  const reveal = (minVotes) => {
    const rev = new Float32Array(N).fill(ceiling);
    const accepted = new Uint8Array(N);
    let budget = new Float32Array(0);
    for (let L = LOD_MIN_LEVEL; L < ceiling; L += LOD_STEP) {
      const cellW = T / Math.pow(2, L + 1);            // verses per cell
      const cells = Math.ceil(T / cellW) + 1;
      if (budget.length < cells) budget = new Float32Array(cells);
      budget.fill(budgetPerCell, 0, cells);
      const ppv = (LOD_REF_CSS * Math.pow(2, L)) / T;   // CSS px per verse at this level
      const lenOf = (i) => {
        const l = 1.57 * span[i] * ppv;
        return l < LOD_LEN_MIN ? LOD_LEN_MIN : (l > LOD_LEN_CAP ? LOD_LEN_CAP : l);
      };
      // what is already drawn pays first
      for (let k = 0; k < N; k++) {
        const i = order[k];
        if (!accepted[i]) continue;
        const l = lenOf(i);
        const ca = (g.from[i] / cellW) | 0, cb = (g.to[i] / cellW) | 0;
        budget[ca] -= l;
        if (cb !== ca) budget[cb] -= l;
      }
      // then the strongest of the rest, while a foot's cell has room
      for (let k = 0; k < N; k++) {
        const i = order[k];
        if (accepted[i] || g.votes[i] < minVotes) continue;
        const l = lenOf(i);
        const ca = (g.from[i] / cellW) | 0, cb = (g.to[i] / cellW) | 0;
        if (budget[ca] >= l || budget[cb] >= l) {
          accepted[i] = 1;
          rev[i] = L;
          budget[ca] -= l;
          if (cb !== ca) budget[cb] -= l;
        }
      }
    }
    const q = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      // floored: a thread is never drawn later than the level that accepted it
      const v = Math.floor((rev[i] - LOD_MIN_LEVEL) * LOD_QUANT);
      q[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
    }
    return q;
  };

  // fly-over groups: (span cell, centre cell)
  const groupOf = new Uint32Array(N);
  const logT = Math.log(T);
  for (let i = 0; i < N; i++) {
    const s = span[i] > 1 ? span[i] : 1;
    let sc = Math.floor((Math.log(s) / logT) * LOD_SPAN_CELLS);
    if (sc >= LOD_SPAN_CELLS) sc = LOD_SPAN_CELLS - 1;
    if (sc < 0) sc = 0;
    const spanLo = Math.pow(T, sc / LOD_SPAN_CELLS);
    const cc = Math.floor((g.from[i] + g.to[i]) / spanLo);   // centre / (spanLo / 2)
    groupOf[i] = sc * 1048576 + cc;
  }
  /** @param {number} minVotes @returns {Uint8Array} 1 for the group's representative */
  const reps = (minVotes) => {
    const seen = new Set();
    const rep = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const i = order[k];
      if (g.votes[i] < minVotes) continue;
      const key = groupOf[i];
      if (seen.has(key)) continue;
      seen.add(key);
      rep[i] = 1;
    }
    return rep;
  };

  const revF = reveal(-32768), revE = reveal(tiers[0]);
  const repF = reps(-32768), repE = reps(tiers[0]);
  const lod = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    lod[i] = (revF[i] | (revE[i] << 8) | (repF[i] << 16) | (repE[i] << 17)) >>> 0;
  }
  return { lod, groupOf };
}

/**
 * The widest thread's span, verses — the y camera's ceiling reads the law at
 * it (geometry.apexMaxPx). 0 for an empty graph.
 * @param {{from:Uint16Array, to:Uint16Array, count:number}} g
 */
export function maxSpanOf(g) {
  let m = 0;
  for (let i = 0; i < g.count; i++) {
    const s = Math.abs(g.to[i] - g.from[i]);
    if (s > m) m = s;
  }
  return m;
}

/**
 * How many instances a bucket draws at a given density.
 * The layout is pre-sorted so each density is a PREFIX of the bucket — the
 * renderer just shortens its instance count; nothing is re-uploaded.
 * @param {GraphBucket} bucket
 * @param {Density} density
 */
export function bucketDrawCount(bucket, density) {
  if (density === 'essential') return bucket.off20;
  return bucket.off10;
}

/**
 * Minimum vote weight a density admits — the picker uses it to match the GPU.
 * @param {Density} density
 * @param {number[]} [tiers]
 */
export function minVotesFor(density, tiers) {
  const t = tiers || [20, 7];
  if (density === 'essential') return t[0];
  return t[1];
}
