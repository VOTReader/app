/* gate.js - the dev-only ?gate=<id> hook (mw4, spec: design's v2-step2/gate-refs/README.md + states.json).

   `<build>?gate=<id>` opens the app in the state of gate picture <id> with no taps, then sets <html data-gate="ready"> once
   that state is painted (fonts loaded, two frames), so tools/desk.py (PC) and the S22 shot wait for it instead of a timer.
   Rules: it seeds MEMORY only (never localStorage or IndexedDB: a gate run must leave the reader's data as it found it);
   it is inert on the live website; an id this build does not know yet sets data-gate="unknown" (the shooter then fails by
   name). Each entry below is the states.json row for that id, in the app's terms; add one per screen as it is built. */

/** The website readers use: the hook never acts there. */
export const LIVE_HOSTS = ['votreader.github.io'];

/** 'now' for relative dates in every gate picture (states.json "clock": a Wednesday). */
export const GATE_NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 3600 * 1000;

/**
 * One gate state: `stack` is the history the hook fakes (its last entry is the place shown; the one before names Back),
 * `facts` what the screen would otherwise read from storage.
 * @typedef {{ place: string, collection?: string, n?: number }} Route
 * @typedef {{ stack: Route[], facts?: Record<string, any> }} GateState
 */

/** @type {Record<string, GateState>} */
export const GATE_STATES = {
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
  // states.json 1a-letter: Volume One, Letter 1 (Chosen by God), top of the page, not playing; Back says Volume One.
  '1a-letter': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
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
