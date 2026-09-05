/* ═══════════════════════════════════════════════════════════════════════
   TourController — runs "Show me around"
   ═══════════════════════════════════════════════════════════════════════
   ES module, bundle-b (window-exposed by _entry-b so the Home strip in
   bundle-d, Settings in bundle-e and the overlay in bundle-e all talk to the
   same one). A tiny store in the shape of every other store here: subscribe /
   getVersion / getState, read by React with useSyncExternalStore.

   WHO CALLS WHAT
     TourPrompt (Home strip)  start('prompt') · dismissPrompt('later'|'never')
     SettingsScreen (Help)    start('settings') · reads step.settingsGroup
     TourOverlay              next() · back() · skip() · targetPressed()
     App (hooks/use-tour.js)  attachNav({ goHome, openLetter, openBible,
                              goJournalHub, openSettingsData })

   A stop's `enter` runs through that nav every time the stop becomes
   current, forwards or back, so the picture always matches the words.
   next() first performs the stop's `act` ('press' taps the ringed control
   for the reader; a nav key navigates), then moves on. targetPressed() is
   the overlay telling us the reader tapped the control themselves: move on,
   act nothing — the app already did what the tap does.

   The lazy bundle: the overlay lives in bundle-e. start() asks
   window.__loadScreensE (index.html's screens-e loader) for it and flips
   `ready` when it resolves; App re-renders on that load signal already
   (use-lazy-bundles), so the overlay appears without anyone polling.

   Leaving — skip(), finish(), dismissPrompt('never') — records
   TourDoneFlagStore, the one durable byte. dismissPrompt('later') is
   session-only by design: "Maybe later" means later.
   ═══════════════════════════════════════════════════════════════════════ */

import { TOUR_STEPS, nextIndex, prevIndex, findTarget } from './tour-steps.js';
import { TourDoneFlagStore, AboutSeenFlagStore } from '../stores/app-flag-stores.js';

const listeners = new Set();
let version = 0;
let nav = {};
let pressing = false;
let state = fresh();

function fresh() {
  return { active: false, index: 0, from: null, ready: true, promptDismissed: false, pressed: false };
}
function bump() {
  version++;
  for (const cb of listeners) { try { cb(); } catch (_e) { /* a listener's problem, not ours */ } }
}
function runEnter(step) {
  const fn = step && step.enter && nav[step.enter];
  if (typeof fn === 'function') { try { fn(); } catch (_e) { /* the picture may lag the words; the overlay says so */ } }
}
/* The tour ends what the tour started. A Listen stop's press begins real playback; leaving that
   stop (Next, Back, Skip, Done) stops it, or the player bar follows the reader into the Journal and
   Settings and covers the very controls the next stops ring (seen on emulator-5554, 2026-09-04).
   AudioPlayer is a bundle-d global; absent on a bare host. */
function stopTourAudio() {
  if (!state.pressed) return;
  const ap = typeof AudioPlayer !== 'undefined' ? /** @type {any} */ (AudioPlayer) : null;
  try { if (ap && typeof ap.stop === 'function') ap.stop(); } catch (_e) { /* the player's problem */ }
}
function goTo(index, skipEnter) {
  stopTourAudio();
  state = { ...state, index, pressed: false };
  if (!skipEnter) runEnter(TOUR_STEPS[index]);
  bump();
}
function end() {
  stopTourAudio();
  state = { ...state, active: false, pressed: false };
  // Playback the reader began during the tour by some other control ran under the held
  // keep-alive edge (audio-player.js holds it while the tour shows); raise it now.
  try { const ap = typeof AudioPlayer !== 'undefined' ? /** @type {any} */ (AudioPlayer) : null; if (ap && typeof ap.syncKeepAlive === 'function') ap.syncKeepAlive(); } catch (_e) { /* the player's problem */ }
  try { TourDoneFlagStore.set(); } catch (_e) { /* no store on a bare host */ }
  bump();
}

export const TourController = {
  subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  getVersion() { return version; },
  /** @returns {{active:boolean,index:number,step:any,from:string|null,ready:boolean,promptDismissed:boolean,pressed:boolean}} */
  getState() { return { ...state, step: TOUR_STEPS[state.index] }; },

  /** True only while next() is pressing the ringed control itself. */
  isPressing() { return pressing; },

  /** The control a stop rings, if it is on screen (bundle-e's overlay reaches findTarget through here). */
  findTarget(step) { return findTarget(step); },

  /** The app hands over the five navigation verbs the stops use. Idempotent; call on every render if you like. */
  attachNav(n) { nav = n || {}; },

  /** Begin at the welcome card. `from` is where the reader started it ('prompt' | 'settings'), for the closing words and the tests. */
  start(from) {
    let ready = true;
    const loader = (typeof window !== 'undefined' && typeof window.__loadScreensE === 'function') ? window.__loadScreensE : null;
    if (loader && typeof window.TourOverlay === 'undefined') {
      ready = false;
      Promise.resolve(loader()).then(() => { state = { ...state, ready: true }; bump(); }, () => { state = { ...state, ready: true }; bump(); });
    }
    state = { ...state, active: true, index: 0, from: from || null, ready };
    runEnter(TOUR_STEPS[0]);
    bump();
  },

  /** Next: do what the stop promised, then move on; on the closing card, finish. */
  next() {
    if (!state.active) return;
    const step = TOUR_STEPS[state.index];
    if (state.index >= TOUR_STEPS.length - 1) { end(); return; }
    if (step.act === 'press' && !state.pressed) {
      // The overlay listens on the ringed control to notice the reader's own tap; this click is
      // ours, so it is fenced off or the tour would advance twice (seen in the browser walk).
      const el = /** @type {HTMLElement|null} */ (findTarget(step));
      pressing = true;
      try { if (el && typeof el.click === 'function') el.click(); } finally { pressing = false; }
      // Stay: the reader should see what the press does. The next Next moves on.
      state = { ...state, pressed: true };
      bump();
      return;
    } else if (step.act && typeof nav[step.act] === 'function') {
      // A navigating act already took the reader where the next stop lives; running that
      // stop's `enter` too would navigate twice (and re-render the letter mid-arrival).
      try { nav[step.act](); } catch (_e) { /* see runEnter */ }
      goTo(nextIndex(state.index), true);
      return;
    }
    goTo(nextIndex(state.index));
  },

  /** The reader tapped the ringed control themselves: move on without acting again. The next
      stop's `enter` still runs — a tap on the Letters tile lands on the Volumes index, and the
      tour promised to open a letter from there. */
  targetPressed() {
    if (!state.active) return;
    if (state.index >= TOUR_STEPS.length - 1) { end(); return; }
    const step = TOUR_STEPS[state.index];
    if (step.act === 'press' && !state.pressed) { state = { ...state, pressed: true }; bump(); return; }
    goTo(nextIndex(state.index));
  },

  back() {
    if (!state.active || state.index === 0) return;
    goTo(prevIndex(state.index));
  },

  skip() { if (state.active) end(); },
  finish() { if (state.active) end(); },

  /** The Home strip: 'later' hides it for this launch; 'never' records the flag. */
  dismissPrompt(how) {
    state = { ...state, promptDismissed: true };
    if (how === 'never') { try { TourDoneFlagStore.set(); } catch (_e) { /* bare host */ } }
    bump();
  },

  /** Home only, after About, not once the flag is set, not while running, not after Maybe later. */
  shouldPrompt(/** @type {{screen?: string}} */ { screen } = {}) {
    if (screen !== 'home' || state.active || state.promptDismissed) return false;
    try {
      if (!AboutSeenFlagStore.is()) return false;
      if (TourDoneFlagStore.is()) return false;
    } catch (_e) { return false; }
    return true;
  },

  _resetForTests() { state = fresh(); nav = {}; pressing = false; listeners.clear(); version = 0; },
};
