// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* WHAT IT PINS: an Android reader can tell which build they are on.

   Moved from SettingsScreen.androidversion.test.jsx (WS4 settings, 2026-11-11): the version row left Settings →
   Your data for About VOTReader (X-hidden-decisions 6, st-data "version rows moved to About"). The four cases and
   their reasons are the Verifier's and the web builder's; only the place they read and About's shorter words
   changed (components/about-parts.jsx versionWords: title "Version 1.0.2", one verdict line, "Build … · corpus …").

   WHY. In a browser the version row reads CACHE_VERSION from the controlling service worker and compares it with
   a read-only probe of the deployed one, which separates "stale cache" from "never deployed". Inside the Android
   WebView there is no service worker to ask, so getBuildVersion() resolves null; versionCode is 1 for every APK
   ever built. The APK ships its own assets/service-worker.js, and under WebViewAssetLoader the relative
   './service-worker.js' that fetchServerBuildVersion() fetches resolves to the INSTALLED build's own copy, so the
   row can name the build with no native code. On 2026-09-05 the bench APK held v1.0.2-60a64a8486 / c45 while the
   web served a newer build, and nothing on the reader's screen could have said so. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { AboutScreen } from './AboutScreen.jsx';

/* The bench APK's real values, so a passing version of this test is also a regression test against that build. */
const APK = { cacheVersion: 'v1.0.2-60a64a8486', corpusVersion: 'c45' };
const KEYS = ['ScreenLayout', 'PlatformBridge', 'getBuildVersion', 'fetchServerBuildVersion'];

function setGlobals({ isAndroid = true, getBuildVersion } = {}) {
  globalThis.ScreenLayout = ({ children }) => <div data-testid="screen-layout">{children}</div>;
  globalThis.PlatformBridge = { isAndroid };
  // getBuildVersion ABSENT means no controlling service worker: the whole condition under test on Android.
  if (getBuildVersion) globalThis.getBuildVersion = getBuildVersion; else delete globalThis.getBuildVersion;
  globalThis.fetchServerBuildVersion = () => Promise.resolve({ ...APK });
}

beforeEach(() => setGlobals());
afterEach(() => { cleanup(); KEYS.forEach((k) => { delete globalThis[k]; }); });

/** About's version row and the build line under the group, as one string. */
async function versionText() {
  const { container } = render(<AboutScreen firstRun={false} onBack={() => {}} onContinue={() => {}} />);
  await act(async () => {});
  const row = container.querySelector('.ws3-version');
  expect(row).toBeTruthy();                                   // the row is really there to be read
  const build = container.querySelector('.ws3-about-build');
  return [row.querySelector('.ui-row-title').textContent, row.querySelector('.ui-row-meta').textContent,
    build ? build.textContent : ''].join(' | ');
}

describe('the version row on Android (About VOTReader)', () => {
  it('names the installed build instead of explaining that it cannot', async () => {
    const text = await versionText();
    // The precondition itself, asserted rather than assumed: without it the screen is on the browser path.
    expect(typeof globalThis.getBuildVersion).not.toBe('function');
    expect(text).toContain('Version 1.0.2');
    expect(text).toContain('60a64a8486');
    expect(text).toContain('c45');
    expect(text).not.toContain('Installed app build');
  });

  it('still says a web reader is current, so the Android branch does not eat the browser one', async () => {
    setGlobals({ isAndroid: false, getBuildVersion: () => Promise.resolve({ ...APK }) });
    const text = await versionText();
    expect(text).toContain('60a64a8486');
    expect(text).toContain('Up to date with the published version');
  });

  it('a BROWSER with no controlling service worker is still told that, not handed the server version', async () => {
    // Off Android an uncontrolled page is a first visit; './service-worker.js' describes the server, not this page.
    setGlobals({ isAndroid: false });
    const text = await versionText();
    expect(typeof globalThis.getBuildVersion).not.toBe('function');
    expect(text).toContain('Not yet kept offline on this device');
    expect(text).not.toContain('60a64a8486');                 // ...and no version was invented
  });

  it('says the build is the installed one, never that it could not reach a server it never needed', async () => {
    const text = await versionText();
    expect(text).toContain('Installed on this phone');
    expect(text).not.toContain('Could not reach the server');
    expect(text).not.toContain('Up to date with the published version');
    expect(text).not.toContain('An update is available');
  });
});
