/* ═════════════════════════════════════════════════
   update-toast — "VOTReader was just updated." once per new build
   ═════════════════════════════════════════════════
   Corbin (2026-09-10): "add a brief toast that indicates when a update just
   happened" and "toast and update should happen no matter what screen user
   happens to be on".

   HOW IT KNOWS. The build's identity is CACHE_VERSION, which no bundle can
   carry (it is a hash over the bundles — see build-version.js). On the web
   the controlling service worker answers GET_VERSION; inside the Android
   WebView there is no service worker, and the APK's own service-worker.js is
   read by the same fetch Settings already uses for its App version row — so
   both platforms answer with the same string for the same build. An
   UNCONTROLLED web page (a first visit: the worker is still installing)
   fetched every byte from the network moments ago, so the server's
   service-worker.js is its own build too, and it is read the Android way; a
   controlled page whose worker does not answer stays unknown, because the
   server may be ahead of the cache that page runs from. One localStorage key
   remembers the last build this profile saw.

   THE THREE ANSWERS, and only one of them is a toast:
     unknown  — the version could not be read. NOTHING is written and nothing
                is shown: a null must never impersonate a value, and writing
                it would turn the next real read into a false "updated".
     first    — nothing stored. Store silently; there is nothing to compare
                against, so there is nothing to announce. (91 toasted here for
                a USED profile, reading absence as "crossed from a build older
                than this key"; retired 2026-09-11 — the 89 → 90 silence it was
                cut against was a sibling document writing the key first, and
                absence is ambiguous: a kill inside localStorage's first commit
                window leaves a used profile with no key on the SAME build. The
                web crossing rides the reload flag; Android crosses from a
                pre-key build silently once and the key carries the rest.)
     same     — stored equals running. Nothing to say.
     shown    — stored differs: the profile has just moved builds. Say so,
                briefly, on whatever screen the reader is on (showToast mounts
                on document.body, above every screen and sheet), then store.
     reloading — this page has already begun its update reload (sw-register's
                takeover flag: the early claim reloads AT registration, four
                lines before this runs). Nothing is ours to decide: the reload
                flag is the NEXT document's, and the key path would ask the NEW
                worker and write the key and a toast into a page being torn
                down — the document that follows would then read 'same'.

   WHERE IT RUNS: once, from bundle-b's entry right after the service worker
   registers, before any screen has an opinion. On the web that is the boot
   after sw-register's controllerchange reload; on Android it is the next cold
   start with a new APK, whatever screen it restores to.

   THE RELOAD FLAG (w-toast-reload-flag, 2026-09-11). On the web the decision is
   the document's, not the profile's: sw-register's doReload() sets a
   sessionStorage flag before location.reload(), and the document that follows
   toasts on it whatever the key says (a sibling document of the origin that
   crossed first has already advanced the key; a silent worker cannot withhold
   it). The key stays as bookkeeping for Android's cold start and for the 'same'
   read of a plain boot.

   "TAP TO CONTINUE LISTENING." (Corbin, 2026-09-10). After the web's self-reload
   the audio player tries to resume the recording it was playing; when the
   browser refuses (autoplay policy — a fresh document has no gesture), the
   update toast carries the tap instead. The player lives in bundle-d and
   cannot import this module, so it reaches offerListeningResume through
   window.__votUpdateToastResume. The two events can land in EITHER order —
   the announcer may still be waiting on GET_VERSION when play() is refused —
   and the reader must see one toast with one text, so a pending offer is
   folded into the announcement, and an offer after the announcement rewrites
   the toast in place. Without a new build there is no update toast to ride,
   and the offer shows nothing: the bar's own Play button is the way then.
   ═════════════════════════════════════════════════ */
import { PlatformBridge } from './platform-bridge.js';
import { getBuildVersion, fetchServerBuildVersion } from './build-version.js';
import { showToast, hideToast } from './toast.js';

/** localStorage key. Listed in cached-store.js's LS_SKIP_LIST so the one-time
 *  vot-* sweep leaves it alone. */
export const LAST_SEEN_BUILD_KEY = 'vot-last-seen-build';
/** sessionStorage flag: "this document was reloaded for an update". Set by
 *  sw-register's doReload() one call before location.reload() (markUpdateReload),
 *  read and cleared by the announcer below (takeUpdateReload). Per document:
 *  sessionStorage is the tab's own and survives its reload, so a sibling document
 *  of the origin cannot spend it and a process kill cannot lose it the way it
 *  loses a localStorage commit. */
export const UPDATE_RELOAD_FLAG = 'vot-update-reload';

/** The reload is ours: say so to the document that follows. */
export function markUpdateReload() {
  try { sessionStorage.setItem(UPDATE_RELOAD_FLAG, '1'); } catch (_e) { /* no sessionStorage: the key path below still decides */ }
}
/** Whether this document was reloaded for an update — consumed on the read. */
function takeUpdateReload() {
  try {
    const v = sessionStorage.getItem(UPDATE_RELOAD_FLAG);
    if (v !== null) sessionStorage.removeItem(UPDATE_RELOAD_FLAG);
    return v !== null;
  } catch (_e) { return false; }
}
export const UPDATED_TOAST_ID = 'vot-toast-updated';
export const UPDATED_TOAST_TEXT = 'VOTReader was just updated.';
export const UPDATED_TOAST_LISTEN_TEXT = 'VOTReader was just updated. Tap to continue listening.';
export const UPDATED_TOAST_MS = 4000;
/** The tap-toast stays longer: it carries an action, and the bar's Play button
 *  remains after it goes. */
export const UPDATED_TOAST_LISTEN_MS = 8000;

/** @type {(() => void) | null} the resume the player asked us to carry */
let pendingResume = null;
/** true from the moment this boot's announcement was shown */
let announced = false;

/** @param {() => void} onTap */
function showListeningToast(onTap) {
  showToast({ id: UPDATED_TOAST_ID, className: 'vot-toast', text: UPDATED_TOAST_LISTEN_TEXT, durationMs: UPDATED_TOAST_LISTEN_MS });
  const el = document.getElementById(UPDATED_TOAST_ID);
  if (!el) return;
  // .vot-toast is pointer-events:none (app.css): a toast is not a target. This one
  // is, so it opts in with .vot-toast-action — added HERE, because showToast sets
  // className only when it creates the element and the announcer may have
  // created this one already. Without it the tap falls through to whatever is
  // under the toast (the walk's click did, under the phone's autoplay policy).
  el.classList.add('vot-toast-action');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  const tap = () => { hideToast(UPDATED_TOAST_ID); onTap(); };
  el.addEventListener('click', tap, { once: true });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } }, { once: true });
}

/**
 * The audio player's door: "the browser refused to resume; put the tap on the
 * update toast". Shown now if the announcement is up, folded into it if it is
 * still coming, dropped if this boot announced nothing.
 * @param {() => void} onTap
 */
export function offerListeningResume(onTap) {
  if (typeof onTap !== 'function') return;
  if (announced) { showListeningToast(onTap); return; }
  pendingResume = onTap;
}
/** Tests only: one boot per module in the app, many per module in a test file. */
export function _resetUpdateToast() { pendingResume = null; announced = false; }
if (typeof window !== 'undefined') /** @type {any} */ (window).__votUpdateToastResume = offerListeningResume;

/** The build this page is running, or null when nobody can say. Web: the
 *  controlling service worker. Android, and an UNCONTROLLED web page (which
 *  came from the network, so the server's file is its own build): the
 *  deployed service-worker.js — the same two calls Settings' App version row
 *  makes, in the same order. A controlled page whose worker is silent stays
 *  null: it runs from a cache the server may be ahead of. */
async function runningBuild() {
  const sw = await getBuildVersion();
  if (sw && sw.cacheVersion) return sw.cacheVersion;
  if (!PlatformBridge.isAndroid && controlled()) return null;
  const file = await fetchServerBuildVersion();
  return file && file.cacheVersion ? file.cacheVersion : null;
}

/** Whether a service worker controls this page (jsdom and a first visit: no). */
function controlled() {
  try { return !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (_e) { return false; }
}

/**
 * Compare the running build with the last one this profile saw; announce a
 * change once. Resolves to which of the four answers it took, for tests and
 * for anyone reading a boot log.
 * @returns {Promise<'unknown'|'first'|'same'|'shown'|'reloading'>}
 */
export async function announceUpdateIfAny() {
  if (typeof window !== 'undefined' && /** @type {any} */ (window).__votSwTookOver) return 'reloading';   // see the header: not ours to decide
  if (takeUpdateReload()) {
    // THE RELOAD IS THE EVIDENCE (w-toast-reload-flag, 2026-09-11). sw-register reloaded
    // THIS document onto a new worker and said so in the tab's own sessionStorage before
    // calling reload(). Toast on that, now, whatever the key says: the key is a PROFILE
    // fact, and on the live 90 → 91 crossing a sibling document of the origin crossed
    // first and advanced it, so the document the reader was looking at read 'same' and
    // stayed silent. A silent worker cannot withhold the toast either. The key is then
    // bookkeeping — Android's cold start and the 'same' read below — written when the
    // build is known and left alone when it is not (a null is not a value).
    const out = announce();
    const running = await runningBuild();
    if (running) { try { localStorage.setItem(LAST_SEEN_BUILD_KEY, running); } catch (_e) { /* private mode */ } }
    return out;
  }
  const running = await runningBuild();
  if (!running) return 'unknown';
  let seen = null;
  try { seen = localStorage.getItem(LAST_SEEN_BUILD_KEY); } catch (_e) { seen = null; }
  if (seen === running) return 'same';
  try { localStorage.setItem(LAST_SEEN_BUILD_KEY, running); } catch (_e) { /* private mode: announce anyway, next boot repeats */ }
  if (seen == null) return 'first';
  return announce();
}

/** Show the one announcement of this boot: the listening offer if the player already
 *  asked for the tap, the plain toast otherwise. */
function announce() {
  announced = true;
  const resume = pendingResume;
  pendingResume = null;
  if (resume) showListeningToast(resume);
  else showToast({ id: UPDATED_TOAST_ID, className: 'vot-toast', text: UPDATED_TOAST_TEXT, durationMs: UPDATED_TOAST_MS });
  return /** @type {'shown'} */ ('shown');
}
