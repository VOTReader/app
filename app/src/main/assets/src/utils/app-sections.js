/* ═══════════════════════════════════════════════════════════════════════
   app-sections — the three places at the bottom, and which screen is where
   ═══════════════════════════════════════════════════════════════════════
   The one source of truth for the bottom tab bar (the layout pass,
   2026-11-10, mock read.png / listen.png / library.png / map.png): for every
   screen key in ui/screen-routes.jsx, the tab it belongs to and whether the
   bar shows on it. app-sections.test.js fails when a route has no entry.

     tab    'read' | 'listen' | 'library', or 'keep': the screen keeps the tab
            you came from lit (Search, Settings, About: places every tab reaches)
     bar    true: the bar shows; false: a full-height page (every reader,
            the Scripture Web, the journal's viewer and editor)

   The bar also steps aside, whatever the screen, on the first-run About,
   over the tabs overview, while the tour runs, and while the on-screen
   keyboard is up (barShown).

   Tapping a tab opens its root (TAB_ROOTS); tapping the lit tab on its root
   scrolls that page to the top (tabTap). There are no per-tab history
   stacks: Back keeps working as it always has, and Back from the Listen or
   Library root goes to Read (use-android-back).
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {'read' | 'listen' | 'library'} SectionTab */
/** @typedef {{ tab: SectionTab | 'keep' | null, bar: boolean }} Section */

/** The tabs, left to right, with their roots and their labels. */
export const TABS = Object.freeze(/** @type {const} */ (['read', 'listen', 'library']));
/** @type {Readonly<Record<SectionTab, string>>} */
export const TAB_ROOTS = Object.freeze({ read: 'home', listen: 'audio-library', library: 'library' });
/** @type {Readonly<Record<SectionTab, string>>} */
export const TAB_LABELS = Object.freeze({ read: 'Read', listen: 'Listen', library: 'Library' });

/** @param {SectionTab} tab @returns {Section} */
const on = (tab) => Object.freeze({ tab, bar: true });
const KEEP = Object.freeze({ tab: /** @type {'keep'} */ ('keep'), bar: true });
const FULL = Object.freeze({ tab: null, bar: false });

/** @type {Readonly<Record<string, Section>>} */
export const SECTIONS = Object.freeze({
  // ── READ ──
  'home': on('read'),
  'volumes-home': on('read'),
  'vot-index': on('read'), 'vot-one-index': on('read'), 'vot-three-index': on('read'), 'vot-four-index': on('read'),
  'vot-five-index': on('read'), 'vot-six-index': on('read'), 'vot-seven-index': on('read'),
  'vot-timothy-index': on('read'), 'vot-flock-index': on('read'), 'vot-rebuke-index': on('read'),
  'wtlb-one-index': on('read'), 'wtlb-two-index': on('read'), 'blessed-index': on('read'), 'holy-days-index': on('read'),
  'scriptures-home': on('read'), 'scripture-genre': on('read'), 'bible-idx': on('read'), 'matthew-idx': on('read'),
  'studies-home': on('read'), 'bible-study-index': on('read'),
  'answers-home': on('read'), 'answers-group': on('read'), 'answers-media': on('read'), 'answers-saved': on('read'),

  // ── LISTEN ──
  'audio-library': on('listen'),
  'audio-library-volumes': on('listen'), 'audio-library-offline': on('listen'), 'audio-library-studies': on('listen'), 'audio-library-bible': on('listen'),
  'audio-library-collection': on('listen'), 'audio-library-saved': on('listen'), 'audio-library-songs': on('listen'),
  // ── LIBRARY ──
  'library': on('library'), 'reading-plans': on('library'), 'my-progress': on('library'),
  'notes-index': on('library'), 'highlights-index': on('library'), 'bookmarks-index': on('library'),
  'links-index': on('library'), 'journal-home': on('library'), 'history': on('library'),
  // ── the bar, the tab you came from still lit ──
  'search': KEEP, 'settings': KEEP, 'about': KEEP,
  // ── full-height pages: every reader, the web, the journal's page ──
  'vot-one-letter': FULL, 'vot-letter': FULL, 'vot-three-letter': FULL, 'vot-four-letter': FULL, 'vot-five-letter': FULL,
  'vot-six-letter': FULL, 'vot-seven-letter': FULL, 'vot-timothy-letter': FULL, 'vot-flock-letter': FULL,
  'vot-rebuke-letter': FULL, 'wtlb-one-entry': FULL, 'wtlb-two-entry': FULL, 'blessed-entry': FULL, 'holy-days-entry': FULL,
  'bible-ch': FULL, 'matthew-ch': FULL, 'bible-study-chapter': FULL, 'answers-entry': FULL, 'hm-letter': FULL,
  'garden-view': FULL, 'scripture-web': FULL, 'journal-viewer': FULL, 'journal-editor': FULL,
});

/**
 * Where a screen lives. An unknown key (a removed route restored from an old save) falls back the way the app does,
 * to Home's place.
 * @param {string} screen @returns {Section}
 */
export function sectionOf(screen) {
  return Object.prototype.hasOwnProperty.call(SECTIONS, screen) ? SECTIONS[screen] : SECTIONS.home;
}

/**
 * The tab the bar lights on a screen: its own, or for a 'keep' screen the one lit before it (Read when none was).
 * @param {string} screen @param {SectionTab | null} [previous] @returns {SectionTab | null}
 */
export function litTab(screen, previous = null) {
  const tab = sectionOf(screen).tab;
  if (tab === 'keep') return previous || 'read';
  return tab;
}

/**
 * Whether the bar shows right now.
 * @param {{ screen: string, firstRunAbout?: boolean, overviewOpen?: boolean, tourOn?: boolean, keyboardUp?: boolean }} s
 * @returns {boolean}
 */
export function barShown({ screen, firstRunAbout = false, overviewOpen = false, tourOn = false, keyboardUp = false }) {
  if (firstRunAbout || overviewOpen || tourOn || keyboardUp) return false;
  return sectionOf(screen).bar;
}

/**
 * What a tap on a tab does: 'top' (the lit tab, on its own root: scroll to the top) or 'root' (open the tab's root).
 * @param {SectionTab} tab @param {string} screen @returns {'top' | 'root'}
 */
export function tabTap(tab, screen) {
  return screen === TAB_ROOTS[tab] ? 'top' : 'root';
}
