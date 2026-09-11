// @ts-nocheck
/* RED for Corbin's update toast: "add a brief toast that indicates when a
 * update just happened" — "toast and update should happen no matter what
 * screen user happens to be on".
 *
 * Four answers, three of them silent. The one that matters most is the one
 * nobody asked for: an UNKNOWN version writes nothing and shows nothing,
 * because a null that overwrote the stored build would make the next real
 * read a false "updated" (a null must never impersonate a value).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SW_VERSION = { value: null };
const APK_VERSION = { value: null };
/* The bridge is a MODULE export (utils/platform-bridge.js), never a global: the
   app has no window.PlatformBridge, so a module that read one would take the web
   arm on every Android boot and never show the toast there. The getter reads the
   holder at call time, the same lazy shape as SW_VERSION above (vi.mock hoists). */
const BRIDGE = { isAndroid: false };
vi.mock('./platform-bridge.js', () => ({ PlatformBridge: { get isAndroid() { return BRIDGE.isAndroid; } } }));
vi.mock('./build-version.js', () => ({
  getBuildVersion: vi.fn(async () => SW_VERSION.value),
  fetchServerBuildVersion: vi.fn(async () => APK_VERSION.value),
}));
vi.mock('./toast.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, showToast: vi.fn(real.showToast) };
});

import { showToast } from './toast.js';
import { announceUpdateIfAny, offerListeningResume, markUpdateReload, _resetUpdateToast, LAST_SEEN_BUILD_KEY, UPDATE_RELOAD_FLAG, UPDATED_TOAST_ID, UPDATED_TOAST_TEXT, UPDATED_TOAST_LISTEN_TEXT } from './update-toast.js';
import { LS_SKIP_LIST } from '../stores/cached-store.js';

const OLD = 'v1.0.2-aaaaaaaaaa', NEW = 'v1.0.2-bbbbbbbbbb', NEWER = 'v1.0.2-cccccccccc';

describe('announceUpdateIfAny — one toast per new build, on any screen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    SW_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    APK_VERSION.value = null;
    BRIDGE.isAndroid = false;
    vi.mocked(showToast).mockClear();
    const stale = document.getElementById(UPDATED_TOAST_ID);
    if (stale) stale.remove();
  });
  afterEach(() => { BRIDGE.isAndroid = false; uncontrol(); });

  /* jsdom has no navigator.serviceWorker at all, which IS the uncontrolled web page
     (a first visit). A CONTROLLED page is stubbed on: the announcer reads only
     `.controller`, and the SW's answer itself comes through the mocked getBuildVersion. */
  const control = () => Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
  const uncontrol = () => { try { delete /** @type {any} */ (navigator).serviceWorker; } catch (_e) { /* not stubbed */ } };

  it('a stored OLDER build shows the toast once and stores the new build', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(showToast).mock.calls[0][0];
    expect(opts.text).toBe('VOTReader was just updated.');
    expect(opts.durationMs).toBeGreaterThanOrEqual(3000);
    expect(opts.durationMs).toBeLessThanOrEqual(5000);
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
    // Once: a second boot on the same build is silent.
    expect(await announceUpdateIfAny()).toBe('same');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  /* THE RELOAD FLAG (w-toast-reload-flag, 2026-09-11). The live 90 → 91 crossing: the reloaded
     document read the OLD build in the key before any of its scripts ran and the NEW build
     540 ms later with no write of its own — a sibling document of the origin had crossed first
     and advanced the key — so it took 'same' and stayed silent. The key is a PROFILE fact; the
     reload is a DOCUMENT fact: sw-register's doReload() sets a sessionStorage flag before
     location.reload(), and the document that follows toasts on it, whatever the key says. */
  it('a document reloaded for an update toasts on the flag even when a sibling already advanced the key', async () => {
    control();
    markUpdateReload();                                        // what doReload() does before location.reload()
    expect(sessionStorage.getItem(UPDATE_RELOAD_FLAG), 'the flag is written').not.toBeNull();
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);           // the sibling got there first
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.getElementById(UPDATED_TOAST_ID).textContent).toBe(UPDATED_TOAST_TEXT);
    expect(sessionStorage.getItem(UPDATE_RELOAD_FLAG), 'consumed: the next document in this tab decides for itself').toBeNull();
    expect(await announceUpdateIfAny(), 'control: the same document asked again has no flag and the key agrees').toBe('same');
  });

  it('reloaded for an update: the key follows when the build is known', async () => {
    control();
    markUpdateReload();
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
  });

  it('reloaded for an update but the worker is silent: the toast still shows and the key is left alone — a null is not a value', async () => {
    control();
    SW_VERSION.value = null;
    markUpdateReload();
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(OLD);
  });

  it('the listening offer rides the flag path: one toast, carrying the tap', async () => {
    control();
    markUpdateReload();
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);
    const onTap = vi.fn();
    offerListeningResume(onTap);
    expect(await announceUpdateIfAny()).toBe('shown');
    const el = document.getElementById(UPDATED_TOAST_ID);
    expect(el.textContent).toBe(UPDATED_TOAST_LISTEN_TEXT);
    expect(el.classList.contains('vot-toast-action')).toBe(true);
    el.click();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('a plain reload of the same build (no flag) shows nothing — the flag is set by doReload() alone', async () => {
    control();
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);
    expect(await announceUpdateIfAny()).toBe('same');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a stored EQUAL build shows nothing', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);
    expect(await announceUpdateIfAny()).toBe('same');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('the first ever boot stores silently — nothing to compare, nothing to announce', async () => {
    expect(localStorage.length, 'precondition: a FRESH profile — nothing of the app\'s in storage').toBe(0);
    expect(await announceUpdateIfAny()).toBe('first');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
  });

  it('a USED profile with no stored build has just crossed from a build older than this key: the plain toast, once', async () => {
    /* The first update INTO the build that introduced the key. The old page never
       wrote vot-last-seen-build (it had no announcer), so "nothing stored" is not
       "nothing to compare": the profile has a history and a build it was on. The
       one thing every used profile carries in localStorage is the vot-state shim
       (index.html reads theme + fontStyle + fontScale from it before React mounts),
       written by usePersistedState on every state flush. The old page also never
       fired vot:before-update-reload, so the exact clock cannot ride this crossing:
       the PLAIN toast, never the listening offer. */
    localStorage.setItem('vot-state', JSON.stringify({ theme: 'dark', settings: { fontStyle: 'classic' } }));
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][0].text).toBe(UPDATED_TOAST_TEXT);
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
    // the second update on the same profile: the key path, exactly as before
    _resetUpdateToast(); vi.mocked(showToast).mockClear();
    SW_VERSION.value = { cacheVersion: NEWER, corpusVersion: 'c45' };
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEWER);
    vi.mocked(showToast).mockClear();
    expect(await announceUpdateIfAny(), 'the same build again: nothing').toBe('same');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a used profile with no stored build and an UNKNOWN version: still nothing written, nothing shown', async () => {
    // The history rule sits BEHIND the unknown arm: with no build to compare against,
    // a history is not an update either.
    localStorage.setItem('vot-state', '{"theme":"dark"}');
    control(); SW_VERSION.value = null;
    expect(await announceUpdateIfAny()).toBe('unknown');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBeNull();
  });

  it('an UNKNOWN version writes nothing and shows nothing — a null must never impersonate a value', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    control(); SW_VERSION.value = null;   // web, controlled by an old SW that never answers
    expect(await announceUpdateIfAny()).toBe('unknown');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(OLD);   // untouched
  });

  it('Android: no service worker, so the APK\'s own service-worker.js is the build', async () => {
    BRIDGE.isAndroid = true;
    SW_VERSION.value = null;
    APK_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
  });

  it('web, CONTROLLED but the worker is silent: the deployed file is NOT this page\'s build', async () => {
    // A controlled page runs whatever its worker cached; the server's
    // service-worker.js says what is PUBLISHED, which may be ahead of that.
    control(); SW_VERSION.value = null;
    APK_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('unknown');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(OLD);
  });

  it('web, UNCONTROLLED (a first visit fetched every byte from the network): the deployed file IS this page\'s build', async () => {
    /* Boot 1 of a fresh profile has no controller yet — the worker is installing — so
       the SW cannot answer, and the page came from the network moments ago, so the
       server's service-worker.js is its own build. It must be REMEMBERED here: a fresh
       profile that recorded nothing at boot 1 would arrive at boot 2 (controlled, the
       SW answering) as "a used profile with no stored build" and toast a brand-new
       reader about an update that never happened. */
    expect(navigator.serviceWorker, 'precondition: uncontrolled').toBeUndefined();
    SW_VERSION.value = null;
    APK_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    expect(await announceUpdateIfAny()).toBe('first');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
    // boot 2: controlled, the worker answers the same build; the profile is used by now
    localStorage.setItem('vot-state', '{"theme":"dark"}');
    control(); SW_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' }; APK_VERSION.value = null;
    expect(await announceUpdateIfAny()).toBe('same');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('mounts on document.body — the root layer above every screen and sheet — while a non-Home screen is up', async () => {
    // Whatever is on screen, the toast is not inside it. A Settings screen
    // stands in for "any screen"; the announcer never looks at it.
    const screen = document.createElement('div');
    screen.className = 'screen settings-screen';
    screen.setAttribute('data-screen', 'settings');
    document.body.appendChild(screen);
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    const el = document.getElementById(UPDATED_TOAST_ID);
    expect(el).not.toBeNull();
    expect(el.parentElement).toBe(document.body);
    expect(el.textContent).toBe(UPDATED_TOAST_TEXT);
    expect(screen.contains(el)).toBe(false);
    screen.remove();
  });

  it('is wired at boot, unconditionally, right after the service worker registers (bundle-b entry)', () => {
    const entry = fs.readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../stores/_entry-b.js'), 'utf8');
    const lines = entry.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    const i = lines.indexOf('registerServiceWorker();');
    const j = lines.indexOf('announceUpdateIfAny();');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // Nothing conditional stands between the two top-level calls.
    expect(lines.slice(i + 1, j).filter((l) => /^(if|else|switch|try)\b|^\}/.test(l))).toEqual([]);
  });

  it('its localStorage key survives the one-time vot-* sweep (LS_SKIP_LIST)', () => {
    expect(LS_SKIP_LIST).toContain(LAST_SEEN_BUILD_KEY);
  });
});

/* ── "Tap to continue listening." (Corbin, 2026-09-10) ──
   When the browser refuses the resume after the update's reload, the update toast
   carries the tap. The audio player (bundle-d) reaches this through
   window.__votUpdateToastResume; the two can arrive in either order — the announcer
   may still be waiting on GET_VERSION when the player learns play() was refused —
   and the text must be the same either way, with no flicker between the two. */
describe('offerListeningResume — the update toast carries the tap', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    SW_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    vi.mocked(showToast).mockClear();
    _resetUpdateToast();
    const stale = document.getElementById(UPDATED_TOAST_ID);
    if (stale) stale.remove();
  });

  it('after the announcer showed the toast: the text gains the tap, one tap calls back once and closes it', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('shown');
    const onTap = vi.fn();
    offerListeningResume(onTap);
    const el = document.getElementById(UPDATED_TOAST_ID);
    expect(el).not.toBeNull();
    expect(el.textContent).toBe(UPDATED_TOAST_LISTEN_TEXT);
    expect(UPDATED_TOAST_LISTEN_TEXT).toBe('VOTReader was just updated. Tap to continue listening.');
    expect(el.getAttribute('role')).toBe('button');
    /* app.css: .vot-toast is pointer-events:none (a toast is not a target). A toast that IS the
       target opts in with .vot-toast-action (the export-escape precedent), and showToast sets
       className only when it CREATES the element: the announcer created this one, so the class
       has to be added to the element, not passed. Measured (walk r5, refused policy): the click
       fell through the toast and "sound never came back"; this unit test had passed by calling
       the offer's callback directly. jsdom cannot see the stylesheet, so the class is the
       witness here and app-css.test.js pins the rule it names. */
    expect(el.classList.contains('vot-toast-action'), 'the tap toast must be hittable: .vot-toast alone is pointer-events:none').toBe(true);
    el.click();
    expect(onTap).toHaveBeenCalledTimes(1);
    el.click();
    expect(onTap, 'one offer, one tap').toHaveBeenCalledTimes(1);
    // toast.js keeps one element per id and hides it by class (hideToast); "closed" is that.
    expect(el.classList.contains('show'), 'the toast closes on the tap').toBe(false);
  });

  it('offered BEFORE the announcer decides: the toast appears once, already carrying the tap', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    const onTap = vi.fn();
    offerListeningResume(onTap);
    expect(document.getElementById(UPDATED_TOAST_ID), 'nothing to show yet — no new build known').toBeNull();
    expect(await announceUpdateIfAny()).toBe('shown');
    const el = document.getElementById(UPDATED_TOAST_ID);
    expect(el.textContent).toBe(UPDATED_TOAST_LISTEN_TEXT);
    expect(showToast, 'one toast, not a plain one replaced by a tap one').toHaveBeenCalledTimes(1);
    expect(el.classList.contains('vot-toast-action'), 'created by the offer itself: hittable on this path too').toBe(true);
    el.click();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('with no new build (same version) an offer shows nothing — the tap rides an update toast or not at all', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);
    offerListeningResume(vi.fn());
    expect(await announceUpdateIfAny()).toBe('same');
    expect(document.getElementById(UPDATED_TOAST_ID)).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('is published for bundle-d as window.__votUpdateToastResume (the player cannot import bundle-b)', () => {
    // Both sides typed first: `undefined toBe undefined` would pass with the export deleted
    // AND the publication gone — the bite that removes both must redden this case.
    expect(typeof offerListeningResume).toBe('function');
    expect(typeof window.__votUpdateToastResume).toBe('function');
    expect(window.__votUpdateToastResume).toBe(offerListeningResume);
  });
});
