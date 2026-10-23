/* ═══════════════════════════════════════════════════════════════════════
   whats-new — what changed for the reader since the build they last had
   ═══════════════════════════════════════════════════════════════════════
   up1 (Corbin 2026-10-23: "VOTReader has been flashing 'VOTReader was just
   updated' at me all day long"). The web publishes twice a day now, and an
   update says "Updated · What's new" at most once per release, opening a
   plain list of what changed (WhatsNewSheet). A release with nothing a
   reader would notice says nothing at all.

   THE LIST is ./whats-new.json, beside index.html: on the web the deploy
   writes it (tools/whats-new.mjs over the release's commits); in the APK the
   build does (the same tool over the local history). { since, items: [{ t,
   text }] }, newest first, t the commit time. It is fetched past the service
   worker (the worker lets it through), so it is never an older copy.

   WHAT IS NEW for this profile: the items newer than the newest one it has
   already been told about (LAST_SEEN_NOTE_KEY). The first time there is no
   key, the file's own `since` (the commit the site served before this
   release) stands in; without one (the APK) nothing is new that first time,
   and the key starts from here.

   Bundle-b (update-toast.js imports it). The sheet lives in bundle-d and
   listens for the window event OPEN_EVENT, so this file never imports it.
   ═══════════════════════════════════════════════════════════════════════ */

export const NOTES_URL = './whats-new.json';
/** localStorage key: the commit time of the newest item this profile was told about. Listed in cached-store.js's
 *  LS_SKIP_LIST so the one-time vot-* sweep leaves it alone. */
export const LAST_SEEN_NOTE_KEY = 'vot-whats-new-seen';
/** window event the sheet listens for; detail { items, title } */
export const OPEN_EVENT = 'vot:whats-new';
/** The Settings row shows this many of the newest items. */
export const RECENT_COUNT = 30;

/** @typedef {{ t: number, text: string }} NoteItem */

/** The notes file, or null (offline, missing, malformed). @returns {Promise<{ since: number | null, items: NoteItem[] } | null>} */
export async function fetchNotes() {
  try {
    const r = await fetch(NOTES_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) return null;
    const items = d.items.filter((/** @type {any} */ i) => i && typeof i.text === 'string' && i.text && Number.isFinite(i.t));
    return { since: Number.isFinite(d.since) ? d.since : null, items };
  } catch (_e) { return null; }
}

/**
 * The items newer than what this profile has been told about.
 * @param {{ since: number | null, items: NoteItem[] }} doc @param {number | null} seen
 * @returns {NoteItem[]}
 */
export function unseenItems(doc, seen) {
  const from = seen != null ? seen : doc.since;
  if (from == null) return [];
  return doc.items.filter((i) => i.t > from);
}

function readSeen() {
  try {
    const v = localStorage.getItem(LAST_SEEN_NOTE_KEY);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch (_e) { return null; }
}

/**
 * What is new for this profile, and from now on it has been told: the key moves to the newest item in the file.
 * Empty when there is nothing new, or nothing could be read (the key is then left alone).
 * @returns {Promise<NoteItem[]>}
 */
export async function takeNewItems() {
  const doc = await fetchNotes();
  if (!doc) return [];
  const items = unseenItems(doc, readSeen());
  const newest = doc.items.reduce((m, i) => Math.max(m, i.t), -Infinity);
  if (Number.isFinite(newest)) { try { localStorage.setItem(LAST_SEEN_NOTE_KEY, String(newest)); } catch (_e) { /* private mode */ } }
  return items;
}

/**
 * Open the What's new sheet: with these items, or the newest RECENT_COUNT from the file (Settings).
 * @param {NoteItem[]} [items]
 */
export async function openWhatsNew(items) {
  let list = items;
  if (!list) {
    const doc = await fetchNotes();
    list = doc ? doc.items.slice(0, RECENT_COUNT) : [];
  }
  try { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: list } })); } catch (_e) { /* no window */ }
}

/**
 * The items as days, newest first, for the sheet: [{ day: 'October 23', items: [...] }].
 * @param {NoteItem[]} items
 */
export function byDay(items) {
  /** @type {{ day: string, items: NoteItem[] }[]} */
  const out = [];
  const fmt = (/** @type {number} */ t) => new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  for (const i of [...items].sort((a, b) => b.t - a.t)) {
    const day = fmt(i.t);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(i);
    else out.push({ day, items: [i] });
  }
  return out;
}
