/* gate.js - the dev-only ?gate=<id> hook (mw4, spec: design's v2-step2/gate-refs/README.md + states.json).

   `<build>?gate=<id>` opens the app in the state of gate picture <id> with no taps, then sets <html data-gate="ready"> once
   that state is painted (fonts loaded, two frames), so tools/desk.py (PC) and the S22 shot wait for it instead of a timer.
   Rules: it seeds MEMORY only (never localStorage or IndexedDB: a gate run must leave the reader's data as it found it);
   it is inert on the live website; an id this build does not know yet sets data-gate="unknown" (the shooter then fails by
   name). Each entry below is the states.json row for that id, in the app's terms; add one per screen as it is built. */

import { gateMarks } from './notes-facts.js';
import { GATE_CHOSEN } from './search-facts.js';

/** The website readers use: the hook never acts there. */
export const LIVE_HOSTS = ['votreader.github.io'];

/** 'now' for relative dates in every gate picture (states.json "clock": a Wednesday). */
export const GATE_NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 3600 * 1000;

/**
 * One gate state: `stack` is the history the hook fakes (its last entry is the place shown; the one before names Back),
 * `facts` what the screen would otherwise read from storage, `scroll` where the page sits (px, or a selector whose
 * element's top goes right under the top bar), `playing` the recording loaded (states.json's playing: item, reader code,
 * at/length in seconds, paused; the player reads it, agreed with readalong 10-14). rv1 adds optional playing.rate,
 * playing.sleep ({ minutes, left } in min / s, or 'end') and playing.saved (true = saved on this device), and `player`:
 * open ('now-playing', or a sheet: 'speed' | 'sleep' | 'up-next'), full (full screen) and toast (the hint drawn).
 * @typedef {{ place: string, collection?: string, n?: number, kind?: string, id?: string, book?: string, chapter?: number | string,
 *   verse?: number, match?: string[] }} Route
 * @typedef {{ item: Record<string, any>, reader: string, at: number, length: number, paused: boolean } & Record<string, any>} GatePlaying
 * @typedef {{ stack: Route[], facts?: Record<string, any>, scroll?: number | string, playing?: GatePlaying | null,
 *   player?: Record<string, any> }} GateState
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
