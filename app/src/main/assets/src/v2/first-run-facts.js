/* first-run-facts.js - the welcome, the tour and the install offer (zv1 group 10; pictures 8a-welcome, 8b-install).

   Main's own flags and rules, re-used: a first visit is main's (AboutSeenFlagStore not set, nothing being read yet),
   and leaving the welcome sets that same flag, so main never shows its About welcome to the same reader; the tour's end
   sets main's TourDoneFlagStore. The install offer keeps main's per-browser state (localStorage 'vot-install-offer',
   utils/install-offer.js: browser only, Maybe later snoozes 21 days, Don't ask again or three dismissals end it) and
   counts visits in it: the picture's offer comes on the second visit, once a session, never over a reading page. */
import { installFlow, shouldOffer, dismiss, hasInstallPrompt } from '../utils/install-offer.js';

const g = /** @type {any} */ (globalThis);

/** A flag store of main's (AboutSeenFlagStore, TourDoneFlagStore), or null before bundle-b. */
const flag = (name, gl) => {
  const f = gl[name];
  return f && typeof f.is === 'function' && typeof f.set === 'function' ? f : null;
};

/** True on a reader's first visit: main's About flag unset and nothing being read. Reads only. */
export function firstVisit(gl = g) {
  const about = flag('AboutSeenFlagStore', gl);
  if (!about || about.is()) return false;
  try {
    const store = gl.StateStore;
    const s = store && typeof store.isReady === 'function' && store.isReady() ? store.get() : null;
    if (s && s.activeReadKey) return false;
  } catch (_e) { /* no saved state: a first visit */ }
  return true;
}

/** The welcome has been seen: main's own flag. */
export function markWelcomed(gl = g) {
  const about = flag('AboutSeenFlagStore', gl);
  if (about) about.set();
}

/** The tour is done (finished or left): main's own flag, so main's tour strip never asks again. */
export function markToured(gl = g) {
  const done = flag('TourDoneFlagStore', gl);
  if (done) done.set();
}

/** The tour's stops: each rings a real control (the tab bar on the phone, the rail on the laptop; Home's gear). */
export const TOUR = [
  { sel: '.tabbar .tab:nth-child(1), .rail .tab:nth-child(1)', t: 'Home', s: 'What you are reading and hearing, the Volumes, the Bible and your reading plans.' },
  { sel: '.tabbar .tab:nth-child(2), .rail .tab:nth-child(2)', t: 'Search', s: 'Every letter and verse, by a word or a reference.' },
  { sel: '.tabbar .tab:nth-child(3), .rail .tab:nth-child(3)', t: 'Notes', s: 'Your highlights, notes, bookmarks, links and journal, kept here.' },
  { sel: '.tb .ic[aria-label="Settings"]', t: 'Settings', s: 'Text size and theme, listening, downloads, and your data.' },
];

/* ── the install offer ─────────────────────────────────────────────────────────────────────────────────────────── */

const STATE_KEY = 'vot-install-offer';

/** @typedef {import('../utils/install-offer.js').InstallOfferState & { visits?: number }} OfferState */

/** Main's per-browser offer state. @returns {OfferState} */
export function readOffer(gl = g) {
  try { return JSON.parse(gl.localStorage.getItem(STATE_KEY) || 'null') || {}; } catch (_e) { return {}; }
}

/** @param {OfferState} s */
export function writeOffer(s, gl = g) {
  try { gl.localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_e) { /* storage blocked: it asks again next visit */ }
}

let counted = /** @type {number | null} */ (null);

/** This visit's number in this browser: counted once a page load (the first call writes visits + 1). */
export function visitNumber(gl = g) {
  if (counted == null) {
    const s = readOffer(gl);
    counted = (s.visits || 0) + 1;
    writeOffer({ ...s, visits: counted }, gl);
  }
  return counted;
}

/** Tests only. */
export function _resetVisit() { counted = null; }

/** Which way this browser installs (main's installFlow over the live window), or null where it never offers. */
export function liveFlow(gl = g) {
  const nav = gl.navigator || {};
  const ua = nav.userAgent || '';
  return installFlow(ua, {
    hasPrompt: hasInstallPrompt(),
    isApk: !!(gl.PlatformBridge && gl.PlatformBridge.isAndroid),
    standalone: !!(gl.StorageHealth && typeof gl.StorageHealth._isStandalone === 'function' && gl.StorageHealth._isStandalone()),
    touchMac: /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1,
  });
}

/** Places the offer never covers: reading pages, a note being written, a bare place (the welcome, the Garden's photograph). */
const NOT_OVER = new Set(['letter', 'bible-chapter', 'study-chapter', 'note', 'journal-entry', 'welcome', 'garden']);

/**
 * Whether the offer opens now: a browser that installs, the second visit or later, main's rules (snooze, never, three
 * dismissals), once a session, after the reader has moved off the first page, and not over reading.
 * @param {{ flow: string | null, visit: number, state: OfferState, place: string, moved: boolean, shown: boolean, now: number }} c
 */
export function offerNow(c) {
  if (c.visit < 2 || !c.moved || NOT_OVER.has(c.place)) return false;
  return shouldOffer(c.state, { flow: c.flow, engaged: true, shownThisSession: c.shown, now: c.now });
}

/** The offer's words on a phone or a computer. @param {boolean} computer */
export function offerWords(computer) {
  return computer
    ? { title: 'Keep VOTReader on this computer', body: 'Open it like an app, in its own window. Your reading and notes stay on this computer.' }
    : { title: 'Keep VOTReader on your home screen', body: 'Open it like an app, with one tap. Your reading and notes stay on this phone.' };
}

/** The next state after Maybe later / Don't ask again / an install (main's dismiss), visits kept. */
export function endOffer(how, gl = g, now = Date.now()) {
  const s = readOffer(gl);
  const next = { ...dismiss(s, how, now), visits: s.visits };
  writeOffer(next, gl);
  return next;
}

/** Main's SHOW ME HOW steps per flow: [picture, title, note]. */
export const STEPS = {
  'ios-safari': { title: 'Add to Home Screen', intro: 'In Safari:', steps: [
    ['install/ios-1.jpg', 'Tap the ••• button', 'At the bottom right. On an older iPhone the Share button is on the bottom bar: tap it and go to step 3.'],
    ['install/ios-2.jpg', 'Tap Share', null],
    ['install/ios-3.jpg', 'Tap Add to Home Screen', 'Scroll down the list if you do not see it.'],
    ['install/ios-4.jpg', 'Tap Add', 'VOTReader is now on your home screen.'],
  ] },
  'android-chrome': { title: 'Add to Home Screen', intro: 'In Chrome:', steps: [
    ['install/android-1.jpg', 'Tap the menu', 'The three dots at the top right.'],
    ['install/android-2.jpg', 'Tap Install app', 'Some phones say Add to Home screen.'],
    ['install/android-3.jpg', 'Tap Install', null],
  ] },
  samsung: { title: 'Add to Home Screen', intro: 'In Samsung Internet:', steps: [
    ['install/samsung-1.jpg', 'Tap the menu', 'The three lines at the bottom right.'],
    ['install/samsung-2.jpg', 'Tap Add page to', null],
    ['install/samsung-3.jpg', 'Tap Home screen', null],
    ['install/samsung-4.jpg', 'Tap Add', null],
  ] },
  desktop: { title: 'Install VOTReader on this computer', intro: 'In Chrome or Edge:', steps: [
    ['install/desktop-1.jpg', 'Click the install icon', 'At the right end of the address bar.'],
    ['install/desktop-2.jpg', 'Click Install', 'VOTReader opens in its own window.'],
  ] },
};
