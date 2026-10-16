/* notes-facts.js - what v2's Notes tab lists (zv1; pictures 3c-notes, 3d-notes-journal, 8c-notes-empty).

   Saved data is re-shown, never migrated (v2 build plan rule 5): readMarks() reads main's own stores read-only
   (JournalStore, AnnotationStore through bundle-d's _collectMarks, NoteStore, BookmarkStore, LinkStore, and the
   recordings saved in AudioLibraryStore, shown with the bookmarks: v2 has no library page) and turns every item into one
   Mark; the gate hook seeds Marks directly. Everything else here is pure: the six kinds, the line under
   each kind's title, the day words ("Today", "Sunday", "Oct 9") and each row's meta line. No storage writes, no DOM. */

import { bookName } from './home-facts.js';

const DAY = 24 * 3600 * 1000;

/**
 * One row in Notes.
 * @typedef {{ kind: 'journal' | 'highlight' | 'note' | 'bookmark' | 'link', id: string, at: number,
 *   title?: string, text?: string, quote?: string, note?: string, colour?: string, where?: string,
 *   label?: string, open?: Record<string, any> | null }} Mark
 *   label: the meta line's first words when not the kind's name ("Saved recording")
 */

/** The chips, in the picture's order (Journal second: Corbin asked how to reach his journal, 10-14 17:4x). */
export const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'journal', label: 'Journal' },
  { id: 'highlight', label: 'Highlights' },
  { id: 'note', label: 'Notes' },
  { id: 'bookmark', label: 'Bookmarks' },
  { id: 'link', label: 'Links' },
];

/** The line under "Notes" for each chip (All and Journal as drawn). */
export const LEDES = {
  all: 'Everything you marked, newest first',
  journal: 'Your own entries, newest first',
  highlight: 'Words you highlighted, newest first',
  note: 'Your notes on the text, newest first',
  bookmark: 'Places you saved, newest first',
  link: 'Passages you joined, newest first',
};

/** What a chip with nothing in it says (the whole tab empty is EMPTY_ALL). */
export const EMPTY = {
  journal: 'No journal entries yet',
  highlight: 'No highlights yet',
  note: 'No notes yet',
  bookmark: 'No bookmarks yet',
  link: 'No links yet',
};
export const EMPTY_ALL = {
  title: 'Nothing marked yet',
  text: 'Tap a paragraph while you read to highlight it, add a note or bookmark it. Journal entries and links gather here too.',
};

const KIND_NAME = { journal: 'Journal', highlight: 'Highlight', note: 'Note', bookmark: 'Bookmark', link: 'Link' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** main's highlight colours -> the kit's five (kit.css .hl.*). */
const COLOUR = { yellow: 'gold', orange: 'gold', gold: 'gold', green: 'sage', teal: 'sage', cyan: 'sage', blue: 'blue', pink: 'rose', red: 'rose', purple: 'plum' };
/** @param {string | undefined} c */
export function kitColour(c) { return (c && COLOUR[c]) || 'gold'; }

/** Local midnight before `ts`. */
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

/**
 * The day words a row ends with: Today, Yesterday, a weekday within this week (weeks start on Sunday), else "Oct 9"
 * ("Oct 9, 2025" in another year).
 * @param {number} ts @param {number} now
 */
export function dayLabel(ts, now) {
  if (!ts) return '';
  const daysAgo = Math.round((dayStart(now) - dayStart(ts)) / DAY);   // round: a DST day is 23 or 25 hours
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo <= new Date(now).getDay()) return WEEKDAYS[new Date(ts).getDay()];
  const d = new Date(ts);
  const md = MONTHS[d.getMonth()] + ' ' + d.getDate();
  return d.getFullYear() === new Date(now).getFullYear() ? md : md + ', ' + d.getFullYear();
}

/** "Highlight · Volume One · Letter 1 · Today". @param {Mark} m @param {number} now */
export function metaLine(m, now) {
  return [m.label || KIND_NAME[m.kind], m.where, dayLabel(m.at, now)].filter(Boolean).join(' · ');
}

/** The rows a chip shows, newest first. @param {Mark[]} marks @param {string} kind */
export function marksOfKind(marks, kind) {
  const list = kind && kind !== 'all' ? marks.filter((m) => m.kind === kind) : marks.slice();
  return list.sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** @param {string} kind @returns {string} a known chip id ('all' for anything else) */
export function kindOf(kind) {
  return KINDS.some((k) => k.id === kind) ? kind : 'all';
}

/* ---- reading main's stores (a real boot) ---------------------------------------------------------------------- */

/** The collections main knows (scripture-resolution.js COLLECTIONS, or COL_BY_KEY's values). */
function collections(env) {
  if (Array.isArray(env.COLLECTIONS)) return env.COLLECTIONS;
  const map = env.COL_BY_KEY;
  return map && typeof map.values === 'function' ? Array.from(map.values()) : [];
}

/**
 * Where a key points: `where` for the meta line, `title` of the thing itself, `open` the v2 route that shows it,
 * `pending` while the letters it needs have not loaded (index.html's lazy corpus).
 * @param {string} key @param {any} env
 * @returns {{ where: string, title: string, open: Record<string, any> | null, pending?: boolean }}
 */
export function placeOfKey(key, env) {
  const parts = String(key || '').split(':');
  const kind = parts[0];
  if (kind === 'bible' || kind === 'study') {
    let bookId = parts[1] || '';
    let chapter = parseInt(parts[2] || '', 10);
    let verse = parseInt(parts[3] || '', 10);
    if (kind === 'study') {
      const m = bookId.match(/^(.+)-(\d+)$/);
      if (m) { bookId = m[1]; verse = parseInt(parts[2] || '', 10); chapter = parseInt(m[2], 10); }
    }
    const book = bookTitle(bookId, env);
    const ref = book + (chapter ? ' ' + chapter + (verse ? ':' + verse : '') : '');
    return { where: ref, title: ref, open: chapter ? { place: 'bible-chapter', book: bookId, chapter, verse: verse || null } : null };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    const id = parts[1];
    for (const col of collections(env)) {
      const p = col ? letterPlace(col, id, env) : null;
      if (p) return p;
    }
    const label = typeof env._bookmarkSourceLabel === 'function' ? env._bookmarkSourceLabel(key) : id;
    const corpus = env.__votCorpus;
    return { where: '', title: label || id, open: null, pending: !!(corpus && !corpus.loaded) };
  }
  if (kind === 'journal') {
    const entry = env.JournalStore && typeof env.JournalStore.get === 'function' ? env.JournalStore.get(parts[1]) : null;
    const t = entry ? journalTitle(entry) || 'Untitled' : 'Journal entry';
    return { where: 'Journal · ' + t, title: t, open: entry ? { place: 'journal-entry', id: entry.id } : null };
  }
  return { where: '', title: String(key || ''), open: null };
}

/**
 * A letter of the collection `volKey` by its id (a journal card's volKey + letterId), as placeOfKey says it; any
 * collection's when that one does not hold it. @param {string} volKey @param {string} id @param {any} env
 */
export function letterPlaceOf(volKey, id, env) {
  const col = collections(env).find((c) => c && c.volKey === volKey);
  return (col && letterPlace(col, id, env)) || placeOfKey('letter:' + id, env);
}

/**
 * A letter (or the preface) of one collection by its id, or null when the collection does not hold it (or has not
 * loaded). Every collection's letters open by number in v2's letter place; "· Letter N" is said only for the
 * numbered volumes (main's vot- letter screens).
 */
function letterPlace(col, id, env) {
  const pref = col.prefaceGlobal ? env[col.prefaceGlobal] : null;
  if (pref && pref.id === id) return { where: col.label, title: pref.title || col.label, open: { place: 'letter', collection: col.volKey, preface: true } };
  const arr = env[col.globalName];
  const e = Array.isArray(arr) ? arr.find((x) => x && x.id === id) : null;
  if (!e) return null;
  const n = typeof e.num === 'number' ? e.num : null;
  return {
    where: n != null && /^vot-/.test(col.letterScreen || '') ? col.label + ' · Letter ' + n : col.label,
    title: e.title || id,
    open: n != null ? { place: 'letter', collection: col.volKey, n } : null,
  };
}

/**
 * Where a saved recording's text is, read as main opens it from the library (screen-routes.jsx _openAudioText): a
 * 'bible-<edition>:<book>' track at its "Chapter N", a 'study:<id>-chN' track at that study chapter, else the letter
 * '<volKey>:<letter id>' of that collection (`pending` while that collection's letters have not loaded); a Words To
 * Live By compilation (key null) at its section's first entry, as main's AudioShelf textKeyOf asks the player (`unnamed`
 * until the player has the section list, which rides the VOT corpus, and the compilation timings file: Notes asks for
 * both and reads again, never waiting, since a key-null recording may be no compilation at all).
 * @param {{ key?: string | null, title?: string, partLabel?: string | null, url?: string }} t @param {any} env
 * @returns {{ where: string, title: string, open: Record<string, any> | null, pending?: boolean, unnamed?: boolean }}
 */
export function recordingPlace(t, env) {
  let key = String((t && t.key) || '');
  const none = { where: '', title: (t && t.title) || '', open: null };
  if (!key && t && t.key == null) {
    const A = env.AudioPlayer;
    try { key = (A && typeof A.sectionOpeningKey === 'function' && A.sectionOpeningKey(t)) || ''; } catch (_e) { key = ''; }
    if (!key) {
      // AUDIO_SECTIONS: volKey -> [[label, asset id, reader], ...]; the asset id is the url's file name
      const sections = env.AUDIO_SECTIONS;
      const asset = String(t.url || '').replace(/^.*\//, '').replace(/\.mp3$/i, '');
      const section = !sections || Object.values(sections).some((list) => Array.isArray(list) && list.some((s) => s && s[1] === asset));
      return { ...none, pending: false, unnamed: section && !(sections && env.AUDIO_SYNC_SECTIONS) };
    }
  }
  const i = key.indexOf(':');
  if (i < 1 || i >= key.length - 1) return none;
  const volKey = key.slice(0, i);
  const id = key.slice(i + 1);
  if (volKey.startsWith('bible-')) {
    const m = typeof t.partLabel === 'string' ? t.partLabel.match(/^Chapter (\d+)$/) : null;
    return placeOfKey('bible:' + id + ':' + (m ? m[1] : 1), env);
  }
  if (volKey === 'study') {
    const stem = id.match(/^(.+)-ch\d+$/);
    return stem ? { where: 'Studies', title: none.title, open: { place: 'study-chapter', study: stem[1], chapter: id } } : none;
  }
  const col = collections(env).find((c) => c && c.volKey === volKey);
  if (!col) return none;
  const p = letterPlace(col, id, env);
  if (p) return p;
  const corpus = env.__votCorpus;
  return { ...none, where: col.label, pending: !Array.isArray(env[col.globalName]) && !!(corpus && !corpus.loaded) };
}

function bookTitle(bookId, env) {
  const list = env.BIBLE_BOOK_LIST;
  const b = Array.isArray(list) ? list.find((x) => x && x.id === bookId) : null;
  if (b && b.title) return b.title;
  return bookName(bookId);
}

/** A journal entry's own title (blank when it has none). */
export function journalTitle(entry) {
  if (entry.title && String(entry.title).trim()) return String(entry.title).trim();
  return '';
}

/** A journal entry's words: its text blocks in order, one space apart. */
export function journalText(entry) {
  const blocks = Array.isArray(entry && entry.blocks) ? entry.blocks : [];
  return blocks.map((b) => (b && typeof b.text === 'string' ? b.text : '')).filter((s) => s.trim())
    .join(' ').replace(/\s+/g, ' ').trim();
}

const curly = (s) => '“' + s + '”';
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

/**
 * Every saved item main's stores hold, as Marks (read only). `pending` is true while a mark's letter title waits for
 * the lazy corpus; `unnamed` while a saved compilation waits for its section list and timings (asked for, not waited on).
 * @param {any} [env] the globals (bundle-b's stores, bundle-d's helpers)
 * @returns {{ marks: Mark[], pending: boolean, unnamed: boolean }}
 */
export function readMarks(env = globalThis) {
  /** @type {Mark[]} */
  const marks = [];
  let pending = false;
  let unnamed = false;
  const at = (key) => { const p = placeOfKey(key, env); if (p.pending) pending = true; return p; };
  const J = env.JournalStore;
  if (J && typeof J.all === 'function') {
    for (const e of J.all() || []) {
      if (!e || !e.id) continue;
      const title = journalTitle(e);
      const text = journalText(e);
      marks.push({ kind: 'journal', id: 'journal:' + e.id, at: e.updated || e.created || 0,
        title: title || clip(text, 60) || 'Untitled', text: title ? clip(text, 160) : '', open: { place: 'journal-entry', id: e.id } });
    }
  }
  if (typeof env._collectMarks === 'function') {
    for (const g of env._collectMarks() || []) {
      if (!g || !g.text) continue;
      const p = at(g.hlKey);
      marks.push({ kind: 'highlight', id: 'hl:' + g.groupId, at: g.created || g.updated || 0, text: g.text,
        colour: kitColour(g.color), where: p.where, open: p.open });
    }
  }
  const N = env.NoteStore;
  if (N && typeof N.list === 'function') {
    for (const n of N.list() || []) {
      if (!n) continue;
      const p = at((n.keys || [])[0]);
      const quote = String(n.fullText || '').replace(/\s+/g, ' ').trim();
      marks.push({ kind: 'note', id: 'note:' + n.groupId, at: n.updated || n.created || 0,
        quote: quote ? curly(clip(quote, 160)) : '', note: String(n.body || '').trim(), where: p.where, open: p.open });
    }
  }
  const B = env.BookmarkStore;
  if (B && typeof B.all === 'function') {
    for (const b of B.all() || []) {
      if (!b) continue;
      const p = at(b.hlKey);
      const title = (b.label && String(b.label).trim()) || p.title;
      marks.push({ kind: 'bookmark', id: 'bkm:' + b.id, at: b.created || b.updated || 0, title,
        where: p.where === title ? '' : p.where, open: p.open });
    }
  }
  const A = env.AudioLibraryStore;
  if (A && typeof A.saved === 'function') {
    for (const t of A.saved() || []) {
      if (!t || !t.url) continue;
      const p = recordingPlace(t, env);
      if (p.pending) pending = true;
      if (p.unnamed) unnamed = true;
      const title = (t.title && String(t.title).trim()) || p.title || 'Recording';
      marks.push({ kind: 'bookmark', label: 'Saved recording', id: 'rec:' + t.url, at: t.savedAt || 0, title,
        where: p.where === title ? '' : p.where, open: p.open });
    }
  }
  const L = env.LinkStore;
  if (L && typeof L.all === 'function') {
    for (const l of L.all() || []) {
      if (!l || !l.source || !l.target) continue;
      const s = at(l.source.key);
      const t = l.target.label || placeOfKey(l.target.key, env).title;
      const from = l.source.label || s.title;
      marks.push({ kind: 'link', id: 'lnk:' + l.id, at: l.created || l.updated || 0,
        title: from + ', joined to ' + t, where: s.where === from ? '' : s.where, open: s.open });
    }
  }
  return { marks, pending, unnamed };
}

/** Seeds for the gate pictures: 'now' minus whole days (so the day words match on any clock). */
export function gateMarks(now) {
  const d = (n) => now - n * DAY;
  const all = [
    { kind: 'journal', id: 'journal:g1', at: d(0), title: 'On being set apart', text: 'What “set apart for My glory” asks of me this week.' },
    { kind: 'highlight', id: 'hl:g1', at: d(0) - 60000, colour: 'gold', where: 'Volume One · Letter 1',
      text: 'Many things you must overcome in the years ahead; many things will I show you, many things will I teach you.' },
    { kind: 'note', id: 'note:g1', at: d(1), quote: curly('Timothy, write as I speak.'), note: 'Read this again on Sunday.', where: 'Volume One · Letter 1' },
    { kind: 'bookmark', id: 'bkm:g1', at: d(3), title: 'Honor Not the Day of the Dead... Honor God', where: 'Volume One · Letter 2' },
    { kind: 'link', id: 'lnk:g1', at: d(5), title: 'Chosen by God, joined to John 15:16', where: 'Volume One · Letter 1' },
    { kind: 'journal', id: 'journal:g2', at: d(3) - 60000, title: 'Sunday with the family', text: 'We read Letter 2 aloud after dinner. Talked about what to keep.' },
    { kind: 'journal', id: 'journal:g3', at: d(12), title: 'Questions for this month', text: 'Read the Answers on the Sabbath, then John 3 again.' },
  ];
  return /** @type {Mark[]} */ (all);
}
