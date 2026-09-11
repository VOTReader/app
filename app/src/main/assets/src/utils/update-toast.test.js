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
import { announceUpdateIfAny, offerListeningResume, _resetUpdateToast, LAST_SEEN_BUILD_KEY, UPDATED_TOAST_ID, UPDATED_TOAST_TEXT, UPDATED_TOAST_LISTEN_TEXT } from './update-toast.js';
import { LS_SKIP_LIST } from '../stores/cached-store.js';

const OLD = 'v1.0.2-aaaaaaaaaa', NEW = 'v1.0.2-bbbbbbbbbb';

describe('announceUpdateIfAny — one toast per new build, on any screen', () => {
  beforeEach(() => {
    localStorage.clear();
    SW_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    APK_VERSION.value = null;
    BRIDGE.isAndroid = false;
    vi.mocked(showToast).mockClear();
    const stale = document.getElementById(UPDATED_TOAST_ID);
    if (stale) stale.remove();
  });
  afterEach(() => { BRIDGE.isAndroid = false; });

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

  it('a stored EQUAL build shows nothing', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, NEW);
    expect(await announceUpdateIfAny()).toBe('same');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('the first ever boot stores silently — nothing to compare, nothing to announce', async () => {
    expect(await announceUpdateIfAny()).toBe('first');
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_BUILD_KEY)).toBe(NEW);
  });

  it('an UNKNOWN version writes nothing and shows nothing — a null must never impersonate a value', async () => {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    SW_VERSION.value = null;              // web, uncontrolled or an old SW that never answers
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

  it('web with no service worker answer does NOT read the deployed file as its own build', async () => {
    // Off Android an uncontrolled page is a first visit; the server's
    // service-worker.js says what is PUBLISHED, not what this page runs.
    SW_VERSION.value = null;
    APK_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    localStorage.setItem(LAST_SEEN_BUILD_KEY, OLD);
    expect(await announceUpdateIfAny()).toBe('unknown');
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
