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
   both platforms answer with the same string for the same build. One
   localStorage key remembers the last build this profile saw.

   THE THREE ANSWERS, and only one of them is a toast:
     unknown  — the version could not be read. NOTHING is written and nothing
                is shown: a null must never impersonate a value, and writing
                it would turn the next real read into a false "updated".
     first    — nothing stored yet (first ever boot, or the one-time vot-*
                sweep ran before us). Store silently; there is nothing to
                compare against, so there is nothing to announce.
     same     — stored equals running. Nothing to say.
     shown    — stored differs: the profile has just moved builds. Say so,
                briefly, on whatever screen the reader is on (showToast mounts
                on document.body, above every screen and sheet), then store.

   WHERE IT RUNS: once, from bundle-b's entry right after the service worker
   registers, before any screen has an opinion. On the web that is the boot
   after sw-register's controllerchange reload; on Android it is the next cold
   start with a new APK, whatever screen it restores to.
   ═════════════════════════════════════════════════ */
import { PlatformBridge } from './platform-bridge.js';
import { getBuildVersion, fetchServerBuildVersion } from './build-version.js';
import { showToast } from './toast.js';

/** localStorage key. Listed in cached-store.js's LS_SKIP_LIST so the one-time
 *  vot-* sweep leaves it alone. */
export const LAST_SEEN_BUILD_KEY = 'vot-last-seen-build';
export const UPDATED_TOAST_ID = 'vot-toast-updated';
export const UPDATED_TOAST_TEXT = 'VOTReader was just updated.';
export const UPDATED_TOAST_MS = 4000;

/** The build this page is running, or null when nobody can say. Web: the
 *  controlling service worker. Android: the APK's own service-worker.js — the
 *  same two calls Settings' App version row makes, in the same order. */
async function runningBuild() {
  const sw = await getBuildVersion();
  if (sw && sw.cacheVersion) return sw.cacheVersion;
  if (!PlatformBridge.isAndroid) return null;
  const apk = await fetchServerBuildVersion();
  return apk && apk.cacheVersion ? apk.cacheVersion : null;
}

/**
 * Compare the running build with the last one this profile saw; announce a
 * change once. Resolves to which of the four answers it took, for tests and
 * for anyone reading a boot log.
 * @returns {Promise<'unknown'|'first'|'same'|'shown'>}
 */
export async function announceUpdateIfAny() {
  const running = await runningBuild();
  if (!running) return 'unknown';
  let seen = null;
  try { seen = localStorage.getItem(LAST_SEEN_BUILD_KEY); } catch (_e) { seen = null; }
  if (seen === running) return 'same';
  try { localStorage.setItem(LAST_SEEN_BUILD_KEY, running); } catch (_e) { /* private mode: announce anyway, next boot repeats */ }
  if (seen == null) return 'first';
  showToast({ id: UPDATED_TOAST_ID, className: 'vot-toast', text: UPDATED_TOAST_TEXT, durationMs: UPDATED_TOAST_MS });
  return 'shown';
}
