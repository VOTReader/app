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
 * @property {string} [seekKey]    AUDIO_SYNC key of the recording the press starts: the tour seeks to its
 *                                 first lit clause, so the words light up within a second of the press
 *                                 instead of after the recording's silent lead-in (26.75 s on "Chosen by
 *                                 God"; Corbin's device walk, 2026-09-04)
 * @property {string} primary        the primary button's label
 * @property {string} [settingsGroup] a Settings group the stop needs open
 */

/* THE COUNT IS WRITTEN ONCE (2026-09-10). A stop's `number` is its position in this array and
   its eyebrow's "N of M" is built from that; the word every sentence uses to count the stops
   ("seven stops, about two minutes" on the welcome card, the Home strip and the Settings Help
   note) is TOUR_STOPS_WORD below. Until tonight all four were typed by hand, and the Home
   strip still said "six" after the highlight stop made it seven. Adding a stop is inserting
   one object here; nothing else moves. */
const STOPS = [
  {
    id: 'welcome', screen: 'home', enter: 'goHome', target: null, act: null,
    eyebrow: 'Show me around',
    title: 'Welcome to VOTReader',
    // The sentence is finished below, once the array knows how long it is.
    text: 'This is a short tour: {stops} stops, about two minutes. You can leave at any time with Skip, and see it again from Settings.',
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
    text: 'Hold your finger on any line for a moment. A small bar appears: Highlight, or Note. Your highlights and notes collect in the Library.',
    tip: 'Try it now, or press Next and I will show you.',
    after: 'See the colour? Hold on any line to do this yourself, any time. Press Next when you are ready.',
    primary: 'Next',
  },
  {
    id: 'bible', screen: 'bible-ch', enter: 'openBible',
    target: { selector: '.hero-play-pill' }, act: 'press',
    label: 'The Scriptures',
    title: 'The Bible too, verse by verse',
    text: 'I opened John 3 for you: Home › The Scriptures of Truth › Gospels › John › 3. Press Listen and the verses light up one by one as they are read.',
    after: 'Hear it? Each verse lights up as it is read. Press Next when you are ready.',
    primary: 'Next',
  },
  /* THE WEB GETS A STOP (Corbin, 2026-09-11: "add a stop about it to the tutorial … both the
     trailer and the tutorial should mention both halves of the scripture web"). It follows the
     Bible stop — the reader has just watched verses light up; the next thing is every place one
     verse points to another — and it rings the Home button the same ask put back, so `enter` is
     goHome (the Bible stop leaves the tour on bible-ch; one navigation, as the journal and backup
     stops pay). The three sentences are the trailer slide's own (Creative's cut 8), so the app and
     the trailer agree, and they name both halves by their on-screen names. */
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
     what the card says. The closing card stays the closing card. */
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
  {
    id: 'done', screen: 'home', enter: 'goHome', target: null, act: null,
    title: "That's the tour",
    // Highlighting used to be taught here, in passing. It has its own stop now, so teaching it
    // again on the way out would repeat it at the one moment nothing can be shown.
    text: 'You can see this tour again from Settings › Help. Enjoy your reading.',
    primary: 'Done',
  },
];

// The numbered stops: everything after the welcome card, the closing card included ("7 of 7").
const NUMBERED = STOPS.length - 1;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** The stop count as the word the sentences use ("seven stops, about two minutes"). */
export const TOUR_STOPS_WORD = WORDS[NUMBERED] || String(NUMBERED);

/** @type {ReadonlyArray<TourStep>} */
export const TOUR_STEPS = Object.freeze(STOPS.map((s, i) => Object.freeze({
  ...s,
  number: i,
  eyebrow: i === 0 ? s.eyebrow : `${i} of ${NUMBERED}${s.label ? ' · ' + s.label : ''}`,
  text: i === 0 ? s.text.replace('{stops}', TOUR_STOPS_WORD) : s.text,
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
