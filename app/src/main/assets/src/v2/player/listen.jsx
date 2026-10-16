/* player/listen.jsx - a letter's Listen pill (picture 1a: Listen; 1b: Pause while that letter plays). The same decisions
   as main's LetterListenRow, asked of the one engine (the AudioPlayer global, bundle-d): Pause while this letter plays
   (a tap pauses); Resume · N min left when a tap would pick it up part-way (main's listenResume, ra4, so the label never
   promises a resume the player would not make); Listen otherwise. With no connection and the recording not on the
   phone (picture 9c) the pill still says Listen, and a tap shows main's offline line as a toast instead of playing.
   A gate boot reads gate.playing and gate.open.toast and never touches the engine. A Bible chapter's pill (2c) makes
   the same decisions over main's chapter path (BibleChapterView's HeroListen): the chapter plays on through its book. */
import { Icon } from '../Icon.jsx';
import { AUDIO_RESUME_MIN_SEC, AUDIO_RESUME_END_FRACTION, resolveBibleAudio } from '../../utils/audio-track.js';
import { OFFLINE_LISTEN, offlineListenWords, offlineChapterWords } from '../offline-facts.js';
import { savedSettings, listeningFacts } from '../settings-pages.js';
import { readerLine } from './view.js';

const g = /** @type {any} */ (globalThis);
const NONE = () => () => {};
const ZERO = () => 0;

/** @typedef {{ text: string, icon?: string }} Toast */

/** The toast a Listen shows instead of playing (9c: the cloud, then the words). @param {string} text @returns {Toast} */
export const offlineToast = (text) => ({ text, icon: 'cloudOff' });

/** A gate boot's toast: 9c's { toast: 'offline-listen' } is Listen just tapped with no connection. @returns {Toast | null} */
export function gateListenToast(gate) {
  return gate && gate.open && gate.open.toast === 'offline-listen' ? offlineToast(OFFLINE_LISTEN) : null;
}

/**
 * Start this letter, or say why it cannot make sound now (the toast) and leave the player alone.
 * @param {any} engine @param {{ volKey: string, letter: any, collectionLabel?: string | null }} what
 * @param {((t: Toast) => void) | null | undefined} onToast
 */
export function startListening(engine, { volKey, letter, collectionLabel = null }, onToast) {
  const words = offlineListenWords(volKey, letter.id);
  if (words) { if (onToast) onToast(offlineToast(words)); return; }
  engine.playLetter({ volKey, letter, collectionLabel });
}

/**
 * The Listen row of Mark this paragraph (4b, v2-gaps 23; main's SelectionToolbar listen row), or null for none. Main's
 * read-along on the page registers window.__votListenFrom while the letter has a recording: the row shows when it holds
 * this paragraph, and Repeat only where it can loop one (main's pane: the player loops and the read-along is on). The
 * reader is the playing one when this letter is the loaded track, else the one its Listen would start (the favourite
 * where they read it, else the manifest's first); no engine, no reader line.
 * @param {any} lf window.__votListenFrom @param {any} engine AudioPlayer @param {string} hlKey
 * @param {{ volKey: string, letter: { id: string }, collectionLabel?: string | null }} what
 * @returns {{ reader: string | null, repeat: boolean } | null}
 */
export function listenRowFor(lf, engine, hlKey, { volKey, letter, collectionLabel = null }) {
  if (!lf || typeof lf.has !== 'function' || typeof lf.start !== 'function' || !hlKey || !lf.has(hlKey)) return null;
  let code = null;
  try {
    const st = engine ? engine.getState() : null;
    const cur = st && Array.isArray(st.queue) ? st.queue[st.qi] : null;
    if (cur && cur.key === volKey + ':' + letter.id) code = cur.readerCode || null;
    else if (engine && typeof engine.playbackTracks === 'function') {
      const tracks = engine.playbackTracks(volKey, letter, collectionLabel);
      code = (tracks && tracks[0] && tracks[0].readerCode) || null;
    }
  } catch (_e) { /* an older engine: the row without its reader line */ }
  return { reader: readerLine(code), repeat: typeof lf.repeat === 'function' };
}

/**
 * Start this Bible chapter (on through its book, main's playBibleBook), or say why it cannot make sound now.
 * @param {any} engine @param {{ volKey: string, book: string, chapter: number | null, label?: string | null }} what
 * @param {((t: Toast) => void) | null | undefined} onToast
 */
export function startChapter(engine, { volKey, book, chapter, label = null }, onToast) {
  const words = offlineChapterWords(volKey, book, chapter == null ? undefined : chapter);
  if (words) { if (onToast) onToast(offlineToast(words)); return; }
  engine.playBibleBook(chapter == null ? { volKey, bookId: book, label } : { volKey, bookId: book, label, chapterNum: chapter });
}

/**
 * The edition a chapter's Listen plays and its read-along paints: main's resolveBibleAudio over the reader's saved
 * settings (the chosen edition when it carries the book, else the default), null when none does (no pill, no wash).
 * A gate boot reads its own facts, never the reader's storage (places.js).
 * @param {string} bookId @param {any} [gate] @returns {{ volKey: string, label: string } | null}
 */
export function chapterAudio(bookId, gate = null, gl = g) {
  // listeningFacts fills main's default (brm-kjv) for a store that never saved the setting
  const saved = gate ? (gate.facts || {}) : savedSettings(gl);
  const ed = resolveBibleAudio({ settings: { bibleAudio: listeningFacts(saved).bibleAudio }, bookId }).offer;
  return ed ? { volKey: ed.volKey, label: ed.label } : null;
}

/**
 * "Resume · N min left", N the nearest whole minute and never 0, or "Resume" when the length was never learned
 * (main's resumePillText, AudioPlayButton.jsx).
 * @param {{ at: number, left: number }} resume @returns {string}
 */
export function resumeText(resume) {
  const left = Number(resume && resume.left) || 0;
  return left > 0 ? 'Resume · ' + Math.max(1, Math.round(left / 60)) + ' min left' : 'Resume';
}

/**
 * Loaded and paused here: where a tap un-pauses, inside the player's resume window (main's pausedHere), else null.
 * @param {any} st @returns {{ at: number, left: number } | null}
 */
export function pausedAt(st) {
  const t = Number(st && st.time) || 0;
  const d = Number(st && st.duration) || 0;
  if (!st || st.status !== 'paused' || t < AUDIO_RESUME_MIN_SEC || (d > 0 && t >= d * AUDIO_RESUME_END_FRACTION)) return null;
  return { at: t, left: d > t ? d - t : 0 };
}

/**
 * What the pill says. Offline it never promises a resume: a tap only explains (9c).
 * @param {{ recorded: boolean, here: boolean, playing: boolean, offline: boolean, resume: { at: number, left: number } | null }} f
 * @returns {{ show: boolean, text: string, playing: boolean, label: string }}
 */
export function listenPill({ recorded, here, playing, offline, resume }) {
  if (!recorded) return { show: false, text: '', playing: false, label: '' };
  const listening = here && playing;
  const text = listening ? 'Pause' : !offline && resume ? resumeText(resume) : 'Listen';
  return { show: true, text, playing: listening, label: listening ? 'Pause the reading' : text };
}

/**
 * @param {{ gate: any, collection: string, n: number, volKey: string, letter: { id: string, title?: string } | null,
 *   collectionLabel?: string | null, onToast?: ((t: Toast) => void) | null }} props
 */
export function ListenPill({ gate, collection, n, volKey, letter, collectionLabel = null, onToast = null }) {
  const engine = gate ? null : g.AudioPlayer;
  React.useSyncExternalStore(engine ? engine.subscribe : NONE, engine ? engine.getVersion : ZERO);
  if (!letter) return null;
  let f;
  let tap = () => {};
  if (gate) {
    const p = gate.playing;
    const here = !!(p && p.item && p.item.collection === collection && p.item.n === n);
    f = listenPill({ recorded: true, here, playing: here && !p.paused, offline: false, resume: null });
  } else if (engine) {
    const key = volKey + ':' + letter.id;
    const st = engine.getState();
    const cur = Array.isArray(st.queue) ? st.queue[st.qi] : null;
    const here = !!(cur && cur.key === key);
    const recorded = !!engine.hasAudio(volKey, letter.id);
    const offline = recorded && !here && !!offlineListenWords(volKey, letter.id);
    const playing = st.status === 'playing' || st.status === 'loading';
    const resume = !recorded || offline || (here && playing) ? null
      : here ? pausedAt(st) : engine.listenResume({ volKey, letter, collectionLabel });
    f = listenPill({ recorded, here, playing, offline, resume });
    tap = () => { if (here) engine.toggle(); else startListening(engine, { volKey, letter, collectionLabel }, onToast); };
  } else {
    return null;
  }
  return f.show ? <PillButton f={f} onClick={tap} /> : null;
}

/**
 * A Bible chapter's pill (2c): Pause while this chapter plays, Resume · N min left, Listen; offline and not on the
 * phone, a tap says so. `volKey`/`label` are chapterAudio's (null: no pill). `chapter` null: the whole book from its
 * start, as main's chapter index (ChapterIndex's HeroListen; the Matthew index, 5h).
 * @param {{ gate: any, book: string, chapter: number | null, volKey: string | null, label?: string | null,
 *   onToast?: ((t: Toast) => void) | null }} props
 */
export function ChapterListenPill({ gate, book, chapter, volKey, label = null, onToast = null }) {
  const engine = gate ? null : g.AudioPlayer;
  React.useSyncExternalStore(engine ? engine.subscribe : NONE, engine ? engine.getVersion : ZERO);
  let f;
  let tap = () => {};
  if (gate) {
    const p = gate.playing;
    const here = !!(p && p.item && p.item.book === book && (chapter == null || p.item.chapter === chapter));
    f = listenPill({ recorded: true, here, playing: here && !p.paused, offline: false, resume: null });
  } else if (engine && volKey) {
    const st = engine.getState();
    const cur = Array.isArray(st.queue) ? st.queue[st.qi] : null;
    // a book queues on through its chapters: here = this book's track AND this chapter of it
    const here = !!(cur && cur.key === volKey + ':' + book && (chapter == null || engine.bibleChapterOfTrack(cur) === chapter));
    const recorded = !!engine.hasAudio(volKey, book);
    const offline = recorded && !here && !!offlineChapterWords(volKey, book, chapter);
    const playing = st.status === 'playing' || st.status === 'loading';
    const resume = !recorded || offline || (here && playing) ? null
      : here ? pausedAt(st) : engine.listenResume(chapter == null ? { volKey, bookId: book } : { volKey, bookId: book, chapterNum: chapter });
    f = listenPill({ recorded, here, playing, offline, resume });
    tap = () => { if (here) engine.toggle(); else startChapter(engine, { volKey, book, chapter, label }, onToast); };
  } else {
    return null;
  }
  return f.show ? <PillButton f={f} onClick={tap} /> : null;
}

/** @param {{ f: { text: string, playing: boolean, label: string }, onClick: () => void }} props */
function PillButton({ f, onClick }) {
  const wide = f.text.length > 6;
  return (
    <button type="button" className={'pill play' + (wide ? ' wide' : '')} aria-label={f.label} aria-pressed={f.playing}
      onClick={onClick}>
      {f.playing ? <Icon name="pause" size={26} /> : <Icon name="playBig" />}{f.text}
    </button>
  );
}
