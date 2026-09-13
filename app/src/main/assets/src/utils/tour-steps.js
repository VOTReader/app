/* ═══════════════════════════════════════════════════════════════════════
   tour-steps — "Show me around": the stops, as data
   ═══════════════════════════════════════════════════════════════════════
   ES module, bundle-b (via tour-controller). Pure: no React, no DOM except
   findTarget(), so the copy and the order are unit-tested as plain data.

   A stop says WHERE it lives (`screen`), HOW the tour gets there (`enter`, a
   key on the nav the app attaches — see hooks/use-tour.js), WHAT it rings
   (`target`: a selector, and a text match where the control's position is
   not stable, like Home's reorderable tiles), and what NEXT does (`act`):
   'press' taps the ringed control for the reader AND STAYS on the stop with
   `after` as the card's words, so the reader sees what the press does (the
   words lighting up); the next Next moves on, and the tour stops the playback
   it started. 'highlightDemo' is the same shape for a stop that has no control
   to press: it paints the real highlight's colour on the ringed paragraph and
   stays, and the tour takes the colour back on every way out. A nav key
   navigates; null just moves on. The reader may also do the thing themselves —
   tap the ringed control, or raise the selection bar with a long press — and the
   overlay notices and moves on without acting twice.

   THE LISTENING STOPS (Corbin, 2026-09-12: "show users how to navigate through
   the media player at the bottom and change the audiobook version or for the
   letters the voice … and then dismiss it once again so they can listen to the
   text as it reads"). The tour ENDS on the Bible: the Bible stop presses
   Listen, the player stop opens the player from the bar and rings the voice
   row (`afterTarget`), the back-to-words stop closes it with ‹, and the closing
   card sits over John 3 with the verses still lighting up — Done keeps the
   reading running, Skip stops it. Those three carry `listening: true`: the
   tour's playback is up there by construction (`enter: 'ensureListening'`
   starts John 3 if nothing of the tour's is playing), entering one keeps what
   plays, and leaving the span for any other stop stops it (tour-controller).
   `doneIf` names the fact that means "already done" for a press stop whose
   press has a visible result — the sheet open, the sheet gone — so a reader
   who did it themselves, or Back into a stop already in that state, is not
   asked to do it again.

   THE WORDS are the trailer's (Creative, 2026-09-04): "Press Listen", "The
   words light up as they are read", "verse by verse", "a backup", "Export".
   bannedWord() keeps the jargon out; the test pins both.

   No Scripture is quoted here: the Bible stop shows whatever translation the
   reader chose, untouched.
   ═══════════════════════════════════════════════════════════════════════ */

export const TOUR_WORDS = Object.freeze([
  'The Volumes of Truth', 'The Scriptures of Truth', 'Press Listen',
  'The words light up as they are read', 'verse by verse', 'Journal', 'New Entry',
  'a backup', 'Export', 'Import', 'Your Data',
  // The two words the real selection bar shows, so the reader recognises them under their finger.
  'Highlight', 'Note',
  // The two halves of the web, as the Home button and the screen's own control name them.
  'Scripture Web', 'My Web',
  // The listening sheet's own kicker, so the reader finds the voice row under the words the card used.
  'Listening now',
]);

/** Words an older reader should never have to decode. Matched whole, case-insensitive. */
const BANNED = ['tutorial', 'onboarding', 'coach mark', 'coachmark', 'modal', 'UI', 'UX', 'app bar', 'FAB', 'toggle', 'swipe', 'sync', 'config'];

/**
 * @typedef {Object} TourStep
 * @property {string} id
 * @property {number} number         0 for the welcome card, then 1.. — the array position, never typed
 * @property {string} screen         the screen the stop lives on
 * @property {string|null} enter     nav key the tour calls to get there
 * @property {{selector:string,text?:string}|null} target  the control to ring
 * @property {'press'|'highlightDemo'|string|null} act   what Next does before moving on
 * @property {string} eyebrow        'N of M · label' for a numbered stop, built from the position
 * @property {string} [label]        the eyebrow's words after the count ('The Letters'); none on the closing card
 * @property {string} title
 * @property {string} text
 * @property {string} [tip]
 * @property {string} [after]      what the card says once the ringed control has been pressed (Listen stops)
 * @property {{selector:string,text?:string}} [afterTarget]  the control ringed once pressed, where the press
 *                                 opened something (the player stop rings the voice row inside the sheet)
 * @property {boolean} [listening] the tour's playback is up on this stop by construction: entering keeps it,
 *                                 leaving the listening span stops it, the card docks (tour-controller / overlay)
 * @property {{selector:string,present:boolean}} [doneIf]  the press already happened when `selector` is
 *                                 (present) / is not (absent) on the page — the reader did it, or the stop is
 *                                 re-entered in that state; the overlay marks the stop pressed, acts nothing
 * @property {string} [seekKey]    AUDIO_SYNC key of the recording the press starts: the tour seeks to its
 *                                 first lit clause, so the words light up within a second of the press
 *                                 instead of after the recording's silent lead-in (26.75 s on "Chosen by
 *                                 God"; Corbin's device walk, 2026-09-04)
 * @property {string} primary        the primary button's label
 * @property {string} [settingsGroup] a Settings group the stop needs open
 */

/** THE GESTURE, IN ONE SENTENCE PAIR, OWNED HERE (journey F2.1, 2026-09-12). The highlight stop
    opens with these words and the first-run hint pill (AnnotationHint, bundle d) says exactly
    them, read through TourController.highlightWords() the way the stop count travels — so the
    pill can never drift from the stop it echoes, as its own copy did ("highlight, note, or
    bookmark" against "Highlight, or Note"). */
export const HIGHLIGHT_GESTURE_WORDS = 'Hold your finger on any line for a moment. A small bar appears: Highlight, or Note.';

/** The listening sheet's ‹ button, as the two cards that point at it name it. */
const CLOSE_GLYPH = '‹';

/* THE COUNT IS WRITTEN ONCE (2026-09-10). A stop's `number` is its position in this array and
   its eyebrow's "N of M" is built from that; the word every sentence uses to count the stops
   ("seven stops, about two minutes" on the welcome card, the Home strip and the Settings Help
   note) is TOUR_STOPS_WORD below, and the minutes beside it are TOUR_MINUTES_WORD — typed here
   and nowhere else (the Home strip and the Help note read both through TourController). Until
   tonight all four were typed by hand, and the Home strip still said "six" after the highlight
   stop made it seven. Adding a stop is inserting one object here; nothing else moves. */
const STOPS = [
  {
    id: 'welcome', screen: 'home', enter: 'goHome', target: null, act: null,
    eyebrow: 'Show me around',
    title: 'Welcome to VOTReader',
    // The sentence is finished below, once the array knows how long it is.
    text: 'This is a short tour: {stops} stops, about {minutes} minutes. You can leave at any time with Skip, and see it again from Settings.',
    primary: 'Start',
  },
  {
    id: 'letters', screen: 'home', enter: 'goHome',
    target: { selector: '.home-nav-item', text: 'The Volumes of Truth' }, act: 'openLetter',
    label: 'The Letters',
    title: 'The Letters live here',
    text: 'Tap a Volume, then a letter. Tap this tile now, or press Next and I will open one for you.',
    primary: 'Next',
  },
  {
    id: 'listen', screen: 'vot-one-letter', enter: 'openLetter',
    target: { selector: '.hero-play-pill' }, act: 'press', seekKey: 'one:chosen-by-god',
    label: 'Listen',
    title: 'Hear it read aloud',
    text: 'Press Listen. The words light up as they are read, and the page follows along.',
    tip: 'Tap it now, or press Next and I will do it for you.',
    after: 'Hear it? The words light up as they are read, and the page follows along. Press Next when you are ready.',
    primary: 'Next',
  },
  /* HIGHLIGHTING GETS A STOP (Corbin, 2026-09-10). It used to be a clause in the closing
     card — "Hold on any text to highlight it or add a note" — which tells the reader a
     feature exists at the moment the tour stops showing them anything. This rides the letter
     screen the Listen stop already opened (same `screen`, same `enter`, so no navigation is
     added) and rings a PARAGRAPH rather than a control, because here the text is the thing
     being taught. `highlightDemo` paints the real highlight's colour on that paragraph and
     writes NOTHING: see tour-controller.js, where the paint and its removal live. Its card DOCKS
     like the Listen stops' — same rule (nothing sits over text the tour is showing something on)
     and the geometry insists too, a letter paragraph being most of a phone screen. */
  {
    id: 'highlight', screen: 'vot-one-letter', enter: 'openLetter',
    target: { selector: '.letter-para' }, act: 'highlightDemo',
    label: 'Highlight',
    title: 'Mark what speaks to you',
    text: HIGHLIGHT_GESTURE_WORDS + ' Your highlights and notes collect in the Library.',
    tip: 'Try it now, or press Next and I will show you.',
    after: 'See the colour? Hold on any line to do this yourself, any time. Press Next when you are ready.',
    primary: 'Next',
  },
  /* THE WEB GETS A STOP (Corbin, 2026-09-11: "add a stop about it to the tutorial … both the
     trailer and the tutorial should mention both halves of the scripture web"). It rings the
     Home button the same ask put back, so `enter` is goHome (the highlight stop leaves the tour
     on the letter; one navigation, as the journal and backup stops pay). The three sentences are
     the trailer slide's own (Creative's cut 8), so the app and the trailer agree, and they name
     both halves by their on-screen names. It sat after the Bible stop until 2026-09-13, when the
     Bible moved to the end so the tour could finish with the verses still being read. */
  {
    id: 'scripture-web', screen: 'home', enter: 'goHome',
    target: { selector: '.home-shortcuts button', text: 'Scripture Web' }, act: null,
    label: 'The Scripture Web',
    title: 'See the Scriptures as a web',
    text: 'Every place one verse points to another is drawn as a thread. Scripture Web shows the whole Bible\'s threads. My Web holds the links you make yourself.',
    tip: 'Tap a thread to read both ends.',
    primary: 'Next',
  },
  {
    id: 'journal', screen: 'journal-home', enter: 'goJournalHub',
    target: { selector: '.jrn-fab-newentry' }, act: null,
    label: 'Journal',
    title: 'Keep your own notes in the Journal',
    text: 'Your Journal is in the Library. Tap New Entry to write one. It saves by itself as you write.',
    primary: 'Next',
  },
  {
    id: 'backup', screen: 'settings', enter: 'openSettingsData', settingsGroup: 'data',
    target: { selector: '[data-settings-group="data"] button', text: 'Export' }, act: null,
    label: 'Your Data',
    title: 'Keep a backup',
    text: 'Your notes stay on your device. One tap on Export saves a backup file. Import brings it back.',
    primary: 'Next',
  },
  /* SETTINGS GETS A STOP (Corbin, 2026-09-10: "a stop showing users they can toggle certain
     features on/off in settings"). It rides the Settings screen the backup stop already opened
     (same `screen`, same `enter`, so no navigation is added), opens the Reading group and rings
     the dice row — the same feature the reader met on Home — and names three features by the
     words the reader sees on screen. "toggle" is on the banned list; "switched on or off" is
     what the card says. */
  {
    id: 'settings', screen: 'settings', enter: 'openSettingsData', settingsGroup: 'reading',
    target: { selector: '[data-settings-group="reading"] .settings-row', text: 'Surprise Me' }, act: null,
    label: 'Settings',
    title: 'Make it yours',
    /* Corbin, 2026-09-11: say too that whole features go quiet here — "control many UI
       features (like disabling search, history, other icons, etc)". Search and History are the
       rows' own names; "the icons in the top bar" is the Top-Nav Buttons group's own subtitle. */
    text: 'Most of what you have seen can be switched on or off here in Settings: the Surprise Me button on Home, the Reading Position Marker in the top bar, Auto-Scroll, even Search and History, and which icons sit in the top bar. Turn off what you do not use.',
    primary: 'Next',
  },
  /* THE TOUR ENDS ON THE BIBLE (Corbin, 2026-09-12, and the Tour Reviewer's reorder, accepted
     2026-09-13). The Bible stop presses Listen; the two stops after it teach the player over
     that same playback; the closing card sits over the verses still lighting up. Its `enter`
     is openBible from wherever the tour was (Settings, going forward) — and its card says so. */
  {
    id: 'bible', screen: 'bible-ch', enter: 'openBible',
    target: { selector: '.hero-play-pill' }, act: 'press',
    label: 'The Scriptures',
    title: 'The Bible too, verse by verse',
    text: 'I opened John 3 for you: Home › The Scriptures of Truth › Gospels › John › 3. Press Listen and the verses light up one by one as they are read.',
    after: 'Hear it? Each verse lights up as it is read. Press Next when you are ready.',
    primary: 'Next',
  },
  /* THE PLAYER (Corbin, 2026-09-12). The bar's own "Open listening controls" button is the
     ring; the press opens the listening sheet, and the ring moves to the voice row at its top —
     the three Bible editions here, a letter's readers on a letter — or, on a recording with one
     voice, to the transport (first on-screen match of the comma selector). `doneIf`: the sheet
     already open (the reader tapped the bar, or Back from the next stop) is the press done. */
  {
    id: 'player', screen: 'bible-ch', enter: 'ensureListening', listening: true,
    target: { selector: '.audio-bar-summary' }, act: 'press',
    afterTarget: { selector: '.audio-manager-voice-top, .audio-manager-transport' },
    doneIf: { selector: '.audio-manager-sheet', present: true },
    label: 'The Player',
    title: 'Whatever is playing lives here',
    text: 'The bar at the bottom shows what is being read. Tap it to open the player.',
    tip: 'Tap it now, or press Next and I will open it for you.',
    // Five lines of a docked card on a phone: 162 characters (tour-steps.test.js, measured 2026-09-13).
    // Leads with the teaching (the Tour Reviewer's D6): where a card is cut, the cut line must not be this one.
    after: 'Tap another edition under Listening now: the chapter starts again in that voice, and the rest follow. Pause, skip or slow the reading here. Press Next when ready.',
    primary: 'Next',
  },
  /* BACK TO THE WORDS. The sheet's ‹ (a real 44 px button, SheetHandle) is the ring; the press
     closes the sheet and the reading is the brightest thing on the screen again. `doneIf`: no
     sheet on the page — the reader closed it by ‹, by the backdrop or by Back, or Back arrived
     here from the closing card — is the press done. Nothing here the reader can try inside the
     tour and fail: the dim panes leave only ‹ open. */
  {
    id: 'back-to-words', screen: 'bible-ch', enter: 'ensureListening', listening: true,
    target: { selector: '.audio-manager-sheet .sheet-handle-back' }, act: 'press',
    doneIf: { selector: '.audio-manager-sheet', present: false },
    label: 'Back to the Words',
    title: 'Close the player, keep listening',
    text: 'Tap ' + CLOSE_GLYPH + ' at the top of the player to put it away. The reading goes on.',
    tip: 'Tap it now, or press Next and I will do it for you.',
    // The letters' half of Corbin's ask lives here: the same row switches a letter's reader.
    after: 'You are back with the words, and they keep lighting up as they are read. A letter\'s reader is changed the same way. Press Next when you are ready.',
    primary: 'Next',
  },
  /* The closing card docks over John 3 with the verses still being read: Done leaves the
     playback running (tour-controller end(keepAudio)); Skip, Escape and Android Back stop it
     like every other exit. `listening` docks the card and keeps the column open above it. */
  {
    id: 'done', screen: 'bible-ch', enter: 'ensureListening', listening: true, target: null, act: null,
    title: "That's the tour",
    // Highlighting used to be taught here, in passing. It has its own stop now, so teaching it
    // again on the way out would repeat it at the one moment nothing can be shown.
    text: 'You can see this tour again from Settings › Help. The reading goes on. Enjoy your reading.',
    primary: 'Done',
  },
];

// The numbered stops: everything after the welcome card, the closing card included ("7 of 7").
const NUMBERED = STOPS.length - 1;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** The stop count as the word the sentences use ("eleven stops, about three minutes"). */
export const TOUR_STOPS_WORD = WORDS[NUMBERED] || String(NUMBERED);
/** The minutes the same sentences promise; honest for eleven quick stops (the Orchestrator, 2026-09-13). */
export const TOUR_MINUTES_WORD = 'three';

/** @type {ReadonlyArray<TourStep>} */
export const TOUR_STEPS = Object.freeze(STOPS.map((s, i) => Object.freeze({
  ...s,
  number: i,
  eyebrow: i === 0 ? s.eyebrow : `${i} of ${NUMBERED}${s.label ? ' · ' + s.label : ''}`,
  text: i === 0 ? s.text.replace('{stops}', TOUR_STOPS_WORD).replace('{minutes}', TOUR_MINUTES_WORD) : s.text,
})));

export function stepCount() { return TOUR_STEPS.length; }
export function nextIndex(i) { return Math.min(TOUR_STEPS.length - 1, i + 1); }
export function prevIndex(i) { return Math.max(0, i - 1); }

/** The first banned word found in `text`, or null. */
export function bannedWord(text) {
  const t = String(text || '');
  for (const w of BANNED) {
    const re = new RegExp('(^|[^A-Za-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)', w === w.toUpperCase() ? '' : 'i');
    if (re.test(t)) return w;
  }
  return null;
}

/**
 * The control a stop rings: the first match that is actually on screen. The
 * pager keeps a copy of the neighbouring letters parked off-screen, so a bare
 * querySelector would ring a Listen pill the reader cannot see.
 * @param {{target: {selector:string, text?:string}|null}} step
 * @param {Document|Element} [root]
 * @returns {Element|null}
 */
export function findTarget(step, root) {
  const t = step && step.target;
  if (!t || !t.selector) return null;
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 100000;
  const want = t.text ? String(t.text).toLowerCase() : null;
  for (const el of doc.querySelectorAll(t.selector)) {
    if (want && !(el.textContent || '').toLowerCase().includes(want)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right <= 0 || r.left >= vw) continue;
    return el;
  }
  return null;
}
