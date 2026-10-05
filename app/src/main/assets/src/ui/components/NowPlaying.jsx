/* ═══════════════════════════════════════════════════════════════════════
   NowPlaying — the full-screen player for a READING (rv1, the overhaul's
   Listen tab; Corbin's review build). Cluster D, beside the bar that opens it.
   ═══════════════════════════════════════════════════════════════════════
   Built to the Design canvas's "19b Now Playing (no queue)" (words) and the
   Codex sheet 37 (look): a typographic cover (collection eyebrow, title,
   reader), the ONE scrubber (AUDIO-MANAGER rule 6), −15 · previous · play ·
   next · +15, a chip row (speed · sleep · voice · parts · save) and "Open the
   reading". No queue (hub 2026-10-05): previous and next follow the natural
   order the player already builds (the next letter, chapter or study).

   A song keeps its own desk (AudioManagerSheet + SongDeskParts): the bar opens
   NowPlayingSheet only for readings. The desk's reading arms (queue picker,
   desk speed/sleep) are now unreachable on this branch and go in the cleanup. It is a controller, never a second player: every control
   calls the one AudioPlayer. listenEyebrow and listenReaderLine are shared with
   the Listen screens (bundle-h reads them as globals).
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioSeekSlider, formatClock } from './AudioSeekSlider.jsx';
import { AudioSpeedControl } from './AudioSpeedControl.jsx';
import { hasTextDestination } from './AudioShelf.jsx';
import { voiceChoices } from './AudioManagerSheet.jsx';

/** The sleep panel's minutes (audit-listen 5.7), then the end of this recording and Off. */
const SLEEP_STEPS = [15, 30, 45, 60];

/**
 * "Volume One · Letter 7", "World English Bible", "Purity", or the track's own
 * collection line: the small-caps line over a reading's title (CSS sets the caps).
 * @param {any} track
 * @returns {string}
 */
export function listenEyebrow(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const cut = key.indexOf(':');
  const volKey = cut > 0 ? key.slice(0, cut) : '';
  const id = cut > 0 ? key.slice(cut + 1) : '';
  const g = /** @type {any} */ (globalThis);
  const col = volKey && g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(volKey) : null;
  if (col) {
    const letters = typeof g.colLetterArr === 'function' ? (g.colLetterArr(col) || []) : [];
    const letter = letters.find((/** @type {any} */ l) => l && l.id === id);
    const noun = col.kind && col.kind !== 'letter' ? 'Entry' : 'Letter';
    // The preface lives outside colLetterArr (colPreface reads it from its own global).
    const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
    if ((letter && letter.num === 0) || (preface && preface.id === id)) return col.label + ' · Preface';
    return letter && letter.num ? col.label + ' · ' + noun + ' ' + letter.num : col.label || '';
  }
  return (track && track.sub) || '';
}

/**
 * "Read by Benjamin", "Synthesized voice", or '' when the manifest names no reader.
 * The V code reads as a voice, not a setting (audit-listen 5.2: "Synthesized voice", copy only).
 * @param {any} track
 * @returns {string}
 */
export function listenReaderLine(track) {
  const code = track ? track.readerCode : null;
  if (code === 'V') return 'Synthesized voice';
  const label = code ? AudioPlayer.readerLabel(code) : '';
  if (!label) return '';
  return /^read by/i.test(label) ? label : 'Read by ' + label;
}

const ChevronDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 9l6.5 6.5L18.5 9" /></svg>;
const Dots = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="18.5" r="1.6" /></svg>;
const Prev = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2.5v14H6zM20 5v14L9.5 12z" /></svg>;
const Next = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 5H18v14h-2.5zM4 5v14l10.5-7z" /></svg>;
const Play = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>;
const Pause = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>;
const Chevron = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>;

/**
 * @param {{
 *   state: any,
 *   current: any,
 *   voices: { kind: string, activeLabel: string, chips: Array<{ id: string, label: string, active: boolean, select: () => void }> } | null,
 *   saved: boolean,
 *   onToggleSave: () => void,
 *   onClose: () => void,
 *   trapRef: any,
 * }} props
 */
export function NowPlaying({ state, current, voices, saved, onToggleSave, onClose, trapRef }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [sheet, setSheet] = React.useState(/** @type {'' | 'speed' | 'sleep' | 'voice' | 'parts'} */ (''));
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const playing = state.status === 'playing';
  const loading = state.status === 'loading';
  const active = playing || loading;
  const duration = Math.max(0, Math.floor(state.duration || 0));
  const reader = listenReaderLine(current);
  // A compilation (WTLB sections) is titled by the letter under the clock; the section rides the line below it (as on the desk).
  const live = AudioPlayer.liveLetter();
  const liveTitle = live && live.title ? live.title : null;
  const eyebrow = listenEyebrow(current);
  // A multi-part letter is several queue items under one key: its parts are the run around qi.
  const parts = queue.map((t, i) => ({ t, i })).filter(({ t }) => t && t.key === current.key && t.partLabel);
  const rate = Number(state.rate) || 1;
  const sleepSeconds = AudioPlayer.getSleepRemainingSeconds();
  const sleepLabel = state.sleepAtTrackEnd ? 'End' : sleepSeconds ? Math.ceil(sleepSeconds / 60) + ' min' : 'Off';

  const toggleSheet = (/** @type {'speed' | 'sleep' | 'voice' | 'parts'} */ name) => setSheet(sheet === name ? '' : name);
  const openText = () => {
    const open = typeof window !== 'undefined' ? /** @type {any} */ (window).__openAudioText : null;
    if (typeof open === 'function') { onClose(); open(current); }
  };
  const canOpen = hasTextDestination(current);

  return (
    <section className="now-playing" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="now-playing-title">
      <header className="now-playing-top">
        <button type="button" className="now-playing-icon" onClick={onClose} aria-label="Close Now Playing"><ChevronDown /></button>
        <span className="now-playing-name">Now Playing</span>
        <button type="button" className="now-playing-icon" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="More: save, go to the reading, stop"><Dots /></button>
      </header>
      {menuOpen ? (
        <div className="now-playing-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { onToggleSave(); setMenuOpen(false); }}>{saved ? 'Remove from Saved' : 'Save'}</button>
          {canOpen ? <button type="button" role="menuitem" onClick={openText}>Open the reading</button> : null}
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onClose(); AudioPlayer.stop(); }}>Stop</button>
        </div>
      ) : null}

      <div className="now-playing-body">
        <div className="now-playing-cover">
          {eyebrow ? <span className="now-playing-eyebrow">{eyebrow}</span> : null}
          <span className="now-playing-rule" aria-hidden="true" />
          <h2 id="now-playing-title" className="now-playing-title">{liveTitle || current.title || 'Untitled recording'}</h2>
          <span className="now-playing-rule" aria-hidden="true" />
          {liveTitle && current.title ? <span className="now-playing-reader now-playing-section">{current.title}</span> : null}
          {reader ? <span className="now-playing-reader">{reader}</span> : null}
        </div>

        <AudioSeekSlider className="audio-manager-seek now-playing-seek" ariaLabel="Playback position" time={state.time} duration={state.duration} />
        <div className="now-playing-times"><span>{formatClock(state.time)}</span><span>{duration ? '−' + formatClock(Math.max(0, duration - (state.time || 0))) : ''}</span></div>

        <div className="now-playing-transport">
          <button type="button" className="now-playing-skip" onClick={() => AudioPlayer.skip(-15)} aria-label="Back 15 seconds">−15</button>
          <button type="button" className="now-playing-step" onClick={() => AudioPlayer.prev()} aria-label="Previous"><Prev /></button>
          <button type="button" className="now-playing-play" onClick={() => AudioPlayer.toggle()} aria-label={active ? 'Pause' : 'Play'} aria-busy={loading}>{active ? <Pause /> : <Play />}</button>
          <button type="button" className="now-playing-step" onClick={() => AudioPlayer.next()} aria-label="Next" disabled={queue.length < 2}><Next /></button>
          <button type="button" className="now-playing-skip" onClick={() => AudioPlayer.skip(15)} aria-label="Forward 15 seconds">+15</button>
        </div>

        <div className="now-playing-chips">
          <button type="button" onClick={() => toggleSheet('speed')} aria-expanded={sheet === 'speed'} aria-label={'Speed ' + rate + '×'}>{rate + '×'}</button>
          <button type="button" onClick={() => toggleSheet('sleep')} aria-expanded={sheet === 'sleep'} aria-label={'Sleep timer: ' + sleepLabel}>{'☾ ' + sleepLabel}</button>
          <button type="button" onClick={() => toggleSheet('voice')} disabled={!voices} aria-expanded={sheet === 'voice'}>Voice</button>
          <button type="button" onClick={() => toggleSheet('parts')} disabled={parts.length < 2} aria-expanded={sheet === 'parts'}>Parts</button>
          <button type="button" onClick={onToggleSave} aria-pressed={saved}>{saved ? '★ Saved' : '☆ Save'}</button>
        </div>
        {/* Speed keeps the desk's whole control: presets plus the 1 % fine slider (Corbin 2026-09-21). */}
        {sheet === 'speed' ? <div className="now-playing-panel"><AudioSpeedControl rate={rate} /></div> : null}
        {sheet === 'sleep' ? (
          <div className="now-playing-choices" role="group" aria-label="Sleep timer">
            {SLEEP_STEPS.map((m) => {
              const on = !state.sleepAtTrackEnd && !!sleepSeconds && Number(state.sleepMinutes) === m;
              return <button key={m} type="button" className={on ? 'is-active' : ''} aria-pressed={on} onClick={() => { setSheet(''); AudioPlayer.setSleepTimer(m); }}>{m + ' min'}</button>;
            })}
            <button type="button" className={state.sleepAtTrackEnd ? 'is-active' : ''} aria-pressed={!!state.sleepAtTrackEnd} onClick={() => { setSheet(''); AudioPlayer.setSleepAtTrackEnd(); }}>End of this recording</button>
            <button type="button" className={!sleepSeconds && !state.sleepAtTrackEnd ? 'is-active' : ''} aria-pressed={!sleepSeconds && !state.sleepAtTrackEnd} onClick={() => { setSheet(''); AudioPlayer.clearSleepTimer(); }}>Off</button>
          </div>
        ) : null}
        {sheet === 'voice' && voices ? (
          <div className="now-playing-choices" role="group" aria-label="Voice">
            {voices.chips.map((chip) => (
              <button key={chip.id} type="button" className={chip.active ? 'is-active' : ''} aria-pressed={chip.active} onClick={() => { setSheet(''); if (!chip.active) chip.select(); }}>{chip.label}</button>
            ))}
          </div>
        ) : null}
        {sheet === 'parts' && parts.length > 1 ? (
          <div className="now-playing-choices" role="group" aria-label="Parts">
            {parts.map(({ t, i }) => (
              <button key={i} type="button" className={i === state.qi ? 'is-active' : ''} aria-pressed={i === state.qi} onClick={() => { setSheet(''); if (i !== state.qi) AudioPlayer.playAt(i); }}>{t.partLabel}</button>
            ))}
          </div>
        ) : null}

        {canOpen ? (
          <button type="button" className="now-playing-open" onClick={openText}>Open the reading<Chevron /></button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The modal around NowPlaying, as the bar opens it: the same contract as the desk (focus trap, the modal registry
 * that Escape and Android Back close through, the close-sheet bridge, a once-a-second tick while a sleep timer runs).
 * @param {{ open: boolean, state: any, onClose: () => void }} props
 */
export function NowPlayingSheet({ open, state, onClose }) {
  const current = Array.isArray(state.queue) ? state.queue[state.qi] || null : null;
  const renders = open && !!current;
  const trapRef = useFocusTrap(renders);
  useModalRegistry({ id: 'now-playing', dismiss: onClose, active: renders });
  const library = /** @type {any} */ (globalThis).AudioLibraryStore || null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (library && typeof library.subscribe === 'function' ? library.subscribe(cb) : () => {}), [library]),
    React.useCallback(() => (library && typeof library.getVersion === 'function' ? library.getVersion() : 0), [library])
  );
  React.useEffect(() => {
    if (!renders || typeof window === 'undefined') return undefined;
    const previous = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = previous || null; };
  }, [renders, onClose]);
  const [, tick] = React.useReducer((n) => n + 1, 0);
  const sleepArmed = renders && !!state.sleepEndsAt;
  React.useEffect(() => {
    if (!sleepArmed) return undefined;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sleepArmed]);
  if (!renders || typeof document === 'undefined') return null;
  const saved = !!(library && typeof library.isSaved === 'function' && library.isSaved(current));
  return ReactDOM.createPortal(
    <NowPlaying state={state} current={current} voices={voiceChoices(current)} saved={saved} onClose={onClose} trapRef={trapRef}
      onToggleSave={() => { if (library && typeof library.toggleSaved === 'function') library.toggleSaved(current); }} />,
    document.body
  );
}
