// @ts-nocheck — the harness installs free-var globals for this screen
/* WHAT IT PINS: an Android reader can tell which build they are on.

   Written by the Verifier as a RED before the fix existed, and landed here
   verbatim — assertions untouched — with the fix in the commit above it. The
   "expected to FAIL on main" header it carried while parked is gone, because on
   this branch it passes and a header that says otherwise is a lie the next reader
   would act on. The BRANCH is still parked; that note lives with the branch.

   WHY. Settings → Your Data → "App version" answers the question completely
   in a browser: it reads CACHE_VERSION from the controlling service worker and
   compares it against a read-only probe of the deployed one, which is what
   separates "stale cache" from "never deployed" — the pair of situations that
   cost the owner several wrong fixes on 2026-08-11.

   Inside the Android WebView there is no service worker to ask (the APK
   bundles its own assets and registration is skipped), so getBuildVersion()
   resolves null, the row falls through to state 'no-sw', and it prints a
   sentence with no version in it. Android's own app-info screen is no help
   either: versionName = "1.0" / versionCode = 1 in app/build.gradle.kts are
   the same for every APK ever built. So an Android reader cannot name their
   build, and neither can anyone else without unzipping the artifact.

   That is not hypothetical. On 2026-09-05 the release APK on the bench held
   CACHE_VERSION v1.0.2-60a64a8486 and CORPUS_VERSION c45 while the web served
   v1.0.2-e71130b6f4 / c46 — 617 timed recordings against 729. Nothing on the
   reader's screen could have said so.

   THE PREMISE, MEASURED rather than reasoned: the installed launch APK
   (D:/VOTReader-build/launch-2026-09-05/app-release-INSTALLED-1453e303.apk)
   contains assets/service-worker.js carrying CACHE_VERSION v1.0.2-60a64a8486 and
   CORPUS_VERSION c45 — the exact pair asserted below — among 169 assets/ entries,
   with assets/index.html present as the control. So the file the fix fetches is
   really in the artifact, at the path WebViewAssetLoader serves.

   THE FIX THIS WAS RED AGAINST. The APK ships its own assets/service-worker.js,
   and under WebViewAssetLoader the page origin is
   https://appassets.androidplatform.net/assets/index.html — so the relative
   './service-worker.js' that fetchServerBuildVersion() already fetches
   resolves, on Android, to the INSTALLED build's own copy. The existing
   function and the existing regex (utils/build-version.js) answer the Android
   question with no native code, no BuildConfig field and no new bridge verb.
   Only the wording changes with the platform: on the web that file is what the
   SERVER has; on Android it is what the reader INSTALLED. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { cleanup, act } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings, row,
} from './settings-harness.jsx';

/* The bench APK's real values, so a passing version of this test is also a
   regression test against the exact build that prompted it. */
const APK = { cacheVersion: 'v1.0.2-60a64a8486', corpusVersion: 'c45' };

const androidGlobals = () => ({
  PlatformBridge: {
    isAndroid: true, setKeepScreenOn: () => {}, saveToFile: () => {},
    openFilePicker: () => {}, openExportSink: () => null, pickImportFile: () => null,
    clearGardenCache: () => {}, getCrashLog: () => '[]',
  },
  // getBuildVersion must be ABSENT: inside the WebView there is no controlling
  // service worker to ask, and that absence is the whole condition under test.
  // The harness installs a fake one at settings-harness.jsx:170 (testhash01 /
  // c99), so it has to be overwritten here, not merely left out — the first
  // version of this file "left it out" and the screen quietly took the browser
  // path, failing on the wrong assertion while reading as the right RED.
  getBuildVersion: undefined,
  fetchServerBuildVersion: () => Promise.resolve({ ...APK }),
  formatBuildVersion: (v) => {
    const m = /^(v[\d.]+)-([0-9a-f]+)$/.exec(v || '');
    return m ? `${m[1]} · ${m[2]}` : String(v || 'unknown');
  },
});

const valueOf = (label) => {
  const r = row(label);
  if (!r) return null;
  const v = r.querySelector('.settings-data-value');
  return v ? v.textContent.trim() : '';
};

beforeEach(() => {
  setupSettingsGlobals(androidGlobals());
  if (!window.matchMedia) {
    /** @type {any} */ (window).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('the App version row on Android', () => {
  it('names the installed build instead of explaining that it cannot', async () => {
    renderSettings();
    await act(async () => {});

    const text = valueOf('App version');

    // The control, and it is the load-bearing half: an assertion that the row
    // does NOT say "Installed app build" is satisfied by a row that renders
    // nothing at all. These two say the row is really there to be read, so the
    // absence assertion below is about its CONTENT.
    expect(row('App version')).toBeTruthy();
    expect(valueOf('Platform')).toBeTruthy();

    // The precondition itself, asserted rather than assumed: without this the
    // screen is on the browser path and every line below is about the wrong code.
    expect(typeof globalThis.getBuildVersion).not.toBe('function');
    expect(text).not.toContain('testhash01');

    expect(text).toContain('60a64a8486');
    expect(text).toContain('c45');
    expect(text).not.toContain('Installed app build');
  });

  it('still says a web reader is current, so the Android branch does not eat the browser one', async () => {
    // The same row on the web path: a controlling SW answers, the server probe
    // agrees, and the row must still say so. A fix that routes every platform
    // through fetchServerBuildVersion would pass the first case and break this
    // one, which is the realistic wrong shape of the change.
    teardownSettingsGlobals();
    setupSettingsGlobals({
      ...androidGlobals(),
      PlatformBridge: { ...androidGlobals().PlatformBridge, isAndroid: false },
      getBuildVersion: () => Promise.resolve({ ...APK }),
    });
    renderSettings();
    await act(async () => {});

    const text = valueOf('App version');
    expect(row('App version')).toBeTruthy();
    expect(text).toContain('60a64a8486');
    expect(text).toContain('up to date with the published version');
  });

  /* ADDED BY THE WEB BUILDER with the fix (the two cases above are the
     Verifier's, assertions untouched). The fix's fallback is gated on
     PlatformBridge.isAndroid, and nothing above pins that gate: both cases
     either have no controlling SW AND are Android, or have one. Without this
     third case, deleting `PlatformBridge.isAndroid &&` is a silent no-op in the
     suite — a guard nothing can fail is a guard nobody will keep. */
  it('a BROWSER with no controlling service worker is still told that, not handed the server version', async () => {
    // Off Android an uncontrolled page is a first visit, and './service-worker.js'
    // describes what the SERVER publishes rather than what this page is running.
    // Printing it would name a version the reader is not on and cannot act on.
    teardownSettingsGlobals();
    setupSettingsGlobals({
      ...androidGlobals(),
      PlatformBridge: { ...androidGlobals().PlatformBridge, isAndroid: false },
      // getBuildVersion stays undefined: no controlling service worker.
    });
    renderSettings();
    await act(async () => {});

    const text = valueOf('App version');
    expect(row('App version')).toBeTruthy();                 // the row is really there
    expect(typeof globalThis.getBuildVersion).not.toBe('function');
    expect(text).toContain('Not yet managed by the offline service worker');
    expect(text).not.toContain('60a64a8486');                // …and no version was invented
  });
});
