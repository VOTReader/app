/* safari-gate.js - main's Safari 7-day gate for v2's saving gestures (mw6, v2-gaps 4; picture 8d-safari-notice).

   Safari deletes a site's storage after 7 days without a visit unless the site is on the Home Screen (or the Dock). Main
   warns once a session, on the first gesture that creates data in a Safari tab (utils/storage-health.js
   checkFirstDataCreation: a mark, a note, a bookmark, a journal entry), and drops that gesture; its Safari7DayModal shows
   while StorageHealth reports safariGateBlocked, and dismissing it ("I understand the risk") lets the next save through.
   v2 asks the same gate (firstSaveWaits) and draws the notice in the kit (SafariNotice.jsx). Never on a gate boot. */

const g = /** @type {any} */ (globalThis);

/**
 * True when this saving gesture must wait: the first of the session in a Safari tab. Asking shows the notice (main's
 * gate counts the ask), so call it only when the reader has just asked to save something.
 */
export function firstSaveWaits() {
  const H = g.StorageHealth;
  try {
    return !!(H && typeof H.checkFirstDataCreation === 'function' && H.checkFirstDataCreation().shouldBlock);
  } catch (_e) {
    return false;   // a broken health check never stops a save
  }
}

const unsubscribed = () => {};
const noSubscribe = () => unsubscribed;

/** StorageHealth's subscription (main's useSyncExternalStore pair); nothing when it is not on the page. */
function subscribe(cb) {
  const H = g.StorageHealth;
  return H && typeof H.subscribe === 'function' ? H.subscribe(cb) : unsubscribed;
}
const zero = () => 0;
function version() {
  const H = g.StorageHealth;
  return H && typeof H.getVersion === 'function' ? H.getVersion() : 0;
}

/** True while the notice should show (main's Safari7DayModal rule: the gate tripped and not yet dismissed). */
export function safariNoticeShown() {
  const H = g.StorageHealth;
  if (!H || typeof H.getReport !== 'function') return false;
  try {
    const report = H.getReport();
    return !!(report && report.safariGateBlocked) && !(typeof H.isDismissed === 'function' && H.isDismissed('safari-7day'));
  } catch (_e) {
    return false;
  }
}

/** safariNoticeShown, re-read whenever StorageHealth changes; false when `on` is false (a gate boot). @param {boolean} on */
export function useSafariNotice(on = true) {
  React.useSyncExternalStore(on ? subscribe : noSubscribe, on ? version : zero);
  return on ? safariNoticeShown() : false;
}

/** The reader has read the notice (main's "I understand the risk"): the next save goes through. */
export function dismissSafariNotice() {
  const H = g.StorageHealth;
  if (H && typeof H.dismissScenario === 'function') H.dismissScenario('safari-7day');
}
