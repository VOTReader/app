/* ── NoteStore ── body text and notebook memberships for note annotations ── */
const NoteStore = Object.assign(CachedStore('vot-notes', {}), {
  get(groupId) { return this._load()[groupId] || null; },
  all() { return this._load(); },
  list() {
    const data = this._load();
    return Object.keys(data).map(k => data[k]).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
  },
  count() { return Object.keys(this._load()).length; },
  set(groupId, fields) {
    const data = this._load();
    const existing = data[groupId];
    const ts = Date.now();
    data[groupId] = {
      groupId, notebookIds: [], body: '', color: 'yellow',
      fullText: '', keys: [], created: ts,
      ...(existing || {}),
      ...fields,
      updated: ts
    };
    this._save();
  },
  update(groupId, patch) {
    const data = this._load();
    if (!data[groupId]) return;
    data[groupId] = { ...data[groupId], ...patch, updated: Date.now() };
    this._save();
  },
  remove(groupId) {
    const data = this._load();
    delete data[groupId];
    this._save();
  },
  // Toggle a notebook membership on a note. No-op if the note doesn't exist.
  toggleNotebook(groupId, notebookId) {
    const data = this._load();
    const note = data[groupId];
    if (!note) return;
    const ids = Array.isArray(note.notebookIds) ? note.notebookIds.slice() : [];
    const i = ids.indexOf(notebookId);
    if (i >= 0) ids.splice(i, 1); else ids.push(notebookId);
    data[groupId] = { ...note, notebookIds: ids, updated: Date.now() };
    this._save();
  },
  // Strip a notebook from every note (used when a notebook is deleted).
  pruneNotebook(notebookId) {
    const data = this._load();
    const ts = Date.now();
    Object.keys(data).forEach(k => {
      const ids = (data[k].notebookIds || []).filter(id => id !== notebookId);
      if (ids.length !== (data[k].notebookIds || []).length) {
        data[k] = { ...data[k], notebookIds: ids, updated: ts };
      }
    });
    this._save();
  }
});

function _bookTitle(bookId) {
  if (typeof BIBLE_BOOK_LIST !== 'undefined') {
    const b = BIBLE_BOOK_LIST.find(x => x.id === bookId);
    if (b) return b.title;
  }
  return bookId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}
function _verseRangeLabel(nums) {
  if (!nums.length) return '';
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) { p = sorted[i]; continue; }
    parts.push(s === p ? String(s) : (s + '-' + p));
    s = p = sorted[i];
  }
  parts.push(s === p ? String(s) : (s + '-' + p));
  return parts.join(', ');
}
function noteSourceLabel(note) {
  const keys = note.keys || [];
  if (!keys.length) return 'Note';
  const first = keys[0];
  const parts0 = first.split(':');
  const kind = parts0[0];
  if (kind === 'bible' || kind === 'study') {
    const byChap = new Map();
    keys.forEach(k => {
      const p = k.split(':');
      let book, chap, verse;
      if (kind === 'study') {
        book = p[1];
        chap = (p[1].match(/-(\d+)$/) || [])[1] || '';
        verse = parseInt(p[2] || '0', 10);
      } else {
        book = p[1];
        chap = p[2];
        verse = parseInt(p[3] || '0', 10);
      }
      const ck = book + ':' + chap;
      if (!byChap.has(ck)) byChap.set(ck, []);
      byChap.get(ck).push(verse);
    });
    const segs = [];
    byChap.forEach((verses, ck) => {
      const [book, chap] = ck.split(':');
      const title = kind === 'bible' ? _bookTitle(book) :
        (function() {
          const m = book.match(/^(.+)-(\d+)$/);
          return m ? (m[1].charAt(0).toUpperCase() + m[1].slice(1)) : book;
        })();
      segs.push(title + ' ' + chap + ':' + _verseRangeLabel(verses.filter(Boolean)));
    });
    return segs.join(' · ');
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    const id = parts0[1];
    if (typeof findEntryContext === 'function') {
      const ctx = findEntryContext(id, kind);
      if (ctx && ctx.title) return ctx.title;
    }
    return id;
  }
  return first;
}
function noteSourceNav(note) {
  const keys = note.keys || [];
  if (!keys.length) return null;
  const k = keys[0];
  const p = k.split(':');
  const kind = p[0];
  if (kind === 'bible') {
    return { type: 'bible', key: k, bookId: p[1], chapter: parseInt(p[2], 10), verse: parseInt(p[3], 10) };
  }
  if (kind === 'study') {
    const m = (p[1] || '').match(/^(.+)-(\d+)$/);
    if (m) return { type: 'study', key: k, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(p[2] || '0', 10) };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    const ctx = (typeof findEntryContext === 'function') ? findEntryContext(p[1], kind) : null;
    return {
      type: kind, key: k,
      letterId: p[1], entryId: p[1],
      screen: ctx ? ctx.screen : null
    };
  }
  return null;
}
