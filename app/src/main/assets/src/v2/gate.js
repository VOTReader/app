/* gate.js - the dev-only ?gate=<id> hook (mw4, spec: design's v2-step2/gate-refs/README.md + states.json).

   `<build>?gate=<id>` opens the app in the state of gate picture <id> with no taps, then sets <html data-gate="ready"> once
   that state is painted (fonts loaded, two frames), so tools/desk.py (PC) and the S22 shot wait for it instead of a timer.
   Rules: it seeds MEMORY only (never localStorage or IndexedDB: a gate run must leave the reader's data as it found it);
   it is inert on the live website; an id this build does not know yet sets data-gate="unknown" (the shooter then fails by
   name). Each entry below is the states.json row for that id, in the app's terms; add one per screen as it is built. */

import { gateMarks } from './notes-facts.js';
import { GATE_CHOSEN } from './search-facts.js';
import { gateListening, gateData } from './settings-pages.js';
import { gateDownloads } from './offline-facts.js';
import { gatePlans } from './plans-facts.js';

/** The website readers use: the hook never acts there. */
export const LIVE_HOSTS = ['votreader.github.io'];

/** 'now' for relative dates in every gate picture (states.json "clock": a Wednesday). */
export const GATE_NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 3600 * 1000;

/**
 * One gate state: `stack` is the history the hook fakes (its last entry is the place shown; the one before names Back),
 * `facts` what the screen would otherwise read from storage, `scroll` where the page sits (px, 'end' = scrolled as far
 * as it goes, or a selector whose element's top goes right under the top bar), `playing` the recording loaded (states.json's playing: item, reader code,
 * at/length in seconds, paused; the player reads it, agreed with readalong 10-14). rv1 adds optional playing.rate,
 * playing.sleep ({ minutes, left } in min / s, or 'end') and playing.saved (true = saved on this device), and `player`:
 * open ('now-playing', or a sheet: 'speed' | 'sleep' | 'up-next' | 'more'), full (full screen) and toast (the hint drawn).
 * playing.savedRecording: the recording is in the Listening Library's Saved (2f's Save; default not).
 * @typedef {{ place: string, collection?: string, n?: number, kind?: string, id?: string, book?: string, chapter?: number | string,
 *   verse?: number, match?: string[], study?: string }} Route
 * @typedef {{ item: Record<string, any>, reader: string, at: number, length: number, paused: boolean } & Record<string, any>} GatePlaying
 * `open` names a sheet the screen opens on the gate boot ({ sheet: 'mark-paragraph', para, colour } on a letter; the
 * shell's { sheet: 'text-and-theme' }; 9c's { toast: 'offline-listen' }, the Listen pill's); `look` the text and page
 * shown (look.js: { scale, page, lines }; Slate otherwise).
 * @typedef {{ stack: Route[], facts?: Record<string, any>, scroll?: number | string | { to: string, gap?: number, phone?: boolean },
 *   playing?: GatePlaying | null, player?: Record<string, any>, open?: Record<string, any>,
 *   look?: { scale?: number, page?: string, lines?: string } }} GateState
 */

/** Letter 1 of Volume One loaded at 3:51 of 10:08, read by Benjamin (states.json 0a, 0b, 2a, 1b). */
const LETTER1_AT_351 = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608 };

/** Home's seeded saved data (states.json 0a/0b data): Continue is Letter 1; Recent is John 3, then Letter 2. */
const HOME_FACTS = {
  home: {
    continue: { kind: 'letter', collection: 'one', n: 1 },
    recent: [{ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }, { kind: 'letter', collection: 'one', n: 2 }],
  },
};
const OVER_VOLUME_ONE = [{ place: 'home' }, { place: 'collection', collection: 'one' }];
/** Words To Live By, Part One, Entry 46 from its collection page (1d, 1e). */
const WTLB_46 = [{ place: 'home' }, { place: 'collection', collection: 'wtlb1' }, { place: 'letter', collection: 'wtlb1', n: 46 }];
/** Volume One, Letter 9 (1f, 1g). */
const LETTER_9 = [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 9 }];
const LETTER_ONE_PLAYING = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608, paused: false, saved: true };

/** @type {Record<string, GateState>} */
export const GATE_STATES = {
  // states.json 0a-home: Home at the top, Home lit; Continue reading Letter 1, Recent John 3 + Letter 2; Letter 1 paused.
  '0a-home': {
    stack: [{ place: 'home' }],
    facts: HOME_FACTS,
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 0b-home-more: Home scrolled 500 px (as the picture was drawn): Volume Four's row just under the top bar,
  // whose hairline shows.
  '0b-home-more': {
    stack: [{ place: 'home' }],
    facts: HOME_FACTS,
    scroll: 500,
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 4a-settings: Settings from Home; one recording saved (48 MB), exported 2 days ago, Benjamin first, KJV
  // Bible audio, 1x, standard size, Slate, comfortable lines, NKJV.
  '4a-settings': {
    stack: [{ place: 'home' }, { place: 'settings' }],
    facts: {
      textSize: 'standard', page: 'slate', lines: 'comfortable',
      translation: 'nkjv', doubleTapFullscreen: true,
      reader: 'B', bibleAudio: 'brm-kjv', speed: 1,
      downloads: { count: 1, bytes: 48 * 1024 * 1024 },
      lastExportAt: GATE_NOW - 2 * DAY,
      now: GATE_NOW,
    },
  },
  // states.json 2a-collection: Volume One from Home, at the top; Letter 1 playing at 3:51, Letter 2 finished, Letter 3 with
  // 6 minutes left (progress keys are <collection>/<n>, collection-facts.js).
  '2a-collection': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }],
    facts: { progress: { 'one/2': { finished: true }, 'one/3': { leftMin: 6 } } },
    playing: { ...LETTER1_AT_351, paused: false },
  },
  // states.json 1a-letter: Volume One, Letter 1 (Chosen by God), top of the page, not playing; Back says Volume One.
  '1a-letter': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
  },
  // states.json 5a-bible: The Bible from Home on the New Testament (the reader is reading John), at the top.
  '5a-bible': {
    stack: [{ place: 'home' }, { place: 'bible' }],
    facts: { bible: { reading: 'john' } },
  },
  // states.json 5b-book: Genesis from The Bible, chapters 1-11 read, 12 next (ringed); John 3 loaded, paused at 0:46 of
  // 6:24 (the mini player; the laptop's player bar).
  '5b-book': {
    stack: [{ place: 'home' }, { place: 'bible' }, { place: 'bible-book', book: 'genesis' }],
    facts: { bible: { read: { genesis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }, place: { genesis: 12 } } },
    playing: { item: { book: 'john', chapter: 3 }, reader: 'B', at: 46, length: 384, paused: true },
  },
  // states.json 1b-letter-playing: Letter 1 playing, scrolled into the text with the bars stepped aside (reading-bars.js),
  // one clause lit, the mini player. The picture's 3:51 of 10:08 was drawn, not measured: Letter 1's recording runs 75 s
  // and 0:47 lights "For the years draw short, Timothy," (readalong 10-15; the app lights a clause, never the whole
  // sentence). Phone only: paragraph 1 starts 118 px above where the top bar ends before it steps aside (the shift keeps
  // lines still, whenever the phone's inset arrives), so it sits 35 px above the screen's top as drawn and line 2 sits
  // right under the status bar (measured against the picture with measure.py); the laptop stays at the top, bars shown.
  '1b-letter-playing': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    playing: { ...LETTER_ONE_PLAYING, at: 47, length: 75 },
    scroll: { to: '.body [data-hl-key$=":0"]', gap: -118, phone: true },
  },
  // states.json 2c-john3-playing: John 3 from Home > The Bible > John, at its top (bars shown: the head is in view),
  // playing with verse 2 lit; Back says John. The picture's 0:46 of 6:24 was drawn: the Word of Promise John 3 runs
  // 312 s and its timings light verse 2 from 15.0 to 24.0 s (at 46 the app lights verse 5; readalong 10-15).
  '2c-john3-playing': {
    stack: [{ place: 'home' }, { place: 'bible' }, { place: 'bible-book', book: 'john' }, { place: 'bible-chapter', book: 'john', chapter: 3 }],
    facts: { translation: 'nkjv' },
    playing: { item: { book: 'john', chapter: 3 }, reader: 'B', at: 19, length: 312, paused: false },
  },
  // states.json 1c-aa-sheet: Letter 1 at its top, Text and theme open: standard size (step 3 of 6), Slate, Comfortable.
  '1c-aa-sheet': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    open: { sheet: 'text-and-theme' },
    look: { scale: 1, page: 'slate', lines: 'comfortable' },
  },
  // states.json 4b-mark-paragraph: Letter 1's first paragraph tapped (its gold bar just under the top bar, the head
  // scrolled away), "Mark this paragraph" open with gold ringed; nothing playing.
  '4b-mark-paragraph': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    scroll: { to: '.body [data-hl-key$=":0"]', gap: 20 },
    open: { sheet: 'mark-paragraph', para: 0, colour: 'gold' },
  },
  // states.json 3c-notes (zv1): the Notes tab, All; a journal entry, a highlight and a note today/yesterday, a bookmark
  // Sunday, a link Oct 9.
  '3c-notes': { stack: [{ place: 'notes', kind: 'all' }], facts: { marks: gateMarks(GATE_NOW).slice(0, 5), now: GATE_NOW } },
  // states.json 3d-notes-journal: the same tab on Journal: 3c's marks plus two older entries; only the three entries show.
  '3d-notes-journal': { stack: [{ place: 'notes', kind: 'journal' }], facts: { marks: gateMarks(GATE_NOW), now: GATE_NOW } },
  // states.json 8c-notes-empty: nothing marked yet.
  '8c-notes-empty': { stack: [{ place: 'notes', kind: 'all' }], facts: { marks: [], now: GATE_NOW } },
  // rv1 Listening (states.json 2b, 6a, 6b, 6c): Now playing opened over Volume One's page (Home > Volume One), Letter 1
  // read by Benjamin at 3:51 of 10:08, saved on this device; 6a-6c open a sheet over it.
  '2b-now-playing': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'now-playing' } },
  '6a-speed': { stack: OVER_VOLUME_ONE, playing: { ...LETTER_ONE_PLAYING, rate: 1.25 }, player: { open: 'speed' } },
  '6b-sleep': { stack: OVER_VOLUME_ONE, playing: { ...LETTER_ONE_PLAYING, sleep: { minutes: 30, left: 24 * 60 } }, player: { open: 'sleep' } },
  '6c-up-next': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'up-next' } },
  '2f-player-more': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'more' } },
  // states.json 9b-full-screen: Letter 2 full screen (every bar hidden), paragraph 1 at the top, the hint showing.
  '9b-full-screen': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }],
    player: { full: true, toast: 'Full screen. Double-tap to come back.' },
    scroll: '.body',
  },
  // states.json 3a-search: the Search tab before typing.
  '3a-search': { stack: [{ place: 'search' }], facts: { search: { query: '', scope: 'all', hits: [], marks: [] } } },
  // states.json 3b-search-results: 'chosen' typed, All, the field focused; Volume One's Letters 1 and 4, then John 13:18.
  '3b-search-results': { stack: [{ place: 'search' }], facts: { search: GATE_CHOSEN } },
  // states.json 5c-search-match: John 3 (NKJV) opened from a search for 'born again', verse 3 a third of the way down with
  // the words underlined; Back says Search and Search stays lit.
  '5c-search-match': {
    stack: [{ place: 'search' }, { place: 'bible-chapter', book: 'john', chapter: 3, verse: 3, match: ['born again'] }],
    facts: { translation: 'nkjv' },
  },
  // states.json 7a-listening (zv1): Settings > Listening from Home; Benjamin, KJV Bible audio, 1x, every switch on.
  '7a-listening': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/listening' }], facts: { listening: gateListening() } },
  // states.json 7b-your-data: exported 2 days ago, the newest snapshot today, 7 kept on this phone, the weekly copy off.
  '7b-your-data': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/your-data' }], facts: { data: gateData(GATE_NOW) } },
  // states.json 7c-help: Help and about; the version line is this build's own.
  '7c-help': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/help' }], facts: {} },
  // states.json 4c-downloads (zv1): Volume One from Home while it downloads with no connection: the queue bar (12 of 29)
  // stuck under the top bar with Letter 4 right below it (gap = the bar's 59 px), 4 on this phone, 5 at 64 %, 6 failed,
  // 7 waiting for Wi-Fi; the no-connection toast.
  '4c-downloads': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }],
    facts: { downloads: gateDownloads(), offline: true },
    scroll: { to: '.rows .row[data-key="one/4"]', gap: 59 },
  },
  // states.json 9c-offline: Letter 2 with no connection and nothing on this phone, Listen just tapped: its toast. The
  // toast is the Listen pill's (readalong's ListenPill, rv1 1b part 2), from offline-facts.js offlineListenWords.
  '9c-offline': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }],
    facts: { offline: true },
    open: { toast: 'offline-listen' },
  },
  // states.json 9a-plans (zv1): Reading plans from Home; Bible in a Year on day 40 of 365 (Numbers 11-13, a day to catch
  // up, 11 % done), the Volumes in Order not started with 2 a day chosen.
  '9a-plans': { stack: [{ place: 'home' }, { place: 'reading-plans' }], facts: { plans: gatePlans() } },
  // states.json 8a-welcome (zv1): the welcome a first visit opens on; no tab, no Back, no bars.
  '8a-welcome': { stack: [{ place: 'welcome' }] },
  // states.json 8b-install (zv1): Volume One from Home in a browser on the second visit, the offer open; this browser
  // handed over its install event, so the button is the browser's own Install.
  '8b-install': { stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }], open: { sheet: 'install' }, facts: { install: { flow: 'prompt' } } },
  // dz13 (myweb's v2-gaps 1-4). states.json 1d-wtlb-entry: Words To Live By, Part One, Entry 46 (Building the Gallows)
  // scrolled to its end: [Esther 7], (1 John 3:12) and (Genesis 4:8) in gold, the Next card; Back says Words To Live By.
  // The laptop's whole entry fits, so its end is its top.
  '1d-wtlb-entry': { stack: WTLB_46, scroll: 'end' },
  // states.json 1e-ref-sheet: 1d with (1 John 3:12) tapped: its sheet (the laptop's dialog), the cite washed.
  '1e-ref-sheet': { stack: WTLB_46, scroll: 'end', open: { sheet: 'ref', ref: '1 John 3:12' } },
  // states.json 1f-footnotes: Volume One, Letter 9 (What's In a Name) at its end: the Footnotes list (two notes, then
  // Revelation 3:5) above the Next card.
  '1f-footnotes': { stack: LETTER_9, scroll: 'end' },
  // states.json 1g-footnote-sheet (phone): Letter 9 with footnote 1 tapped, its number 190 px below the screen's top (the
  // scroller starts under the 27 px status bar and the 56 px top bar: 190 - 83), Footnote 1 of 3 open, the number ringed.
  '1g-footnote-sheet': {
    stack: LETTER_9,
    scroll: { to: '.body .fn-ref[data-fn-num="1"]', gap: 107, phone: true },
    open: { sheet: 'footnote', num: '1' },
  },
  // states.json 8d-safari-notice (phone): Letter 1 in a Safari tab, paragraph 1 tapped as in 4b: the first save of the
  // session waits on the 7-day notice (the hook draws it; no Safari, no StorageHealth needed).
  '8d-safari-notice': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    scroll: { to: '.body [data-hl-key$=":0"]', gap: 20 },
    open: { sheet: 'safari-7day', para: 0 },
  },
  // states.json 2d-studies: Studies from Home, at the top; coverage pinned, not live: the Matthew Study Bible and Purity
  // read along, Lamb of God reads along in 14 of its 16 chapters, the rest have no recording.
  '2d-studies': {
    stack: [{ place: 'home' }, { place: 'studies' }],
    facts: { studies: { coverage: {
      'matthew-study': { state: 'read-along' },
      purity: { state: 'read-along', recorded: 6, total: 6 },
      'lamb-of-god': { state: 'read-along', recorded: 14, total: 16 },
    } } },
  },
  // states.json 2e-study-index: YAHUSHUA More Than a Man from Studies, at the top: the Preface and Part 1's first chapter
  // read, Part 1 open, its chapter 2 the one you are on.
  '2e-study-index': {
    stack: [{ place: 'home' }, { place: 'studies' }, { place: 'study', study: 'more-than-a-man' }],
    facts: { studies: {
      place: { current: 'more-than-a-man-ch2', read: ['more-than-a-man-ch0', 'more-than-a-man-ch1'] },
      open: [1],
    } },
  },
};

/**
 * The gate id this page was opened with, or null (no ?gate=, or the live website).
 * @param {{ hostname: string, search?: string } | null} [loc]
 */
export function readGateId(loc = globalThis.location) {
  if (!loc || LIVE_HOSTS.includes(loc.hostname)) return null;
  const id = new URLSearchParams(loc.search || '').get('gate');
  return id ? id : null;
}

/** @param {string} id @returns {GateState | null} */
export function gateState(id) {
  return Object.prototype.hasOwnProperty.call(GATE_STATES, id) ? GATE_STATES[id] : null;
}

/** @param {'ready' | 'unknown' | 'waiting'} value */
export function markGate(value, doc = globalThis.document) {
  if (doc && doc.documentElement) doc.documentElement.dataset.gate = value;
}

/**
 * Resolves once the kit's faces are loaded and two frames have painted with them.
 * @param {any} [doc] @param {(cb: () => void) => any} [raf]
 */
export async function whenPainted(doc = globalThis.document, raf = globalThis.requestAnimationFrame) {
  const fonts = doc && /** @type {any} */ (doc).fonts;
  if (fonts) {
    try {
      await Promise.all([fonts.load('400 20px "EB Garamond"'), fonts.load('italic 400 20px "EB Garamond"'), fonts.load('italic 500 20px "EB Garamond"')]);
      await fonts.ready;
    } catch (_e) { /* a font that fails to load still paints the fallback: the gate's measure then fails by itself */ }
  }
  if (typeof raf === 'function') await new Promise((res) => raf(() => raf(() => res(undefined))));
}
