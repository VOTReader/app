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
   it started. A nav key navigates; null just moves on. The reader may also tap the ringed control themselves — the
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
]);

/** Words an older reader should never have to decode. Matched whole, case-insensitive. */
const BANNED = ['tutorial', 'onboarding', 'coach mark', 'coachmark', 'modal', 'UI', 'UX', 'app bar', 'FAB', 'toggle', 'swipe', 'sync', 'config'];

/**
 * @typedef {Object} TourStep
 * @property {string} id
 * @property {number} number         0 for the welcome card, then 1..6
 * @property {string} screen         the screen the stop lives on
 * @property {string|null} enter     nav key the tour calls to get there
 * @property {{selector:string,text?:string}|null} target  the control to ring
 * @property {'press'|string|null} act   what Next does before moving on
 * @property {string} eyebrow
 * @property {string} title
 * @property {string} text
 * @property {string} [tip]
 * @property {string} [after]      what the card says once the ringed control has been pressed (Listen stops)
 * @property {string} primary        the primary button's label
 * @property {string} [settingsGroup] a Settings group the stop needs open
 */

/** @type {ReadonlyArray<TourStep>} */
export const TOUR_STEPS = Object.freeze([
  {
    id: 'welcome', number: 0, screen: 'home', enter: 'goHome', target: null, act: null,
    eyebrow: 'Show me around',
    title: 'Welcome to VOTReader',
    text: 'This is a short tour: six stops, about two minutes. You can leave at any time with Skip, and see it again from Settings.',
    primary: 'Start',
  },
  {
    id: 'letters', number: 1, screen: 'home', enter: 'goHome',
    target: { selector: '.home-nav-item', text: 'The Volumes of Truth' }, act: 'openLetter',
    eyebrow: '1 of 6 · The Letters',
    title: 'The Letters live here',
    text: 'Tap a Volume, then a letter. Tap this tile now, or press Next and I will open one for you.',
    primary: 'Next',
  },
  {
    id: 'listen', number: 2, screen: 'vot-one-letter', enter: 'openLetter',
    target: { selector: '.hero-play-pill' }, act: 'press',
    eyebrow: '2 of 6 · Listen',
    title: 'Hear it read aloud',
    text: 'Press Listen. The words light up as they are read, and the page follows along.',
    tip: 'Tap it now, or press Next and I will do it for you.',
    after: 'Hear it? The words light up as they are read, and the page follows along. Press Next when you are ready.',
    primary: 'Next',
  },
  {
    id: 'bible', number: 3, screen: 'bible-ch', enter: 'openBible',
    target: { selector: '.hero-play-pill' }, act: 'press',
    eyebrow: '3 of 6 · The Scriptures',
    title: 'The Bible too, verse by verse',
    text: 'I opened John 3 for you: Home › The Scriptures of Truth › Gospels › John › 3. Press Listen and the verses light up one by one as they are read.',
    after: 'Hear it? Each verse lights up as it is read. Press Next when you are ready.',
    primary: 'Next',
  },
  {
    id: 'journal', number: 4, screen: 'journal-home', enter: 'goJournalHub',
    target: { selector: '.jrn-fab-newentry' }, act: null,
    eyebrow: '4 of 6 · Journal',
    title: 'Keep your own notes in the Journal',
    text: 'Your Journal is in the Library. Tap New Entry to write one. It saves by itself as you write.',
    primary: 'Next',
  },
  {
    id: 'backup', number: 5, screen: 'settings', enter: 'openSettingsData', settingsGroup: 'data',
    target: { selector: '[data-settings-group="data"] button', text: 'Export' }, act: null,
    eyebrow: '5 of 6 · Your Data',
    title: 'Keep a backup',
    text: 'Your notes stay on your device. One tap on Export saves a backup file. Import brings it back.',
    primary: 'Next',
  },
  {
    id: 'done', number: 6, screen: 'home', enter: 'goHome', target: null, act: null,
    eyebrow: '6 of 6',
    title: "That's the tour",
    text: 'Hold on any text to highlight it or add a note. You can see this tour again from Settings › Help. Enjoy your reading.',
    primary: 'Done',
  },
]);

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
