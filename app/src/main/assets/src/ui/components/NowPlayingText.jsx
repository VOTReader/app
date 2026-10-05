/* ═══════════════════════════════════════════════════════════════════════
   NowPlayingText — Now Playing's live text pane (rv1, audit-listen 5.4
   "phase 2"; Codex sheet 37: the clause being read in large serif, the next
   one dimmed under it). Cluster D, beside NowPlaying.
   ═══════════════════════════════════════════════════════════════════════
   No new data: the rows are the page wash's own (letterFragsFor, the same
   alternate-voice and part choice ReadAlongHighlight makes), and the words
   are cut from the letter's blocks with blockSpanText (utils/block-dom-text.js), the text domain the
   aligner measured those offsets in (pinned corpus-wide by
   tools/block-dom-text.test.js), footnote numbers dropped. A Format-B row (-1/-1) shows its whole block.

   Letters only for now. A Bible chapter's rows are whole verses of a text
   this screen does not hold, and a compilation's follow the section under
   the clock: both draw no pane (the cover stands alone, as before).

   THE CLOCK is the wash's: a rAF loop on AudioPlayer.getPreciseTime() while
   playing, setState only when the clause index changes (a re-render per
   clause, never per frame); paused, the index follows the store's time.
   Tapping the pane opens the reading, where the wash and follow-scroll land
   on the same clause.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { loadAudioSync, audioSyncStore } from '../../utils/sync-loaders.js';
import { blockSpanText } from '../../utils/block-dom-text.js';
import { fragmentAt, letterFragsFor } from './ReadAlongHighlight.jsx';

/** The wash paints this far ahead of the clock (ReadAlongHighlight LEAD_S): the eye meets the clause as the voice does. */
const LEAD_S = 0.15;

/**
 * The letter a track reads, from the loaded corpus: its blocks, or null.
 * @param {any} track
 * @returns {any[] | null}
 */
function blocksOf(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const cut = key.indexOf(':');
  if (cut < 1) return null;
  const g = /** @type {any} */ (globalThis);
  const col = g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(key.slice(0, cut)) : null;
  if (!col) return null;
  const id = key.slice(cut + 1);
  const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  const letters = typeof g.colLetterArr === 'function' ? (g.colLetterArr(col) || []) : [];
  const letter = preface && preface.id === id ? preface : letters.find((/** @type {any} */ l) => l && l.id === id);
  return letter && Array.isArray(letter.blocks) ? letter.blocks : null;
}

/**
 * The words of one sync row, or '' when its block or offsets do not resolve (a stale row paints nothing, as on the page).
 * @param {any[] | null} blocks
 * @param {any[] | undefined} row  [startSec, blockIndex, charStart, charEnd, partIndex]
 * @returns {string}
 */
export function clauseText(blocks, row) {
  if (!blocks || !row) return '';
  return blockSpanText(blocks[row[1]], row[2], row[3]);
}

/**
 * @param {{ state: any, current: any, onOpen: (() => void) | null }} props
 */
export function NowPlayingText({ state, current, onOpen }) {
  const syncVersion = React.useSyncExternalStore(audioSyncStore.subscribe, audioSyncStore.getVersion);
  const isLetter = !!current && typeof current.key === 'string' && current.key.indexOf(':') > 0 && !AudioPlayer.bibleChapterOfTrack(current);
  const url = current ? current.url : '';
  const key = current ? current.key : '';
  const status = state.status;
  // Asked once a letter is up, and again on transport activity (the wash's retry cadence: never the loader's own version).
  React.useEffect(() => { if (isLetter) loadAudioSync(); }, [isLetter, url, status]);

  const queue = state.queue, qi = state.qi;
  const frags = React.useMemo(() => (isLetter ? letterFragsFor(current, { queue, qi }) : null),
    // syncVersion: the timings file lands as a global after the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLetter, url, key, qi, syncVersion]);
  const blocks = React.useMemo(() => (frags ? blocksOf(current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frags, key]);

  const playing = status === 'playing';
  const [idx, setIdx] = React.useState(() => (frags ? fragmentAt(frags, (state.time || 0) + LEAD_S) : -1));
  React.useEffect(() => {
    if (!frags) { setIdx(-1); return undefined; }
    const at = () => {
      const t = typeof AudioPlayer.getPreciseTime === 'function' ? AudioPlayer.getPreciseTime() : state.time;
      return fragmentAt(frags, (Number(t) || 0) + LEAD_S);
    };
    setIdx(at());
    if (!playing || typeof requestAnimationFrame !== 'function') return undefined;
    let raf = 0;
    const tick = () => { const i = at(); setIdx((prev) => (prev === i ? prev : i)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frags, playing, state.time]);

  if (!frags || !blocks) return null;
  const now = idx >= 0 ? clauseText(blocks, frags[idx]) : '';
  // What comes next, dimmed: the pane fills the room the controls leave and reads ahead (the hub, 2026-10-05);
  // eight clauses fill the tallest phone, the pane's fade cuts the rest.
  const next = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => clauseText(blocks, frags[idx + k])).filter(Boolean);
  if (!now && !next.length) return null;
  const body = (
    <>
      {now ? <span className="now-playing-text-now">{now}</span> : null}
      {next.map((t, k) => <span key={idx + 1 + k} className="now-playing-text-next" aria-hidden="true">{t}</span>)}
    </>
  );
  return onOpen
    ? <button type="button" className="now-playing-text" onClick={onOpen} aria-label={(now || next[0]) + ' (open the reading here)'}>{body}</button>
    : <div className="now-playing-text">{body}</div>;
}
