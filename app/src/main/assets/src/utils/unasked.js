/* ═══════════════════════════════════════════════════════════════════════
   unasked — the one gate for what the app says without being asked
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-11-27: "Make sure new users aren't bombarded with info, only
   what is essential to use the app." The rule (lanes/hub/out/newcomer/ORDER.md):
   after the welcome, the app speaks unasked at most once per session, only at a
   pause (Home, or the end of a reading), never over the text, never in the
   session the welcome ran in, and never before the first finished reading.
   One ask at a time: install, the tip and the plan offer never stack or follow
   each other in one session.

   Every unasked surface asks here before it shows:
     install   the install popup (ui/components/InstallCard.jsx InstallPopup), Home only
     tip       the one press-and-hold line at a finished reading's end
     plan      "Start a reading plan" on Home's up-next card
   Two answer something and are not held back, but each still takes the session,
   so nothing else follows it:
     safari-save   "Before you start saving" (SafariFlows.jsx): it answers the reader's own first save
     whats-new     "Updated · What's new" (utils/update-toast.js): Corbin 09-10, "no matter what screen"
   When more than one is due, the earlier in WAIT_ORDER goes first and the rest wait for a later session:
   a surface that is due says so with want(), and a later one does not take the session from it.

   A session is this page load. Nothing is counted or stored here: what has been read is the read marks the reader
   keeps, a "later day" is the dates already on the reading history, and the rest lives on the window for this
   page load only (one slot, shared by every bundle's copy of this module). No usage statistics (Corbin 09-25).
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {'install' | 'tip' | 'plan' | 'safari-save' | 'whats-new'} UnaskedKind */

/** The surfaces held to the pause rule, the first-due first. */
export const WAIT_ORDER = /** @type {const} */ (['install', 'tip', 'plan']);
/** The surfaces that answer something: never held back, but they take the session. */
export const ANSWERS = /** @type {const} */ (['safari-save', 'whats-new']);

/** @returns {{ spoke: string | null, firstRun: boolean, wanting: Set<string>, subs: Set<() => void>, version: number }} */
function _slot() {
  const g = /** @type {any} */ (globalThis);
  if (!g.__votUnasked) g.__votUnasked = { spoke: null, firstRun: false, wanting: new Set(), subs: new Set(), version: 0 };
  return g.__votUnasked;
}
function _notify() {
  const s = _slot();
  s.version++;
  s.subs.forEach((f) => { try { f(); } catch (_e) { /* a listener's bug is its own */ } });
}

/**
 * The decision itself, pure.
 * @param {string} kind
 * @param {{ spoke: string | null, firstRun: boolean, pause: boolean, finished: number, wanting?: Iterable<string> }} ctx
 * @returns {boolean}
 */
export function mayShow(kind, ctx) {
  if (/** @type {readonly string[]} */ (ANSWERS).includes(kind)) return true;   // never held back (note() takes the session)
  if (ctx.spoke) return ctx.spoke === kind;                  // one a session; the one that spoke keeps its place
  const rank = /** @type {readonly string[]} */ (WAIT_ORDER).indexOf(kind);
  if (rank < 0) return false;                                // a surface nobody listed does not speak
  if (ctx.firstRun || !ctx.pause || ctx.finished < 1) return false;
  for (const w of ctx.wanting || []) {
    const r = /** @type {readonly string[]} */ (WAIT_ORDER).indexOf(w);
    if (r >= 0 && r < rank) return false;                    // an earlier one is due: it goes first
  }
  return true;
}

/** How many readings the reader has finished: the read marks they keep. */
export function finishedReadings() {
  const g = /** @type {any} */ (globalThis);
  try {
    const s = g.StateStore && g.StateStore.get();
    return s && s.readItems ? Object.keys(s.readItems).length : 0;
  } catch (_e) { return 0; }
}

/**
 * Whether the reader read here on an earlier day than today: the reading history's own dates.
 * @param {number} [now]
 */
export function readOnEarlierDay(now = Date.now()) {
  const g = /** @type {any} */ (globalThis);
  try {
    const list = g.HistoryStore && typeof g.HistoryStore.list === 'function' ? g.HistoryStore.list() : [];
    const d = new Date(now);
    const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Array.isArray(list) && list.some((e) => e && typeof e.ts === 'number' && e.ts > 0 && e.ts < today);
  } catch (_e) { return false; }
}

/** The welcome ran in this page load: nothing unasked follows it until the next session. */
export function markFirstRunSession() { _slot().firstRun = true; _notify(); }
export function isFirstRunSession() { return _slot().firstRun; }
/** @returns {string | null} what spoke this session */
export function spokeThisSession() { return _slot().spoke; }

/**
 * A surface says it is due (or no longer is), so a later one in WAIT_ORDER waits for it.
 * @param {string} kind @param {boolean} on
 */
export function want(kind, on) {
  const w = _slot().wanting;
  if (on === w.has(kind)) return;
  if (on) w.add(kind); else w.delete(kind);
  _notify();
}

/**
 * Whether `kind` may show now, from the live state. `where.finished`: a reading the caller knows is finished that the
 * stored read marks may not hold yet (a mark is on screen at once and written a moment later).
 * @param {string} kind @param {{ pause: boolean, finished?: number }} where
 */
export function canShow(kind, where) {
  const s = _slot();
  // The tip is due from the session's start, not only at a reading's end, so the plan offer waits for it.
  const wanting = tipDue() && kind !== 'tip' ? [...s.wanting, 'tip'] : s.wanting;
  return mayShow(kind, { spoke: s.spoke, firstRun: s.firstRun, pause: where.pause, finished: Math.max(finishedReadings(), where.finished || 0), wanting });
}

/**
 * Take the session for `kind` if it may show; true when it is `kind`'s to show.
 * @param {string} kind @param {{ pause: boolean, finished?: number }} where
 */
export function claim(kind, where) {
  const s = _slot();
  if (!canShow(kind, where)) return false;
  if (s.spoke !== kind) { s.spoke = kind; s.wanting.delete(kind); _notify(); }
  return true;
}

/**
 * An answering surface (ANSWERS) showed: the session is taken, unless something spoke before it.
 * @param {string} kind
 */
export function note(kind) {
  const s = _slot();
  if (s.spoke) return;
  s.spoke = kind;
  _notify();
}

/**
 * The tip is due: the reader never took the tour and has not yet highlighted, noted or bookmarked anything, nor
 * said "Got it" to the tip (here or in the More menu). Read from the stores the app already keeps.
 */
export function tipDue() {
  const g = /** @type {any} */ (globalThis);
  try {
    if (!g.TourDoneFlagStore || g.TourDoneFlagStore.is()) return false;
    if (!g.AnnHintDismissedFlagStore || g.AnnHintDismissedFlagStore.is()) return false;
    if (!g.AnnotationStore || !g.NoteStore || !g.BookmarkStore) return false;
    return !(Object.keys(g.AnnotationStore.all() || {}).length > 0 || g.NoteStore.count() > 0 || g.BookmarkStore.count() > 0);
  } catch (_e) { return false; }
}

/** @param {() => void} fn */
export function subscribeUnasked(fn) { const subs = _slot().subs; subs.add(fn); return () => { subs.delete(fn); }; }
export function unaskedVersion() { return _slot().version; }

/** Tests only. */
export function _resetUnasked() { const g = /** @type {any} */ (globalThis); delete g.__votUnasked; }
