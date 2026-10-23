/* ═══════════════════════════════════════════════════════════════════════
   answers-topic — the words, counts and shapes an Answers topic page draws
   ═══════════════════════════════════════════════════════════════════════
   Pure functions over one topic (an ANSWERS entry) and its sidecar
   (ANSWERS_META[id]); no DOM, no React. The topic page
   (ui/components/AnswersTopic.jsx) reads its hero, Contents rows, foot and
   every paragraph's decorations from here (AOGCG final design f07-f11).

   THE ONE HARD RULE (D3): a decorated paragraph's textContent equals the
   plain render's. answersInline builds every decoration from the
   paragraph's own characters (the same split WtlbEntryView's renderLine
   makes: **bold**, _italic_, {{ref:X}} drawn "(X)", line breaks as <br>),
   then wraps runs of them: links, underlines, small and big text, note
   markers. Nothing here adds a character; generated words ("From", " · ",
   a row's sub) are CSS content or attributes, and hidden characters stay in
   sr-only spans. Offsets in the sidecar are UTF-16 indices into the raw
   text (tools/fetch-answers.py).
   ═══════════════════════════════════════════════════════════════════════ */

import { pl, SEP, NBSP, answersMinutes, answersSizeWords, answersTopSections, answersRowSub, answersDomain, isDateHead } from './answers-browse.js';
import { ANSWERS_COMMANDMENTS, ANSWERS_MAIN_PAGE_ID, answersShortTitle, isAttribution, isTrumpetSection } from './answers-shelves.js';
import { ANSWERS_FD_INDEX_ID, answersSiteShelfOf } from './answers-site.js';
import { answersSource } from './answers-contents.js';
import { splitFormatBInline } from './format-b-inline.js';

const FD_LEAD = 'False Doctrine:';

export { isTrumpetSection };

/** A topic over this many words offers Fold in its Contents (f10b: the eight longest). */
export const ANSWERS_FOLD_WORDS = 8000;

/** @param {any} meta */
export function answersFoldable(meta) {
  return !!meta && (meta.words || 0) > ANSWERS_FOLD_WORDS;
}

/* ── Hero (f07) ─────────────────────────────────────────────────────── */

/**
 * The hero's eyebrow: the sidebar label the topic is filed under, word for word (C13), and the
 * shelf a tap opens (a commandment opens its sheet; FD and the Main Page are plain text).
 * @param {any[]} entries ANSWERS
 * @param {any} entry
 * @returns {{ text: string, shelf: any }}
 */
export function answersEyebrow(entries, entry) {
  const id = entry && entry.id;
  if (id === ANSWERS_MAIN_PAGE_ID) return { text: 'Official website' + SEP + 'Main Page', shelf: null };
  const s = answersSiteShelfOf(entries, id);
  if (!s) return { text: 'Other Topics', shelf: null };
  if (s.kind === 'index') return { text: s.label, shelf: null };
  if (s.kind === 'commandment') return { text: 'The ' + ANSWERS_COMMANDMENTS[/** @type {number} */ (s.num) - 1].ordinal + ' Commandment', shelf: s };
  const l = String(s.label);
  return { text: l.endsWith(':') ? l.slice(0, -1) : l, shelf: s };
}

/** The page title at 30px: a title of 40 characters or more, and the Main Page. */
export function answersLongTitle(entry) {
  return !!entry && (String(entry.title || '').length >= 40 || entry.id === ANSWERS_MAIN_PAGE_ID);
}

const MEDIA_WORD = { playlist: 'playlist', video: 'video', channel: 'channel', audio: 'audio', pdf: 'pdf', image: 'chart', download: 'downloads' };

/** Media words with counts, in the order given (the hero: first appearance; a Contents row: its range). */
function mediaWords(list) {
  /** @type {Map<string, number>} */
  const words = new Map();
  for (const m of list) {
    const w = /** @type {Record<string, string>} */ (MEDIA_WORD)[m.kind];
    if (w) words.set(w, (words.get(w) || 0) + 1);
  }
  const out = [];
  for (const [w, n] of words) {
    if (w === 'channel') out.push('YouTube channel');
    else if (w === 'audio' || w === 'downloads') out.push(w);
    else if (w === 'pdf') out.push(n > 1 ? n + NBSP + 'PDFs' : 'PDF');
    else out.push(pl(n, w));
  }
  return out;
}

/** The media a page shows (the Main Page's banner is its hero picture, not a chart). */
function pageMedia(meta) {
  return ((meta && meta.media) || []).filter((m) => !(m.kind === 'image' && m.at === -1));
}

/**
 * The hero's meta line: "26 passages · ~31 min · 15 sections · 2 playlists · 1 video · audio · PDF · 2 charts";
 * "See: 6 links" for a page of links (never "0 passages"). '' before the sidecar lands.
 * @param {any} entry
 * @param {any} meta
 */
export function answersHeroMeta(entry, meta) {
  if (!meta) return '';
  const fd = entry.id === ANSWERS_FD_INDEX_ID;
  const top = answersTopSections(meta).length;
  const size = fd ? pl(top, 'category') : answersSizeWords(entry, meta, { minutes: false });
  const parts = [size];
  if (!size.startsWith('See:') && !size.startsWith('~')) parts.push('~' + answersMinutes(meta) + NBSP + 'min');
  if (!fd && top >= 2) parts.push(pl(top, 'section'));
  const pos = (m) => (m.at === 'end' ? 1e9 : m.at);
  return parts.concat(mediaWords(pageMedia(meta).slice().sort((a, b) => pos(a) - pos(b)))).filter(Boolean).join(SEP);
}

/**
 * The hero's contents line (3 sections or more): the first names within 60 characters, skipping one
 * equal to the title and the generic ones, then "All 15 sections".
 * @param {any} entry
 * @param {any} meta
 * @returns {{ names: string, more: string } | null}
 */
export function answersContentsLine(entry, meta) {
  const s = answersTopSections(meta);
  if (s.length < 3) return null;
  const generic = (t) => /^(Section (One|Two|Three|Four|Five|Six)|Introduction)$/i.test(t);
  /** @type {string[]} */
  const names = [];
  for (const x of s) {
    if (x.title === entry.title || generic(x.title)) continue;
    if (names.concat([x.title]).join(' · ').length > 60) break;
    names.push(x.title);
  }
  const fd = entry.id === ANSWERS_FD_INDEX_ID;
  return { names: names.length ? names.join(SEP) + SEP : '', more: 'All ' + pl(s.length, fd ? 'category' : 'section') };
}

/* ── Sections and Contents (f08 running head, f10) ─────────────────── */

/**
 * Section numbers from the site's heading levels: 1, 1.1, 1.2, 2…; the Trumpet Call has none.
 * @param {any} meta
 * @returns {Map<number, string>} paragraph index → number
 */
export function answersSectionNums(meta) {
  const out = new Map();
  let a = 0, b = 0;
  for (const s of (meta && meta.sections) || []) {
    if (isTrumpetSection(s)) { out.set(s.at, ''); continue; }
    if (s.level === 1) { a++; b = 0; out.set(s.at, String(a)); } else { b++; out.set(s.at, a + '.' + b); }
  }
  return out;
}

/**
 * @typedef {object} AnswersTocRow
 * @property {string} title
 * @property {number} level
 * @property {number} at      the heading's paragraph (synthetic: the first paragraph it heads)
 * @property {string} anchor
 * @property {boolean} [synthetic]
 * @property {number} end     the paragraph after its last
 * @property {string} num     '' for the Trumpet Call
 * @property {string} sub     "7 passages", "1 chart", "See: 2 links", "3 false doctrines"
 * @property {{ at: number, title: string, collection: string }[]} ex  its passages' source lines
 * @property {boolean} trumpet
 */

/**
 * Every site section of a page, with its number, its sub and its passages.
 * @param {any} entry
 * @param {any} meta
 * @returns {AnswersTocRow[]}
 */
export function answersTocRows(entry, meta) {
  const all = (meta && meta.sections) || [];
  const paras = (entry && entry.paragraphs) || [];
  const nums = answersSectionNums(meta);
  const fd = entry && entry.id === ANSWERS_FD_INDEX_ID;
  return all.map((s, k) => {
    const end = k + 1 < all.length ? all[k + 1].at : paras.length;
    /** @type {{ at: number, title: string, collection: string }[]} */
    const ex = [];
    let fds = 0;
    for (let i = s.at; i < end; i++) {
      const t = paras[i] && paras[i].text;
      const src = answersSource(t);
      if (src) ex.push({ at: i, title: src.title, collection: src.collection });
      if (typeof t === 'string' && t.startsWith(FD_LEAD)) fds++;
    }
    let sub = '';
    if (fd) sub = fds ? pl(fds, 'false doctrine') : '';
    else if (ex.length) sub = pl(ex.length, 'passage');
    else {
      const med = pageMedia(meta).filter((m) => m.at !== 'end' && m.at >= s.at && m.at < end);
      if (med.length) sub = mediaWords(med).join(SEP);
      else {
        let links = 0;
        for (const [p, arr] of Object.entries((meta && meta.links) || {})) {
          if (+p >= s.at && +p < end) links += /** @type {any[]} */ (arr).filter((l) => l.kind !== 'contents').length;
        }
        if (links) sub = 'See:' + NBSP + pl(links, 'link');
      }
    }
    return { ...s, end, num: nums.get(s.at) || '', sub, ex, trumpet: isTrumpetSection(s) };
  });
}

/** The section a paragraph sits in (the last row starting at or before it), or null. */
export function answersTocRowAt(rows, index) {
  let cur = null;
  for (const r of rows) if (!r.trumpet && r.at <= index) cur = r;
  return cur;
}

/** The running head's name for a page: its short title; the two still-long ones get the app's names. */
export function answersRunTitle(entry) {
  if (!entry) return '';
  if (entry.id === ANSWERS_MAIN_PAGE_ID) return 'Main Page';
  if (entry.id === ANSWERS_FD_INDEX_ID) return 'False Doctrines';
  return answersShortTitle(entry.title);
}

/* ── Foot (f09) ─────────────────────────────────────────────────────── */

/**
 * The foot's parts in the page's own order: the Main Page puts Related before Videos, as the site does.
 * @param {any} entry
 * @param {any} meta
 */
export function answersFootOrder(entry, meta) {
  const tc = ((meta && meta.sections) || []).some(isTrumpetSection);
  const order = entry && entry.id === ANSWERS_MAIN_PAGE_ID ? ['related', 'videos', 'nav'] : ['videos', 'related', 'nav'];
  return tc ? order.concat(['tc']) : order;
}

/**
 * Related rows in the site's order: `related`, then `relatedMore` (section links), merged by `pos`.
 * @param {any} entry
 * @param {any} meta
 * @returns {{ id: string | null, title?: string, anchor?: string, letter?: any, more?: boolean }[]}
 */
export function answersRelated(entry, meta) {
  const a = ((entry && entry.related) || []).map((r, k) => ({ id: r && r.id != null ? r.id : r, pos: r && r.pos != null ? r.pos : k }));
  const b = ((meta && meta.relatedMore) || []).map((r) => ({ ...r, more: true }));
  return a.concat(b).sort((x, y) => x.pos - y.pos);
}

/** The videos and playlists the site lists after a page's text. */
export function answersFootMedia(meta) {
  return ((meta && meta.media) || []).filter((m) => m.at === 'end');
}

/** "Playlist · YouTube": what a media card opens. */
export function answersMediaKindSub(m) {
  const where = String((m && m.url) || '').includes('youtube.com') || String((m && m.url) || '').includes('youtu.be') ? 'YouTube' : answersDomain(m && m.url);
  const kind = m.kind === 'channel' ? 'Channel' : m.kind === 'playlist' ? 'Playlist' : m.kind === 'audio' ? 'Audio' : m.kind === 'pdf' ? 'PDF' : 'Video';
  return kind + SEP + where;
}

/** A media label as the card shows it: the site's "▶️" becomes the card's play disc. */
export function answersMediaLabel(m) {
  const t = String((m && m.title) || '');
  return t.startsWith('▶️') ? t.slice(2).trim() : t;
}

/* ── Links (f08) ────────────────────────────────────────────────────── */

/**
 * A link row's sub: where its link goes ("In The Holidays of Men", a topic's size, the collection,
 * "Study", "Search the library", the site's domain). Generated words: drawn from data-sub, never text.
 * @param {any} L a links / bareLinks sidecar item
 * @param {Map<string, any>} byId
 * @param {Record<string, any> | null} metaAll ANSWERS_META
 */
export function answersLinkSub(L, byId, metaAll) {
  if (!L) return '';
  if (L.kind === 'topic' && L.anchor) {
    const e = byId.get(L.id);
    return L.id === ANSWERS_FD_INDEX_ID ? 'In the False Doctrines index' : e ? 'In ' + answersShortTitle(e.title) : '';
  }
  if (L.kind === 'topic') { const e = byId.get(L.id); return e ? answersRowSub(e, metaAll && metaAll[L.id]) : ''; }
  if (L.kind === 'letter') return L.collection || 'Letter';
  if (L.kind === 'study') return 'Study';
  if (L.kind === 'search') return 'Search the library';
  if (L.kind === 'external') return answersDomain(L.url);
  return '';
}

/* ── One paragraph's characters, decorated (D3) ─────────────────────── */

/**
 * @typedef {{ c: string, r: number, b?: number, i?: number, cite?: number, ref?: string,
 *   u?: number, small?: number, big?: number, link?: number, L?: any, sup?: number, N?: any }} Ch
 */

/**
 * The paragraph's characters as the plain render draws them, each with its raw offset and styles.
 * Mirrors WtlbEntryView.renderLine exactly (the same split, the same tests), so the text is the same.
 * @param {string} raw
 * @returns {{ chars: Ch[], cites: number }}
 */
export function answersChars(raw) {
  /** @type {Ch[]} */
  const chars = [];
  let cites = 0;
  const rec = (s, off, st) => {
    let pos = 0;
    for (const seg of splitFormatBInline(s)) {
      const o = off + pos;
      pos += seg.length;
      if (!seg) continue;
      if (seg.startsWith('**') && seg.endsWith('**')) rec(seg.slice(2, -2), o + 2, { ...st, b: 1 });
      else if (seg.startsWith('_') && seg.endsWith('_')) rec(seg.slice(1, -1), o + 1, { ...st, i: 1 });
      else if (seg.startsWith('{{ref:') && seg.endsWith('}}') && seg.length > 8) {
        const ref = seg.slice(6, -2).trim();
        const n = ++cites;
        for (const c of '(' + ref + ')') chars.push({ c, r: o, ...st, cite: n, ref });
      } else for (let k = 0; k < seg.length; k++) chars.push({ c: seg[k], r: o + k, ...st });
    }
  };
  rec(String(raw || ''), 0, {});
  return { chars, cites };
}

/** The plain render's textContent of a paragraph (line breaks draw nothing). */
export function answersPlainOf(raw) {
  return answersChars(raw).chars.filter((c) => c.c !== '\n').map((c) => c.c).join('');
}

/**
 * @typedef {string | { t: string, d?: any, k?: AnsNode[] }} AnsNode
 * t: 'a' (a sidecar link; d.L, d.n), 'cite' (d.ref, d.n: 1-based in the paragraph), 'sup' (a note
 * marker; d.N), 'u', 'small', 'big', 'b', 'i', 'br', 'sr' (sr-only), 'bare' (the link glyph; d.B, d.n),
 * 'ext' (the ↗ icon closing an external link).
 */

/**
 * A paragraph's characters as a tree of decorated runs. `pm` is the paragraph's slice of the sidecar
 * ({ marks, links, notes, bare }); null draws the plain render (styles, cites, breaks).
 * @param {string} raw
 * @param {{ marks?: any, links?: any[], notes?: any[], bare?: any[] } | null} pm
 * @param {{ from?: number, to?: number, noExt?: boolean, wrapLink?: any, noLinks?: boolean, noSmall?: boolean, noBold?: boolean }} [opts]
 * @returns {AnsNode[]}
 */
export function answersInline(raw, pm, opts) {
  const o = opts || {};
  const from = o.from || 0, to = o.to == null ? Infinity : o.to;
  const chars = answersChars(raw).chars.filter((ch) => ch.r >= from && ch.r < to);
  const p = pm || {};
  const mk = p.marks || {};
  const one = new Set(mk.br1 || []);
  const inRun = (ch, s, l) => ch.r >= s && ch.r < s + l;
  for (const [s, l] of mk.u || []) for (const ch of chars) if (inRun(ch, s, l) && !ch.cite) ch.u = 1;
  for (const [s, l] of mk.small || []) if (!o.noSmall) for (const ch of chars) if (inRun(ch, s, l)) ch.small = 1;
  for (const [s, l] of mk.big || []) for (const ch of chars) if (inRun(ch, s, l)) ch.big = 1;
  let ln = 0;
  if (!o.noLinks) {
    (p.links || []).forEach((L, li) => {
      if (L.kind === 'contents') return;
      const n = ++ln;
      for (const ch of chars) if (inRun(ch, L.at, String(L.text).length) && !ch.cite) { ch.link = n; ch.L = { ...L, li }; }
    });
  }
  if (o.wrapLink && !chars.some((c) => c.link)) { const n = ++ln; for (const ch of chars) { ch.link = n; ch.L = o.wrapLink; } }
  for (const N of p.notes || []) for (const ch of chars) if (inRun(ch, N.at, String(N.marker).length)) { ch.sup = 1; ch.N = N; }
  /** @type {Map<number, { B: any, n: number }>} */
  const bare = new Map();
  (p.bare || []).forEach((B, n) => bare.set(B.at - 1, { B, n }));

  /** @type {AnsNode[]} */
  const root = [];
  /** @type {{ key: string, node: any }[]} */
  const stack = [];
  const top = () => (stack.length ? stack[stack.length - 1].node.k : root);
  const want = (ch) => {
    const w = [];
    if (ch.cite) w.push(['cite', 'c' + ch.cite, { ref: ch.ref, n: ch.cite }]);
    else if (ch.link) w.push(['a', 'l' + ch.link, { L: ch.L }]);
    if (ch.sup) w.push(['sup', 's' + ch.N.at, { N: ch.N }]);
    if (ch.u) w.push(['u', 'u']);
    if (ch.small) w.push(['small', 'm']);
    if (ch.big) w.push(['big', 'g']);
    if (ch.b && !o.noBold) w.push(['b', 'b']);
    if (ch.i) w.push(['i', 'i']);
    return w;
  };
  const closeTo = (n) => {
    while (stack.length > n) {
      const { node } = /** @type {any} */ (stack.pop());
      if (node.t === 'a' && node.d.L && node.d.L.kind === 'external' && !o.noExt) node.k.push({ t: 'ext' });
    }
  };
  const put = (/** @type {AnsNode} */ x) => {
    const k = top();
    if (typeof x === 'string' && typeof k[k.length - 1] === 'string') k[k.length - 1] += x;
    else k.push(x);
  };
  for (let q = 0; q < chars.length; q++) {
    const ch = chars[q];
    const w = want(ch);
    let same = 0;
    while (same < stack.length && same < w.length && stack[same].key === w[same][1]) same++;
    closeTo(same);
    for (let z = same; z < w.length; z++) {
      const node = { t: w[z][0], d: w[z][2] || null, k: [] };
      put(node);
      stack.push({ key: w[z][1], node });
    }
    // a couplet's second "\n" (one <br /> on the site, marks.br1) draws nothing; it never was text
    if (ch.c === '\n') { if (!one.has(ch.r)) put({ t: 'br' }); }
    else if (ch.sup && (ch.c === '[' || ch.c === ']')) put({ t: 'sr', k: [ch.c] });
    else put(ch.c);
    const b = bare.get(ch.r);
    if (b && !(chars[q + 1] && chars[q + 1].r === ch.r)) { closeTo(0); put({ t: 'bare', d: b }); }
  }
  closeTo(0);
  return root;
}

/** The text a node tree draws (sr-only included, as textContent counts it). */
export function answersNodesText(nodes) {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') s += n;
    else if (n.k) s += answersNodesText(n.k);
  }
  return s;
}

/**
 * The sidecar slice for paragraph i.
 * @param {any} meta
 * @param {number} i
 */
export function answersParaMeta(meta, i) {
  if (!meta) return null;
  const k = String(i);
  return {
    marks: (meta.marks || {})[k] || null,
    links: (meta.links || {})[k] || [],
    notes: (meta.notes || {})[k] || [],
    bare: (meta.bareLinks || {})[k] || [],
  };
}

/* ── What each paragraph is (f07-f11) ───────────────────────────────── */

/** Lead characters a link row reads aloud but does not show ("- ", "• "). */
function bulletPrefix(plain) {
  return plain.startsWith('• ') || plain.startsWith('- ') ? plain.slice(0, 2) : '';
}

/** The raw offset where the visible text after a bullet prefix starts. */
function rawAfter(raw, chars, count) {
  return chars.length > count ? chars[count].r : String(raw).length;
}

/**
 * What paragraph i is, and what it needs to draw. Without the sidecar only what the text alone
 * says (source lines, ornaments, dated headers, also-see rows) is decorated.
 * @param {any} entry
 * @param {any} meta
 * @param {number} i
 * @returns {{ kind: string, [k: string]: any }}
 */
export function answersParaPlan(entry, meta, i) {
  const p = entry.paragraphs[i] || {};
  const t = String(p.text || '');
  const trimmed = t.trim();
  const attr = meta && meta.attr ? meta.attr[String(i)] : null;
  if (isAttribution(t)) {
    const src = answersSource(t);
    const at = t.indexOf('~ [From ');
    const inner = t.trim().slice('~ [From '.length, -1);
    const cut = inner.lastIndexOf(' ~ ');
    if (src && at === 0 && cut > 0 && t.trim() === t) {
      return { kind: 'src', title: inner.slice(0, cut), collection: inner.slice(cut + 3), bare: src.title, wording: (attr && attr.wording) || 'From' };
    }
  }
  if (attr && attr.title) return { kind: 'src-ns', attr };
  if (trimmed === '✦') return { kind: 'orn' };
  if (trimmed === '~' || trimmed === '†') return { kind: 'orn', minor: true };
  const sec = meta ? (meta.sections || []).find((s) => s.at === i && !s.synthetic) : null;
  if (sec) return { kind: 'sh', section: sec };
  if (isDateHead(t)) return { kind: 'metarow' };
  // "• **_Also see:_** …": the lead is raw 5..14, the link's words follow the closing "_**" (17)
  if (t.toLowerCase().startsWith('• **_also see:_**')) return { kind: 'alsosee', lead: t.slice(5, 14), restAt: 17 };
  if (entry.id === ANSWERS_FD_INDEX_ID && t.startsWith(FD_LEAD)) return { kind: 'fd' };
  const media = meta ? (meta.media || []).find((m) => m.replaces === i) : null;
  if (media) return { kind: 'media', media };
  const pm = answersParaMeta(meta, i);
  const links = pm ? pm.links : [];
  const { chars } = answersChars(t);
  const plain = chars.filter((c) => c.c !== '\n').map((c) => c.c).join('');
  const pre = bulletPrefix(plain);
  const contents = links.find((l) => l.kind === 'contents');
  if (contents && pre) return { kind: 'linkrow', icon: 'list', sub: 'Opens Contents', sr: pre, from: rawAfter(t, chars, 2), L: contents };
  const real = links.filter((l) => l.kind !== 'contents');
  if (t.startsWith('• ') && real.length === 1) {
    const L = real[0];
    const L0 = rawAfter(t, chars, 2);
    // (a link's raw text may stop inside an emphasis run: compare the words, markers out)
    const linkPlain = String(L.text).split('**').join('').split('_').join('');
    const shown = plain.slice(2).trim();
    // the site's "*" footnote mark may follow the link ("Be Apart of the Trumpet Call*")
    if (L.at <= L0 && (shown === linkPlain.trim() || shown === linkPlain.trim() + '*')) {
      if (entry.id === ANSWERS_MAIN_PAGE_ID && L.kind === 'external') {
        const dl = (meta.media || []).some((m) => m.at === i && m.kind === 'download');
        return { kind: 'linkrow', icon: dl ? 'download' : 'doc', sub: dl ? 'Dropbox' : 'PDF', sr: pre, from: L0, L, ext: true };
      }
      return { kind: 'bulletlink', L, sr: pre, from: L0 };
    }
  }
  return { kind: 'p' };
}

/**
 * A False Doctrine entry's lines, each with its raw range: the "False Doctrine:" line, then its
 * "The Truth:" / "Also See:" lines (each a link to the topic that answers it).
 * @param {string} raw
 * @returns {{ kind: 'fd' | 'truth' | 'line', from: number, to: number, lead?: string, leadEnd?: number }[]}
 */
export function answersFdLines(raw) {
  const out = [];
  let off = 0;
  for (const ln of String(raw).split('\n')) {
    const from = off, to = off + ln.length;
    off = to + 1;
    const lead = ln.startsWith('**The Truth: ') ? 'The Truth:' : ln.startsWith('**Also See: ') ? 'Also See:' : '';
    if (lead && ln.endsWith('**')) out.push({ kind: /** @type {const} */ ('truth'), from, to, lead, leadEnd: from + 2 + lead.length });
    else if (ln.startsWith(FD_LEAD)) out.push({ kind: /** @type {const} */ ('fd'), from, to, leadEnd: from + FD_LEAD.length });
    else out.push({ kind: /** @type {const} */ ('line'), from, to });
  }
  return out;
}

/**
 * Where a note's own words start and end in its note paragraph: the line for this marker, after the
 * marker the site prints before it ("[1]↑ ", "1. ", "A. ", "• ↑ ").
 * @param {string} raw the note paragraph
 * @param {string} marker "[1]", "1", "A"
 */
export function answersNoteRange(raw, marker) {
  const s = String(raw || '');
  const bare = String(marker).startsWith('[') ? String(marker).slice(1, -1) : String(marker);
  const lines = [];
  let off = 0;
  for (const ln of s.split('\n')) { lines.push({ from: off, to: off + ln.length, ln }); off += ln.length + 1; }
  const lead = (ln) => { let k = 0; while (k < ln.length && '_*• ↑'.includes(ln[k])) k++; return k; };
  const pick = lines.find((x) => { const r = x.ln.slice(lead(x.ln)); return r.startsWith(bare + '.') || r.startsWith('[' + bare + ']'); }) || lines[0];
  let k = lead(pick.ln);
  const rest = pick.ln.slice(k);
  if (rest.startsWith('[' + bare + ']')) k += bare.length + 2;
  else if (rest.startsWith(bare + '.')) k += bare.length + 1;
  while (k < pick.ln.length && '_*↑ '.includes(pick.ln[k])) k++;
  // (an emphasis marker stepped over still styles what follows: answersInline filters by offset)
  return { from: pick.from + k, to: pick.to };
}

/** "Note 1", "Note A": a note marker without its brackets. */
export function answersNoteLabel(marker) {
  const m = String(marker || '');
  return 'Note ' + (m.startsWith('[') && m.endsWith(']') ? m.slice(1, -1) : m);
}
