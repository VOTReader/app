/* ═══════════════════════════════════════════════════════════════════════
   install-offer — when and how to offer "install as an app" (ip1)
   ═══════════════════════════════════════════════════════════════════════
   Design: D:/AgentBackbone/reports/phone-audio-and-growth-2026-09-24/
   05-install-as-app-prompt.md (sections 4 and 6). The card itself is UI and
   waits for its mockups; this module is the part that decides.

   installFlow   which way this browser installs: 'prompt' (Chromium handed us
                 its beforeinstallprompt, so a real Install button works),
                 else the browser's own way, in words: 'android-chrome',
                 'samsung', 'firefox-android', 'ios-safari', 'ios-other' (the
                 other iPhone browsers), 'mac-safari' or 'desktop';
                 'in-app-android' / 'in-app-ios'
                 for an in-app browser, which cannot install and is told to
                 open the page in the phone's own browser; else null (never
                 offered: the APK, an installed app, Firefox desktop).
   shouldOffer   the trigger rules: engaged first (a finished chapter), at
                 most once a session, and not inside the 21 days after the
                 last answer. Nothing ends it: Corbin 2026-11-21, "detects
                 somehow if the pwa is installed on the device, and if not
                 offers it, then reoffers it every so often".
   dismiss       the next persisted state after "Not now" or an install:
                 either way the offer waits 21 days and then looks again.
   seemsInstalled / markStandalone
                 a browser tab does not ask a reader who has the app already.
   capture       holds the deferred beforeinstallprompt event, from boot.
   ═══════════════════════════════════════════════════════════════════════ */

export const SNOOZE_DAYS = 21;

/**
 * @param {string} ua
 * @param {{ hasPrompt?: boolean, isApk?: boolean, standalone?: boolean, touchMac?: boolean }} env
 * @returns {'prompt' | 'android-chrome' | 'samsung' | 'firefox-android' | 'ios-safari' | 'ios-other' | 'mac-safari' | 'desktop' | 'in-app-android' | 'in-app-ios' | null}
 */
export function installFlow(ua, env) {
  if (env.isApk || env.standalone) return null;
  ua = ua || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || !!env.touchMac;
  // In-app webviews (Facebook and Messenger, Instagram, Gmail's GSA, WeChat, Line) cannot install anything; nor
  // can any other app's browser built on the system Android WebView, which names no app but carries '; wv)'.
  // A link tapped in Messenger opens there, so this is where many readers first meet the app: the way out is
  // the phone's own browser, whatever install event this webview claims to have.
  if (/FBAN|FBAV|FB_IAB|Instagram|GSA\/|MicroMessenger|\bLine\//i.test(ua) || (/Android/.test(ua) && /;\s*wv\)/.test(ua))) {
    return ios ? 'in-app-ios' : 'in-app-android';
  }
  if (env.hasPrompt) return 'prompt';
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  if (ios) {
    if (!/AppleWebKit/.test(ua) || !/Safari/.test(ua)) return null;
    // Real Safari carries no other browser's token. Chrome, Firefox and Edge on an iPhone have had Add to Home
    // Screen in their own Share menu since iOS 16.4; the rest are not known to.
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-other';
    return /OPiOS|DuckDuckGo|YaBrowser/.test(ua) ? null : 'ios-safari';
  }
  const chromium = /Chrome\//.test(ua) && !/OPR\/|YaBrowser/.test(ua);
  if (/Android/.test(ua)) return chromium ? 'android-chrome' : /Firefox\//.test(ua) ? 'firefox-android' : null;
  if (chromium) return 'desktop';   // Chrome / Edge on a computer
  // Safari on a Mac has File > Add to Dock since Safari 17. Firefox on a computer has no install.
  const safari = /Macintosh/.test(ua) && /Safari\//.test(ua) && /Version\/(\d+)/.exec(ua);
  return safari && Number(safari[1]) >= 17 ? 'mac-safari' : null;
}

/**
 * dismissals: how many times the reader said "Not now" (kept as a count; it ends nothing). installedAt: the last
 * time this browser said the app was installed. never: written until 2026-11-21 for "installed", read by nothing
 * now: an install was ended "for good" on Chrome's word alone, and Chrome says yes on a phone before the icon
 * exists (and where the phone then added none, the reader was never asked again).
 * @typedef {{ dismissals?: number, snoozeUntil?: number, installedAt?: number, standaloneAt?: number, real?: boolean, never?: boolean }} InstallOfferState
 */

/**
 * @param {InstallOfferState | null | undefined} state
 * @param {{ flow: string | null, engaged: boolean, shownThisSession: boolean, now: number }} ctx
 * @returns {boolean}
 */
export function shouldOffer(state, ctx) {
  const s = state || {};
  if (!ctx.flow || !ctx.engaged || ctx.shownThisSession) return false;
  return !(s.snoozeUntil && ctx.now < s.snoozeUntil);
}

/**
 * @param {InstallOfferState | null | undefined} state
 * @param {'later' | 'installed'} how
 * @param {number} now
 * @returns {InstallOfferState}
 */
export function dismiss(state, how, now) {
  const s = Object.assign({}, state || {});
  delete s.never;
  s.snoozeUntil = now + SNOOZE_DAYS * 86400000;
  if (how === 'installed') s.installedAt = now;
  else s.dismissals = (s.dismissals || 0) + 1;
  return s;
}

/* ── installed already? ──────────────────────────────────────────────────
   A page in a browser tab cannot ask whether its icon is on the home screen. It can know three things:
     related        what navigator.getInstalledRelatedApps() answered: true, the browser sees the installed app
                    (Chrome on Android, for a real app it had Google Play install, once the manifest names itself
                    under related_applications); false, it sees none; null, it cannot say.
     standaloneAt   the last time the app ran from its own icon. That window shares this browser's storage on
                    Android and on a computer (not on an iPhone, where the home-screen app keeps its own).
                    `real` is what the browser answered about itself in that window.
     the install event   a computer's Chrome or Edge hands a page its install event whenever the app can be
                    installed and is not. Flow 'desktop' is that browser with no event after its time to send
                    one: the app is installed there, or that window cannot install (a private or guest window).
   So a reader who uses the icon is not asked in a tab, a computer that has the app is not asked at all, and one
   who removed the app is asked again as soon as the browser can tell (a real app that is gone; a computer's
   Chrome offering to install), else 21 days after the icon was last used. A phone without Google Play pins a
   home-screen icon that is no app the browser can see, and its Chrome offers to install whether or not the icon
   is there: only the 21 days speak for it. Safari and Firefox tell a page nothing: there the offer comes back
   every 21 days in a tab and never in the app's own window. */

/**
 * The state after a run from the app's own icon.
 * @param {InstallOfferState | null | undefined} state @param {number} now @param {boolean | undefined} real
 * @returns {InstallOfferState}
 */
export function markStandalone(state, now, real) {
  const s = Object.assign({}, state || {}, { standaloneAt: now });
  if (typeof real === 'boolean') s.real = real;
  return s;
}

/**
 * @param {InstallOfferState | null | undefined} state
 * @param {{ now: number, related: boolean | null, hasPrompt: boolean, android: boolean, flow?: string | null }} ctx
 * @returns {boolean}
 */
export function seemsInstalled(state, ctx) {
  if (ctx.related === true) return true;
  if (ctx.flow === 'desktop') return true;           // a computer's Chromium that does not offer install: it has the app
  const s = state || {};
  if (!s.standaloneAt || ctx.now - s.standaloneAt >= SNOOZE_DAYS * 86400000) return false;
  if (s.real === true && ctx.related === false) return false;   // it was a real app, and the browser says it is gone
  if (ctx.hasPrompt && !ctx.android) return false;               // a computer's Chrome offers install only when it is not installed
  return true;
}

/* ── capture: Chromium fires beforeinstallprompt once, early; keep it ────── */

/* The capture runs in bundle-b at boot and the card reads it from bundle-d: each bundle carries its own copy of
   this module, so the captured event lives on the window, one slot both copies share. */
/** @returns {{ deferred: any, installed: boolean, subs: Set<() => void> }} */
function _slot() {
  const g = /** @type {any} */ (globalThis);
  if (!g.__votInstallSlot) g.__votInstallSlot = { deferred: null, installed: false, subs: new Set() };
  return g.__votInstallSlot;
}
const _notify = () => { _slot().subs.forEach((f) => { try { f(); } catch (_e) { /* a listener's bug is its own */ } }); };

/**
 * Listen for the browser's install event (call once, at boot). Idempotent per window.
 * @param {any} win
 */
export function attachInstallCapture(win) {
  if (!win || win.__votInstallCapture) return;
  win.__votInstallCapture = true;
  win.addEventListener('beforeinstallprompt', (/** @type {any} */ e) => {
    e.preventDefault();          // keep Chrome's mini-infobar away; our card asks at the right moment
    _slot().deferred = e; _notify();
  });
  win.addEventListener('appinstalled', () => { const s = _slot(); s.deferred = null; s.installed = true; _notify(); });
}

/** @returns {boolean} */ export function hasInstallPrompt() { return !!_slot().deferred; }
/** @returns {boolean} */ export function wasInstalled() { return _slot().installed; }
/** @param {() => void} fn @returns {() => void} */
export function subscribeInstall(fn) { const subs = _slot().subs; subs.add(fn); return () => { subs.delete(fn); }; }

/**
 * Show the browser's own install dialog. The event is single-use.
 * @returns {Promise<'accepted' | 'dismissed' | 'unavailable'>}
 */
export async function promptInstall() {
  const e = _slot().deferred;
  if (!e) return 'unavailable';
  _slot().deferred = null; _notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (_e) { return 'unavailable'; }
}

/** Tests only. */
export function _resetInstallCapture() { const s = _slot(); s.deferred = null; s.installed = false; s.subs.clear(); }
