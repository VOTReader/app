/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/describe — Cluster F (bundle-d)

   Every word the Scripture Web computes about what is under the finger, and
   the cards behind it: what a tapped thread, chapter, verse, bundle, link or
   corpus thread is (describeFound), the chooser's and Nearby's rows
   (connectionTitle / connectionMeta), the sheet's and the list's eyebrow and
   meta lines, what the live region announces, the density hint, and the
   endpoint cards that jump into the reader. Moved out of ScriptureWebScreen
   unchanged (F0, 2026-10-18): the wording is today's, character for
   character, and the screen and its panels only ask. Copy that is plain
   markup (the guide's lines, the empty-web notice) stays in the JSX.

   Free globals (bookCategory, resolveVerseText) are resolved at call time,
   the free-global pattern the rest of bundle-d uses.
   ═══════════════════════════════════════════════════════════════════════ */

import { refOfVerse, chapterRange, countTouching, bundleGroups } from './pick.js';
import { MY_WEB_SOURCES, LINK_KIND_NAMES } from './palette.js';
import { entryHlBase } from '../hl-keys.js';

/** What the live region says when + does nothing because it can do nothing. */
export const ZOOM_MAX_MESSAGE = 'Zoomed all the way in';

const DENSITY_LABEL = { essential: 'Essential', famous: 'Famous' };

const DENSITY_HINT = {
  essential: 'only the strongest connections',
  famous: 'the famous view — about 64,000 connections',
};

/** The hint that flashes under the title when the reader switches density. */
export function densityHint(density) {
  return DENSITY_LABEL[density] + ' — ' + DENSITY_HINT[density];
}

/** The live region while the chooser asks which of several close threads was meant. */
export function chooserAnnouncement(count) {
  return count + ' nearby connections. Choose one.';
}

/** The live region as Follow pans to a thread's far foot. */
export function followAnnouncement(label) {
  return 'Following the line to ' + label;
}

/** The live region when a bundle's group is chosen, or let go of (`letGo`). */
export function groupAnnouncement(grp, letGo) {
  return letGo ? 'Showing the strongest again.' : grp.count + ' threads to ' + grp.label + ' shown.';
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
    const target = curatedEndpoint(edge, node);
    // the card's third line names the Volume the passage sits in (what the
    // reader zoomed the top rail to), never the edge's storage kind
    const seg = p.votRail.segments.find((s) => s.volKey === node.volKey);
    return {
      kind: 'underlay', index: found.index, source, target,
      // rail positions, published on the card (data-verse / data-vot) so a
      // walk can follow this one thread through the exported geometry
      verse: underlay.versePos[found.index], vot: underlay.votPos[found.index],
      joins: (seg && (seg.short || seg.label)) || edge.kind || 'curated connection',
      // the family in words (design-myweb-colour.md, 5): the source the thread's
      // colour encodes, then the Volume
      sourceName: MY_WEB_SOURCES[underlay.source ? underlay.source[found.index] : MY_WEB_SOURCES.length - 1].name,
      cards: [verseCard('Scripture', source), endpointCard('Corpus', target)],
    };
  }
  if (found.kind === 'arc') {
    const a = refOfVerse(g, found.hit.from), b = refOfVerse(g, found.hit.to);
    return {
      kind: 'arc', a, b, votes: found.hit.votes,
      span: Math.abs(found.hit.to - found.hit.from), index: found.hit.index,
      // whether it is a prophecy pair, and which (g.prophecy; GL, pick.pickThreads): the panel
      // stream's describe carries the same two fields
      prophecy: found.hit.prophecy >= 0, prophecyIndex: found.hit.prophecy >= 0 ? found.hit.prophecy : -1,
      from: found.hit.from, to: found.hit.to,
      cards: [verseCard('From', a), verseCard('To', b)],
    };
  }
  if (found.kind === 'bundle') {
    const cell = found.cell;
    const view = viewFor();
    const first = refOfVerse(g, cell.lo), last = refOfVerse(g, cell.hi);
    const label = cell.verse ? first.label
      : cell.chapterLo === cell.chapterHi ? first.bookTitle + ' ' + first.chapter
      : first.bookTitle + ' ' + first.chapter + ' – ' + (last.bookTitle === first.bookTitle ? '' : last.bookTitle + ' ') + last.chapter;
    const groups = cam && v.W ? bundleGroups(g, cam, view, cell.lo, cell.hi, 40) : [];
    const chapter = g.chapters[cell.chapterLo];
    return { kind: 'bundle', cell, label, lo: cell.lo, hi: cell.hi,
      hidden: cell.hidden, drawn: cell.drawn,
      connections: countTouching(g, cell.lo, cell.hi, density),
      groups: groups.map((grp) => {
        const r = refOfVerse(g, grp.lo);
        return Object.assign({ label: r.bookTitle + ' ' + r.chapter }, grp);
      }),
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

/** A described hit's row title in the chooser and the Nearby list. */
export function connectionTitle(info) {
  if (info.kind === 'arc') return info.a.label + ' ↕ ' + info.b.label;
  if (info.kind === 'chapter') return info.book.title + ' ' + info.chapter + ' — where its threads go';
  if (info.kind === 'underlay') return info.source.label + ' ↕ ' + endpointLabel(info.target);
  return endpointLabel(info.source) + ' ↕ ' + endpointLabel(info.target);
}

/** A described hit's row meta line in the chooser and the Nearby list. */
export function connectionMeta(info) {
  if (info.kind === 'arc') return info.prophecy ? prophecyMeta(info) : info.votes + ' votes · ' + info.span.toLocaleString() + ' verses apart';
  if (info.kind === 'chapter') {
    return info.verses + ' verses · ' + info.connections.toLocaleString() + ' connections'
      + (info.groups && info.groups.length ? ' · to ' + info.groups.length + (info.groups.length === 1 ? ' chapter' : ' chapters') : '');
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
  return 'Prophecy fulfilled · ' + (info.index >= 0 ? info.votes + ' votes · ' : '') + info.span.toLocaleString() + ' verses apart';
}

/** The detail sheet's eyebrow (also its aria-label's head). */
export function sheetEyebrow(info) {
  return info.kind === 'link' ? 'Your link'
    : info.kind === 'underlay' ? 'Timothy’s thread'
    : info.kind === 'arc' ? 'Connection'
    : info.kind === 'bundle' ? 'Bundle · ' + info.label
    : info.kind === 'chapter' ? 'Chapter' : 'Verse';
}

/** The detail sheet's meta line. */
export function sheetMeta(info) {
  return info.kind === 'arc'
    ? (info.prophecy ? prophecyMeta(info) : info.span.toLocaleString() + ' verses apart · weight ' + info.votes)
    : info.kind === 'link' ? LINK_KIND_NAMES[info.joins]
    : info.kind === 'underlay' ? (info.sourceName ? info.sourceName + ' · ' + info.joins : info.joins)
    : info.kind === 'bundle'
      ? (info.hidden > 0
        ? info.connections.toLocaleString() + ' connections here, ' + info.hidden.toLocaleString()
          + ' not drawn at this zoom. Choose where they go to see them.'
        : info.connections.toLocaleString() + ' connections converge here. Choose where they go to follow them.')
    : info.kind === 'chapter'
      ? info.verses + ' verses · ' + info.connections.toLocaleString() + ' connections'
      : info.connections.toLocaleString() + ' connections';
}

/** The Nearby list's eyebrow: the reader's links on My Web, else the chapter it reads. */
export function listEyebrow(mode, chapter, lensOn) {
  return mode === 'personal' ? 'Your links'
    : chapter ? (lensOn ? 'Under the lens · ' : 'Nearby · ') + chapter.book.title + ' ' + chapter.chapter
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
    return found.source.label + ' and ' + endpointLabel(found.target) + ', corpus connection.';
  }
  if (found.kind === 'arc') return found.a.label + ' and ' + found.b.label + ', connected.';
  if (found.kind === 'verse') return found.ref.label + ', ' + found.connections + ' connections.';
  if (found.kind === 'bundle') {
    return found.label + ', ' + (found.hidden > 0
      ? found.hidden + ' connections not drawn here.' : found.connections + ' connections converge here.');
  }
  return found.book.title + ' ' + found.chapter + ', ' + found.connections + ' connections.';
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
  const endpoint = {
    type: 'bible',
    key: 'bible:' + ref.bookId + ':' + ref.chapter + ':' + ref.verse,
    bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse, label: ref.label,
  };
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

/** The reader-side endpoint of one of Timothy's curated threads (study, letter or entry). */
export function curatedEndpoint(edge, node) {
  if (edge.studyId) {
    return {
      type: 'study-letter', key: 'study:' + edge.studyId + ':' + edge.chapterId,
      studyId: edge.studyId, studyChapterId: edge.chapterId,
      screen: 'bible-study-chapter',
      label: node.title, collection: 'Bible Studies',
    };
  }
  if (edge.letterId) {
    const screenByVolume = {
      one: 'vot-one-letter', two: 'vot-letter', three: 'vot-three-letter',
      four: 'vot-four-letter', five: 'vot-five-letter', six: 'vot-six-letter',
      seven: 'vot-seven-letter', timothy: 'vot-timothy-letter', flock: 'vot-flock-letter',
      rebuke: 'vot-rebuke-letter', hm: 'hm-letter',
    };
    return {
      type: 'letter', key: 'letter:' + edge.letterId + ':0', letterId: edge.letterId,
      screen: screenByVolume[edge.volKey] || 'vot-letter',
      volKey: edge.volKey, collection: edge.volKey, label: node.title,
    };
  }
  if (edge.entryId) {
    const type = edge.volKey === 'blessed' ? 'blessed'
      : edge.volKey === 'holydays' ? 'holy-days' : 'wtlb';
    const screen = edge.volKey === 'blessed' ? 'blessed-entry'
      : edge.volKey === 'holydays' ? 'holy-days-entry'
      : edge.volKey === 'wtlb2' ? 'wtlb-two-entry' : 'wtlb-one-entry';
    return {
      type, key: entryHlBase(type, edge.entryId) + ':0', entryId: edge.entryId,
      screen,
      volKey: edge.volKey, collection: edge.volKey, label: node.title,
    };
  }
  return null;
}
