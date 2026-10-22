/**
 * scripture-web-cites — the Volumes' own citations of scripture, for the
 * Scripture Web asset (tools/gen-scripture-web.mjs). Pure: the shell loads
 * the corpus and injects it with the two resolvers below; tests feed it
 * fixtures and real corpus slices.
 *
 * WHAT IT RECORDS. One SITE per place a verse is cited: which entry (a
 * letter, a preface, a Words To Live By / Blessed / Holy Days entry, a Bible
 * Study chapter), which block of it (the paragraph the reader should land
 * on), and which citation in that block: the footnote number, the r-th
 * inline {{ref:}}, or for a Matthew Study Bible note the span of the
 * letter's own words the note quotes. Sites are then grouped one ENTRY per
 * letter (reading order) and one EDGE per (verse, letter), so a letter that
 * cites a verse twice is one thread on the web with two sites, and the
 * corpus-edge count no longer moves with how often a letter repeats itself.
 *
 * Offsets live in the citation text domain defined by
 * app/src/main/assets/src/utils/scripture-web/vot-citations.js (formatAText
 * / formatBText). This file imports those functions rather than restating
 * them, so the generator and the runtime excerpt cannot disagree.
 */
import {
  formatAText, formatBText, CITE_KINDS, ENTRY_COLLECTIONS,
} from '../app/src/main/assets/src/utils/scripture-web/vot-citations.js';

export { ENTRY_COLLECTIONS };
export const KIND = Object.fromEntries(CITE_KINDS.map((k, i) => [k, i]));

/**
 * Every citable block of a Format A entry, prophecy-group parts included:
 * `{ p, sub, block }` where sub = [part, index] inside group p, else null.
 * @param {any} entry
 */
export function* formatABlocks(entry) {
  const blocks = (entry && Array.isArray(entry.blocks)) ? entry.blocks : [];
  for (let p = 0; p < blocks.length; p++) {
    const b = blocks[p];
    if (!b) continue;
    if (b.type === 'prophecy-group') {
      for (const part of ['intro', 'ot', 'nt', 'vot']) {
        const list = part === 'intro' ? b.intro : b[part] && b[part].blocks;
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) if (list[i]) yield { p, sub: [part, i], block: list[i] };
      }
      continue;
    }
    yield { p, sub: null, block: b };
  }
}

/** @type {WeakMap<object, Array<{p:number, sub:[string, number]|null, text:string}>>} */
const BLOCK_TEXTS = new WeakMap();
/**
 * Every citable block of any entry in the citation text domain:
 * `{ p, sub, text }` (Format B paragraphs, Format A blocks and their
 * prophecy-group parts). Computed once per entry.
 * @param {any} entry
 */
export function blockTexts(entry) {
  if (!entry || typeof entry !== 'object') return [];
  let out = BLOCK_TEXTS.get(entry);
  if (out) return out;
  out = Array.isArray(entry.paragraphs)
    ? entry.paragraphs.map((para, p) => ({ p, sub: null, text: formatBText(para && para.text).text }))
    : [...formatABlocks(entry)].map((x) => ({ p: x.p, sub: x.sub, text: formatAText(x.block).text }));
  BLOCK_TEXTS.set(entry, out);
  return out;
}

/** A word of a quotation: letters and digits, an inner apostrophe in any of its forms. */
const QUOTE_WORD = /[\p{L}\p{N}]+(?:['’‘`][\p{L}\p{N}]+)*/gu;
/** A word as compared: lower case, one apostrophe. */
const fold = (w) => w.toLowerCase().replace(/[’‘`]/g, "'");

/** @type {WeakMap<object, Array<[string, number, number]>>} */
const BLOCK_WORDS = new WeakMap();
/** A block's words as [folded word, start, end] (cached on the block-text record). */
function wordsOf(x) {
  let out = BLOCK_WORDS.get(x);
  if (!out) {
    out = [...x.text.matchAll(QUOTE_WORD)].map((m) => [fold(m[0]), m.index, m.index + m[0].length]);
    BLOCK_WORDS.set(x, out);
  }
  return out;
}

/**
 * Find the words a study note quotes inside the letter it quotes. The note's
 * excerpt may join passages with an ellipsis; the FIRST passage of at least
 * three words is located by its words alone (punctuation, dashes, line breaks
 * and quote forms between them do not count, nor does case), and a shorter
 * head of it is tried when the passage runs past its paragraph or was quoted
 * loosely; a passage that runs across paragraphs is tried sentence by sentence.
 * @param {any} entry  a letter or entry (Format A or B)
 * @param {string} excerpt
 * @returns {{p:number, sub:[string, number]|null, o:number, n:number, whole:boolean}|null}
 */
export function locateQuote(entry, excerpt) {
  const parts = String(excerpt || '').split(/\s*(?:…|\.\.\.)\s*/).filter((s) => (s.match(QUOTE_WORD) || []).length >= 3);
  if (!parts.length || !entry) return null;
  const texts = blockTexts(entry);
  const sentences = parts[0].split(/(?<=[.!?])\s+/);
  const tries = [parts[0], ...(sentences.length > 1 ? sentences : [])];
  for (const [i, passage] of tries.entries()) {
    const hit = findWords(texts, (passage.match(QUOTE_WORD) || []).map(fold), i === 0);
    if (hit) return hit;
  }
  return null;
}

/** The first block holding `words` in sequence (or, failing that, the head of them). */
function findWords(texts, words, mayBeWhole) {
  for (const take of [words.length, 16, 10, 6]) {
    if (take > words.length || take < 3) continue;
    for (const x of texts) {
      const bw = wordsOf(x);
      for (let i = 0; i + take <= bw.length; i++) {
        let k = 0;
        while (k < take && bw[i + k][0] === words[k]) k++;
        if (k < take) continue;
        // a head-only match quotes on past its paragraph: take the block's rest
        const whole = mayBeWhole && take === words.length;
        let end = whole ? bw[i + take - 1][2] : x.text.length;
        while (end < x.text.length && /[.!?…"'”’)\]]/.test(x.text[end])) end++;
        return { p: x.p, sub: x.sub, o: bw[i][1], n: end - bw[i][1], whole };
      }
    }
  }
  return null;
}

/**
 * A Bible Study quotes scripture and names it on a plain source line at the
 * block's end: '... for the mouth of The Lord has spoken." - Isaiah 40:3-5'.
 * The tail after the last spaced dash is a citation when the whole of it
 * parses as references (book, chapter, verses; compound lists allowed); the
 * quotation is everything before the dash.
 * @param {string} text  a block in the citation text domain
 * @param {(raw:string) => RefPart[]} refParts
 * @returns {{raw:string, o:number, n:number}|null}  o/n: the quoted span
 */
export function trailingRef(text, refParts) {
  const t = String(text || '').replace(/\s+$/, '');
  const m = /\s[-–—]\s+([1-3]?\s?[A-Za-z][A-Za-z .]*\d[\d:,;\s.\-–a-z]*?)(?:\s*\([A-Z]{2,6}\))?$/.exec(t);
  if (!m || m[1].length > 80) return null;
  const raw = m[1].replace(/[.;,\s]+$/, '');
  if (!/\d+:\d+|\d+$/.test(raw) || !refParts(raw).length) return null;
  let n = m.index;
  while (n > 0 && /\s/.test(t[n - 1])) n--;
  return n > 0 ? { raw, o: 0, n } : null;
}

/**
 * The generator's reference parser over the app's own (data/
 * scripture-resolution.js splitCompoundRef + findBook, injected so this file
 * stays pure): one RefPart per passage of a compound ref, the book carried
 * across its parts, the Study Bible's "matthew" read as the plain Matthew of
 * the verse table. Ref strings in the corpus occasionally carry prose the
 * parser can't eat, a leading gloss ("(which means \"God with us\") -
 * Matthew 1:23") or a bare translation tag ("Amos 3:7 CJB"), so trimmed
 * candidates are tried after the raw string. parseRefStr stays untouched:
 * its single-object return is a pinned contract.
 * @param {(raw:string) => Array<{parsed:any}>} splitCompoundRef
 * @param {(rawBook:string) => (string|null)} findBook  returns the book KEY
 * @returns {(raw:string) => RefPart[]}
 */
export function makeRefParts(splitCompoundRef, findBook) {
  const resolveParsed = (p) => {
    if (!p) return null;
    const key = findBook(p.rawBook);
    if (!key) return null;
    return {
      bookId: key === 'matthew' ? 'matthew-plain' : key, chapter: p.chapter,
      verse: p.verse == null ? null : p.verse, verseEnd: p.verseEnd == null ? null : p.verseEnd,
    };
  };
  const candidates = (raw) => {
    const s = String(raw).trim();
    const out = [s];
    const dash = s.lastIndexOf(' - ');
    if (dash > 0) out.push(s.slice(dash + 3).trim());
    const bareTag = /^(.*?)[\s]+[A-Z]{2,6}$/.exec(s);
    if (bareTag) out.push(bareTag[1].trim());
    return out;
  };
  return (raw) => {
    for (const cand of candidates(raw)) {
      const parts = splitCompoundRef(cand).map((p) => resolveParsed(p.parsed)).filter(Boolean);
      if (parts.length) return parts;
    }
    return [];
  };
}

/**
 * @typedef {{ bookId:string, chapter:number, verse:number|null, verseEnd:number|null }} RefPart
 * @typedef {{ v:number, ve:number, target:{volKey?:string, letterId?:string, entryId?:string,
 *   studyId?:string, chapterId?:string}, k:number, p:number, sub?:[string, number]|null,
 *   fn?:string, r?:number, o?:number, n?:number }} Site
 */

/**
 * Verse ids a ref part covers: [first, last]. A chapter-only cite covers the
 * chapter (its first verse is where the web draws it, as before); a range
 * stays inside its chapter; a verse past the chapter's end clamps to it.
 * @param {RefPart} part
 * @param {{chapterStart:Map<string, {start:number, verses:number}>}} table
 * @returns {[number, number]|null}
 */
export function verseSpan(part, table) {
  const ch = table.chapterStart.get(`${part.bookId}:${part.chapter}`);
  if (!ch) return null;
  const last = ch.start + ch.verses - 1;
  if (part.verse == null) return [ch.start, last];
  const v = ch.start + Math.min(Math.max(part.verse, 1), ch.verses) - 1;
  const ve = part.verseEnd != null && part.verseEnd > part.verse
    ? ch.start + Math.min(part.verseEnd, ch.verses) - 1 : v;
  return [v, Math.max(v, Math.min(ve, last))];
}

/**
 * Extract every citation site from the corpus.
 *
 * @param {{
 *   collections: Map<string, {letters:any[]}>,   // volKey -> entries (preface included)
 *   studies: any[],                                // BIBLE_STUDIES
 *   matthew: any,                                  // MATTHEW (the Study Bible)
 *   table: any,                                    // buildVerseTable output
 *   refParts: (raw:string) => RefPart[],           // compound-aware ref parser
 *   resolveLetter: (vol:string|null, title:string) => ({volKey:string, letterId:string}|null),
 *   resolveCollection: (label:string) => (string|null),   // a collection label -> volKey
 *   resolveScreen?: (screen:string) => (string|null),     // a letter screen -> volKey
 *   skip?: Set<string>,                            // volKeys to leave out (Hidden Manna)
 * }} input
 */
export function extractCites(input) {
  const { collections, studies, matthew, table, refParts, resolveLetter, resolveCollection, resolveScreen } = input;
  const skip = input.skip || new Set();
  /** @type {Site[]} */
  const sites = [];
  const prophecy = [];
  const votLinks = [];
  const problems = [];
  /** @type {Site[]} votNote sites whose quotation was not found in the letter */
  const unlocated = [];
  const counts = { votNote: 0, footnote: 0, study: 0, studyPlain: 0, wtlb: 0, quoteWhole: 0, quoteHead: 0, quoteMissing: 0, quoteTwin: 0, skipped: 0 };

  const spansOf = (raw) => {
    const out = [];
    for (const part of refParts(raw)) { const s = verseSpan(part, table); if (s) out.push(s); }
    return out;
  };
  const entryOf = (volKey, id) => {
    const col = collections.get(volKey);
    return col ? (col.letters || []).find((e) => e && e.id === id) || null : null;
  };
  const targetOf = (volKey, id) => (ENTRY_COLLECTIONS.has(volKey) ? { volKey, entryId: id } : { volKey, letterId: id });

  // ── 1. Matthew Study Bible votNotes: a note on a Matthew verse quotes a letter.
  for (const ch of (matthew && matthew.chapters) || []) {
    const notes = Array.isArray(ch.votNotes) ? ch.votNotes : Object.values(ch.votNotes || {});
    for (const note of notes) {
      if (!note || !note.letter) continue;
      const m = /^(\d+):(\d+)(?:-(\d+))?/.exec(String(note.ref || ''));
      const span = verseSpan({
        bookId: 'matthew-plain', chapter: m ? Number(m[1]) : ch.num,
        verse: m ? Number(m[2]) : 1, verseEnd: m && m[3] ? Number(m[3]) : null,
      }, table);
      if (!span) { problems.push({ kind: 'votNote-ref', where: `matthew ch ${ch.num}`, what: String(note.ref) }); continue; }
      const hit = resolveLetter(note.vol == null ? null : String(note.vol), String(note.letter));
      if (!hit) { problems.push({ kind: 'votNote-letter', where: `Matthew ${note.ref}`, what: String(note.letter) }); continue; }
      if (skip.has(hit.volKey)) { counts.skipped++; continue; }
      const entry = entryOf(hit.volKey, hit.letterId);
      const q = note.excerpt ? locateQuote(entry, note.excerpt) : null;
      /** @type {Site} */
      const site = { v: span[0], ve: span[1], target: targetOf(hit.volKey, hit.letterId), k: KIND.votNote, p: 0 };
      if (q) {
        site.p = q.p; if (q.sub) site.sub = q.sub; site.o = q.o; site.n = q.n;
        counts[q.whole ? 'quoteWhole' : 'quoteHead']++;
      } else {
        counts.quoteMissing++;
        unlocated.push(site);
        if (note.excerpt) problems.push({ kind: 'votNote-quote', where: `Matthew ${note.ref} -> ${hit.volKey}/${hit.letterId}`, what: String(note.excerpt).slice(0, 60) });
      }
      sites.push(site); counts.votNote++;
    }
  }

  // ── 2. Format A scripture footnotes: the marker's block is the paragraph.
  const footnoteSites = (entry, target, kind, where) => {
    if (!entry || !entry.footnotes) return;
    const seen = new Set();
    for (const { p, sub, block } of formatABlocks(entry)) {
      for (const [num] of formatAText(block).fn) {
        const fn = entry.footnotes[num];
        seen.add(num);
        if (!fn || fn.type !== 'scripture' || !fn.ref) continue;
        const spans = spansOf(String(fn.ref));
        if (!spans.length) { problems.push({ kind: 'footnote-ref', where: `${where} fn ${num}`, what: String(fn.ref) }); continue; }
        for (const [v, ve] of spans) {
          /** @type {Site} */
          const site = { v, ve, target, k: kind, p, fn: num };
          if (sub) site.sub = sub;
          sites.push(site);
          counts[CITE_KINDS[kind]]++;
        }
      }
    }
    for (const [num, fn] of Object.entries(entry.footnotes)) {
      if (fn && fn.type === 'scripture' && !seen.has(num)) {
        problems.push({ kind: 'footnote-orphan', where: `${where} fn ${num}`, what: String(fn.ref) });
      }
    }
  };
  for (const [volKey, { letters }] of collections) {
    if (skip.has(volKey)) continue;
    for (const entry of letters || []) {
      if (entry && entry.id && Array.isArray(entry.blocks)) {
        footnoteSites(entry, targetOf(volKey, entry.id), KIND.footnote, `${volKey}/${entry.id}`);
      }
    }
  }

  // ── 3. Bible Studies: inline {{ref:}}, a quotation's plain " - Isaiah 40:3-5"
  //       source line, scripture footnotes, prophecy pairs, letter-links.
  for (const study of studies || []) {
    for (const ch of study.chapters || []) {
      const target = { studyId: study.id, chapterId: ch.id };
      const where = `study ${study.id}/${ch.id}`;
      const firstSite = sites.length;
      for (const { p, sub, block } of formatABlocks(ch)) {
        const bt = formatAText(block);
        bt.refs.forEach(([raw], r) => {
          const spans = spansOf(raw);
          if (!spans.length) { problems.push({ kind: 'study-ref', where, what: raw }); return; }
          for (const [v, ve] of spans) {
            /** @type {Site} */
            const site = { v, ve, target, k: KIND.study, p, r };
            if (sub) site.sub = sub;
            sites.push(site);
            counts.study++;
          }
        });
        const plain = trailingRef(bt.text, refParts);
        if (plain) {
          for (const [v, ve] of spansOf(plain.raw)) {
            /** @type {Site} */
            const site = { v, ve, target, k: KIND.study, p, o: plain.o, n: plain.n };
            if (sub) site.sub = sub;
            sites.push(site);
            counts.study++; counts.studyPlain++;
          }
        }
        const runs = Array.isArray(block.segments) ? [block.segments] : (Array.isArray(block.lines) ? block.lines : []);
        for (const run of runs) {
          for (const seg of run || []) {
            if (!seg || seg.t !== 'letter-link') continue;
            const byLabel = (seg.link && seg.link.collection && resolveCollection(seg.link.collection)) || null;
            const byScreen = (seg.screen && resolveScreen && resolveScreen(seg.screen)) || null;
            const hit = !seg.letterId && seg.link && seg.link.letterTitle && byLabel
              ? resolveLetter(seg.link.collection, seg.link.letterTitle) : null;
            const letterId = seg.letterId || (hit && hit.letterId);
            // the label names the collection a reader sees; the screen is what
            // the tap opens. When they disagree, the one holding the letter wins
            // (and the disagreement is reported: the label is wrong in the data).
            const volKey = [byLabel, byScreen].find((k) => k && letterId && entryOf(k, letterId)) || null;
            if (!volKey) {
              problems.push({ kind: 'study-letter-link', where, what: `${byLabel || byScreen || '?'} / ${letterId || (seg.link && seg.link.letterTitle) || seg.label}` });
              continue;
            }
            if (byLabel && byScreen && byLabel !== byScreen) {
              problems.push({ kind: 'study-letter-link-label', where, what: `${letterId}: labelled ${seg.link.collection}, opens ${byScreen}, found in ${volKey}` });
            }
            /** @type {any} */
            const link = { studyId: study.id, chapterId: ch.id, volKey, letterId, p };
            if (sub) link.sub = sub;
            votLinks.push(link);
          }
        }
      }
      footnoteSites(ch, target, KIND.study, where);
      // A prophecy group pairs its Old Testament prophecy with its New
      // Testament fulfilment: the first passage each part cites.
      const chSites = sites.slice(firstSite);
      (ch.blocks || []).forEach((b, p) => {
        if (!b || b.type !== 'prophecy-group') return;
        const first = (part) => chSites.find((s) => s.p === p && s.sub && s.sub[0] === part) || null;
        const a = first('ot'), c = first('nt');
        if (a && c) prophecy.push({ a: a.v, b: c.v, studyId: study.id, chapterId: ch.id, p });
        else problems.push({ kind: 'prophecy-incomplete', where: `${where} block ${p}`, what: `${b.label || ''}: no ${a ? 'New' : c ? 'Old' : 'Old or New'} Testament passage` });
      });
    }
  }

  // ── 4. Format B inline {{ref:}} (WTLB One/Two, The Blessed, Holy Days' Format B entries).
  for (const volKey of ['wtlb1', 'wtlb2', 'blessed', 'holydays']) {
    const col = collections.get(volKey);
    if (!col || skip.has(volKey)) continue;
    for (const entry of col.letters || []) {
      if (!entry || !entry.id || !Array.isArray(entry.paragraphs)) continue;
      entry.paragraphs.forEach((para, p) => {
        formatBText(para && para.text).refs.forEach(([raw], r) => {
          const spans = spansOf(raw);
          if (!spans.length) { problems.push({ kind: 'wtlb-ref', where: `${volKey}/${entry.id} para ${p}`, what: raw }); return; }
          for (const [v, ve] of spans) {
            sites.push({ v, ve, target: { volKey, entryId: entry.id }, k: KIND.wtlb, p, r });
            counts.wtlb++;
          }
        });
      });
    }
  }

  // A note whose quotation was not found opens where its letter cites the
  // same verse itself, when it does (the note quotes those words loosely).
  const missing = new Set(unlocated);
  for (const site of unlocated) {
    const key = targetKey(site.target);
    const twin = sites.find((s) => !missing.has(s) && s.v === site.v && targetKey(s.target) === key);
    if (!twin) continue;
    site.p = twin.p;
    for (const f of ['sub', 'fn', 'r', 'o', 'n']) if (twin[f] != null) site[f] = twin[f];
    counts.quoteTwin++;
  }

  return { sites, prophecy, votLinks: dedupeBy(votLinks, (l) => [l.chapterId, l.p, l.sub ? l.sub.join(':') : '', l.volKey, l.letterId].join('|')), problems, counts };
}

/**
 * Regarding The Holy Days is a ghost album: each entry re-presents a letter or
 * a Words To Live By entry from another collection (`sourceLabel` names it).
 * Map each Holy Days entry to its source, so a verse cited by both reads as
 * one citation in its own collection, not two. Match by title, then by id,
 * then by the source's title or id opening the Holy Days one ("I Am The
 * Passover" / "I Am The Passover and The Lamb, ...").
 *
 * @param {any[]} hdEntries
 * @param {Map<string, {letters:any[]}>} collections
 * @param {(label:string) => (string|null)} resolveCollection
 * @returns {{ mirrors: Record<string, string>, missing: string[] }}
 */
export function holyDaysMirrors(hdEntries, collections, resolveCollection) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  /** @type {Record<string, string>} */
  const mirrors = {};
  const missing = [];
  for (const e of hdEntries || []) {
    if (!e || !e.id) continue;
    const volKey = resolveCollection(e.sourceLabel || '');
    const letters = (volKey && collections.get(volKey) && collections.get(volKey).letters) || [];
    const t = norm(e.title);
    const hit = letters.find((l) => l && norm(l.title) === t)
      || letters.find((l) => l && l.id === e.id)
      || letters.find((l) => l && l.title && norm(l.title).length >= 8
        && (t.startsWith(norm(l.title) + ' ') || e.id.startsWith(l.id + '-')));
    if (hit) mirrors['holydays/' + e.id] = volKey + '/' + hit.id;
    else missing.push(`holydays/${e.id} (${e.sourceLabel || 'no sourceLabel'})`);
  }
  return { mirrors, missing };
}

function dedupeBy(list, keyOf) {
  const seen = new Set();
  const out = [];
  for (const x of list) { const k = keyOf(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

/** A target's stable key: "two/the-wide-path", "study:more-than-a-man/ch5". */
export function targetKey(t) {
  if (t.studyId) return 'study:' + t.studyId + '/' + t.chapterId;
  return t.volKey + '/' + (t.letterId || t.entryId);
}

/** A site's identity inside its entry (two identical sites are one). */
function siteKey(s) {
  return [s.v, s.ve, s.k, s.p, s.sub ? s.sub.join(':') : '', s.fn == null ? '' : s.fn, s.r == null ? '' : s.r, s.o == null ? '' : s.o].join('|');
}

/**
 * Group sites into entries in reading order and dedupe them.
 *
 * @param {Site[]} sites
 * @param {(key:string, target:object) => {order:number, title:string}|null} describe
 *   the entry's place in reading order and its title
 * @returns {{ entries: Array<{key:string, target:object, order:number, title:string,
 *   sites:Site[]}>, duplicateSites:number, edges:number }}
 */
export function groupCites(sites, describe) {
  /** @type {Map<string, any>} */
  const byKey = new Map();
  let duplicateSites = 0;
  for (const s of sites) {
    const key = targetKey(s.target);
    let e = byKey.get(key);
    if (!e) {
      const d = describe(key, s.target);
      if (!d) continue;
      e = { key, target: s.target, order: d.order, title: d.title, sites: [], seen: new Set() };
      byKey.set(key, e);
    }
    const sk = siteKey(s);
    if (e.seen.has(sk)) { duplicateSites++; continue; }
    e.seen.add(sk);
    e.sites.push(s);
  }
  const entries = [...byKey.values()].sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
  let edges = 0;
  for (const e of entries) {
    delete e.seen;
    // reading order inside the entry: paragraph, then the site's place in it, then the verse
    e.sites.sort((a, b) => a.p - b.p || subRank(a) - subRank(b) || (a.o ?? -1) - (b.o ?? -1)
      || (a.r ?? -1) - (b.r ?? -1) || (Number(a.fn) || 0) - (Number(b.fn) || 0) || a.v - b.v || a.k - b.k);
    edges += new Set(e.sites.map((s) => s.v)).size;
  }
  return { entries, duplicateSites, edges };
}

const SUB_RANK = { intro: 0, ot: 1, nt: 2, vot: 3 };
function subRank(s) { return s.sub ? (SUB_RANK[s.sub[0]] + 1) * 10000 + s.sub[1] : 0; }

/**
 * The shipped form of the grouped citations (`votCites` in the asset):
 *
 *   [{ c, id, sid?, t, s: [site, ...] }, ...]   in reading order, where
 *     c   collection volKey, or "studies"
 *     id  the letter / entry / study chapter id; sid the study id
 *     t   its title (cards name a citation before the corpus has loaded)
 *     s   its sites, each a small array:
 *         [v, k, p, extra?, sub?, ve?]
 *           v     verse id (the start of the cited passage)
 *           k     kind: 0 footnote, 1 votNote, 2 wtlb, 3 study (CITE_KINDS)
 *           p     block (Format A) or paragraph (Format B) index
 *           extra footnote number (string), or the inline-ref ordinal r
 *                 (number), or a votNote's quoted span [o, n]; null if none
 *           sub   [part, index] inside a prophecy group, or null
 *           ve    last verse id when the cite covers more than one verse
 *         trailing nulls are dropped.
 *
 * decode.js expands this back to one edge per (verse, entry) — the shape
 * every consumer has read since 2026-08 — each carrying its sites in `at`.
 */
export function encodeCites(entries) {
  return entries.map((e) => {
    const t = e.target;
    const row = t.studyId
      ? { c: 'studies', sid: t.studyId, id: t.chapterId, t: e.title, s: [] }
      : { c: t.volKey, id: t.letterId || t.entryId, t: e.title, s: [] };
    for (const s of e.sites) {
      const extra = s.fn != null ? String(s.fn) : s.r != null ? s.r : (s.o != null ? [s.o, s.n] : null);
      const tuple = [s.v, s.k, s.p, extra, s.sub || null, s.ve > s.v ? s.ve : null];
      while (tuple.length > 3 && tuple[tuple.length - 1] == null) tuple.pop();
      row.s.push(tuple);
    }
    return row;
  });
}

/**
 * The shipped form of the Bible Studies' prophecy pairs and letter-links
 * (`studyLinks` in the asset), one row per study chapter in study order:
 *
 *   [{ sid, id, pr?: [[p, a, b], ...], l?: [[p, volKey, letterId, sub?], ...] }, ...]
 *     pr  prophecy groups: block p pairs Old Testament verse a with its New
 *         Testament fulfilment b (the first passage each part cites)
 *     l   letter-links: block p (sub inside a prophecy group) links the letter
 *
 * decode.js expands it to graph.prophecy [{a, b, studyId, chapterId, p}] and
 * graph.votLinks [{kind:'studyLetter', studyId, chapterId, volKey, letterId, p, sub?}].
 * @param {Array<{a:number, b:number, studyId:string, chapterId:string, p:number}>} prophecy
 * @param {Array<{studyId:string, chapterId:string, volKey:string, letterId:string, p:number, sub?:[string, number]}>} votLinks
 * @param {(studyId:string, chapterId:string) => number} orderOf  the chapter's place in study order
 */
export function encodeStudyLinks(prophecy, votLinks, orderOf) {
  /** @type {Map<string, any>} */
  const rows = new Map();
  const rowOf = (x) => {
    const key = x.studyId + '/' + x.chapterId;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { sid: x.studyId, id: x.chapterId }));
    return row;
  };
  for (const x of prophecy) (rowOf(x).pr ||= []).push([x.p, x.a, x.b]);
  for (const x of votLinks) {
    const t = [x.p, x.volKey, x.letterId];
    if (x.sub) t.push(x.sub);
    (rowOf(x).l ||= []).push(t);
  }
  return [...rows.values()].sort((a, b) => orderOf(a.sid, a.id) - orderOf(b.sid, b.id));
}

/**
 * A Bible Study's name as a citation card's collection line: its title up to
 * the first subtitle break (": ", " - ", " ("), so "YAHUSHUA More Than a Man:
 * YahuShua Is The Fulfillment of ..." reads "YAHUSHUA More Than a Man".
 * @param {string} title
 */
export function shortStudyTitle(title) {
  const t = String(title || '').trim();
  let cut = t.length;
  for (const sep of [': ', ' - ', ' (']) {
    const i = t.indexOf(sep);
    if (i >= 4 && i < cut) cut = i;
  }
  return t.slice(0, cut).trim();
}
