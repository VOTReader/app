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
                 most once a session, "Maybe later" snoozes 21 days, three
                 dismissals or "Don't ask again" end it for good.
   dismiss       the next persisted state after a dismissal.
   capture       holds the deferred beforeinstallprompt event, from boot.
   ═══════════════════════════════════════════════════════════════════════ */

export const SNOOZE_DAYS = 21;
const MAX_DISMISSALS = 3;

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
 * @typedef {{ never?: boolean, dismissals?: number, snoozeUntil?: number }} InstallOfferState
 */

/**
 * @param {InstallOfferState | null | undefined} state
 * @param {{ flow: string | null, engaged: boolean, shownThisSession: boolean, now: number }} ctx
 * @returns {boolean}
 */
export function shouldOffer(state, ctx) {
  const s = state || {};
  if (!ctx.flow || !ctx.engaged || ctx.shownThisSession) return false;
  if (s.never || (s.dismissals || 0) >= MAX_DISMISSALS) return false;
  return !(s.snoozeUntil && ctx.now < s.snoozeUntil);
}

/**
 * @param {InstallOfferState | null | undefined} state
 * @param {'later' | 'never' | 'installed'} how
 * @param {number} now
 * @returns {InstallOfferState}
 */
export function dismiss(state, how, now) {
  const s = Object.assign({}, state || {});
  if (how === 'never' || how === 'installed') { s.never = true; return s; }
  s.dismissals = (s.dismissals || 0) + 1;
  s.snoozeUntil = now + SNOOZE_DAYS * 86400000;
  return s;
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
