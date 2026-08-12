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
