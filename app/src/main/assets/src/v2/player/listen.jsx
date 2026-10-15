/* player/listen.jsx - a letter's Listen pill (picture 1a: Listen; 1b: Pause while that letter plays). The same decisions
   as main's LetterListenRow, asked of the one engine (the AudioPlayer global, bundle-d): Pause while this letter plays
   (a tap pauses); Resume · N min left when a tap would pick it up part-way (main's listenResume, ra4, so the label never
   promises a resume the player would not make); Listen otherwise. With no connection and the recording not on the
   phone (picture 9c) the pill still says Listen, and a tap shows main's offline line as a toast instead of playing.
   A gate boot reads gate.playing and gate.open.toast and never touches the engine. */
import { Icon } from '../Icon.jsx';
import { AUDIO_RESUME_MIN_SEC, AUDIO_RESUME_END_FRACTION } from '../../utils/audio-track.js';
import { OFFLINE_LISTEN, offlineListenWords } from '../offline-facts.js';

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
  if (!f.show) return null;
  const wide = f.text.length > 6;
  return (
    <button type="button" className={'pill play' + (wide ? ' wide' : '')} aria-label={f.label} aria-pressed={f.playing}
      onClick={tap}>
      {f.playing ? <Icon name="pause" size={26} /> : <Icon name="playBig" />}{f.text}
    </button>
  );
}
