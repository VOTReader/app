/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/personal-build — Cluster F (bundle-d)

   My Web's inputs, read from the live app: the reader's links (LinkStore),
   the Volumes in READING_CHAIN order (COLLECTIONS, colPreface then
   colLetterArr: a preface opens its segment, w3) and the
   Bible studies (BIBLE_STUDIES), turned into the dual-rail web by the pure
   builders in personal-graph.js. Moved out of ScriptureWebScreen unchanged
   (F0, 2026-10-18). The globals are free (the bundle-d pattern), resolved at
   call time, and a store that is not there yet gives a null web.
   ═══════════════════════════════════════════════════════════════════════ */

import { buildVotRail, buildPersonalGraph, buildCuratedUnderlay } from './personal-graph.js';

/**
 * Short names for the VOT rail. Full collection titles ("Words To Live By:
 * Part One") do not fit above a rail segment sized by letter count.
 */
const SHORT_VOL = {
  one: 'Vol I', two: 'Vol II', three: 'Vol III', four: 'Vol IV', five: 'Vol V',
  six: 'Vol VI', seven: 'Vol VII', rebuke: 'Rebuke', wtlb1: 'WTLB I',
  wtlb2: 'WTLB II', blessed: 'Blessed', flock: 'Flock', timothy: 'Timothy',
  holydays: 'Holy Days', hm: 'Manna',
};

/** Short rail names for the Bible studies (full titles are sentence-long). */
const SHORT_STUDY = {
  'more-than-a-man': 'MTaM', 'odds-chart': 'Odds', 'lamb-of-god': 'Lamb',
  'state-of-the-dead': 'SotD', 'grace-and-the-law': 'Grace',
  'trinity-exposed': 'Trinity', 'purity': 'Purity',
};

/**
 * The tiny forms, for a rail too narrow for the short ones (w4 review: a
 * portrait phone gives each of the 21 collections 17-20 px). The Volumes'
 * are the nav badges (_NAV_ICONS: V1, LR, W1, TB, HD ...), so the rail and
 * the nav never disagree; the studies' keep a word where a badge would be a
 * riddle. A family steps down together (drawRails), so "VOL I" never stands
 * by "V2": Volumes I-VII, and the two parts of Words To Live By.
 */
const TINY_STUDY = {
  'more-than-a-man': 'MTaM', 'odds-chart': 'Odds', 'lamb-of-god': 'Lamb',
  'state-of-the-dead': 'SotD', 'grace-and-the-law': 'Grace',
  'trinity-exposed': 'Trin', 'purity': 'Pur',
};
const FAMILY = {
  one: 'vol', two: 'vol', three: 'vol', four: 'vol', five: 'vol', six: 'vol', seven: 'vol',
  wtlb1: 'wtlb', wtlb2: 'wtlb',
};

/** Build the dual-rail personal web from live stores + the loaded corpora. */
export function buildPersonal(graph) {
  if (typeof LinkStore === 'undefined') return null;
  const chapterStart = new Map();
  for (let i = 0; i < graph.chapters.length; i++) {
    const c = graph.chapters[i];
    chapterStart.set(graph.books[c[0]].id + ':' + c[1], { start: c[2], verses: c[3] });
  }
  const verseIdOf = (bookId, chapter, verse) => {
    const ch = chapterStart.get(bookId + ':' + chapter);
    if (!ch) return -1;
    return ch.start + (Math.min(Math.max(verse, 1), ch.verses) - 1);
  };
  const collections = [];
  if (typeof COLLECTIONS !== 'undefined' && typeof READING_CHAIN !== 'undefined') {
    for (const volKey of READING_CHAIN) {
      const col = COLLECTIONS.find((c) => c.volKey === volKey);
      if (!col) continue;
      const arr = (typeof colLetterArr === 'function') ? colLetterArr(col) : [];
      // The preface is a page the reader can link to (nav-index lists it as
      // letter 0) and the Volumes cite scripture from: it opens its
      // collection's segment, where the reading chain puts it.
      const pref = (typeof colPreface === 'function') ? colPreface(col) : null;
      const items = pref && pref.id ? [{ id: pref.id, title: pref.title || pref.id }].concat(arr) : arr;
      const tiny = (typeof _NAV_ICONS !== 'undefined' && _NAV_ICONS && _NAV_ICONS[volKey]) || undefined;
      collections.push({ volKey, label: col.label, short: SHORT_VOL[volKey] || col.label, tiny, group: FAMILY[volKey] || volKey, items });
    }
  }
  // The Bible studies are corpora too — their 781 curated threads need rail
  // segments to land on, keyed 'study-<id>' with chapters as the nodes.
  // (Hidden Manna stays OFF the rail on purpose: not publicly indexed.)
  if (typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES)) {
    for (const st of BIBLE_STUDIES) {
      if (!st || !st.chapters) continue;
      const key = st.slug || st.id;
      collections.push({
        volKey: 'study-' + key, label: st.title,
        short: SHORT_STUDY[st.id] || SHORT_STUDY[key] || 'Study',
        tiny: TINY_STUDY[st.id] || TINY_STUDY[key], group: 'study-' + key,
        items: st.chapters.map((c) => ({ id: c.id, title: c.title || st.title })),
      });
    }
  }
  const votRail = buildVotRail(collections);
  const ctx = { verseIdOf, votRail };
  return {
    votRail,
    graph: buildPersonalGraph(LinkStore.all(), ctx),
    // The corpus's OWN curated Bible->Volumes edges, drawn dim beneath the
    // reader's links: on day one the personal web is nearly empty, and this
    // shows what the app already knows so the screen is never a blank page.
    underlay: buildCuratedUnderlay(graph.votEdges, ctx),
  };
}
