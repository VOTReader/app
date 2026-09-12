/* ═══════════════════════════════════════════════════════════════════════
   TourController — runs "Show me around"
   ═══════════════════════════════════════════════════════════════════════
   ES module, bundle-b (window-exposed by _entry-b so the Home strip in
   bundle-d, Settings in bundle-e and the overlay in bundle-e all talk to the
   same one). A tiny store in the shape of every other store here: subscribe /
   getVersion / getState, read by React with useSyncExternalStore.

   WHO CALLS WHAT
     TourPrompt (Home strip)  start('prompt') · dismissPrompt('later'|'never') · stopsWord()
     SettingsScreen (Help)    start('settings') · reads step.settingsGroup · stopsWord()
     TourOverlay              next() · back() · skip() · targetPressed() ·
                              clearHighlightDemo()
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

import { TOUR_STEPS, TOUR_STOPS_WORD, HIGHLIGHT_GESTURE_WORDS, nextIndex, prevIndex, findTarget } from './tour-steps.js';
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
  if (cancelSeek) cancelSeek();
  /* `pressed` means "this stop has done its thing and is showing `after`", which is TWO different
     facts now that a stop can demonstrate without pressing anything. Only a 'press' stop starts
     playback, so only leaving one of those should stop it — otherwise leaving the highlight stop
     stops audio the tour never began, which is the reader's own playback if they started any.
     Read before the state moves: goTo and end both call this while `index` is still the stop
     being left. */
  const leaving = TOUR_STEPS[state.index];
  if (!state.pressed || !leaving || leaving.act !== 'press') return;
  const ap = typeof AudioPlayer !== 'undefined' ? /** @type {any} */ (AudioPlayer) : null;
  try { if (ap && typeof ap.stop === 'function') ap.stop(); } catch (_e) { /* the player's problem */ }
}
/* THE HIGHLIGHT DEMONSTRATION, and the whole of its safety.
   The stop teaches a gesture that has no control to press, so the tour does to a real paragraph
   what the reader's own long press would do — and must leave nothing behind. It is TWO CLASSES on
   the element, never an annotation: `hl-mark` and `hl-yellow` are plain classes in app.css (not
   scoped to <mark>), so the paragraph wears the real highlight's exact wash with no DOM surgery,
   and `classList.remove` is the whole of the undo. Yellow is the app's own default (note-store).

   NOTHING REACHES AnnotationStore. That is the point of doing it this way rather than adding a
   real annotation and deleting it afterwards: a write that is undone is still a write, and the
   undo is a thing that can fail. There is no path from here to the store to fail on.

   THE SWEEP IS BY MARKER CLASS, NOT BY A HELD REFERENCE. React owns these paragraphs and may
   replace the node between the paint and the undo (a re-render, a pager move); a stored element
   reference would then clear a node nobody is looking at and leave the visible one yellow. One
   querySelectorAll over the marker cannot miss that way, and clears a repaint that somehow
   happened twice. Called on every exit: goTo (Next, Back), end (Skip, Done, Android Back through
   the modal registry), and the overlay's own effect cleanup when the stop or the screen changes. */
const TOUR_HL_CLASSES = ['tour-hl-demo', 'hl-mark', 'hl-yellow'];
function clearTourHighlight() {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('.tour-hl-demo')) {
    try { el.classList.remove(...TOUR_HL_CLASSES); } catch (_e) { /* a detached node's problem */ }
  }
}
function paintTourHighlight(el) {
  clearTourHighlight();
  if (el && el.classList) { try { el.classList.add(...TOUR_HL_CLASSES); } catch (_e) { /* best-effort */ } }
}

/* A recording opens with a silent lead-in (the title, a breath): "Chosen by God" lights its first
   clause at 26.75 s. A reader who pressed Listen on the tour's word and heard nothing light up for
   half a minute has been told the feature does not work (Corbin, on his phone, 2026-09-04). So the
   press seeks into the first clause, a real timestamp from AUDIO_SYNC, once the player knows the
   track's duration (a seek before metadata is discarded by the element). Nothing is guessed: no
   rows, no seek. */
const TOUR_SEEK_LEAD_SEC = 0.4;
const TOUR_SEEK_WAIT_MS = 10000;
/** Cancels a seek still waiting on metadata; leaving the stop must not seek the next track. */
let cancelSeek = null;
function seekTourStart(step) {
  const key = step && step.seekKey;
  const ap = typeof AudioPlayer !== 'undefined' ? /** @type {any} */ (AudioPlayer) : null;
  if (!key || !ap || typeof ap.subscribe !== 'function' || typeof ap.seek !== 'function') return;
  const started = Date.now();
  let unsub = () => {};
  let done = false;
  if (cancelSeek) cancelSeek();
  cancelSeek = () => { done = true; unsub(); cancelSeek = null; };
  const attempt = () => {
    if (done) return;
    const g = /** @type {any} */ (globalThis);
    const rows = g.AUDIO_SYNC && g.AUDIO_SYNC[key];
    const st = ap.getState ? ap.getState() : null;
    if (rows && rows.length && st && st.duration > 0) {
      done = true; unsub(); cancelSeek = null;
      const at = Number(rows[0][0]) + TOUR_SEEK_LEAD_SEC;
      if ((st.time || 0) < at) { try { ap.seek(at); } catch (_e) { /* the player's problem */ } }
    } else if (Date.now() - started > TOUR_SEEK_WAIT_MS) { done = true; unsub(); cancelSeek = null; }
  };
  try { unsub = ap.subscribe(attempt) || unsub; } catch (_e) { return; }
  attempt();
}
function goTo(index, skipEnter) {
  stopTourAudio();
  clearTourHighlight();
  state = { ...state, index, pressed: false };
  if (!skipEnter) runEnter(TOUR_STEPS[index]);
  bump();
}
function end() {
  stopTourAudio();
  clearTourHighlight();
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

  /** The stop count as a word ("seven"), for the sentences in bundles d and e that count the stops
      and can reach the steps only through here. tour-steps.js owns the number; nobody types it. */
  stopsWord() { return TOUR_STOPS_WORD; },

  /** The gesture's words ("Hold your finger on any line…"), for the first-run hint pill in bundle d:
      the same string the highlight stop opens with, owned by tour-steps.js, reached only through here. */
  highlightWords() { return HIGHLIGHT_GESTURE_WORDS; },

  /** The control a stop rings, if it is on screen (bundle-e's overlay reaches findTarget through here). */
  findTarget(step) { return findTarget(step); },

  /** Take the demonstration's colour back. goTo and end already do; the overlay calls this from its
      per-stop effect cleanup, which is the one that fires when the SCREEN changes under a stop. */
  clearHighlightDemo() { clearTourHighlight(); },

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
      seekTourStart(step);
      // Stay: the reader should see what the press does. The next Next moves on.
      state = { ...state, pressed: true };
      bump();
      return;
    }
    if (step.act === 'highlightDemo' && !state.pressed) {
      // Same shape as a press: show it, stay, and let the next Next move on (goTo takes the
      // colour back). No click to fence off — nothing is being pressed and nothing is saved.
      paintTourHighlight(/** @type {HTMLElement|null} */ (findTarget(step)));
      state = { ...state, pressed: true };
      bump();
      return;
    }
    if (step.act && typeof nav[step.act] === 'function') {
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
    // The reader did it themselves — pressed the pill, or raised the selection bar with a long
    // press. Either way they have already seen what the demonstration would have shown, so the
    // card moves to its `after` words and NOTHING is acted or painted.
    if ((step.act === 'press' || step.act === 'highlightDemo') && !state.pressed) { state = { ...state, pressed: true }; bump(); return; }
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

  _resetForTests() { clearTourHighlight(); state = fresh(); nav = {}; pressing = false; listeners.clear(); version = 0; },
};
