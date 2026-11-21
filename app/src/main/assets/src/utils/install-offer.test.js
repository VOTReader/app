/* ip1 — when and how to offer "install as an app" (utils/install-offer.js). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installFlow, shouldOffer, dismiss, seemsInstalled, markStandalone, SNOOZE_DAYS, attachInstallCapture, hasInstallPrompt, wasInstalled,
  subscribeInstall, promptInstall, _resetInstallCapture,
} from './install-offer.js';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  facebook: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0]',
  // Any other app's in-app browser built on the system Android WebView: the '; wv)' token, no app name.
  webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
  // A link tapped in Messenger opens in Messenger's own browser.
  messengerAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S901U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.0.0;]',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
  oldMacSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  messengerIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0.0;FBDV/iPhone15,2;FBSN/iOS;FBSV/18.5]',
};

describe('installFlow', () => {
  it('never inside the APK or an installed app', () => {
    expect(installFlow(UA.androidChrome, { isApk: true, hasPrompt: true })).toBeNull();
    expect(installFlow(UA.iphoneSafari, { standalone: true })).toBeNull();
  });
  it('a real Install button only when the browser handed over its prompt', () => {
    expect(installFlow(UA.androidChrome, { hasPrompt: true })).toBe('prompt');
    expect(installFlow(UA.winEdge, { hasPrompt: true })).toBe('prompt');
    expect(installFlow(UA.androidChrome, {})).toBe('android-chrome');
    expect(installFlow(UA.winChrome, {})).toBe('desktop');
    expect(installFlow(UA.winEdge, {})).toBe('desktop');
  });
  it('picture steps for Samsung Internet and iPhone Safari, iPad-as-Mac included', () => {
    expect(installFlow(UA.samsung, {})).toBe('samsung');
    expect(installFlow(UA.iphoneSafari, {})).toBe('ios-safari');
    expect(installFlow(UA.macSafari, { touchMac: true })).toBe('ios-safari');
  });
  /* Corbin 2026-11-20: "build the same popup feature for safari and other browsers". Every browser that has a
     way to install has a flow, so the popup has something true to say there. */
  it('the other browsers that can install: Chrome on an iPhone, Firefox on Android, Safari on a Mac', () => {
    expect(installFlow(UA.iphoneChrome, {})).toBe('ios-other');
    expect(installFlow(UA.firefoxAndroid, {})).toBe('firefox-android');
    expect(installFlow(UA.macSafari, {})).toBe('mac-safari');
  });
  it('nothing where there is no way to install', () => {
    expect(installFlow(UA.winFirefox, {})).toBeNull();
    expect(installFlow(UA.oldMacSafari, {})).toBeNull();   // Add to Dock came with Safari 17
  });
  /* 2026-11-20: a reader tapped the link in Messenger, the app "showed up but didn't install", and the app had
     nothing to say there (this used to answer null). An in-app browser cannot install; it is sent to the phone's
     own browser, whatever install event the webview claims to have. */
  it('an in-app browser is sent to the phone\'s own browser', () => {
    expect(installFlow(UA.facebook, { hasPrompt: true })).toBe('in-app-android');
    expect(installFlow(UA.messengerAndroid, {})).toBe('in-app-android');
    expect(installFlow(UA.messengerIphone, {})).toBe('in-app-ios');
    // Sweep mw12: a WebView that names no app reached the Android branch and got Chrome's menu steps.
    expect(installFlow(UA.webview, {})).toBe('in-app-android');
    // The APK's own WebView is not an in-app browser to leave.
    expect(installFlow(UA.webview, { isApk: true })).toBeNull();
  });
});

describe('shouldOffer + dismiss', () => {
  const now = Date.UTC(2026, 8, 24);
  const ctx = { flow: 'prompt', engaged: true, shownThisSession: false, now };
  it('after a sign of engagement, once a session', () => {
    expect(shouldOffer(null, ctx)).toBe(true);
    expect(shouldOffer(null, { ...ctx, engaged: false })).toBe(false);
    expect(shouldOffer(null, { ...ctx, shownThisSession: true })).toBe(false);
    expect(shouldOffer(null, { ...ctx, flow: null })).toBe(false);
  });
  /* Corbin 2026-11-21: "detects somehow if the pwa is installed on the device, and if not offers it, then reoffers
     it every so often". Until then the third "Not now" ended the offer for good, and so did one "installed" from
     the browser, which a phone says before any icon exists. */
  it('"Not now" waits 21 days and then it is offered again, however often the reader has said it', () => {
    let s = dismiss(null, 'later', now);
    expect(shouldOffer(s, { ...ctx, now: now + (SNOOZE_DAYS - 1) * 86400000 })).toBe(false);
    expect(shouldOffer(s, { ...ctx, now: now + SNOOZE_DAYS * 86400000 })).toBe(true);
    let at = now;
    for (let i = 0; i < 6; i++) { at += SNOOZE_DAYS * 86400000; s = dismiss(s, 'later', at); }
    expect(s.dismissals).toBe(7);
    expect(shouldOffer(s, { ...ctx, now: at + (SNOOZE_DAYS - 1) * 86400000 })).toBe(false);
    expect(shouldOffer(s, { ...ctx, now: at + SNOOZE_DAYS * 86400000 })).toBe(true);
  });
  it('an install waits 21 days too, is written down, and ends nothing', () => {
    const s = dismiss({ dismissals: 2 }, 'installed', now);
    expect(s).toEqual({ dismissals: 2, installedAt: now, snoozeUntil: now + SNOOZE_DAYS * 86400000 });
    expect(shouldOffer(s, ctx)).toBe(false);
    expect(shouldOffer(s, { ...ctx, now: now + SNOOZE_DAYS * 86400000 })).toBe(true);   // whether it IS installed is seemsInstalled's to say
  });
  it('a browser that was ended "for good" before 2026-11-21 is offered again', () => {
    expect(shouldOffer({ never: true }, ctx)).toBe(true);
    expect(shouldOffer({ dismissals: 3, snoozeUntil: now - 1 }, ctx)).toBe(true);
    expect(dismiss({ never: true }, 'later', now).never).toBeUndefined();
  });
});

/* A tab does not ask a reader who has the app (Corbin 2026-11-20). */
describe('seemsInstalled + markStandalone', () => {
  const now = 1_800_000_000_000;
  const DAY = 86400000;
  const tab = { now, related: /** @type {boolean | null} */ (null), hasPrompt: false, android: true };
  it('the browser seeing the installed app settles it', () => {
    expect(seemsInstalled(null, { ...tab, related: true })).toBe(true);
    expect(seemsInstalled({ standaloneAt: now - 400 * DAY }, { ...tab, related: true })).toBe(true);
  });
  it('nothing known: not installed', () => {
    expect(seemsInstalled(null, tab)).toBe(false);
    expect(seemsInstalled({ dismissals: 1 }, { ...tab, related: false })).toBe(false);
  });
  it('a run from the icon is written down and keeps what was there', () => {
    expect(markStandalone({ dismissals: 2 }, now, false)).toEqual({ dismissals: 2, standaloneAt: now, real: false });
    expect(markStandalone({ real: true }, now, undefined)).toEqual({ real: true, standaloneAt: now });
  });
  it('the icon used within ' + SNOOZE_DAYS + ' days counts as installed on a phone, whatever its Chrome offers', () => {
    const s = markStandalone(null, now - 5 * DAY, false);
    expect(seemsInstalled(s, { ...tab, related: false, hasPrompt: true })).toBe(true);
    expect(seemsInstalled(s, { ...tab, now: now + SNOOZE_DAYS * DAY, related: false })).toBe(false);
  });
  it('a real app the browser no longer sees is gone', () => {
    const s = markStandalone(null, now - DAY, true);
    expect(seemsInstalled(s, { ...tab, related: false })).toBe(false);
    expect(seemsInstalled(s, { ...tab, related: null })).toBe(true);     // the browser cannot say: the icon was used yesterday
  });
  it('a computer\'s Chrome offers to install only what is not installed', () => {
    const s = markStandalone(null, now - DAY, undefined);
    expect(seemsInstalled(s, { ...tab, android: false, hasPrompt: true })).toBe(false);
    expect(seemsInstalled(s, { ...tab, android: false, hasPrompt: false })).toBe(true);
  });
  it('a computer\'s Chrome or Edge with no install event has the app (or a window that cannot install), with nothing written down', () => {
    expect(seemsInstalled(null, { ...tab, android: false, hasPrompt: false, flow: 'desktop' })).toBe(true);
    expect(seemsInstalled({ installedAt: now - 400 * DAY }, { ...tab, android: false, hasPrompt: false, flow: 'desktop' })).toBe(true);
    // CONTROL: the same computer once its Chrome hands the event over, and a phone's Chrome without it
    expect(seemsInstalled(null, { ...tab, android: false, hasPrompt: true, flow: 'prompt' })).toBe(false);
    expect(seemsInstalled(null, { ...tab, flow: 'android-chrome' })).toBe(false);
    expect(seemsInstalled(null, { ...tab, android: false, flow: 'ios-safari' })).toBe(false);
  });
});

describe('capture', () => {
  // A fresh target per test: the capture's listeners cannot be removed, so on the shared window every earlier
  // test's listeners would also fire (3 calls instead of 1 when this file runs shuffled).
  /** @type {any} */ let win;
  beforeEach(() => { _resetInstallCapture(); win = new EventTarget(); });

  it('keeps the browser\'s event (and its mini-infobar away), then prompts once', async () => {
    attachInstallCapture(win);
    attachInstallCapture(win);                      // idempotent
    const seen = vi.fn(); subscribeInstall(seen);
    const ev = /** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true }));
    ev.prompt = vi.fn(() => Promise.resolve());
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    win.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(hasInstallPrompt()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe('accepted');
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(hasInstallPrompt()).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('appinstalled drops the prompt and remembers the install', () => {
    attachInstallCapture(win);
    const ev = /** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true }));
    win.dispatchEvent(ev);
    win.dispatchEvent(new Event('appinstalled'));
    expect(hasInstallPrompt()).toBe(false);
    expect(wasInstalled()).toBe(true);
  });

  it('a second copy of this module (another bundle) sees the event the first copy captured', async () => {
    attachInstallCapture(win);
    win.dispatchEvent(/** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true })));
    vi.resetModules();
    const other = await import('./install-offer.js');
    expect(other.hasInstallPrompt()).toBe(true);
  });
});
