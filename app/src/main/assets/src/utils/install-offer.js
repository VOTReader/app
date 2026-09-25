/* ═══════════════════════════════════════════════════════════════════════
   install-offer — when and how to offer "install as an app" (ip1)
   ═══════════════════════════════════════════════════════════════════════
   Design: D:/AgentBackbone/reports/phone-audio-and-growth-2026-09-24/
   05-install-as-app-prompt.md (sections 4 and 6). The card itself is UI and
   waits for its mockups; this module is the part that decides.

   installFlow   which way this browser installs: 'prompt' (Chromium handed us
                 its beforeinstallprompt, so a real Install button works),
                 else picture steps for 'android-chrome', 'samsung',
                 'ios-safari' or 'desktop', else null (never offered: the APK,
                 an installed app, Firefox desktop, in-app webviews).
   shouldOffer   the trigger rules: engaged first (a finished chapter), at
                 most once a session, "Maybe later" snoozes 21 days, three
                 dismissals or "Don't ask again" end it for good.
   dismiss       the next persisted state after a dismissal.
   capture       holds the deferred beforeinstallprompt event, from boot.
   ═══════════════════════════════════════════════════════════════════════ */

export const SNOOZE_DAYS = 21;
export const MAX_DISMISSALS = 3;

/**
 * @param {string} ua
 * @param {{ hasPrompt?: boolean, isApk?: boolean, standalone?: boolean, touchMac?: boolean }} env
 * @returns {'prompt' | 'android-chrome' | 'samsung' | 'ios-safari' | 'desktop' | null}
 */
export function installFlow(ua, env) {
  if (env.isApk || env.standalone) return null;
  ua = ua || '';
  // In-app webviews (Facebook, Instagram, Gmail's GSA, WeChat, Line) cannot install anything.
  if (/FBAN|FBAV|FB_IAB|Instagram|GSA\/|MicroMessenger|\bLine\//i.test(ua)) return null;
  if (env.hasPrompt) return 'prompt';
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  const ios = /iPhone|iPad|iPod/.test(ua) || !!env.touchMac;
  if (ios) {
    // Real Safari only: the other iOS browsers carry their own token.
    return /AppleWebKit/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/.test(ua)
      ? 'ios-safari' : null;
  }
  const chromium = /Chrome\//.test(ua) && !/OPR\/|YaBrowser/.test(ua);
  if (/Android/.test(ua)) return chromium ? 'android-chrome' : null;
  return chromium ? 'desktop' : null;   // Chrome / Edge on a computer; Firefox desktop has no install
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

/** @type {any} */ let _deferred = null;
let _installed = false;
/** @type {Set<() => void>} */ const _subs = new Set();
const _notify = () => { _subs.forEach((f) => { try { f(); } catch (_e) { /* a listener's bug is its own */ } }); };

/**
 * Listen for the browser's install event (call once, at boot). Idempotent per window.
 * @param {any} win
 */
export function attachInstallCapture(win) {
  if (!win || win.__votInstallCapture) return;
  win.__votInstallCapture = true;
  win.addEventListener('beforeinstallprompt', (/** @type {any} */ e) => {
    e.preventDefault();          // keep Chrome's mini-infobar away; our card asks at the right moment
    _deferred = e; _notify();
  });
  win.addEventListener('appinstalled', () => { _deferred = null; _installed = true; _notify(); });
}

/** @returns {boolean} */ export function hasInstallPrompt() { return !!_deferred; }
/** @returns {boolean} */ export function wasInstalled() { return _installed; }
/** @param {() => void} fn @returns {() => void} */
export function subscribeInstall(fn) { _subs.add(fn); return () => { _subs.delete(fn); }; }

/**
 * Show the browser's own install dialog. The event is single-use.
 * @returns {Promise<'accepted' | 'dismissed' | 'unavailable'>}
 */
export async function promptInstall() {
  const e = _deferred;
  if (!e) return 'unavailable';
  _deferred = null; _notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (_e) { return 'unavailable'; }
}

/** Tests only. */
export function _resetInstallCapture() { _deferred = null; _installed = false; _subs.clear(); }
