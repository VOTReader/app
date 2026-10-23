/* ═══════════════════════════════════════════════════════════════════════
   answers-browse — the words and lists the Answers browse screens show
   ═══════════════════════════════════════════════════════════════════════
   Pure functions over ANSWERS (src/data/answers.js) and its sidecars
   (ANSWERS_META, src/data/answers-meta.js); no DOM, no React. The landing
   (AnswersHome.jsx), the shelves (AnswersShelf.jsx), Charts & videos
   (AnswersMedia.jsx) and the sheets (AnswersSheets.jsx) read every count,
   sub line and place name from here, so one rule says each thing once
   (AOGCG final design §2.6, "Copy rules").

   Copy rules:
   - a number and its unit never part: U+00A0 between them ("12 passages");
   - a line never starts with a middot: every separator is U+00A0 + "· " (A29);
   - a row's sub: its size ("12 passages · ~12 min", "46 categories",
     "3 letters · ~4 min", "See: 6 links" or "~3 min"), then its media words
     in one fixed order (video · audio · PDF · chart · downloads);
   - a place: the commandment ("The Fourth Commandment"), the numbered group
     with our short name ("5 · Scripture & doctrine"), "Other Topics" or
     "False Doctrines index".
   The site's words are never changed; the short names, the questions and
   the labels named in the About sheet are ours.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  ANSWERS_COMMANDMENTS, ANSWERS_MAIN_PAGE_ID, answersPassageCount, answersTopicEntries,
  answersSortKey, answersIndexLetter, isAttribution, isDateHead, isTrumpetSection,
} from './answers-shelves.js';
import { ANSWERS_FD_INDEX_ID, answersSiteShelves, answersSiteShelfOf, answersSiteOrder, answersSiteNav } from './answers-site.js';

export const NBSP = '\u00a0';
/** The separator between the parts of a sub line, bound to the word before it (A29). */
export const SEP = '\u00a0· ';

const PLURAL = { category: 'categories', match: 'matches', passage: 'passages', 'more topic': 'more topics' };

/** The site's tagline, word for word (ANSWERS_SITE_META.tagline), for the landing's first paint before answers.js lands. */
export const ANSWERS_TAGLINE = 'The Lord Sets the Record Straight Concerning a Variety of Topics, Doctrines and Traditions';

/** "1 topic", "16 topics", "46 categories": the number bound to its word. */
export function pl(n, word) {
  const w = n === 1 ? word : (/** @type {Record<string, string>} */ (PLURAL)[word] || word + 's');
  return n + NBSP + w;
}

/** The lead words a topic title opens with, muted on every row; the title stays whole. */
export const ANSWERS_LEADS = Object.freeze([
  'Thus Says The Lord Regarding ', 'God Speaks About ', 'God Speaks Regarding ', 'God Rebukes ', 'Regarding ',
]);

/**
 * A title as its lead words and the rest: "Regarding Faith" → { lead: 'Regarding', rest: 'Faith' }.
 * @param {string} title
 * @returns {{ lead: string, rest: string }}
 */
export function answersLeadSplit(title) {
  const t = String(title || '');
  for (const l of ANSWERS_LEADS) if (t.startsWith(l) && t.length > l.length) return { lead: l.trim(), rest: t.slice(l.length) };
  return { lead: '', rest: t };
}

/* ── Sizes ─────────────────────────────────────────────────────────── */

export { isDateHead };

/** The date a dated header carries ("7/5/10"), or ''. */
export function dateOfHead(text) {
  return isDateHead(text) ? text.slice(1, text.indexOf('_', 1)) : '';
}

let _pace = { at: -1e9, wpm: /** @type {number | null} */ (null) };
/** The reader's measured pace (ReadingStatsStore, the reading chip's), read once a few seconds: a list asks per row. */
function measuredPace() {
  const now = Date.now();
  if (now - _pace.at > 2000) {
    const S = typeof ReadingStatsStore !== 'undefined' ? /** @type {any} */ (ReadingStatsStore) : null;
    let wpm = null;
    try { wpm = S && typeof S.measuredWpm === 'function' ? S.measuredWpm() : null; } catch (_e) { wpm = null; }
    _pace = { at: now, wpm: wpm > 0 ? wpm : null };
  }
  return _pace.wpm;
}

/** Reading minutes: the sidecar's word count at the reader's measured pace, else 200 a minute; never under 1. */
export function answersMinutes(meta, wpm) {
  const pace = wpm || measuredPace() || 200;
  return Math.max(1, Math.round(((meta && meta.words) || 0) / pace));
}

/** The kinds of media a topic holds, in the fixed order rows name them. */
export function answersMediaKinds(meta) {
  const k = new Set();
  for (const m of (meta && meta.media) || []) {
    if (m.kind === 'video' || m.kind === 'playlist' || m.kind === 'channel') k.add('video');
    else if (m.kind === 'audio') k.add('audio');
    else if (m.kind === 'pdf') k.add('PDF');
    else if (m.kind === 'image' && m.at !== -1) k.add('chart');
    else if (m.kind === 'download') k.add('downloads');
  }
  return ['video', 'audio', 'PDF', 'chart', 'downloads'].filter((x) => k.has(x));
}

/** Every link the sidecar records for a topic. */
export function answersLinkCount(meta) {
  let n = 0;
  for (const a of Object.values((meta && meta.links) || {})) n += Array.isArray(a) ? a.length : 0;
  return n;
}

/** The dated letters a page of letters holds (a page with no source lines). */
export function answersLetterCount(entry) {
  let n = 0;
  for (const p of (entry && entry.paragraphs) || []) if (isDateHead(p && p.text)) n++;
  return n;
}

/** The page's level-1 sections (the False Doctrines index: its categories). */
export function answersTopSections(meta) {
  return ((meta && meta.sections) || []).filter((s) => s.level === 1 && !isTrumpetSection(s));
}

/**
 * A topic's size: "12 passages · ~12 min", "46 categories", "3 letters · ~4 min", "See: 6 links", "~3 min".
 * @param {any} entry
 * @param {any} meta its sidecar (null before answers-meta.js lands)
 * @param {{ minutes?: boolean }} [opts]
 */
export function answersSizeWords(entry, meta, opts) {
  const minutes = !(opts && opts.minutes === false) && !!meta;
  const min = '~' + answersMinutes(meta) + NBSP + 'min';
  const n = answersPassageCount(entry);
  if (n) return pl(n, 'passage') + (minutes ? SEP + min : '');
  if (entry && entry.id === ANSWERS_FD_INDEX_ID) return meta ? pl(answersTopSections(meta).length, 'category') : '';
  const d = answersLetterCount(entry);
  if (d) return pl(d, 'letter') + (minutes ? SEP + min : '');
  const L = answersLinkCount(meta);
  if (L) return 'See:' + NBSP + pl(L, 'link');
  return meta ? min : '';
}

/**
 * A topic row's sub without its read mark: size, then media words.
 * @param {any} entry
 * @param {any} meta
 */
export function answersRowSub(entry, meta) {
  const k = answersMediaKinds(meta);
  return [answersSizeWords(entry, meta)].concat(k).filter(Boolean).join(SEP);
}

/* ── Places ────────────────────────────────────────────────────────── */

/** A shelf's label without the colon the sidebar ends some with. */
export function shelfLabel(shelf) {
  const l = String((shelf && shelf.label) || '');
  return l.endsWith(':') ? l.slice(0, -1) : l;
}

/** The short names the browse screens give the index and the unnumbered shelf, and the numbered groups' shared head. */
export const ANSWERS_FD_INDEX_SHORT = 'False Doctrines index';
export const ANSWERS_OTHER_LABEL = 'Other Topics';
export const ANSWERS_TSTL_HEAD = 'Thus Says The Lord...';

/**
 * Where a topic sits on the site, in the words a row's sub uses.
 * @param {any[]} entries ANSWERS
 * @param {string} id
 */
export function answersPlaceOf(entries, id) {
  if (id === ANSWERS_FD_INDEX_ID) return ANSWERS_FD_INDEX_SHORT;
  if (id === ANSWERS_MAIN_PAGE_ID) return 'Main Page';
  const s = answersSiteShelfOf(entries, id);
  if (!s) return ANSWERS_OTHER_LABEL;
  if (s.kind === 'commandment') return `The ${ANSWERS_COMMANDMENTS[/** @type {number} */ (s.num) - 1].ordinal} Commandment`;
  if (s.kind === 'tstl') return s.num + SEP + s.short;
  return shelfLabel(s);
}

/**
 * The shelves the landing lists, from the site's sidebar: the ten commandments, Other Topics
 * (its page outside the menu last), the twelve numbered groups, the False Doctrines index.
 * @param {any[]} entries ANSWERS
 */
export function answersBrowseShelves(entries) {
  const all = answersSiteShelves(entries);
  const other = all.find((s) => s.kind === 'other') || null;
  return {
    commandments: all.filter((s) => s.kind === 'commandment'),
    other,
    otherTopics: other ? other.topics.concat(other.notInMenu) : [],
    groups: all.filter((s) => s.kind === 'tstl'),
    index: all.find((s) => s.kind === 'index') || null,
  };
}

/**
 * One shelf's topics in the site's order, by route key: '1'..'12' a numbered group, 'other' Other Topics.
 * @param {any[]} entries ANSWERS
 * @param {string} key
 * @returns {{ shelf: any, topics: any[] } | null}
 */
export function answersShelfByKey(entries, key) {
  const b = answersBrowseShelves(entries);
  if (key === 'other') return b.other ? { shelf: b.other, topics: b.otherTopics } : null;
  const g = b.groups.find((s) => String(s.num) === String(key));
  return g ? { shelf: g, topics: g.topics } : null;
}

/* ── The questions (ours) ──────────────────────────────────────────── */

/** "What does The Lord say about…" and the topic each question opens; the first six are the chips. */
export const ANSWERS_QUESTIONS = Object.freeze([
  ['…the Sabbath?', 'god-speaks-about-the-sabbath'],
  ['…the Trinity?', 'regarding-the-trinity'],
  ['…hell?', 'regarding-hell-and-eternal-torment'],
  ['…the rapture?', 'regarding-the-gathering-up-rapture'],
  ['…holidays?', 'regarding-the-holidays-of-men'],
  ['…marriage?', 'regarding-marriage'],
  ['…the Holy Days?', 'regarding-the-holy-days-of-god'],
  ['…prayer?', 'regarding-prayer'],
  ['…forgiveness?', 'regarding-forgiveness'],
  ['…the Day of The Lord?', 'regarding-the-day-of-the-lord'],
  ['…tithing?', 'regarding-tithing'],
  ['…salvation?', 'regarding-salvation'],
].map((q) => Object.freeze(q)));

/* ── A–Z ───────────────────────────────────────────────────────────── */

/** The A–Z strip's keys: "#" for numbers, then the alphabet. */
export const ANSWERS_AZ_KEYS = Object.freeze(['#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')));

/**
 * Every topic (no Main Page) by its sort key, grouped by its first main word's letter.
 * @param {any[]} entries ANSWERS
 * @returns {{ letter: string, entries: any[] }[]}
 */
export function answersAZGroups(entries) {
  const sorted = answersTopicEntries(entries).slice().sort((a, b) => answersSortKey(a.title).localeCompare(answersSortKey(b.title)));
  /** @type {Map<string, any[]>} */
  const by = new Map();
  for (const e of sorted) {
    const k = answersIndexLetter(e.title);
    if (!by.has(k)) by.set(k, []);
    /** @type {any[]} */ (by.get(k)).push(e);
  }
  return ANSWERS_AZ_KEYS.filter((k) => by.has(k)).map((k) => ({ letter: k, entries: /** @type {any[]} */ (by.get(k)) }));
}

/* ── Source lines ──────────────────────────────────────────────────── */

/**
 * A source line's title (its quotes kept) and collection: "~ [From “Pentecost” ~ Volume 6]"
 * → { title: '“Pentecost”', collection: 'Volume 6' }. A title may hold " ~ " of its own, so the
 * collection is what follows the last one. null for any other paragraph.
 * @param {unknown} text
 */
export function answersSourceParts(text) {
  if (!isAttribution(text)) return null;
  const t = String(text).trim();
  if (!t.endsWith(']')) return null;
  const inner = t.slice('~ [From '.length, -1);
  const at = inner.lastIndexOf(' ~ ');
  if (at < 1) return null;
  return { title: inner.slice(0, at), collection: inner.slice(at + 3) };
}

/* ── Inline marks (a quote's own characters, never changed) ────────── */

/**
 * A Format B paragraph as pieces to render: **bold**, _italic_, line breaks, and a
 * {{ref:X}} cite as "(X)", the way the reading page draws it. Other markers draw nothing.
 * @param {string} text
 * @returns {{ t: string, b?: boolean, i?: boolean, br?: boolean }[]}
 */
export function answersInlinePieces(text) {
  const s = String(text || '');
  /** @type {{ t: string, b?: boolean, i?: boolean, br?: boolean }[]} */
  const out = [];
  let b = false, it = false, buf = '';
  const flush = () => { if (buf) out.push({ t: buf, b, i: it }); buf = ''; };
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '*' && s[k + 1] === '*') { flush(); b = !b; k++; continue; }
    if (c === '_') { flush(); it = !it; continue; }
    if (c === '\n') { flush(); out.push({ t: '', br: true }); continue; }
    if (c === '{' && s[k + 1] === '{') {
      const end = s.indexOf('}}', k + 2);
      if (end > 0) {
        const body = s.slice(k + 2, end);
        if (body.startsWith('ref:')) buf += '(' + body.slice(4).trim() + ')';
        k = end + 1;
        continue;
      }
    }
    buf += c;
  }
  flush();
  return out;
}

/** The words a paragraph shows (marks and markers out), for the daily pool's length rule. */
export function answersWordCount(text) {
  let n = 0;
  for (const p of answersInlinePieces(text)) if (!p.br) n += p.t.split(' ').filter((w) => w.trim()).length;
  return n;
}

/* ── Answer of the day ─────────────────────────────────────────────── */

/**
 * Every whole excerpt of 12-80 words: the quote paragraphs before a source line, after its
 * optional dated header, inside one section (no section heading among them), no ornament
 * or second header inside. The same for everyone (it reads only the corpus and its sidecars).
 * @param {any[]} entries ANSWERS
 * @param {Record<string, any> | null} metaAll ANSWERS_META
 * @returns {{ id: string, head: number, quote: number[], attr: number }[]}
 */
export function answersDailyPool(entries, metaAll) {
  /** @type {{ id: string, head: number, quote: number[], attr: number }[]} */
  const pool = [];
  if (!metaAll) return pool;
  for (const e of answersTopicEntries(entries)) {
    const P = e.paragraphs || [];
    const secAt = new Set(((metaAll[e.id] || {}).sections || []).filter((s) => !s.synthetic).map((s) => s.at));
    let start = 0;
    for (let i = 0; i < P.length; i++) {
      if (!isAttribution(P[i] && P[i].text)) continue;
      let s = start;
      while (s < i && String(P[s].text || '').trim() === '✦') s++;
      start = i + 1;
      if (s >= i) continue;
      const head = isDateHead(P[s].text) ? s : -1;
      const from = head >= 0 ? s + 1 : s;
      if (from >= i) continue;
      let ok = true, words = 0;
      for (let k = s; k < i && ok; k++) {
        if (secAt.has(k)) ok = false;
        else if (k >= from) {
          const t = String(P[k].text || '');
          if (isDateHead(t) || t.trim() === '✦') ok = false;
          else words += answersWordCount(t);
        }
      }
      if (!ok || words < 12 || words > 80) continue;
      const quote = [];
      for (let k = from; k < i; k++) quote.push(k);
      pool.push({ id: e.id, head, quote, attr: i });
    }
  }
  return pool;
}

/** The local calendar day as a whole number (days since 1970-01-01 on that date). */
export function answersDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}

/**
 * Today's excerpt: the pool by local day number, so it turns at the reader's midnight.
 * @template T
 * @param {T[]} pool
 * @param {Date} date
 * @returns {T | null}
 */
export function answersDailyPick(pool, date) {
  if (!pool || !pool.length) return null;
  return pool[((answersDayNumber(date) % pool.length) + pool.length) % pool.length];
}

/**
 * The quote paragraphs "Open to an answer" may land on: justified text, never a heading,
 * a dated header, an ornament, a link line or a source line.
 * @param {any[]} entries ANSWERS
 * @param {Record<string, any> | null} metaAll
 * @returns {{ id: string, index: number }[]}
 */
export function answersOpenablePool(entries, metaAll) {
  /** @type {{ id: string, index: number }[]} */
  const out = [];
  for (const e of answersTopicEntries(entries)) {
    const secAt = new Set((((metaAll || {})[e.id] || {}).sections || []).map((/** @type {any} */ s) => s.at));
    (e.paragraphs || []).forEach((/** @type {any} */ p, /** @type {number} */ i) => {
      const t = String((p && p.text) || '');
      if (!p || p.align !== 'justify' || secAt.has(i) || isAttribution(t) || isDateHead(t)) return;
      const lead = t.trim().charAt(0);
      if (!t.trim() || lead === '•' || lead === '✦' || t.trim().startsWith('http')) return;
      out.push({ id: e.id, index: i });
    });
  }
  return out;
}

/* ── The reading path ──────────────────────────────────────────────── */

/**
 * Where the landing's path row points: the topic after the last one finished, in the site's
 * order (the first unread one from there, round to the start), or the start.
 * @param {any[]} entries ANSWERS
 * @param {(id: string) => boolean} isRead
 * @param {string | null} lastId the topic finished last ('' or null: none)
 * @returns {{ kind: 'start' | 'continue' | 'again', entry: any, n: number }}
 */
export function answersPathState(entries, isRead, lastId) {
  const order = answersSiteOrder(entries);
  const main = order.length && order[0].id === ANSWERS_MAIN_PAGE_ID ? order[0] : null;
  const start = { kind: /** @type {'start'} */ ('start'), entry: main, n: 0 };
  if (!order.length) return start;
  if (order.every((e) => isRead(e.id))) return { kind: 'again', entry: main, n: 0 };
  let at = lastId && isRead(lastId) ? order.findIndex((e) => e.id === lastId) : -1;
  if (lastId && at < 0 && isRead(lastId)) {
    // a page outside the menu: from the neighbour its own page names
    const nav = answersSiteNav(entries, lastId);
    if (nav && nav.prev) at = order.findIndex((e) => e.id === nav.prev);
  }
  if (at < 0) return start;
  for (let k = 1; k <= order.length; k++) {
    const e = order[(at + k) % order.length];
    if (!isRead(e.id)) {
      const n = order.indexOf(e);
      return n === 0 ? start : { kind: 'continue', entry: e, n };
    }
  }
  return { kind: 'again', entry: main, n: 0 };
}

/* ── Charts & videos ───────────────────────────────────────────────── */

/**
 * Every media item the sidecars name, in the site's order, sorted into the media page's four
 * lists: charts (one per image, with every topic that shows it), videos, playlists and channels,
 * audio and PDFs (the Main Page's PDF link among them). Nothing is fetched.
 * @param {any[]} entries ANSWERS
 * @param {Record<string, any> | null} metaAll
 */
export function answersMediaIndex(entries, metaAll) {
  const order = answersSiteOrder(entries).map((e) => e.id);
  const ids = order.concat(answersTopicEntries(entries).map((e) => e.id).filter((id) => !order.includes(id)));
  /** @type {any[]} */
  const all = [];
  for (const id of ids) for (const m of ((metaAll || {})[id] || {}).media || []) all.push({ ...m, id });
  /** @type {Map<string, any>} */
  const charts = new Map();
  for (const m of all) {
    if (m.kind !== 'image' || m.at === -1) continue;
    if (!charts.has(m.src)) charts.set(m.src, { ...m, ids: [] });
    charts.get(m.src).ids.push(m.id);
  }
  const videos = all.filter((m) => m.kind === 'video');
  const lists = all.filter((m) => m.kind === 'playlist' || m.kind === 'channel');
  const urls = new Set(all.map((m) => m.url));
  /** @type {any[]} */
  const files = [];
  const mpLinks = ((metaAll || {})[ANSWERS_MAIN_PAGE_ID] || {}).links || {};
  for (const [i, arr] of Object.entries(mpLinks)) {
    for (const L of arr || []) {
      const u = String(L.url || '').toLowerCase();
      if (L.kind === 'external' && u.endsWith('.pdf') && !urls.has(L.url)) files.push({ kind: 'pdf', title: L.text, url: L.url, at: Number(i), id: ANSWERS_MAIN_PAGE_ID });
    }
  }
  for (const m of all) if (m.kind === 'audio' || m.kind === 'pdf' || m.kind === 'download') files.push(m);
  const rank = (/** @type {any} */ m) => ids.indexOf(m.id) * 1e6 + (typeof m.at === 'number' ? m.at : 1e5);
  files.sort((a, b) => rank(a) - rank(b));
  return { charts: [...charts.values()], videos, lists, files };
}

/** The short name a media item's topic goes by on the media page. */
export function answersMediaPlace(entries, id, shortTitle) {
  if (id === ANSWERS_MAIN_PAGE_ID) return 'Main Page';
  if (id === ANSWERS_FD_INDEX_ID) return ANSWERS_FD_INDEX_SHORT;
  const e = (entries || []).find((x) => x && x.id === id);
  return e ? shortTitle(e.title) : '';
}

/** A web address's host without "www.": "https://www.youtube.com/x" → "youtube.com". */
export function answersDomain(url) {
  const s = String(url || '');
  const at = s.indexOf('//');
  let host = (at >= 0 ? s.slice(at + 2) : s).split('/')[0].split('?')[0].toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

/** The site's own label for a media item, word for word, less the "▶️" its playlist labels open with (the row's disc stands in). */
export function answersMediaTitle(m) {
  let t = String((m && m.title) || '').split('\n')[0];
  for (const lead of ['▶️ ', '▶ ']) if (t.startsWith(lead)) t = t.slice(lead.length);
  return t.trim();
}

/** The lines a media label carries under its first ("- Section Two: …"), without their dashes. */
export function answersMediaLines(m) {
  return String((m && m.title) || '').split('\n').slice(1)
    .map((l) => (l.startsWith('- ') ? l.slice(2) : l).trim()).filter(Boolean);
}

/** Where a media item opens, in a word: "YouTube", "Bandcamp", "PDF", "Dropbox", or a channel's address. */
export function answersMediaSource(m) {
  const url = String((m && m.url) || '');
  const host = answersDomain(url);
  if (m && m.kind === 'channel') {
    const at = url.indexOf('//');
    const rest = (at >= 0 ? url.slice(at + 2) : url).split('?')[0];
    const path = rest.slice(rest.indexOf('/') < 0 ? rest.length : rest.indexOf('/'));
    return host + (path.endsWith('/') ? path.slice(0, -1) : path);
  }
  if (m && m.kind === 'playlist') return '';
  if (url.toLowerCase().split('?')[0].endsWith('.pdf')) return 'PDF';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube';
  if (host.endsWith('bandcamp.com')) return 'Bandcamp';
  if (host.endsWith('dropbox.com')) return 'Dropbox';
  return host;
}

/** A media row's sub: its topic, then where it opens. */
export function answersMediaSub(m, place) {
  return [place, answersMediaSource(m)].filter(Boolean).join(SEP);
}

/** The landing's Charts & videos row: "2 charts, 4 videos, 11 playlists and more". */
export function answersMediaSummary(idx) {
  if (!idx) return '';
  const playlists = idx.lists.filter((/** @type {any} */ m) => m.kind === 'playlist').length;
  return `${pl(idx.charts.length, 'chart')}, ${pl(idx.videos.length, 'video')}, ${pl(playlists, 'playlist')} and more`;
}

/* ── Search words ─────────────────────────────────────────────────── */

/** "In Answers · 73 matches in 22 topics": the header is the sum of the groups under it. */
export function answersSearchSum(r) {
  const k = r.groups.length;
  // Only titles hold the words ("main page"): "0 matches" would read as nothing found.
  if (!r.matches) return 'In Answers' + SEP + pl(k, 'topic') + (k === 1 ? ' by its title' : ' by their titles');
  return 'In Answers' + SEP + pl(r.matches, 'match') + ' in ' + pl(k, 'topic');
}

/**
 * A search group's sub: "18 of 19 passages · The Fourth Commandment", "6 of 46 categories · False
 * Doctrines index", "1 of 2 sections" on another page of prose, "1 match" on a page of one passage
 * or section, or "Title match · Other Topics" when only the title holds the words.
 * @param {any[]} entries ANSWERS
 * @param {{ entry: any, n: number, total: number, prose: boolean }} g
 */
export function answersSearchSub(entries, g) {
  const place = answersPlaceOf(entries, g.entry.id);
  if (!g.n) return 'Title match' + SEP + place;
  if (g.total === 1) return pl(g.n, 'match') + SEP + place;
  const unit = !g.prose ? 'passage' : (g.entry.id === ANSWERS_FD_INDEX_ID ? 'category' : 'section');
  return g.n + NBSP + 'of ' + pl(g.total, unit) + SEP + place;
}

/**
 * The source line under a hit: "“Pentecost” · Volume 6 · 3/29/06", a category's name on a page of
 * prose, or the passage's own closing line ("From: Poured Out").
 * @param {any} entry
 * @param {{ src: number, date: string, sec: string } | null} first
 * @param {(t: string) => string} plain
 */
export function answersHitSource(entry, first, plain) {
  if (!first) return '';
  if (first.sec) return first.sec;
  const p = first.src >= 0 && entry && entry.paragraphs ? entry.paragraphs[first.src] : null;
  if (!p) return first.date || '';
  const sp = answersSourceParts(p.text);
  return (sp ? [sp.title, sp.collection, first.date] : [plain(p.text), first.date]).filter(Boolean).join(SEP);
}

/** Three-letter runs of a folded string, for "Closest topics". */
function trigrams(s) {
  const t = ' ' + String(s || '').toLowerCase().split('').filter((c) => (c >= 'a' && c <= 'z') || c === ' ').join('') + ' ';
  const out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/**
 * Up to `max` topics whose short title looks most like a query that found nothing (a typo:
 * "sabath" → The Sabbath), best first; none when nothing is close.
 * @param {any[]} entries ANSWERS
 * @param {string} query
 * @param {(t: string) => string} shortTitle
 * @param {number} [max]
 */
export function answersClosest(entries, query, shortTitle, max = 3) {
  const q = trigrams(query);
  if (q.size < 2) return [];
  const scored = [];
  for (const e of answersTopicEntries(entries)) {
    const t = trigrams(shortTitle(e.title));
    let shared = 0;
    for (const g of q) if (t.has(g)) shared++;
    const score = shared / q.size;
    if (score >= 0.4) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.e);
}
