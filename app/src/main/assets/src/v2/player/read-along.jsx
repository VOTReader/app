/* player/read-along.jsx - the read sentence lit on v2's letter body (rv1, 1b-letter-playing). Main's ReadAlongHighlight
   (bundle-d, on window) does the work over the one engine: the same timings file, wash, follow, tap-to-seek and
   double-tap rule as the v1 letter. Importing it here would bundle a second AudioPlayer into bundle-v2, so it is read
   from window at render time. A gate boot never touches the engine: it paints a still wash at the row's playing.at
   through main's paintReadAlongAt (the live wash's own paint path) and holds the gate until the wash is on the page.
   A Bible chapter (2c) is the same over main's chapter path: the whole verse lit, keys bible:<book>:<ch>:<v>. A Format B
   entry (Words To Live By, The Blessed, Holy Days) is keyed and mapped as main's WtlbEntryView does it. */
import { bibleHlKey, wtlbHlKey } from '../../utils/hl-keys.js';
import { formatBOffsetMap } from '../../utils/format-b-dom-text.js';
import { formatBFootnotesMode } from '../../utils/excerpt-pieces.js';
import { gateBibleVolKey } from './source.js';

const g = /** @type {any} */ (globalThis);

/** Gate washes not yet painted. The player's `ready` waits until there are none (App's gate waits on the player). */
const pending = new Set();
const listeners = new Set();
const bump = () => { listeners.forEach((cb) => cb()); };
export const stillWashes = {
  /** @param {() => void} cb */
  subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  pending: () => pending.size,
};

/**
 * The gate's clock on this letter: the row's playing.at when the gate is playing THIS letter, else null.
 * @param {any} gate @param {string} collection @param {number} n @returns {number | null}
 */
export function gateAt(gate, collection, n) {
  const p = gate && gate.playing;
  const it = p && p.item;
  return it && it.collection === collection && it.n === n ? Number(p.at) || 0 : null;
}

/**
 * The gate's clock on this Bible chapter: the row's playing.at when the gate is playing THIS chapter, else null.
 * @param {any} gate @param {string} book @param {number} chapter @returns {number | null}
 */
export function gateChapterAt(gate, book, chapter) {
  const p = gate && gate.playing;
  const it = p && p.item;
  return it && it.book === book && it.chapter === chapter ? Number(p.at) || 0 : null;
}

const noSubscribe = () => () => {};
const noVersion = () => 0;

/**
 * main's offsetMapFn for a Format B entry (WtlbEntryView's paraOffsetMap): a paragraph's timings are corpus offsets, and
 * this projects them onto the text v2 draws for it (letter-text.jsx renderFormatB replays format-b-dom-text's rules with
 * the same reference scan), so the wash lights the clause being read, not some other words.
 * @param {Array<{ text?: string }>} paragraphs @param {{ perParagraph: any[] }} scan @param {string} volKey
 * @returns {(pi: number) => ((off: number, isEnd?: boolean) => number) | null}
 */
export function formatBOffsetMaps(paragraphs, scan, volKey) {
  const footnotesMode = formatBFootnotesMode(volKey);
  const cache = new Map();
  return (pi) => {
    if (cache.has(pi)) return cache.get(pi);
    const p = paragraphs[pi];
    const fn = p ? formatBOffsetMap(p.text, { refs: scan.perParagraph[pi] || [], footnotesMode }).toDom : null;
    cache.set(pi, fn);
    return fn;
  };
}

/**
 * Lights the sentence being read on a letter body. `bodyRef` holds the element whose [data-hl-key] blocks carry the
 * letter's text (LetterBlock), the same contract as v1's .letter-body. A Format B entry passes its `paragraphs` and the
 * reference `scan` they were drawn with (footnotes.js formatBRefs): its blocks are main's wtlb:<id>:<i>, mapped.
 * @param {{ gate: any, collection: string, n: number, volKey: string, letterId: string,
 *   bodyRef: { current: HTMLElement | null }, on?: boolean, follow?: boolean, onListen?: (() => void) | null,
 *   paragraphs?: any[] | null, scan?: { perParagraph: any[] } | null }} props
 */
export function LetterReadAlong({ gate, collection, n, volKey, letterId, bodyRef, on = true, follow = true, onListen = null,
  paragraphs = null, scan = null }) {
  const offsetMapFn = React.useMemo(() => (paragraphs && scan ? formatBOffsetMaps(paragraphs, scan, volKey) : null),
    [paragraphs, scan, volKey]);
  if (gate) return <StillWash at={on ? gateAt(gate, collection, n) : null} volKey={volKey} letterId={letterId} bodyRef={bodyRef} />;
  const RA = g.ReadAlongHighlight;
  const hlKeyFn = offsetMapFn ? wtlbHlKey : g.letterHlKey;
  if (typeof RA !== 'function' || typeof hlKeyFn !== 'function' || !volKey || !letterId) return null;
  return <RA volKey={volKey} letterId={letterId} mainRef={bodyRef} hlKeyFn={hlKeyFn} offsetMapFn={offsetMapFn}
    readAlongOn={on} readAlongFollow={follow} onListen={onListen} />;
}

/**
 * Lights the verse being read on a Bible chapter (2c), as main's BibleChapterView mounts the wash. `bodyRef` holds the
 * element whose verse spans carry data-hl-key bible:<book>:<chapter>:<verse>; `volKey` is the edition the reader hears
 * (a gate boot uses the row's own); `textKey` changes when the words on the page change (a new translation).
 * @param {{ gate: any, book: string, chapter: number, volKey: string, bodyRef: { current: HTMLElement | null },
 *   on?: boolean, follow?: boolean, onListen?: (() => void) | null, textKey?: string }} props
 */
export function ChapterReadAlong({ gate, book, chapter, volKey, bodyRef, on = true, follow = true, onListen = null, textKey = '' }) {
  const hlKeyFn = React.useCallback((/** @type {string} */ id, /** @type {number} */ v) => bibleHlKey(id, chapter, v), [chapter]);
  if (gate) {
    return <StillWash at={on ? gateChapterAt(gate, book, chapter) : null} volKey={gateBibleVolKey(gate.playing)} letterId={book}
      chapter={chapter} hlKeyFn={hlKeyFn} bodyRef={bodyRef} />;
  }
  const RA = g.ReadAlongHighlight;
  if (typeof RA !== 'function' || !volKey || !book) return null;
  return <RA volKey={volKey} letterId={book} chapter={chapter} mainRef={bodyRef} hlKeyFn={hlKeyFn}
    readAlongOn={on} readAlongFollow={follow} onListen={onListen} textKey={textKey} />;
}

/**
 * @param {{ at: number | null, volKey: string, letterId: string, bodyRef: { current: HTMLElement | null },
 *   chapter?: number, hlKeyFn?: ((id: string, i: number) => string) | null }} props
 */
function StillWash({ at, volKey, letterId, bodyRef, chapter = 0, hlKeyFn = null }) {
  // a chapter's timings are the edition's table (bibleSyncStore bumps when it lands); a letter's, the letters' file
  const store = chapter ? g.__bibleSyncStore : g.__audioSyncStore;
  const version = React.useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.getVersion : noVersion);
  const want = at == null ? null : volKey + ':' + letterId + (chapter ? ':' + chapter : '') + '@' + at;
  // Held from the first commit (layout, so App's gate effect in the same commit already sees it) until painted.
  const held = React.useRef(/** @type {object | null} */ (null));
  const settle = () => { if (held.current && pending.delete(held.current)) bump(); held.current = null; };
  React.useLayoutEffect(() => {
    if (want == null) return undefined;
    const token = {};
    held.current = token;
    pending.add(token);
    bump();
    return () => {
      if (pending.delete(token)) bump();
      if (held.current === token) held.current = null;
      if (typeof g.clearReadAlong === 'function') g.clearReadAlong();
    };
  }, [want]);
  // Every render until it is painted: the body arrives with the lazy volume and the timings file with its store.
  React.useLayoutEffect(() => {
    if (want == null || !held.current) return;
    const keyFn = chapter ? hlKeyFn : g.letterHlKey;
    if (typeof g.paintReadAlongAt !== 'function' || typeof keyFn !== 'function') { settle(); return; }
    if (!bodyRef.current || !bodyRef.current.querySelector('[data-hl-key]')) return;
    const r = g.paintReadAlongAt({ mainEl: bodyRef.current, volKey, letterId, hlKeyFn: keyFn, time: at, chapter });
    if (r !== 'waiting') settle();
  });
  void version;
  return null;
}
