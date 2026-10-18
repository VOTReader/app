/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/personal-graph — Cluster F (bundle-d since lz1; lazy bundle-f before)

   Turns the reader's own links into the dual-rail web.

   The canonical web is one axis: scripture, Genesis to Revelation. A personal
   web spans two corpora, so it gets two rails — scripture along the bottom
   (the SAME axis, same ruler, same renderer as the canonical view, so the
   mental model transfers) and the Volumes of Truth along the top, ordered by
   READING_CHAIN. A link between corpora is a ribbon between rails; a link
   within one is an arc along it.

   Everything here is pure: the screen injects the live corpus shape and the
   raw LinkStore records, and gets back typed arrays ready for the GPU. That
   keeps it testable without globals and cheap to rebuild whenever LinkStore
   version-bumps (hundreds of records, not hundreds of thousands).
   ═══════════════════════════════════════════════════════════════════════ */

import { myWebSourceIndex } from './palette.js';

/**
 * @typedef {{ total:number, span?:number, index:Map<string, number>,
 *   segments:Array<{volKey:string, label:string, short?:string,
 *     start:number, count:number, u0?:number, uw?:number}>,
 *   nodes:Array<{volKey:string, id:string, title:string}>,
 *   labels?:Map<string, string> }} VotRail
 *   total: the letters on the rail (a position is a letter's index, 0..total);
 *   span: the rail's length in its own units, the Volumes camera's axis
 *   (RAIL_SLOTS: each collection's slot is [u0, u0 + uw)); absent, the rail
 *   is one unit a letter.
 *   labels: a collection's display label -> its volKey (an endpoint names
 *   its collection by label; the rail resolves that scope before a bare id)
 */

/**
 * How the Volumes rail shares its width among the collections (w4, r2-05).
 * Through w3 every letter took one unit, so the two Words To Live By took
 * half the rail and Timothy's threads left it as two wide sheets (the C17
 * smear: Vol I-VII swept right into Matthew, the studies left into the Law).
 * r2-05 gives every collection one equal slot, and its threads read as one
 * fan per Volume. Three whole pictures were shot at 1600x900 and 891x411
 * (D:/Swarm/lanes/sweb/out/w4/myweb/slots/): by letter count, by its square
 * root, and equal. 'equal' is the one that reads as a fan per Volume, and
 * the only one that leaves every collection room for its name on a phone;
 * the order is the reading chain's in all three, and inside its slot a
 * collection's letters stay evenly spaced in reading order, so zooming the
 * rail still reveals every letter (the densest collection's letter is the
 * rail's unit, so its zoom ceiling of 44 CSS px a unit reaches each one).
 * @type {'count'|'sqrt'|'equal'}
 */
export const RAIL_SLOTS = 'equal';

/**
 * What the rail's axis needs of a rail (a VotRail, or a caller's own stand-in).
 * @typedef {{ total:number, span?:number,
 *   segments?:Array<{start:number, count:number, u0?:number, uw?:number}> }} RailAxis
 */

/** A collection's share of the rail under a slot law, before the scale. */
function slotShare(count, law) {
  if (!(count > 0)) return 0;
  return law === 'count' ? count : law === 'sqrt' ? Math.sqrt(count) : 1;
}

/**
 * @typedef {{ verseIdOf?: (bookId:string, chapter:number, verse:number) => number,
 *   votRail?: VotRail }} PlaceCtx
 */

/** Endpoint types that live on the VOT (top) rail. */
export const VOT_TYPES = new Set([
  'letter', 'wtlb', 'blessed', 'holy-days', 'study-letter', 'journal',
]);

/**
 * Strip the character-span suffix a TARGET endpoint carries (":10-40"), the
 * same way use-navigate-to-link.js does before scrolling. Source endpoints
 * keep the key bare and carry start/end as separate fields, so this is a
 * no-op for them — which is exactly what we want: both collapse to the same
 * node identity.
 * @param {string} key
 */
export function baseKey(key) {
  return String(key || '').replace(/:\d+-\d+$/, '');
}

/**
 * Build the top rail from the live VOT corpus.
 *
 * @param {Array<{volKey:string, label:string, short?:string,
 *   items:Array<{id:string, title:string}>}>} collections
 *   in READING_CHAIN order
 * @param {'count'|'sqrt'|'equal'} [law] how the collections share the rail (RAIL_SLOTS)
 * @returns {VotRail}
 */
export function buildVotRail(collections, law = RAIL_SLOTS) {
  const index = new Map();
  const labels = new Map();
  const segments = [];
  const nodes = [];
  let cursor = 0;
  for (const col of collections || []) {
    const items = col.items || [];
    if (col.label && !labels.has(col.label)) labels.set(col.label, col.volKey);
    segments.push({
      volKey: col.volKey, label: col.label, short: col.short || col.label,
      start: cursor, count: items.length,
    });
    for (const item of items) {
      if (!item || !item.id) continue;
      index.set(col.volKey + ':' + item.id, cursor);
      // Second lookup path: LinkStore endpoints often carry only letterId /
      // entryId with no collection, so accept a bare id too. First writer
      // wins, which keeps reading order deterministic.
      if (!index.has(item.id)) index.set(item.id, cursor);
      nodes.push({ volKey: col.volKey, id: item.id, title: item.title || item.id });
      cursor++;
    }
    segments[segments.length - 1].count = cursor - segments[segments.length - 1].start;
  }
  // the slots: the scale makes the densest collection's letter one unit (the
  // count law's own scale is 1, so its rail is the w3 rail exactly); a
  // collection with no letters yet takes no width until they land
  let scale = 0;
  for (const s of segments) if (s.count > 0) scale = Math.max(scale, s.count / slotShare(s.count, law));
  let u = 0;
  for (const s of segments) {
    s.u0 = u;
    s.uw = slotShare(s.count, law) * scale;
    u += s.uw;
  }
  return { total: cursor, span: u, index, segments, nodes, labels };
}

/**
 * The rail's length in its own units, the Volumes camera's total (a rail
 * built without slots is one unit a letter).
 * @param {RailAxis|null|undefined} rail
 */
export function railSpan(rail) {
  if (!rail) return 0;
  return /** @type {number} */ (rail.span) > 0 ? /** @type {number} */ (rail.span) : rail.total || 0;
}

/**
 * The segment a rail position (a letter index, fractional) falls in: the last
 * collection with letters that starts at or before it, the first one before
 * the rail's start. -1 for a rail with none.
 * @param {RailAxis} rail
 * @param {number} pos
 */
function segmentAt(rail, pos) {
  const segs = rail.segments || [];
  let lo = 0, hi = segs.length - 1, at = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (segs[m].start <= pos) { at = m; lo = m + 1; } else hi = m - 1;
  }
  while (at >= 0 && !(segs[at].count > 0)) at--;
  if (at < 0) at = segs.findIndex((s) => s.count > 0);
  return at;
}

/**
 * A rail position (a letter index, fractional: a letter's middle is i + 0.5)
 * as the rail's own unit, the Volumes camera's axis (RAIL_SLOTS). Inside a
 * collection its letters are spread evenly over its slot; past either end
 * of the rail the end collection's spacing carries on, so the map is
 * continuous and increasing everywhere. A rail built without slots is one
 * unit a letter.
 * @param {RailAxis|null|undefined} rail
 * @param {number} pos
 */
export function railUnit(rail, pos) {
  if (!rail || !(/** @type {number} */ (rail.span) > 0) || !rail.segments) return pos;
  const at = segmentAt(rail, pos);
  if (at < 0) return pos;
  const s = rail.segments[at];
  return /** @type {number} */ (s.u0) + ((pos - s.start) * /** @type {number} */ (s.uw)) / s.count;
}

/**
 * The inverse of railUnit: the rail position (a letter index, fractional) at
 * one of the rail's units.
 * @param {RailAxis|null|undefined} rail
 * @param {number} u
 */
export function railPosition(rail, u) {
  if (!rail || !(/** @type {number} */ (rail.span) > 0) || !rail.segments) return u;
  const segs = rail.segments;
  let at = -1;
  for (let i = 0; i < segs.length; i++) {
    if (!(segs[i].count > 0)) continue;
    if (at < 0 || /** @type {number} */ (segs[i].u0) <= u) at = i;
    if (/** @type {number} */ (segs[i].u0) > u) break;
  }
  if (at < 0) return u;
  const s = segs[at];
  return s.start + ((u - /** @type {number} */ (s.u0)) * s.count) / /** @type {number} */ (s.uw);
}

/** The collection an endpoint's TYPE names when nothing else does. */
const TYPE_SCOPE = { 'holy-days': 'holydays', blessed: 'blessed' };

/**
 * The volKey an endpoint lives under, or null when it names none. 23 letter
 * ids are shared between collections (Holy Days repeats letters from the
 * Volumes; WTLB and The Blessed share entry ids), so a bare id is a guess:
 * the endpoint's own volKey first (nav-index writes it from w3), then its
 * study, then the collection label it carries, then its type.
 * @param {any} ep
 * @param {VotRail} rail
 * @returns {string|null}
 */
function scopeOf(ep, rail) {
  if (ep.volKey) return ep.volKey;
  if (ep.studyId) return 'study-' + ep.studyId;
  if (ep.collection && rail.labels && rail.labels.has(ep.collection)) return rail.labels.get(ep.collection) || null;
  return TYPE_SCOPE[ep.type] || null;
}

/**
 * Place one LinkEndpoint on a rail.
 *
 * Structured fields are trusted before the key string: nav-index builds
 * endpoints with bookId/chapter/verse already parsed, and a key can carry an
 * excerpt suffix or a block index that means nothing to us.
 *
 * @param {any} ep — a LinkEndpoint
 * @param {PlaceCtx} ctx
 * @returns {{ rail:'bible'|'vot', pos:number, key:string }|null}
 */
export function placeEndpoint(ep, ctx) {
  if (!ep || !ep.type) return null;
  const key = baseKey(ep.key);

  // ── bottom rail: scripture ────────────────────────────────────────────────
  // `study` is the Matthew Study Bible — a Bible verse with commentary, so it
  // belongs on the scripture rail at its verse, not on the VOT rail.
  if (ep.type === 'bible' || ep.type === 'study') {
    let bookId = ep.bookId, chapter = ep.chapter, verse = ep.verse;
    const parts = key ? key.split(':') : [];
    // The two key spaces differ: "bible:<book>:<chapter>:<verse>", but the
    // Study Bible fuses "study:<book>-<chapter>:<verse>", so its verse is the
    // THIRD part (item 26: "study:matthew-22:11" was read as chapter 11).
    const fused = parts[0] === 'study';
    const keyed = fused || parts[0] === 'bible';
    if (!bookId && keyed) {
      bookId = parts[1];
      if (!fused) chapter = parts[2] != null ? parseInt(parts[2], 10) : undefined;
    }
    if (verse == null && keyed) {
      const vp = fused ? parts[2] : parts[3];
      verse = vp != null ? parseInt(vp, 10) : undefined;
    }
    if (!bookId) return null;
    // The alias trap: `matthew` is the Study Bible; plain Matthew's verses
    // live under `matthew-plain` in the canon table the graph is indexed by.
    if (bookId === 'matthew') bookId = 'matthew-plain';
    // A study key can be "<bookId>-<chapter>" ("matthew-4") rather than two
    // fields. Split only when there is no separate chapter.
    if (chapter == null || Number.isNaN(chapter)) {
      const m = /^(.*)-(\d+)$/.exec(bookId);
      if (m) { bookId = m[1] === 'matthew' ? 'matthew-plain' : m[1]; chapter = parseInt(m[2], 10); }
    }
    if (!(chapter > 0)) return null;
    const pos = ctx.verseIdOf(bookId, chapter, verse > 0 ? verse : 1);
    if (!(pos >= 0)) return null;
    return { rail: 'bible', pos, key };
  }

  // ── top rail: the Volumes ─────────────────────────────────────────────────
  if (!VOT_TYPES.has(ep.type)) return null;
  const rail = ctx.votRail;
  if (!rail) return null;
  const id = ep.letterId || ep.entryId || (key ? key.split(':')[1] : '');
  if (!id) return null;
  const scope = scopeOf(ep, rail);
  // an endpoint that names its scope is placed there or nowhere (fix-review
  // #10): a study not loaded yet, or a Volume without the id, is skipped and
  // counted (the web rebuilds when the studies or the corpus land), never
  // drawn to another collection's letter of the same id; only an endpoint
  // that names no scope takes the bare id's first writer
  const pos = scope ? rail.index.get(scope + ':' + id) : rail.index.get(id);
  if (pos === undefined) return null;
  return { rail: 'vot', pos, key };
}

/**
 * Why placeEndpoint could not place an endpoint (fix-review 2 #6): 'pending'
 * when what it names has not landed yet (the VOT corpus, its collection's
 * letters, or the Bible studies), so the web will place it when they do; else
 * 'unknown': the scope it names is on the web without its id, or names nothing
 * the web holds (a renamed collection, a wrong volKey), and it never will.
 * The Bible rail is whole from the first frame, so a verse it cannot place is
 * unknown.
 * @param {any} ep — a LinkEndpoint placeEndpoint returned null for
 * @param {PlaceCtx} ctx
 * @returns {'pending'|'unknown'}
 */
export function unplacedReason(ep, ctx) {
  if (!ep || !ep.type || !VOT_TYPES.has(ep.type)) return 'unknown';
  const rail = ctx.votRail;
  if (!rail || !(rail.total > 0)) return 'pending';
  const key = baseKey(ep.key);
  if (!(ep.letterId || ep.entryId || (key ? key.split(':')[1] : ''))) return 'unknown';
  const segs = rail.segments || [];
  const isStudy = (k) => String(k).startsWith('study-');
  const scope = scopeOf(ep, rail);
  if (scope) {
    const seg = segs.find((s) => s.volKey === scope);
    if (seg) return seg.count > 0 ? 'unknown' : 'pending';
    // a study with no segment waits for the studies, until any study is on the rail
    return isStudy(scope) && !segs.some((s) => isStudy(s.volKey)) ? 'pending' : 'unknown';
  }
  // a bare id waits while a collection's letters have yet to land
  return segs.some((s) => !isStudy(s.volKey) && !(s.count > 0)) ? 'pending' : 'unknown';
}

/**
 * Build the personal web from raw LinkStore records.
 *
 * Unresolvable endpoints are skipped and counted, never thrown — a link into
 * content the user has since deleted (or a corpus that has not loaded yet)
 * must not blank the whole screen.
 *
 * @param {Array<{id?:string, source?:object, target?:object}>} links — LinkStore.all()
 * @param {PlaceCtx} ctx
 * @returns {{
 *   count:number, aRail:Uint8Array, bRail:Uint8Array,
 *   aPos:Float32Array, bPos:Float32Array, kind:Uint8Array,
 *   records:Array<object>, skipped:number, pending:number, degree:Map<string, number>
 * }}
 *   skipped: the links not placed; pending: those of them waiting for a
 *   corpus to land (unplacedReason), the rest name what the web has no place for
 */
export function buildPersonalGraph(links, ctx) {
  const rows = [];
  const degree = new Map();
  const seen = new Set();
  let skipped = 0, pending = 0;
  for (const link of links || []) {
    if (!link || !link.source || !link.target) { skipped++; continue; }
    // a record the store holds twice (one id) is one link: drawn and counted
    // once, and never reported as one that is not on the web
    if (link.id) { if (seen.has(link.id)) continue; seen.add(link.id); }
    const a = placeEndpoint(link.source, ctx);
    const b = placeEndpoint(link.target, ctx);
    if (!a || !b) {
      skipped++;
      // waiting only when every side it could not place is waiting
      if ((a || unplacedReason(link.source, ctx) === 'pending') && (b || unplacedReason(link.target, ctx) === 'pending')) pending++;
      continue;
    }
    rows.push({ link, a, b });
    for (const side of [a, b]) {
      const k = side.rail + ':' + side.pos;
      degree.set(k, (degree.get(k) || 0) + 1);
    }
  }
  const n = rows.length;
  const out = {
    count: n,
    aRail: new Uint8Array(n),
    bRail: new Uint8Array(n),
    aPos: new Float32Array(n),
    bPos: new Float32Array(n),
    kind: new Uint8Array(n),
    records: rows.map((r) => r.link),
    skipped,
    pending,
    degree,
    /** link id -> index, so a chosen link is found again by WHAT it is (item 30) */
    byId: new Map(),
  };
  for (let i = 0; i < n; i++) {
    const { a, b } = rows[i];
    out.aRail[i] = a.rail === 'vot' ? 1 : 0;
    out.bRail[i] = b.rail === 'vot' ? 1 : 0;
    out.aPos[i] = a.pos;
    out.bPos[i] = b.pos;
    // 0 = within scripture, 1 = within the Volumes, 2 = a bridge between them
    out.kind[i] = (out.aRail[i] === out.bRail[i]) ? out.aRail[i] : 2;
    const id = rows[i].link.id;
    if (id) out.byId.set(id, i);
  }
  return out;
}

/**
 * Where a link sits in a built personal graph, by its LinkStore id; -1 when
 * it is not on the web (deleted, or skipped). An index names a row of ONE
 * build: a link deleted or added before it shifts every index after it, so a
 * choice kept across a rebuild (the resume, a live store bump) is kept by id.
 * @param {{byId?:Map<string, number>, records?:Array<any>}|null|undefined} pg
 * @param {string|null|undefined} id
 */
export function linkIndexById(pg, id) {
  if (!pg || !id) return -1;
  if (pg.byId) { const i = pg.byId.get(id); return i === undefined ? -1 : i; }
  return (pg.records || []).findIndex((r) => r && r.id === id);
}

/**
 * What one of Timothy's threads IS, whatever row a build gives it: its verse
 * and the passage it names (collection-scoped when the edge names its
 * collection or study). A row index names a row of ONE build: the studies or
 * a collection landing insert rows before it, so a chosen thread is kept by
 * this key (fix-review 2 #4), as a reader's link is kept by its id. '' for an
 * edge that names no passage.
 * @param {{v:number, volKey?:string, letterId?:string, entryId?:string, studyId?:string, chapterId?:string}} e
 */
export function underlayKey(e) {
  const id = e && (e.letterId || e.entryId || e.chapterId);
  if (!id) return '';
  const volKey = e.volKey || (e.studyId ? 'study-' + e.studyId : null);
  return e.v + '@' + (volKey ? volKey + ':' + id : id);
}

/**
 * Where a thread sits in a built underlay, by its key; -1 when it is not on
 * the web.
 * @param {{byKey?:Map<string, number>}|null|undefined} underlay
 * @param {string|null|undefined} key
 */
export function underlayIndexByKey(underlay, key) {
  if (!underlay || !underlay.byKey || !key) return -1;
  const i = underlay.byKey.get(key);
  return i === undefined ? -1 : i;
}

/**
 * Curated corpus edges (votEdges from the graph asset) in the same shape, so
 * the renderer can draw them as one dimmed underlay beneath the user's own
 * links without a second code path.
 *
 * @param {Array<{v:number, kind?:string, volKey?:string, letterId?:string,
 *   entryId?:string, studyId?:string, chapterId?:string}>} votEdges
 * @param {{votRail?:VotRail}} ctx
 */
export function buildCuratedUnderlay(votEdges, ctx) {
  const rows = [];
  // one thread per (verse, passage): the asset is one edge per (verse,
  // letter) already (v2), and this holds the count to the threads drawn
  // even when a source lists one twice
  const seen = new Map();
  /** thread key -> row, an edge folded into another row's thread included */
  const byKey = new Map();
  for (const e of votEdges || []) {
    if (!(e && e.v >= 0) || !ctx.votRail) continue;
    // Letters and entries address the rail by their own id; STUDY edges carry
    // {studyId, chapterId} instead, and their rail segments are keyed
    // 'study-<studyId>'. Without this branch all 781 study threads silently
    // vanished from the underlay (the "make sure all albums are included"
    // report was this, seen from the outside).
    const id = e.letterId || e.entryId || e.chapterId;
    if (!id) continue;
    const volKey = e.volKey || (e.studyId ? 'study-' + e.studyId : null);
    const scoped = volKey ? volKey + ':' + id : null;
    const pos = (scoped != null && ctx.votRail.index.has(scoped))
      ? ctx.votRail.index.get(scoped)
      : ctx.votRail.index.get(id);
    if (pos === undefined) continue;
    const pair = e.v + ':' + pos;
    const key = underlayKey(e);
    const had = seen.get(pair);
    if (had !== undefined) { if (!byKey.has(key)) byKey.set(key, had); continue; }
    seen.set(pair, rows.length);
    if (!byKey.has(key)) byKey.set(key, rows.length);
    rows.push([e.v, pos, e, key]);
  }
  const n = rows.length;
  const versePos = new Float32Array(n);
  const votPos = new Float32Array(n);
  // the source (footnote / votNote / wtlb / study) decided once here, so the
  // renderer strokes by bin and never reads a record per frame
  const source = new Uint8Array(n);
  for (let i = 0; i < n; i++) { versePos[i] = rows[i][0]; votPos[i] = rows[i][1]; source[i] = myWebSourceIndex(rows[i][2].kind); }
  return { count: n, versePos, votPos, source, records: rows.map((row) => row[2]), keys: rows.map((row) => row[3]), byKey };
}
