/* journal-blocks.js - a journal entry's blocks in v2 (mw9, design dz20 3n/3o and dz22 4g; main's JournalInsertSheet,
   JournalViewerScreen and JournalEditorScreen). Pure facts, no React and no storage writes:
   - targetToBlock: what Insert > Card / Excerpt puts in the entry for a place the picker hands back (main's
     targetToJournalBlock, block for block: a letter-card, a chapter-card or a verse-block), so main shows it too;
   - insertBelow: where a new block goes (main's insertBlockBelow: under the block the cursor is in, never splitting it;
     with no cursor, before the entry's trailing empty paragraph; always one empty paragraph after the last card);
   - blockView: what each block shows on the page (3n: overline, title, words cut at three lines, where it is, and the
     v2 route a tap opens), read from main's own stores through their globals;
   - pickRows / entryParts: Insert's Bookmark, Note, Journal entry and Notebook pickers (main's JournalInsertSheet);
   - withTail, moveBlock, removedWords: a block moved or removed (main's moveBlock and its Undo words). */
import { letterPlaceOf, placeOfKey, journalTitle, journalText } from './notes-facts.js';
import { testamentOf } from './links.js';
import { translationName } from './bible-facts.js';

const g = /** @type {any} */ (globalThis);

/** A block as main makes one (JournalHelpers.newBlock: b_<time>_<random> ids). */
export function newBlock(type, extra = {}, env = g) {
  const H = env.JournalHelpers;
  if (H && typeof H.newBlock === 'function') return H.newBlock(type, extra);
  return { id: 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), type, ...extra };
}

/** A paragraph of the entry's own words (the editor writes these). @param {any} b */
export const isText = (b) => !!b && b.type === 'p' && typeof b.text === 'string';

const LETTER_KINDS = ['letter', 'wtlb', 'blessed', 'holy-days', 'study-letter'];

/** main's volKey for a collection named by its label (COLLECTIONS), or undefined. */
function volKeyOf(label, env) {
  const cols = Array.isArray(env.COLLECTIONS) ? env.COLLECTIONS : [];
  const c = label ? cols.find((x) => x && x.label === label) : null;
  return c ? c.volKey : undefined;
}

/**
 * The block Insert puts in the entry for a place the picker hands back (main's targetToJournalBlock): an excerpt of a
 * Bible place is a verse-block (its words as picked, with v2's `translation`: the picker reads main's NKJV text), a card
 * of one a chapter-card; a letter (or entry) is a letter-card, its words kept as `excerpt` for an excerpt. Null when
 * main could not show it (no collection for the letter).
 * @param {any} target @param {any} item @param {boolean} asExcerpt
 */
export function targetToBlock(target, item, asExcerpt, env = g) {
  if (!target) return null;
  const t = target.type;
  if (t === 'bible' || t === 'study') {
    const hasText = !!(target.text && target.text.length);
    const hasVerse = target.verse != null;
    if (asExcerpt && hasText) {
      const ref = target.label || ((target.bookId || '') + ' ' + (target.chapter || '')
        + (hasVerse ? ':' + target.verse + (target.verseEnd ? '-' + target.verseEnd : '') : ''));
      const extra = { ref, text: target.text, partial: !!target.partial, bookId: target.bookId, chapter: target.chapter,
        verse: target.verse || null, verseEnd: target.verseEnd || null, isStudy: t === 'study' };
      return newBlock('verse-block', t === 'bible' ? { ...extra, translation: 'nkjv' } : extra, env);
    }
    if (target.bookId != null && target.chapter != null) {
      return newBlock('chapter-card', { bookId: target.bookId, chapter: target.chapter, isStudy: t === 'study' }, env);
    }
    return null;
  }
  if (LETTER_KINDS.includes(t)) {
    const letterId = target.letterId || target.entryId || target.studyChapterId;
    const volKey = target.volKey || volKeyOf(target.collection, env) || volKeyOf(item && item.collection, env);
    /** @type {Record<string, any>} */
    const extra = { volKey, letterId };
    if (t === 'study-letter') {
      extra.studyId = target.studyId;
      extra.studyChapterId = target.studyChapterId || letterId;
    }
    if (asExcerpt && target.text) {
      extra.excerpt = target.text;
      extra.blockKey = target.blockKey || null;
      extra.start = target.start != null ? target.start : null;
      extra.end = target.end != null ? target.end : null;
    }
    if (!volKey || !letterId) return null;
    return newBlock('letter-card', extra, env);
  }
  return null;
}

/**
 * The entry with `block` put in (main's insertBlockBelow), and where the cursor goes after it.
 * @param {any[]} blocks @param {{ id: string, caret: number } | null} at the text block the cursor was last in
 * @returns {{ blocks: any[], focus: { id: string, caret: number } | null }}
 */
export function insertBelow(blocks, at, block, env = g) {
  const next = blocks.slice();
  const idx = at ? next.findIndex((b) => b && b.id === at.id) : -1;
  if (idx >= 0) {
    next.splice(idx + 1, 0, block);
    if (idx + 1 === next.length - 1) next.push(newBlock('p', { text: '' }, env));
    return { blocks: next, focus: { id: at.id, caret: at.caret || 0 } };
  }
  const last = next[next.length - 1];
  if (last && isText(last) && !last.text.trim()) {
    next.splice(next.length - 1, 0, block);
    return { blocks: next, focus: { id: last.id, caret: 0 } };
  }
  const tail = newBlock('p', { text: '' }, env);
  next.push(block, tail);
  return { blocks: next, focus: { id: tail.id, caret: 0 } };
}

/** The page a chapter-card or verse-block opens: the Bible chapter at its verse, or the Matthew Study Bible's chapter. */
function chapterRoute(b) {
  if (b.bookId == null || b.chapter == null) return null;
  if (b.isStudy) return { place: 'study-chapter', study: 'matthew-study', chapter: String(b.chapter) };
  return { place: 'bible-chapter', book: b.bookId, chapter: b.chapter, verse: b.verse || null };
}

/** main's stored excerpts keep the page's spacing; the card shows them as one run of words. */
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** A store's record by id, or null (the store absent or throwing). */
function get(store, id) {
  try { return store && typeof store.get === 'function' ? store.get(id) || null : null; } catch (_e) { return null; }
}

/**
 * What one block shows on the entry's page (3n). `kind` is 'text' (the reader's words, written in place), 'card' (an
 * overline, a title, `words` cut at three lines or a `quote`, `meta` under them, and `open`: the v2 route a tap opens, or
 * null), 'divider', 'image', 'memo' (a voice memo) or 'other' (a kind v2 does not draw yet: one quiet line).
 * @param {any} b @returns {{ kind: string } & Record<string, any>}
 */
export function blockView(b, env = g) {
  if (!b) return { kind: 'other', line: '' };
  const H = env.JournalHelpers;
  switch (b.type) {
    case 'p': return { kind: 'text', text: typeof b.text === 'string' ? b.text : '' };
    case 'divider': return { kind: 'divider' };
    case 'image': return { kind: 'image', mediaId: b.mediaId || null, caption: b.caption || '' };
    case 'audio': return { kind: 'memo', mediaId: b.mediaId || null, duration: b.duration || 0, caption: b.caption || '',
      samples: Array.isArray(b.samples) ? b.samples : null };
    case 'letter-card': {
      const p = letterPlaceOf(b.volKey, b.letterId, env);
      const excerpt = b.excerpt && String(b.excerpt).trim() ? oneLine(b.excerpt) : '';
      return { kind: 'card', eyebrow: excerpt ? 'Excerpt' : (p.where && / · Letter \d+$/.test(p.where) ? 'Letter' : 'Entry'),
        title: p.title || b.letterId || '', words: excerpt, meta: p.where || '', open: p.open || null };
    }
    case 'chapter-card': {
      const ref = placeOfKey('bible:' + b.bookId + ':' + b.chapter, env);
      return { kind: 'card', eyebrow: 'Bible chapter', title: ref.title, words: '',
        meta: b.isStudy ? 'Matthew Study Bible' : testamentOf(b.bookId), open: chapterRoute(b) };
    }
    case 'verse-block': {
      let text = b.text && String(b.text).trim() ? b.text : '';
      if (!text && typeof env.resolveVerseText === 'function') { try { text = env.resolveVerseText(b.ref) || ''; } catch (_e) { text = ''; } }
      const open = chapterRoute(b);
      return { kind: 'card', eyebrow: 'Excerpt', title: b.ref || '', words: oneLine(text), missing: !text,
        meta: b.translation ? translationName(b.translation, env) : '', open };
    }
    case 'bookmark-card': {
      const bm = get(env.BookmarkStore, b.bookmarkId);
      const p = bm && bm.hlKey ? placeOfKey(bm.hlKey, env) : null;
      const title = (bm && (bm.label || (p && p.title))) || 'Bookmark';
      return { kind: 'card', eyebrow: 'Bookmark', title, words: bm && bm.thought ? oneLine(bm.thought) : '',
        meta: p && p.where !== title ? p.where : '', open: p ? p.open : null };
    }
    case 'note-card': {
      const n = get(env.NoteStore, b.noteGroupId);
      const p = n && n.hlKey ? placeOfKey(n.hlKey, env) : null;
      let title = 'Note';
      if (n && typeof env.noteSourceLabel === 'function') { try { title = env.noteSourceLabel(n) || title; } catch (_e) { /* keep Note */ } }
      return { kind: 'card', eyebrow: 'Note', title, words: n ? oneLine(n.body || n.fullText || '') : '', meta: '', open: p ? p.open : null };
    }
    case 'journal-card': {
      const e = get(env.JournalStore, b.entryId);
      const t = e ? journalTitle(e) || (H && typeof H.entryDisplayTitle === 'function' ? H.entryDisplayTitle(e) : '') || 'Untitled' : 'Deleted entry';
      return { kind: 'card', eyebrow: 'Journal entry', title: t, words: e ? journalText(e) : '', meta: '',
        open: e ? { place: 'journal-entry', id: e.id } : null };
    }
    case 'notebook-card': {
      const nb = b.notebookId === 'uncategorized' ? { name: 'Uncategorized' } : get(env.NotebookStore, b.notebookId);
      return { kind: 'card', eyebrow: 'Notebook', title: nb ? nb.name || 'Notebook' : 'Deleted notebook', words: '', meta: '', open: null };
    }
    case 'journal-excerpt': {
      // words from another entry (main's embedBlockFromJournal): its title kept on the block, else looked up
      let title = b.sourceJournalTitle || '';
      const src = b.sourceJournalId ? get(env.JournalStore, b.sourceJournalId) : null;
      if (!title && src) title = journalTitle(src) || 'Untitled';
      return { kind: 'card', eyebrow: 'Excerpt', title: title || 'Journal entry', words: oneLine(b.text), meta: 'Journal',
        open: b.sourceJournalId ? { place: 'journal-entry', id: b.sourceJournalId } : null };
    }
    default: {
      const s = H && typeof H.describeBlock === 'function' ? H.describeBlock(b) : '';
      return { kind: 'other', line: s || 'Kept as it is' };
    }
  }
}

/** The blocks with a paragraph to write in after the last card (main's rule after an insert, a move or a remove). */
export function withTail(blocks, env = g) {
  const last = blocks[blocks.length - 1];
  return last && isText(last) ? blocks : blocks.concat(newBlock('p', { text: '' }, env));
}

/**
 * The block at `i` moved one place up (-1) or down (+1) (main's moveBlock); the same list when it cannot go.
 * @param {any[]} blocks @param {number} i @param {number} by
 */
export function moveBlock(blocks, i, by) {
  const to = i + by;
  if (i < 0 || to < 0 || i >= blocks.length || to >= blocks.length) return blocks;
  const next = blocks.slice();
  const [b] = next.splice(i, 1);
  next.splice(to, 0, b);
  return next;
}

/** main's Undo words for a removed block. @param {any} b */
export function removedWords(b) {
  return b && b.type === 'audio' ? 'Voice memo removed.' : b && b.type === 'image' ? 'Image removed.' : 'Block deleted.';
}

/** What a block is called on its sheet (Move up / Move down / Remove). @param {any} b */
export function blockName(b, env = g) {
  const v = blockView(b, env);
  if (v.kind === 'card') return v.eyebrow;
  return { divider: 'Divider', image: 'Picture', memo: 'Voice memo', text: 'Paragraph' }[v.kind] || 'Block';
}

/* ---- Insert's pickers from your notes (main's JournalInsertSheet: bookmarks, notes, entries, notebooks) ------------- */

/** What each picker says (main's placeholders and empty lines, as v2 words them). */
export const PICKERS = {
  bookmark: { title: 'Pick a bookmark', search: 'Search bookmarks', none: 'No bookmarks yet.' },
  note: { title: 'Pick a note', search: 'Search notes', none: 'No notes yet.' },
  journal: { title: 'Pick a journal entry', search: 'Search journal entries', none: 'No other journal entries yet.' },
  notebook: { title: 'Pick a notebook', search: 'Search notebooks', none: 'No notebooks yet. Uncategorized is always available.' },
};

const newest = (a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0);
const tryCall = (f, fallback) => { try { return f(); } catch (_e) { return fallback; } };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * One picker's rows, newest first, the query matched as main matches it (any part of the row's words, any case); each
 * row's `make()` is the block that goes in (made only when it is picked), or `entry` for a journal entry (it opens to its
 * parts first). `total` is how many the store holds (the empty line says "none yet" or "no matches").
 * @param {'bookmark' | 'note' | 'journal' | 'notebook'} kind @param {string} query @param {string | null} exclude this entry
 * @returns {{ total: number, rows: Array<{ key: string, title: string, sub: string, make?: () => any, entry?: any }> }}
 */
export function pickRows(kind, query, exclude = null, env = g) {
  const q = String(query || '').trim().toLowerCase();
  const hit = (s) => !q || s.toLowerCase().indexOf(q) >= 0;
  const H = env.JournalHelpers;
  if (kind === 'bookmark') {
    const all = tryCall(() => env.BookmarkStore.all().slice(), []).sort(newest);
    const rows = all.map((b) => {
      const p = b.hlKey ? placeOfKey(b.hlKey, env) : null;
      const title = b.label || (p && p.title) || 'Bookmark';
      const sub = p && p.where && p.where !== title ? p.where : '';
      return { key: b.id, title, sub, hay: title + ' ' + (b.thought || '') + ' ' + sub, make: () => newBlock('bookmark-card', { bookmarkId: b.id }, env) };
    });
    return { total: all.length, rows: rows.filter((r) => hit(r.hay)).map(({ hay: _hay, ...r }) => r) };
  }
  if (kind === 'note') {
    const S = env.NoteStore;
    let all = tryCall(() => (typeof S.list === 'function' ? S.list() : Object.values(S.all() || {})), []);
    if (!Array.isArray(all)) all = [];
    all = all.filter((n) => n && n.groupId).sort(newest);
    const rows = all.map((n) => {
      const anchor = oneLine(n.fullText).slice(0, 80);
      const title = clip(oneLine(n.body), 60) || anchor || 'Note';
      const sub = typeof env.noteSourceLabel === 'function' ? tryCall(() => env.noteSourceLabel(n) || '', '') : '';
      return { key: n.groupId, title, sub, hay: (n.body || '') + ' ' + oneLine(n.fullText) + ' ' + sub, make: () => newBlock('note-card', { noteGroupId: n.groupId }, env) };
    });
    return { total: all.length, rows: rows.filter((r) => hit(r.hay)).slice(0, 200).map(({ hay: _hay, ...r }) => r) };
  }
  if (kind === 'journal') {
    const all = tryCall(() => env.JournalStore.all().slice(), []).filter((e) => e && e.id && e.id !== exclude).sort((a, b) => (b.created || 0) - (a.created || 0));
    const rows = all.map((e) => {
      const title = journalTitle(e) || (H && typeof H.entryDisplayTitle === 'function' ? tryCall(() => H.entryDisplayTitle(e), '') : '') || 'Untitled';
      const preview = clip(journalText(e), 80);
      const date = e.created ? new Date(e.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return { key: e.id, title, sub: date + (preview ? ' · ' + preview : ''), hay: title + ' ' + journalText(e) + ' ' + (e.tags || []).join(' '), entry: e };
    });
    return { total: all.length, rows: rows.filter((r) => hit(r.hay)).map(({ hay: _hay, ...r }) => r) };
  }
  // notebook: Uncategorized first, then every notebook, each with its notes counted once
  const nbs = tryCall(() => env.NotebookStore.list().slice(), []);
  const counts = new Map();
  let loose = 0;
  tryCall(() => env.NoteStore.list(), []).forEach((n) => {
    const ids = (n && n.notebookIds) || [];
    if (!ids.length) loose++;
    else new Set(ids).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  });
  const rows = [{ id: 'uncategorized', name: 'Uncategorized' }].concat(nbs).filter((nb) => nb && hit(nb.name || '')).map((nb) => {
    const n = nb.id === 'uncategorized' ? loose : counts.get(nb.id) || 0;
    return { key: nb.id, title: nb.name || 'Notebook', sub: n + (n === 1 ? ' note' : ' notes'), make: () => newBlock('notebook-card', { notebookId: nb.id }, env) };
  });
  return { total: nbs.length, rows };
}

/**
 * Another entry's parts Insert can bring in (main's embeddable blocks: words, a picture, a voice memo), each with the
 * block main makes of it (embedBlockFromJournal: a copy that remembers where it came from); the whole entry is a
 * journal-card (wholeEntry).
 * @returns {Array<{ key: string, title: string, sub: string, block: any }>}
 */
export function entryParts(entry, env = g) {
  const H = env.JournalHelpers;
  if (!entry || !H || typeof H.embedBlockFromJournal !== 'function') return [];
  return (entry.blocks || []).filter((b) => b && ['p', 'h2', 'quote', 'image', 'audio'].includes(b.type) && (b.type === 'image' || b.type === 'audio' || String(b.text || '').trim()))
    .map((b) => {
      const block = tryCall(() => H.embedBlockFromJournal(entry, b), null);
      const sub = b.type === 'image' ? b.caption || '' : b.type === 'audio' ? (b.caption || '') + (b.duration ? (b.caption ? ' · ' : '') + clock(b.duration) : '') : clip(oneLine(b.text), 90);
      return { key: b.id, title: b.type === 'image' ? 'Picture' : b.type === 'audio' ? 'Voice memo' : 'Words', sub, block };
    }).filter((r) => r.block);
}

/** The card that opens another entry (main's "Link the Whole Entry"). */
export function wholeEntry(entry, env = g) {
  return newBlock('journal-card', { entryId: entry.id }, env);
}

/** "1:12" (main's formatDuration). @param {number} s */
export function clock(s) {
  const t = Math.max(0, Math.floor(s || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/**
 * The memo's waveform as `count` bars, 5-28 px (the kit's .jwav): main's samples (0..1) read across the bars, else
 * main's own quiet shape; `played` bars up to the playhead are lit.
 * @param {number[] | null} samples @param {number} count @param {number} progress 0..1
 */
export function waveBars(samples, count, progress) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let h;
    if (samples && samples.length) {
      const v = samples[Math.min(samples.length - 1, Math.floor(i * samples.length / count))];
      h = Math.round(5 + Math.max(0, Math.min(1, Number(v) || 0)) * 23);
    } else {
      h = 6 + Math.round(Math.abs(Math.sin(i * 0.6 + i * 0.13)) * 16);
    }
    out.push({ h, played: progress > 0 && (i + 1) / count <= progress + 1e-9 });
  }
  return out;
}
