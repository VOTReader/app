/* ═══════════════════════════════════════════════════════════════════════
   note-draft — the words of a note being typed outlive a kill (dl4, 2026-11-04)
   ═══════════════════════════════════════════════════════════════════════
   NoteSheet keeps the text being typed in React state until Save. The app's own
   reloads wait for it (utils/update-hold.js), but nothing else did: Android
   killing the app in the background, a closed tab, the reader's own reload or a
   crash took every word typed since the sheet opened. The journal editor has
   kept a synchronous localStorage draft for exactly this since JRNL-1
   (JournalEditorScreen.jsx); this is the note's.

   One key, one draft per note: { v: 1, drafts: { <groupId>: { body, ts } } }.
   NoteSheet writes it (localStorage is synchronous, so it survives a kill) when
   the page is hidden or left, a beat after typing stops, and when the sheet goes
   away without Save or Cancel (a crash). Opening the note again offers the words
   back in the editor when they differ from the saved note and are not older than
   its last save. The draft goes once Save's write is on disk, or when the reader
   discards the words or deletes the note; a stale one goes when the note opens.
   Over the quota, other notes' drafts go first, oldest first. The key is in
   cached-store.js LS_SKIP_LIST; Clear All removes it with every vot-* key.
   ═══════════════════════════════════════════════════════════════════════ */

export const NOTE_DRAFT_KEY = 'vot-note-draft';

/** How long after the last keystroke the words are written down. */
export const NOTE_DRAFT_DELAY_MS = 700;

/** @returns {Record<string, { body: string, ts: number }>} */
function _read() {
  try {
    const o = JSON.parse(localStorage.getItem(NOTE_DRAFT_KEY) || 'null');
    if (o && o.drafts && typeof o.drafts === 'object' && !Array.isArray(o.drafts)) return o.drafts;
  } catch (_e) { /* unreadable: no drafts */ }
  return {};
}

/** @param {Record<string, any>} drafts */
function _store(drafts) {
  if (!Object.keys(drafts).length) { localStorage.removeItem(NOTE_DRAFT_KEY); return; }
  localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ v: 1, drafts }));
}

/**
 * This note's draft, or null.
 * @param {string} groupId
 * @returns {{ body: string, ts: number } | null}
 */
export function readNoteDraft(groupId) {
  if (!groupId) return null;
  const d = _read()[groupId];
  return d && typeof d.body === 'string' ? { body: d.body, ts: typeof d.ts === 'number' ? d.ts : 0 } : null;
}

/**
 * Write down the words being typed. Over the quota, other notes' drafts give way,
 * oldest first. Best-effort: false when nothing could be stored.
 * @param {string} groupId
 * @param {string} body
 * @returns {boolean}
 */
export function writeNoteDraft(groupId, body) {
  if (!groupId || typeof body !== 'string') return false;
  let drafts;
  try { drafts = _read(); } catch (_e) { return false; }
  drafts[groupId] = { body, ts: Date.now() };
  const others = Object.keys(drafts).filter((id) => id !== groupId)
    .sort((a, b) => (drafts[a].ts || 0) - (drafts[b].ts || 0));
  for (;;) {
    try { _store(drafts); return true; }
    catch (_e) {
      if (!others.length) return false;
      delete drafts[/** @type {string} */ (others.shift())];
    }
  }
}

/**
 * Drop this note's draft; with `body`, only while the draft still holds those words
 * (newer words typed since are kept).
 * @param {string} groupId
 * @param {string} [body]
 */
export function clearNoteDraft(groupId, body) {
  try {
    const drafts = _read();
    const d = drafts[groupId];
    if (!d) return;
    if (body !== undefined && d.body !== body) return;
    delete drafts[groupId];
    _store(drafts);
  } catch (_e) { /* best-effort */ }
}

/**
 * A draft worth offering back: other words than the note holds, and not older
 * than its last save (a later save, here or in another tab, is the newer truth).
 * @param {{ body: string, ts: number } | null} draft
 * @param {{ body?: string, updated?: number } | null} note
 * @returns {boolean}
 */
export function noteDraftRecoverable(draft, note) {
  return !!draft && !!note && draft.body !== (note.body || '') && (draft.ts || 0) >= (note.updated || 0);
}

/**
 * Once the note store's write that carries `body` is on disk, drop the draft holding
 * those words. While the store has not loaded, or its writes are held (Clear All, another
 * tab's import), whenSaved answers for an older write, so the draft stays; the next open
 * finds it older than the saved note and drops it then. A write started meanwhile carries
 * these words too: wait for that one (the journal draft's rule, JournalEditorScreen.jsx).
 * @param {any} store NoteStore
 * @param {string} groupId
 * @param {string} body
 */
export function clearNoteDraftWhenSaved(store, groupId, body) {
  if (!store || typeof store.whenSaved !== 'function') return;
  const g = /** @type {any} */ (globalThis);
  const settled = () => !(typeof store.isReady === 'function' && !store.isReady())
    && !(typeof g.isStoreWriteFenced === 'function' && g.isStoreWriteFenced());
  if (!settled()) return;
  const wait = () => {
    const last = store._lastWrite;
    store.whenSaved().then((/** @type {boolean} */ ok) => {
      if (!ok || !settled()) return;
      if (store._lastWrite !== last) { wait(); return; }
      clearNoteDraft(groupId, body);
    }, () => { /* never rejects */ });
  };
  wait();
}
