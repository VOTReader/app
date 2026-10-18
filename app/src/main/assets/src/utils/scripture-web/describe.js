/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/describe — Cluster F (bundle-d)

   Every word the Scripture Web computes about what is under the finger, and
   the cards behind it: what a tapped thread, chapter, verse, bundle, link,
   corpus thread, prophecy pair or letter is (describeFound), the chooser's
   and Nearby's rows (connectionTitle / connectionMeta), the panel's eyebrow
   and meta lines, what the live region announces, the density's line, and the
   endpoints that jump into the reader. Moved out of ScriptureWebScreen in F0
   (2026-10-18); the panel stream (w3) fixed the drift the digest named
   (item 22): one word for the vote count ("votes", never "weight"), plurals
   everywhere ("1 verse apart"), and "↔" between the two ends, because the
   data has no direction. Copy that is plain markup (the guide's lines, the
   empty-web notice) stays in the JSX; the docked panel's own words are in
   panel-model.js.

   Free globals (bookCategory, resolveVerseText) are resolved at call time,
   the free-global pattern the rest of bundle-d uses.
   ═══════════════════════════════════════════════════════════════════════ */

import { refOfVerse, chapterRange, countTouching, bundleGroups } from './pick.js';
import { MY_WEB_SOURCES, LINK_KIND_NAMES } from './palette.js';
import { prophecyIndexOf } from './focus-state.js';
import { endpointFor, collectionName, letterKeyOf, letterCiteSites, COLLECTION_NAMES } from './vot-citations.js';

/** What the live region says when + does nothing because it can do nothing. */
export const ZOOM_MAX_MESSAGE = 'Zoomed all the way in';

const DENSITY_LABEL = { essential: 'Essential', famous: 'Famous' };

/* What each density is, in one line (Q6): the name, the count it draws, and what that is. */
const DENSITY_MEANS = { essential: 'the strongest', famous: 'the full classic chart' };

/** The CC-BY credit the OpenBible.info cross-references are owed (Q5): the legend's tail, the
 * panel's footer and the guide's footer say it in these words. The data file carries the same
 * line as `attribution`; this is what shows when a graph arrives without one. */
export const WEB_CREDIT = 'Cross-reference data © OpenBible.info (CC-BY)';

/** What a failed load says to the reader (item 24): the data file that never arrived is the
 * connection (web-data.js rejects with "Couldn’t fetch the cross-reference data."); anything
 * else (data that would not decode, a renderer that would not build) is said plainly, and the
 * raw message goes under it, small, for a bug report. */
export function loadErrorWords(message) {
  if (/couldn.t fetch/i.test(String(message || ''))) {
    return 'The cross-reference data didn’t arrive. Check your connection, then try again.';
  }
  return 'Something went wrong while the web was being drawn. Try again, or go back and come in again.';
}

/**
 * A density in words, with its count: "Famous · 63,418, the full classic chart",
 * "Essential · 15,402, the strongest". The density control's options read it, and the hint
 * under the title and the live region say it when the reader switches.
 * @param {'essential'|'famous'} density @param {number} count
 */
export function densityLine(density, count) {
  return DENSITY_LABEL[density] + ' · ' + Number(count).toLocaleString() + ', ' + DENSITY_MEANS[density];
}

/**
 * A count and its noun, singular at exactly one: "1 connection", "2,104 connections".
 * @param {number} n @param {string} one @param {string} many
 */
export function plural(n, one, many) {
  return Number(n).toLocaleString() + ' ' + (n === 1 ? one : many);
}

/** How often the Volumes cite a verse, in words: once, twice, 3 times. */
export function timesWord(n) {
  return n === 1 ? 'once' : n === 2 ? 'twice' : Number(n).toLocaleString() + ' times';
}

/**
 * A connection's meta line: "Prophecy fulfilled · 183 votes · 5,371 verses apart". The prophecy
 * words only for a prophecy pair (spec 4.6), the votes only when the pair has OpenBible votes (a
 * prophecy pair the dataset does not hold has none), and always the distance.
 * @param {{ prophecy?: boolean, votes?: number, span: number }} info
 */
export function arcLine(info) {
  const parts = [];
  if (info.prophecy) parts.push('Prophecy fulfilled');
  if (info.votes > 0) parts.push(plural(info.votes, 'vote', 'votes'));
  parts.push(plural(info.span, 'verse apart', 'verses apart'));
  return parts.join(' · ');
}

/** The live region while the chooser asks which of several close threads was meant. "Here", not
 * "nearby": Nearby is the list the Nearby control opens (digest item 22). */
export function chooserAnnouncement(count) {
  return plural(count, 'connection', 'connections') + ' here. Choose one.';
}

/** The live region as Follow pans to a thread's far foot. */
export function followAnnouncement(label) {
  return 'Following the line to ' + label;
}

/** How many threads the canon web draws at this density (the topbar's count). */
export function graphStats(graph, density) {
  let shown = 0;
  for (const b of graph.buckets) {
    shown += density === 'essential' ? b.off20 : b.off10;
  }
  return { shown };
}

/**
 * What a hit is, in the terms every panel, the hover chip, the live region
 * and the Nearby list read: one object per kind (link, underlay, arc, bundle,
 * verse, chapter) with its cards. `ctx` is the frame the hit was taken in;
 * `viewFor` is called where the screen called it (a bundle's and a chapter's
 * groups), so the view is the frame's own.
 * @param {any} found  a hit candidate or a list item
 * @param {{ g:any, personal:any, cam:any, v:any, viewFor:() => any, density:any }} ctx
 * @returns {any}
 */
export function describeFound(found, { g, personal, cam, v, viewFor, density }) {
  if (!found) return null;
  if (found.kind === 'link') {
    const p = personal;
    const rec = p && p.graph && p.graph.records[found.index];
    if (!rec) return null;
    return {
      kind: 'link', index: found.index, record: rec,
      source: rec.source, target: rec.target,
      joins: p.graph.kind[found.index],
      // The reader's OWN endpoints, passed through untouched — they already
      // carry verse/verseEnd and char spans, so a link the user made over a
      // range highlights that whole range on arrival.
      cards: [endpointCard('Source', rec.source), endpointCard('Target', rec.target)],
    };
  }
  if (found.kind === 'underlay') {
    const p = personal;
    const underlay = p && p.underlay;
    const edge = underlay && underlay.records && underlay.records[found.index];
    const node = p && p.votRail && p.votRail.nodes[underlay && underlay.votPos[found.index]];
    if (!underlay || !edge || !node) return null;
    const source = refOfVerse(g, underlay.versePos[found.index]);
    // the citing paragraph of the edge, opened through vot-citations' endpointFor (the reader's
    // block key at that paragraph, the collection a reader knows): today's card opened every
    // letter at its top and named its collection by the raw volKey (digest item 15)
    const cite = citationOfEdge(edge, node);
    const target = endpointFor(cite);
    // the card's third line names the Volume the passage sits in (what the
    // reader zoomed the top rail to), never the edge's storage kind
    const seg = p.votRail.segments.find((s) => s.volKey === node.volKey);
    return {
      kind: 'underlay', index: found.index, source, target,
      // what the thread is, so a rebuild finds it again (personal-graph's underlayKey)
      key: underlay.keys ? underlay.keys[found.index] : undefined,
      // rail positions, published on the card (data-verse / data-vot) so a
      // walk can follow this one thread through the exported geometry
      verse: underlay.versePos[found.index], vot: underlay.votPos[found.index],
      joins: (seg && (seg.short || seg.label)) || edge.kind || 'curated connection',
      // the family in words (design-myweb-colour.md, 5): the source the thread's
      // colour encodes, then the Volume
      sourceName: MY_WEB_SOURCES[underlay.source ? underlay.source[found.index] : MY_WEB_SOURCES.length - 1].name,
      cite,
      cards: [verseCard('Scripture', source), endpointCard('In the Volumes', target)],
    };
  }
  if (found.kind === 'arc') {
    const a = refOfVerse(g, found.hit.from), b = refOfVerse(g, found.hit.to);
    // whether it is a prophecy pair, and which (g.prophecy): GL's pickThreads names it on the hit
    // (a pair that is no OpenBible arc comes with index -1); a hit without the field is looked up
    const prophecyIndex = found.hit.prophecy != null ? (found.hit.prophecy >= 0 ? found.hit.prophecy : -1)
      : prophecyIndexOf(g, found.hit.from, found.hit.to);
    return {
      kind: 'arc', a, b, votes: found.hit.votes,
      span: Math.abs(found.hit.to - found.hit.from), index: found.hit.index,
      from: found.hit.from, to: found.hit.to,
      prophecy: prophecyIndex >= 0, prophecyIndex,
      cards: [verseCard('This end', a), verseCard('Other end', b)],
    };
  }
  if (found.kind === 'prophecy') {
    // a prophecy pair (g.prophecy[k]): 107 of the 132 are not OpenBible arcs, so `index` is the
    // OpenBible arc joining the same two verses when there is one, else -1, and the votes are
    // that arc's (none without it)
    const p = g.prophecy && g.prophecy[found.prophecy];
    if (!p) return null;
    const arc = arcJoining(g, p.a, p.b);
    const a = refOfVerse(g, p.a), b = refOfVerse(g, p.b);
    return {
      kind: 'arc', a, b, votes: arc >= 0 ? g.votes[arc] : 0,
      span: Math.abs(p.b - p.a), index: arc, from: p.a, to: p.b,
      prophecy: true, prophecyIndex: found.prophecy,
      cards: [verseCard('This end', a), verseCard('Other end', b)],
    };
  }
  if (found.kind === 'letter') {
    const letter = letterOf(g, found.letterKey);
    if (!letter) return null;
    return Object.assign({ kind: 'letter', cards: [] }, letter);
  }
  if (found.kind === 'bundle') {
    const cell = found.cell;
    const first = refOfVerse(g, cell.lo), last = refOfVerse(g, cell.hi);
    const label = cell.verse ? first.label
      : cell.chapterLo === cell.chapterHi ? first.bookTitle + ' ' + first.chapter
      : first.bookTitle + ' ' + first.chapter + ' – ' + (last.bookTitle === first.bookTitle ? '' : last.bookTitle + ' ') + last.chapter;
    const chapter = g.chapters[cell.chapterLo];
    return { kind: 'bundle', cell, label, lo: cell.lo, hi: cell.hi,
      connections: countTouching(g, cell.lo, cell.hi, density),
      cards: cell.verse ? [verseCard('Verse', first)]
        : [chapterCard(g.books[chapter[0]], chapter[1], chapter[3], first)] };
  }
  if (found.kind === 'verse') {
    const r = refOfVerse(g, found.verse);
    return { kind: 'verse', ref: r, verse: found.verse,
      connections: countTouching(g, found.verse, found.verse, density),
      cards: [verseCard('Verse', r)] };
  }
  const [lo, hi] = chapterRange(g, found.chapterIndex);
  const ch = g.chapters[found.chapterIndex];
  const first = refOfVerse(g, lo);
  return { kind: 'chapter', chapterIndex: found.chapterIndex,
    book: g.books[ch[0]], chapter: ch[1], verses: ch[3], lo, hi,
    connections: countTouching(g, lo, hi, density),
    // where this chapter's threads go, by the other end's chapter: the
    // convergence entry point now that nothing is hidden at rest
    groups: cam && v.W ? bundleGroups(g, cam, viewFor(), lo, hi, 40).map((grp) => {
      const r = refOfVerse(g, grp.lo);
      return Object.assign({ label: r.bookTitle + ' ' + r.chapter }, grp);
    }) : [],
    // Opening a chapter highlights the WHOLE chapter on arrival.
    cards: [chapterCard(g.books[ch[0]], ch[1], ch[3], first)] };
}

/** A described thread's two ends in canon order: the data has no direction (digest item 22). */
export function endsOf(info) {
  return info.from <= info.to ? [info.a, info.b] : [info.b, info.a];
}

/** A described hit's row title in the chooser and the Nearby list (and the panel's title). */
export function connectionTitle(info) {
  if (info.kind === 'arc') { const [x, y] = endsOf(info); return x.label + ' ↔ ' + y.label; }
  if (info.kind === 'chapter') return info.book.title + ' ' + info.chapter + ' — where its threads go';
  if (info.kind === 'underlay') return info.source.label + ' ↔ ' + endpointLabel(info.target);
  return endpointLabel(info.source) + ' ↔ ' + endpointLabel(info.target);
}

/** A described hit's row meta line in the chooser and the Nearby list. */
export function connectionMeta(info) {
  if (info.kind === 'arc') return arcLine(info);
  if (info.kind === 'chapter') {
    return plural(info.verses, 'verse', 'verses') + ' · ' + plural(info.connections, 'connection', 'connections')
      + (info.groups && info.groups.length ? ' · to ' + plural(info.groups.length, 'chapter', 'chapters') : '');
  }
  if (info.kind === 'underlay') return info.joins;
  return LINK_KIND_NAMES[info.joins] || 'Your link';
}

/**
 * The meta line of a thread that is a prophecy pair (GL item 4; the mockup's chosen panel, r2-02):
 * "Prophecy fulfilled", then its votes when it is also an OpenBible arc, then how far apart.
 * @param {{ index: number, votes: number, span: number }} info  a described arc that is a prophecy pair
 */
export function prophecyMeta(info) {
  // the panel stream's arcLine is the one wording; a pair that is no arc has no votes to name
  return arcLine(Object.assign({}, info, { prophecy: true, votes: info.index >= 0 ? info.votes : 0 }));
}

/** The panel's eyebrow (its overline, and its aria-label's head). */
export function sheetEyebrow(info) {
  return info.kind === 'link' ? 'Your link'
    : info.kind === 'underlay' ? 'Timothy’s note'
    : info.kind === 'arc' ? 'Connection'
    : info.kind === 'bundle' ? 'Bundle · ' + info.label
    : info.kind === 'letter' ? 'In the Volumes'
    : info.kind === 'chapter' ? 'Chapter' : 'Verse';
}

/** The panel's meta line. */
export function sheetMeta(info) {
  return info.kind === 'arc'
    ? arcLine(info)
    : info.kind === 'letter' ? info.collectionName
    : info.kind === 'link' ? LINK_KIND_NAMES[info.joins]
    : info.kind === 'underlay' ? (info.sourceName ? info.sourceName + ' · ' + info.joins : info.joins)
    : info.kind === 'bundle'
      ? plural(info.connections, 'connection converges', 'connections converge') + ' here.'
    : info.kind === 'chapter'
      ? plural(info.verses, 'verse', 'verses') + ' · ' + plural(info.connections, 'connection', 'connections')
      : plural(info.connections, 'connection', 'connections');
}

/** The Nearby list's eyebrow: the reader's links on My Web, else the chapter it reads, zoomed in
 * or not ("Nearby" names this list and nothing else, digest item 22; `_lensOn` is kept for the
 * panel's call). */
export function listEyebrow(mode, chapter, _lensOn) {
  return mode === 'personal' ? 'Your links'
    : chapter ? 'Nearby · ' + chapter.book.title + ' ' + chapter.chapter
    : 'Nearby connections';
}

/** The Nearby list's meta line; `count` is the whole list, the chapter row included. */
export function listMeta(chapter, count) {
  return chapter
    ? chapter.connections.toLocaleString() + (chapter.connections === 1 ? ' connection' : ' connections')
      + ' · the strongest ' + (count - 1) + ' below; the chapter row lists where they all go.'
    : 'Select a connection to focus it and open its passages.';
}

/** What the live region says when a hit is chosen. */
export function summaryOf(found) {
  if (found.kind === 'link') {
    return endpointLabel(found.source) + ' and ' + endpointLabel(found.target) + ', your link.';
  }
  if (found.kind === 'underlay') {
    return found.source.label + ' and ' + endpointLabel(found.target) + ', Timothy’s note.';
  }
  if (found.kind === 'arc') {
    const [x, y] = endsOf(found);
    return x.label + ' and ' + y.label + (found.prophecy ? ', a prophecy fulfilled.' : ', connected.');
  }
  if (found.kind === 'letter') {
    const n = typeof found.passages === 'number' ? found.passages : found.verses.length;
    return found.title + ', ' + plural(n, 'verse', 'verses') + ' it cites.';
  }
  if (found.kind === 'verse') return found.ref.label + ', ' + plural(found.connections, 'connection', 'connections') + '.';
  if (found.kind === 'bundle') {
    return found.label + ', ' + plural(found.connections, 'connection converges', 'connections converge') + ' here.';
  }
  return found.book.title + ' ' + found.chapter + ', ' + plural(found.connections, 'connection', 'connections') + '.';
}

/** The Volumes rail's node at a rail position, with its Volume ("The Bride, Volume Two"); '' off the rail. */
export function votNodeName(votRail, pos) {
  const node = votRail && pos >= 0 && pos < votRail.total ? votRail.nodes[pos] : null;
  if (!node) return '';
  const seg = votRail.segments.find((s) => s.volKey === node.volKey);
  return node.title + (seg ? ', ' + seg.label : '');
}

/** A LinkEndpoint's own label, falling back to its key. */
export function endpointLabel(ep) {
  if (!ep) return '';
  return ep.label || ep.key || '';
}

/** Verse text via the app's own resolver, once the Bible corpus has landed. */
export function verseTextFor(ref) {
  if (typeof resolveVerseText !== 'function') return '';
  try {
    const t = resolveVerseText({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse });
    return t || '';
  } catch (_e) { return ''; }
}

/**
 * The reader endpoint of one Bible verse the graph knows (the panel's "Open in reader ›" and a
 * row's Open): one verse, so the jump flashes that verse (see verseCard on `verseEnd`).
 * @param {{bookId:string, chapter:number, verse:number, label:string}} ref
 */
export function verseEndpoint(ref) {
  return {
    type: 'bible',
    key: 'bible:' + ref.bookId + ':' + ref.chapter + ':' + ref.verse,
    bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse, label: ref.label,
  };
}

/**
 * A tappable card for a Bible verse the graph knows about.
 *
 * `verseEnd` is deliberately absent: the canonical web stores one verse id per
 * arc end (the source dataset's ranges were resolved to their start verse), so
 * a jump from here flashes that verse. The reader's OWN links keep whatever
 * range they were made over — see endpointCard.
 *
 * @param {string} eyebrow
 * @param {{bookId:string, bookTitle:string, chapter:number, verse:number, label:string}} ref
 */
export function verseCard(eyebrow, ref) {
  const endpoint = verseEndpoint(ref);
  return {
    eyebrow, label: ref.label, endpoint,
    cat: typeof bookCategory === 'function' ? bookCategory(ref.bookId) : '',
    preview: verseTextFor(ref),
  };
}

/**
 * A tappable card for a whole chapter — the anchor covers every verse in it,
 * so arriving flashes the chapter rather than one line.
 */
export function chapterCard(book, chapterNum, verses, firstRef) {
  const label = book.title + ' ' + chapterNum;
  return {
    eyebrow: 'Chapter', label,
    cat: typeof bookCategory === 'function' ? bookCategory(book.id) : '',
    preview: verseTextFor(firstRef),
    endpoint: {
      type: 'bible', key: 'bible:' + book.id + ':' + chapterNum + ':1',
      bookId: book.id, chapter: chapterNum, verse: 1, verseEnd: verses, label,
    },
  };
}

/**
 * A tappable card for one side of a link the reader made. The stored endpoint
 * is passed through UNTOUCHED so its verse range and character span survive —
 * that is what makes a link made over a long passage flash the whole passage.
 */
export function endpointCard(eyebrow, ep) {
  if (!ep) return { eyebrow, label: '(unknown)', endpoint: null };
  const cat = ep.type === 'bible' && typeof bookCategory === 'function'
    ? bookCategory(ep.bookId)
    : ep.type === 'study' || ep.type === 'study-letter' || ep.type === 'study-chapter' ? 'Matthew Study Bible'
    : ep.collection || '';
  return {
    eyebrow,
    label: endpointLabel(ep),
    cat,
    preview: ep.preview || ep.text || (ep.type === 'bible' ? verseTextFor(ep) : ''),
    endpoint: ep,
  };
}

/**
 * One curated thread's edge (a graph votEdge, My Web's underlay record) as the citation
 * vot-citations' endpointFor opens: its letter's address, the collection by the name a reader
 * knows (never the raw volKey), and the paragraph of its first citing site, with that site's
 * anchor so the excerpt is the sentence that cites the verse. Replaces curatedEndpoint (B4,
 * digest item 15), which opened every letter at block 0, named the collection "two", and keyed
 * a Bible Study as study:, a space the reader does not scroll to.
 * @param {any} edge  a votEdge ({ v, at, title, key, volKey, letterId | entryId | studyId + chapterId })
 * @param {any} [node]  the Volumes rail node it lands on (its title, when the edge has none)
 * @returns {any}
 */
export function citationOfEdge(edge, node) {
  if (!edge) return null;
  const at = (Array.isArray(edge.at) && edge.at[0]) || {};
  /** @type {any} */
  const cite = {};
  for (const f of ['fn', 'r', 'o', 'n']) if (at[f] != null) cite[f] = at[f];
  if (at.sub) cite.sub = at.sub;
  /** @type {any} */
  const c = {
    letterKey: edge.key || letterKeyOf(edge),
    title: String(edge.title || (node && node.title) || ''),
    collection: edge.studyId ? 'studies' : String(edge.volKey || ''),
    collectionName: edge.studyId ? String(edge.studyTitle || COLLECTION_NAMES.studies) : collectionName(edge.volKey),
    paragraph: at.p >= 0 ? at.p : 0,
    sub: at.sub || null,
    cite,
  };
  for (const f of ['volKey', 'letterId', 'entryId', 'studyId', 'chapterId']) if (edge[f]) c[f] = edge[f];
  return c;
}

/**
 * The OpenBible arc joining verses a and b (either order), or -1. A scan, asked once per open.
 * @param {any} g @param {number} a @param {number} b
 */
export function arcJoining(g, a, b) {
  if (!g || !g.from) return -1;
  for (let i = 0; i < g.count; i++) {
    if ((g.from[i] === a && g.to[i] === b) || (g.from[i] === b && g.to[i] === a)) return i;
  }
  return -1;
}

/**
 * A letter, entry or study chapter as the panel's letter mode names it: its title, its
 * collection by name, the verses it cites (ascending, each first verse once), how many passages it
 * cites (each verse-to-verseEnd once, as panel-model letterRows lists them: the count the live
 * region says, so it matches the list's header; w3 review) and the endpoint that opens it at the
 * top. Null for a key no curated edge carries.
 * @param {any} g @param {string} letterKey  vot-citations' key ("three/i-am-risen")
 * @returns {{ letterKey: string, title: string, collectionName: string, verses: number[], passages: number, endpoint: any } | null}
 */
export function letterOf(g, letterKey) {
  const edges = (g && g.votEdges) || [];
  const key = String(letterKey || '');
  const mine = edges.filter((/** @type {any} */ e) => e && (e.key || letterKeyOf(e)) === key);
  if (!mine.length) return null;
  const cite = Object.assign(citationOfEdge(mine[0], null), { paragraph: 0, sub: null, cite: {} });
  const verses = [...new Set(mine.map((/** @type {any} */ e) => e.v))].sort((x, y) => x - y);
  const passages = new Set(letterCiteSites(g, key).map((site) => site.verse + '-' + site.verseEnd)).size;
  return { letterKey: key, title: cite.title, collectionName: cite.collectionName, verses, passages, endpoint: endpointFor(cite) };
}

/* ── My Web's words (w3, the My Web stream; spec Q8, r2-05) ────────────────
   Sentence case, one line each. The counts are the BUILT web's (the reader's
   links placed, Timothy's threads placed), so they never move with the
   camera: the old toggle read a ref at render time and showed whichever
   build the last zoom's render happened to see (1,314 one frame, 2,095 the
   next, as the studies landed). */

/**
 * My Web's subtitle: "25 links · 2,095 from Timothy’s notes". With no links
 * yet it is the invitation, never a count of zero (R3, design-perf
 * 2026-09-10: "0 links you have made" under a fog read as a dead screen).
 * @param {number} links the reader's links on the web
 * @param {number} timothy Timothy's threads on the web (the curated underlay)
 */
export function myWebHeadline(links, timothy) {
  if (!(links > 0)) return 'No links yet — select any text and tap Link.';
  const head = links.toLocaleString() + (links === 1 ? ' link' : ' links');
  return timothy > 0 ? head + ' · ' + timothy.toLocaleString() + ' from Timothy’s notes' : head;
}

/**
 * The line under it when some of the reader's links could not be placed:
 * said, never silently dropped (item 27). "Yet" only of the links waiting for
 * their corpus to land (the studies, the letters); a link naming what the web
 * has no place for (a renamed collection) will never arrive, and is said so
 * (fix-review 2 #6). '' when every link is on the web.
 * @param {number} skipped the links not placed
 * @param {number} [pending] of them, those waiting (all of them when omitted)
 */
export function myWebSkippedLine(skipped, pending) {
  if (!(skipped > 0)) return '';
  const wait = Math.min(skipped, pending == null ? skipped : Math.max(0, pending));
  const lost = skipped - wait;
  const parts = [];
  if (wait > 0) parts.push(wait === 1 ? '1 link isn’t on the web yet' : wait.toLocaleString() + ' links aren’t on the web yet');
  if (lost > 0) {
    const lead = wait > 0 ? lost.toLocaleString() : lost === 1 ? '1 link' : lost.toLocaleString() + ' links';
    parts.push(lead + (lost === 1 ? ' points to a passage' : ' point to passages') + ' this web can’t place');
  }
  return parts.join(' · ');
}

/** The legend's two families, Timothy's first as the picture reads (r2-05). */
export function myWebLegendWords() {
  return { timothy: 'Timothy’s notes', yours: 'your links' };
}
