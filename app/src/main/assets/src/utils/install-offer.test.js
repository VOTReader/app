/* ip1 — when and how to offer "install as an app" (utils/install-offer.js). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installFlow, shouldOffer, dismiss, SNOOZE_DAYS, attachInstallCapture, hasInstallPrompt, wasInstalled,
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
  it('nothing where there is no way to install', () => {
    expect(installFlow(UA.iphoneChrome, {})).toBeNull();
    expect(installFlow(UA.winFirefox, {})).toBeNull();
    expect(installFlow(UA.macSafari, {})).toBeNull();
    expect(installFlow(UA.facebook, { hasPrompt: true })).toBeNull();
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
  it('"Maybe later" waits 21 days; the third dismissal ends it', () => {
    let s = dismiss(null, 'later', now);
    expect(shouldOffer(s, { ...ctx, now: now + (SNOOZE_DAYS - 1) * 86400000 })).toBe(false);
    expect(shouldOffer(s, { ...ctx, now: now + SNOOZE_DAYS * 86400000 })).toBe(true);
    s = dismiss(dismiss(s, 'later', now), 'later', now);
    expect(s.dismissals).toBe(3);
    expect(shouldOffer(s, { ...ctx, now: now + 365 * 86400000 })).toBe(false);
  });
  it('"Don\'t ask again" and an install end it for good', () => {
    expect(shouldOffer(dismiss(null, 'never', now), { ...ctx, now: now + 1e12 })).toBe(false);
    expect(shouldOffer(dismiss(null, 'installed', now), ctx)).toBe(false);
  });
});

describe('capture', () => {
  beforeEach(() => { _resetInstallCapture(); delete window.__votInstallCapture; });

  it('keeps the browser\'s event (and its mini-infobar away), then prompts once', async () => {
    attachInstallCapture(window);
    attachInstallCapture(window);                      // idempotent
    const seen = vi.fn(); subscribeInstall(seen);
    const ev = /** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true }));
    ev.prompt = vi.fn(() => Promise.resolve());
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(hasInstallPrompt()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe('accepted');
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(hasInstallPrompt()).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('appinstalled drops the prompt and remembers the install', () => {
    attachInstallCapture(window);
    const ev = /** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true }));
    window.dispatchEvent(ev);
    window.dispatchEvent(new Event('appinstalled'));
    expect(hasInstallPrompt()).toBe(false);
    expect(wasInstalled()).toBe(true);
  });
});
