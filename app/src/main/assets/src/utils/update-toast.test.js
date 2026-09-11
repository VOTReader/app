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
vi.mock('./build-version.js', () => ({
  getBuildVersion: vi.fn(async () => SW_VERSION.value),
  fetchServerBuildVersion: vi.fn(async () => APK_VERSION.value),
}));
vi.mock('./toast.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, showToast: vi.fn(real.showToast) };
});

import { showToast } from './toast.js';
import { announceUpdateIfAny, LAST_SEEN_BUILD_KEY, UPDATED_TOAST_ID, UPDATED_TOAST_TEXT } from './update-toast.js';
import { LS_SKIP_LIST } from '../stores/cached-store.js';

const OLD = 'v1.0.2-aaaaaaaaaa', NEW = 'v1.0.2-bbbbbbbbbb';

describe('announceUpdateIfAny — one toast per new build, on any screen', () => {
  beforeEach(() => {
    localStorage.clear();
    SW_VERSION.value = { cacheVersion: NEW, corpusVersion: 'c45' };
    APK_VERSION.value = null;
    vi.stubGlobal('PlatformBridge', { isAndroid: false });
    vi.mocked(showToast).mockClear();
    const stale = document.getElementById(UPDATED_TOAST_ID);
    if (stale) stale.remove();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

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
    vi.stubGlobal('PlatformBridge', { isAndroid: true });
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
