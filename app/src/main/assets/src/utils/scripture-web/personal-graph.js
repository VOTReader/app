/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/personal-graph — Cluster F (esbuild bundle-f.js)

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

/**
 * @typedef {{ total:number, index:Map<string, number>,
 *   segments:Array<{volKey:string, label:string, start:number, count:number}>,
 *   nodes:Array<{volKey:string, id:string, title:string}> }} VotRail
 */

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
 * @param {Array<{volKey:string, label:string, items:Array<{id:string, title:string}>}>} collections
 *   in READING_CHAIN order
 * @returns {{ total:number, index:Map<string, number>,
 *   segments:Array<{volKey:string, label:string, start:number, count:number}>,
 *   nodes:Array<{volKey:string, id:string, title:string}> }}
 */
export function buildVotRail(collections) {
  const index = new Map();
  const segments = [];
  const nodes = [];
  let cursor = 0;
  for (const col of collections || []) {
    const items = col.items || [];
    segments.push({ volKey: col.volKey, label: col.label, start: cursor, count: items.length });
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
  return { total: cursor, index, segments, nodes };
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
    if (!bookId && key) {
      const parts = key.split(':');
      if (parts[0] === 'bible' || parts[0] === 'study') {
        bookId = parts[1];
        chapter = parts[2] != null ? parseInt(parts[2], 10) : undefined;
        verse = parts[3] != null ? parseInt(parts[3], 10) : undefined;
      }
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
  const scoped = ep.volKey ? ep.volKey + ':' + id : null;
  const pos = (scoped != null && rail.index.has(scoped))
    ? rail.index.get(scoped)
    : rail.index.get(id);
  if (pos === undefined) return null;
  return { rail: 'vot', pos, key };
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
 *   records:Array<object>, skipped:number, degree:Map<string, number>
 * }}
 */
export function buildPersonalGraph(links, ctx) {
  const rows = [];
  const degree = new Map();
  let skipped = 0;
  for (const link of links || []) {
    if (!link || !link.source || !link.target) { skipped++; continue; }
    const a = placeEndpoint(link.source, ctx);
    const b = placeEndpoint(link.target, ctx);
    if (!a || !b) { skipped++; continue; }
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
    degree,
  };
  for (let i = 0; i < n; i++) {
    const { a, b } = rows[i];
    out.aRail[i] = a.rail === 'vot' ? 1 : 0;
    out.bRail[i] = b.rail === 'vot' ? 1 : 0;
    out.aPos[i] = a.pos;
    out.bPos[i] = b.pos;
    // 0 = within scripture, 1 = within the Volumes, 2 = a bridge between them
    out.kind[i] = (out.aRail[i] === out.bRail[i]) ? out.aRail[i] : 2;
  }
  return out;
}

/**
 * Curated corpus edges (votEdges from the graph asset) in the same shape, so
 * the renderer can draw them as one dimmed underlay beneath the user's own
 * links without a second code path.
 *
 * @param {Array<{v:number, kind?:string, volKey?:string, letterId?:string,
 *   entryId?:string, studyId?:string}>} votEdges — decoded graph .votEdges
 * @param {{votRail?:VotRail}} ctx
 */
export function buildCuratedUnderlay(votEdges, ctx) {
  const rows = [];
  for (const e of votEdges || []) {
    if (!(e && e.v >= 0)) continue;
    const id = e.letterId || e.entryId;
    if (!id || !ctx.votRail) continue;
    const scoped = e.volKey ? e.volKey + ':' + id : null;
    const pos = (scoped != null && ctx.votRail.index.has(scoped))
      ? ctx.votRail.index.get(scoped)
      : ctx.votRail.index.get(id);
    if (pos === undefined) continue;
    rows.push([e.v, pos]);
  }
  const n = rows.length;
  const versePos = new Float32Array(n);
  const votPos = new Float32Array(n);
  for (let i = 0; i < n; i++) { versePos[i] = rows[i][0]; votPos[i] = rows[i][1]; }
  return { count: n, versePos, votPos };
}

/**
 * Normalize a journal-index refKey into a LinkStore-shaped endpoint.
 * The journal index uses its OWN grammar ("chapter:genesis:3",
 * "letter:<volKey>/<letterId>"), distinct from the hlKey grammar links use,
 * so it must be translated before it can share a rail.
 *
 * @param {string} refKey
 * @returns {object|null} a LinkEndpoint-shaped object
 */
export function refKeyToRailEndpoint(refKey) {
  const s = String(refKey || '');
  const cut = s.indexOf(':');
  if (cut < 0) return null;
  const kind = s.slice(0, cut);
  const rest = s.slice(cut + 1);
  if (kind === 'verse' || kind === 'chapter') {
    const parts = rest.split(':');
    const bookId = parts[0];
    const chapter = parseInt(parts[1], 10);
    const verse = parts[2] != null ? parseInt(parts[2], 10) : undefined;
    if (!bookId || !(chapter > 0)) return null;
    return { type: 'bible', key: 'bible:' + rest, bookId, chapter, verse, label: rest };
  }
  if (kind === 'letter') {
    const slash = rest.indexOf('/');
    if (slash < 0) return { type: 'letter', key: 'letter:' + rest, letterId: rest, label: rest };
    return {
      type: 'letter', key: 'letter:' + rest.slice(slash + 1),
      volKey: rest.slice(0, slash), letterId: rest.slice(slash + 1), label: rest,
    };
  }
  return null;
}
