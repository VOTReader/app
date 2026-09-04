/**
 * audio-renditions-lib — THE rules that turn a pile of mapped audio-letter
 * candidates into the renditions a listener can choose between.
 *
 * Pure: no fs, no vm, no writes. gen-audio-manifest.mjs does the Drive-listing
 * parsing and the corpus matching and hands the result here; the gate
 * (check-audio-manifest.js) and the tests read the same functions, so the
 * shipped manifest and the thing that checks it cannot drift apart.
 *
 * WHY THIS FILE EXISTS (2026-09-04, Corbin's request via FlockSync v2 §5).
 * The composition rules used to live inline in the generator, and one of them
 * silently threw work away: a reader's rendition was discarded when it had
 * fewer main tracks than the primary. Timothy reading two of a letter's five
 * sections simply did not exist as far as the app was concerned. The archive
 * has 72 Timothy and 38 Benjamin distinct recordings; every one of them is
 * supposed to reach the reader, partial or not. A rendition is now dropped for
 * exactly ONE reason — it is the same set of assets as the primary — and a
 * partial one ships with a note saying what it is.
 */

/** Primary-selection rank. Benjamin supersedes, then Timothy, then TTS, then AI. */
export const READER_RANK = Object.freeze({ B: 3, T: 2, V: 1, M: 0 });

/** Reader codes in report/label order. B=Benjamin T=Timothy V=text-to-speech M=AI-with-music. */
export const READER_CODES = Object.freeze(['B', 'T', 'V', 'M']);

/**
 * Compose reader R's own standalone rendition of a letter from its candidate
 * pool: same precedence as the primary flatten (full > sections > parts, one
 * addendum last), restricted to R's files, first-seen per slot (which is what
 * silently drops same-reader duplicate uploads).
 *
 * @param {Array<{kind:string, n:number, id:string, reader:string}>} cands
 * @param {string} reader
 * @returns {{ kind: 'full'|'sections'|'parts', rows: Array<{id:string, label:string|null}> }}
 *   `rows` is empty when R recorded nothing usable.
 */
export function renditionFor(cands, reader) {
  const seen = new Set();
  const firsts = [];
  for (const c of cands) {
    if (c.reader !== reader) continue;
    const slot = c.kind + ':' + c.n;
    if (seen.has(slot)) continue;
    seen.add(slot);
    firsts.push(c);
  }
  const full = firsts.find((c) => c.kind === 'full');
  let kind = 'full';
  let list = [];
  if (full) {
    list = [{ id: full.id, label: null }];
  } else {
    const secs = firsts.filter((c) => c.kind === 'section').sort((a, b) => a.n - b.n);
    if (secs.length) {
      kind = 'sections';
      list = secs.map((c) => ({ id: c.id, label: `Section ${c.n}` }));
    } else {
      kind = 'parts';
      const parts = firsts.filter((c) => c.kind === 'part').sort((a, b) => a.n - b.n);
      list = parts.map((c, i) => ({ id: c.id, label: `Part ${i + 1}` }));
    }
  }
  if (!list.length) return { kind, rows: [] };   // an addendum alone is not a rendition
  const add = firsts.find((c) => c.kind === 'addendum');
  if (add) list.push({ id: add.id, label: 'Addendum' });
  // NOTE: a lone row keeps its ordinal here. Dropping it is a display choice
  // that only composeAlternates can make, because only it knows whether the
  // rendition is COMPLETE — "Part 1" alone is noise when that is the whole
  // letter and load-bearing when it is one part of five.
  return { kind, rows: list };
}

/**
 * How many distinct slots of one shape the WHOLE candidate pool knows about —
 * the only ground truth available for "how long is this letter". Used to say
 * "2 of 5 sections" instead of the useless bare "2 sections".
 *
 * @param {Array<{kind:string, n:number}>} cands
 * @param {'section'|'part'} kind
 * @returns {number}
 */
export function slotCount(cands, kind) {
  return new Set(cands.filter((c) => c.kind === kind).map((c) => c.n)).size;
}

/**
 * The note that marks a rendition as SHORTER than what the archive proves the
 * letter has. `null` for a complete rendition: a single full-letter recording
 * is always complete, and a section/part composition that covers every slot the
 * pool knows about is complete too.
 *
 * @param {Array<{kind:string, n:number, id:string, reader:string}>} cands  the whole pool
 * @param {{kind:string, rows:Array<{label:string|null}>}} rend
 * @returns {string|null} e.g. "2 of 5 sections"
 */
export function completenessNote(cands, rend) {
  if (rend.kind === 'full') return null;
  const shape = rend.kind === 'sections' ? 'section' : 'part';
  const total = slotCount(cands, shape);
  const mine = rend.rows.filter((r) => r.label !== 'Addendum').length;
  if (!total || mine >= total) return null;
  return `${mine} of ${total} ${shape}s`;
}

/**
 * Every reader rendition of one letter that is worth offering beside the
 * primary, rank-ordered (B > T > V > M).
 *
 * The ONE suppression rule (FlockSync v2 §5.3): a rendition is dropped only
 * when its complete asset-ID set is EXACTLY the primary's. Not a superset, not
 * a subset — exactly. A distinct reader is never suppressed, and a partial
 * track is never suppressed for being shorter than the primary; it ships with
 * a completeness note instead. Subset used to be the rule, and it hid every
 * reader who contributed some-but-not-all of a mixed-reader primary.
 *
 * @param {Array<{kind:string, n:number, id:string, reader:string}>} cands
 * @param {Array<{id:string, label:string|null}>} primaryList  the flattened primary
 * @returns {Array<[string, Array<[string]|[string,string]>, string?]>}
 *   `[readerCode, rows, completenessNote?]`; rows are `[id]` or `[id, label]`.
 */
export function composeAlternates(cands, primaryList) {
  const primaryIds = new Set(primaryList.map((t) => t.id));
  const readers = [...new Set(cands.map((c) => c.reader))]
    .sort((a, b) => (READER_RANK[b] ?? -1) - (READER_RANK[a] ?? -1));
  const pairs = [];
  for (const reader of readers) {
    const r = renditionFor(cands, reader);
    if (!r.rows.length) continue;
    const ids = r.rows.map((row) => row.id);
    if (ids.length === primaryIds.size && ids.every((id) => primaryIds.has(id))) continue;
    const note = completenessNote(cands, r);
    // One row and nothing missing: the ordinal is noise, drop it. One row out
    // of five: the ordinal is the point, and it is also what lets the gate tell
    // a whole-letter reading from a fragment by looking at the data alone.
    const bare = !note && r.rows.length === 1;
    const rows = r.rows.map((row) => (row.label && !bare ? [row.id, row.label] : [row.id]));
    pairs.push(note ? [reader, rows, note] : [reader, rows]);
  }
  return pairs;
}

/**
 * Collapse listing records that carry the SAME audio under different Drive
 * ids. Compare audio, not names (Machine Ops, 2026-09-03): 67 files in
 * `D:\VOT-Archive` are byte-identical copies of another file — six Benjamin
 * readings live in both his aggregate folder and their volume folder, and all
 * 21 Gospel of John chapters exist twice. A record with no `hash` is never
 * collapsed, so a listing produced before hashes existed behaves exactly as it
 * always did.
 *
 * The survivor is the one a listener should get: a real collection folder
 * beats "0. ALL LETTERS", then the higher reader rank (the same audio labelled
 * two ways is one recording, and the stronger attribution is the true one),
 * then the id, so the choice is deterministic.
 *
 * @template {{id:string, hash?:string|null, fill?:boolean, reader?:string}} T
 * @param {T[]} records
 * @returns {{ records: T[], collapsed: Array<{ kept: string, dropped: string, hash: string }> }}
 */
export function dedupeByAudioHash(records) {
  const at = new Map();          // hash -> { rec, slot } — the survivor and where it sits
  const out = [];
  const collapsed = [];
  const rank = (r) => READER_RANK[r && r.reader] ?? -1;
  const better = (a, b) => {
    if (!!a.fill !== !!b.fill) return a.fill ? b : a;      // a real folder beats "0. ALL LETTERS"
    if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
    return a.id <= b.id ? a : b;
  };
  for (const rec of records) {
    if (!rec.hash) { out.push(rec); continue; }
    const prev = at.get(rec.hash);
    if (!prev) { at.set(rec.hash, { rec, slot: out.push(rec) - 1 }); continue; }
    const keep = better(prev.rec, rec);
    const drop = keep === prev.rec ? rec : prev.rec;
    collapsed.push({ kept: keep.id, dropped: drop.id, hash: rec.hash });
    // The survivor keeps the FIRST record's position, so a later winner does
    // not jump the queue the "0. ALL LETTERS fills gaps only" pass depends on.
    out[prev.slot] = keep;
    prev.rec = keep;
  }
  return { records: out, collapsed };
}

/**
 * Count reader codes across a flat list of `[id, reader, label?]` rows.
 * @param {Array<{reader?:string}|Array<any>>} rows
 * @param {(row:any)=>string|undefined} readerOf
 * @returns {Record<string, number>}
 */
export function countByReader(rows, readerOf) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const code of READER_CODES) out[code] = 0;
  for (const row of rows) {
    const r = readerOf(row);
    if (!r) continue;
    out[r] = (out[r] || 0) + 1;
  }
  return out;
}

/** "B×35, T×66, V×630" — the report line FlockSync v2 §5.5 asks for. */
export function formatReaderCounts(counts) {
  return READER_CODES.filter((c) => counts[c])
    .map((c) => `${c}×${counts[c]}`)
    .join(', ') || 'none';
}
