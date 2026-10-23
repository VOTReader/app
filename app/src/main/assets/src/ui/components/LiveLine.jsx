/* ═══════════════════════════════════════════════════════════════════════
   LiveLine — the full player's "Now reading" card (player brief 3b, pl-l2;
   picture 05): the sentence the voice is in, the clause being read bright and
   the clauses before it in the same sentence dim, and "Open the reading ›".
   Cluster D, beside AudioManagerSheet.

   The words come from the same two places the read-along wash uses: the
   timing rows (ReadAlongHighlight's liveFragments, so the card and the page
   can never disagree about which clause is playing) and the letter's own
   blocks, measured in the same text domain the rows are (segment-dom-text for
   a Format A block; a Format B paragraph's raw text, its markup read away).
   Letters and WTLB compilations by the clause; a Bible chapter by the whole
   verse (its timings are verse onsets), its number dim before it, in the
   words of the edition the recording reads.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { holdTranslation, isTranslationLoaded, loadTranslation, translateVerse } from '../../data/translations.js';
import { resolveBibleAudio } from '../../utils/audio-track.js';
import { segmentsDomPieces } from '../../utils/segment-dom-text.js';
import { audioSyncStore, audioSyncSectionsStore, bibleSyncStore, loadAudioSync, loadBibleSync } from '../../utils/sync-loaders.js';
import { fragmentAt, liveBibleFragments, liveFragments } from './ReadAlongHighlight.jsx';

/** How many clauses before the one being read may share the card. */
const LEAD_CLAUSES = 2;

/**
 * The letter or entry a "volKey:id" key names, from the corpus registry; null until the corpus lands.
 * @param {string | null | undefined} key @returns {any}
 */
export function unitOfKey(key) {
  const at = typeof key === 'string' ? key.indexOf(':') : -1;
  if (at < 1) return null;
  const g = /** @type {any} */ (globalThis);
  const col = g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(key.slice(0, at)) : null;
  if (!col || typeof g.colLetterArr !== 'function') return null;
  const id = key.slice(at + 1);
  const list = g.colLetterArr(col) || [];
  const pre = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  return list.find((/** @type {any} */ l) => l && l.id === id) || (pre && pre.id === id ? pre : null);
}

/** A Format B paragraph's raw words read the way the page draws them: {{ref:X}} as X, other markup away. @param {string} s */
function readRaw(s) {
  return String(s || '').replace(/\{\{ref:([^}]*)\}\}/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
}

/**
 * A run of segments as its DOM text, and where its footnote markers sit in it (the card leaves them out: a "1"
 * after "Abraham," reads as a word).
 * @param {any[]} segments @param {string} text @param {Array<[number, number]>} notes @returns {string}
 */
function addRun(segments, text, notes) {
  let out = text;
  for (const piece of segmentsDomPieces(segments)) {
    if (piece.fn && piece.text) notes.push([out.length, out.length + piece.text.length]);
    out += piece.text;
  }
  return out;
}

/**
 * The words of one timing row: the [charStart, charEnd) slice of its block in the rows' own text domain, widened to
 * whole words; a whole-paragraph row (-1, -1) is the paragraph.
 * @param {any} unit @param {any[]} row @returns {string}
 */
export function rowWords(unit, row) {
  const bi = row[1];
  const cs = row[2];
  const ce = row[3];
  let text = '';
  /** @type {Array<[number, number]>} */
  const notes = [];
  if (unit && Array.isArray(unit.blocks)) {
    const b = unit.blocks[bi];
    if (!b) return '';
    if (b.segments) text = addRun(b.segments, '', notes);
    else if (Array.isArray(b.lines)) for (const ln of b.lines) text = Array.isArray(ln) ? addRun(ln, text, notes) : text;
    else if (typeof b.text === 'string') text = b.text;
  } else if (unit && Array.isArray(unit.paragraphs)) {
    const p = unit.paragraphs[bi];
    const raw = p && typeof p.text === 'string' ? p.text : '';
    return readRaw(cs < 0 ? raw : raw.slice(cs, ce)).replace(/\s+/g, ' ').trim();
  }
  if (notes.length) {
    // A marker's characters become placeholders of the same length, so the row's offsets still land; they read as
    // part of the word they stand on (a widening never stops inside one) and drop out below.
    const chars = text.split('');
    for (const [x, y] of notes) for (let k = x; k < y; k++) chars[k] = '';
    text = chars.join('');
  }
  const words = (/** @type {string} */ s) => s.replace(//g, '').replace(/\s+/g, ' ').trim();
  if (cs < 0) return words(text);
  let a = Math.max(0, Math.min(text.length, cs));
  let z = Math.max(a, Math.min(text.length, ce));
  // A row a character off its word (an older alignment) still shows whole words.
  while (a > 0 && a < text.length && /\S/.test(text[a]) && /\S/.test(text[a - 1])) a--;
  while (z > a && z < text.length && /\S/.test(text[z - 1]) && /\S/.test(text[z])) z++;
  return words(text.slice(a, z));
}

/**
 * The card's words at `time`: the clause being read (`now`) and up to two clauses before it in the same block and
 * sentence (`lead`). Null before the first timed clause, or with no rows or no text.
 * @param {any} track @param {number} time
 * @returns {{ lead: string, now: string, key: string } | null}
 */
export function liveLineAt(track, time) {
  if (!track) return null;
  if (AudioPlayer.bibleChapterOfTrack(track) > 0) return bibleLineAt(track, time);
  const sectionKey = track.key == null ? AudioPlayer.sectionLetterKeyAt(track, time) : null;
  const key = sectionKey || track.key;
  const frags = liveFragments(track, sectionKey);
  if (!frags) return null;
  const i = fragmentAt(frags, time);
  if (i < 0) return null;
  const unit = unitOfKey(key);
  if (!unit) return null;
  const now = rowWords(unit, frags[i]);
  if (!now) return null;
  const lead = [];
  for (let j = i - 1; j >= 0 && lead.length < LEAD_CLAUSES; j--) {
    if (frags[j][1] !== frags[i][1] || frags[j][2] < 0) break;
    const words = rowWords(unit, frags[j]);
    if (!words || /[.!?]["”’)]?$/.test(words)) break;   // the sentence before this one
    lead.unshift(words);
  }
  return { lead: lead.join(' '), now, key };
}

/**
 * The text edition whose words a Bible recording reads ('kjv', 'web'), or '' for the NKJV base and the study
 * Matthew (the Scriptures of Truth reads the study's own text, which the base already is for Matthew).
 * @param {any} track @returns {string}
 */
function bibleTextEdition(track) {
  const ed = resolveBibleAudio({ track }).paint;
  const tr = ed && typeof ed.translation === 'string' ? ed.translation : '';
  return tr && tr !== 'nkjv' && tr.lastIndexOf('vot-', 0) !== 0 ? tr : '';
}

/**
 * One verse's words in a Bible edition, the NKJV base until that edition loads; '' until the Bible corpus lands
 * (the card re-renders on the next clock tick).
 * @param {string} bookId @param {number} chapter @param {number} verse @param {string} translation @returns {string}
 */
function verseWords(bookId, chapter, verse, translation) {
  const g = /** @type {any} */ (globalThis);
  if (typeof g.resolveVerseText !== 'function') return '';
  let text = '';
  try {
    text = g.resolveVerseText({ type: 'bible', bookId, chapter, verse }) || '';
    if (text && translation) text = translateVerse(bookId, chapter, { n: verse, text }, translation) || text;
  } catch (_e) { return ''; }
  return readRaw(text).replace(/\s+/g, ' ').trim();
}

/**
 * A Bible chapter's card at `time`: the verse under the clock, whole (`now`), its number as the dim `lead`.
 * @param {any} track @param {number} time
 * @returns {{ lead: string, now: string, key: string } | null}
 */
export function bibleLineAt(track, time) {
  const rows = liveBibleFragments(track);
  if (!rows) return null;
  const i = fragmentAt(rows, time);
  if (i < 0) return null;
  const verse = rows[i][1];
  const now = verseWords(track.key.slice(track.key.indexOf(':') + 1), AudioPlayer.bibleChapterOfTrack(track), verse, bibleTextEdition(track));
  return now ? { lead: String(verse), now, key: track.key } : null;
}

/** The lazy Bible corpus as a store (index.html's __bibleCorpus), inert before it exists. @param {() => void} cb */
function subscribeBibleCorpus(cb) {
  const c = /** @type {any} */ (globalThis).__bibleCorpus;
  return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : () => {};
}
function bibleCorpusVersion() {
  const c = /** @type {any} */ (globalThis).__bibleCorpus;
  return c && typeof c.getVersion === 'function' ? c.getVersion() : 0;
}

/**
 * @param {{ track: any, time: number, title: string, onOpen: (() => void) | null }} props onOpen null: no reading
 *   to open (the card still shows the line)
 */
export function LiveLine({ track, time, title, onOpen }) {
  // The timings are their own lazy files: asked for when the card shows, and the card re-renders when they land.
  React.useSyncExternalStore(audioSyncStore.subscribe, audioSyncStore.getVersion);
  React.useSyncExternalStore(audioSyncSectionsStore.subscribe, audioSyncSectionsStore.getVersion);
  React.useSyncExternalStore(bibleSyncStore.subscribe, bibleSyncStore.getVersion);
  const keyed = !!(track && track.key);
  const bible = keyed && AudioPlayer.bibleChapterOfTrack(track) > 0;
  const bibleEd = bible ? resolveBibleAudio({ track }).paint : null;
  const bibleVolKey = bibleEd ? bibleEd.volKey : '';
  React.useEffect(() => { if (keyed && !bible) void loadAudioSync(); }, [keyed, bible]);
  React.useEffect(() => { if (bibleVolKey) void loadBibleSync(bibleVolKey); }, [bibleVolKey]);
  // A Bible chapter's words: the Bible text (lazy, as the reading screen loads it) and the edition the voice reads,
  // held while the card shows it so a translation switch does not free it underneath.
  React.useSyncExternalStore(subscribeBibleCorpus, bibleCorpusVersion);
  const textEdition = bible ? bibleTextEdition(track) : '';
  React.useEffect(() => {
    const g = /** @type {any} */ (globalThis);
    if (bible && typeof g.__loadBibleCorpus === 'function') void g.__loadBibleCorpus();
  }, [bible]);
  React.useEffect(() => {
    if (!textEdition) return undefined;
    const letGo = holdTranslation(textEdition);
    if (!isTranslationLoaded(textEdition)) void loadTranslation(textEdition);
    return letGo;
  }, [textEdition]);
  const line = liveLineAt(track, Number(time) || 0);
  if (!line && !onOpen) return null;
  const body = (
    <>
      {line ? (
        <>
          <span className="np-live-kicker">Now reading</span>
          <span className="np-live-text">
            {line.lead ? <span className="np-live-lead">{line.lead} </span> : null}
            <span className="np-live-now">{line.now}</span>
          </span>
        </>
      ) : null}
      {onOpen ? <span className="np-live-cue audio-manager-jump-cue">Open the reading <span aria-hidden="true">›</span></span> : null}
    </>
  );
  if (!onOpen) return <div className="np-live">{body}</div>;
  return (
    <button type="button" className="np-live audio-manager-jump" onClick={onOpen}
      aria-label={'Open the reading — ' + (title || 'this recording') + '; playback continues'}>
      {body}
    </button>
  );
}
