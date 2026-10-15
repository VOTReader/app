/* AutoScrollPill - auto-scroll (mw7, v2-gaps 13; design dz15 1j; main's AutoScrollControl): a pill floating above the tab
   bar, thin dividers between its groups: Slower, pause / play, Faster | the readout | the pause before the next page (only
   with Auto-continue; it opens main's Pause row) | Stop.

   Main's transport drives it (hooks/use-autoscroll.js useAutoScroll: the scrollTop lease, the yield to a finger, the brake
   at the end of the text, auto-continue, the keep-awake), handed v2's frame: an open sheet stops it, a turned page that is
   still loading holds it (as main's scroll restore does), and auto-continue turns the page where the reader's own tap
   would, on the page's Next card (a letter's next letter, a chapter's next chapter; none at the end of a volume or of the
   Bible). The speed and the pause are main's settings (autoScrollLpm, autoScrollEndMs), written as main's updateSetting
   writes them. It fades while it runs, as main; a gate boot draws it running, frozen at the top, at full strength. */
import { Icon } from './Icon.jsx';
import { anySheetOpen } from './Sheet.jsx';
import { savedSettings, writeSetting } from './settings-pages.js';
import { useAutoScroll, clampLpm, clampEndDwell } from '../hooks/use-autoscroll.js';
import { measureWordsPerLine } from '../ui/components/AutoScrollControl.jsx';
import { onIdle } from '../utils/on-idle.js';

/** Main's: the pill fades after this long running; a touch brings it back. */
const DIM_AFTER_MS = 3000;
/** Main's steps: 2 lines/min a tap; the pause in half seconds (the Settings slider's grain). */
const LPM_STEP = 2;
const DWELL_STEP_MS = 500;

/** @typedef {{ lpm: number, next: boolean, endMs: number, keepOn: boolean }} AutoPrefs */

/** The reader's auto-scroll settings, main's keys and defaults (16 lines/min, Auto-continue on, 2.5 s). @returns {AutoPrefs} */
export function autoPrefs(s = /** @type {Record<string, any>} */ ({})) {
  return { lpm: clampLpm(s.autoScrollLpm), next: s.autoScrollNext !== false, endMs: clampEndDwell(s.autoScrollEndMs), keepOn: s.keepScreenOn !== false };
}

/** A gate boot's run: nothing moves, nothing waits, the phone's screen is left alone. */
const FROZEN = {
  requestFrame: () => 0, cancelFrame: () => {}, schedule: () => 0, cancelScheduled: () => {},
  isRestoring: () => false, setKeepScreenOn: () => {}, setRunningClass: () => {},
};

/** Main's words for the time left: "~5 min left", under a minute "~40s left". @param {number} ms */
export function timeLeft(ms) {
  if (!ms || ms < 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins >= 1) return '~' + mins + ' min left';
  return '~' + Math.max(5, Math.round(ms / 5000) * 5) + 's left';
}

/** The pause as main's Settings row says it: "2.5s", "None". @param {number} ms */
export function pauseWords(ms) {
  const secs = Math.round(ms / 100) / 10;
  return secs === 0 ? 'None' : secs + 's';
}

/**
 * What the readout says, a line or two: the time left while it runs, main's countdown before the next page, "End of text",
 * else the pace (measured words a minute when the page could be measured, over the lines a minute: one line of both is
 * wider than a phone's pill).
 * @param {{ state: string, remainingMs: number, countdown: number, wpm: number, lpm: number }} r
 * @returns {string[]}
 */
export function readout({ state, remainingMs, countdown, wpm, lpm }) {
  if (state === 'enddwell') return [countdown > 0 ? 'Next in ' + countdown : 'Next…'];
  if (state === 'ended') return ['End of text'];
  if (state === 'running' || state === 'advancing') return [timeLeft(remainingMs) || 'Reading'];
  return wpm > 0 ? ['~' + wpm + ' wpm', lpm + ' lines/min'] : [lpm + ' lines/min'];
}

/**
 * The page's own Next card as main's pager: where auto-continue turns the page, the same tap the reader would make.
 * @param {{ current: HTMLElement | null }} scrollRef
 */
export function nextCardPager(scrollRef) {
  const card = () => (scrollRef.current ? /** @type {HTMLElement | null} */ (scrollRef.current.querySelector('.nextcard')) : null);
  return {
    peek: (/** @type {string} */ dir) => (dir === 'next' && card() ? { kind: 'screen' } : null),
    onNext: () => { const b = card(); if (b) b.click(); },
  };
}

/**
 * @param {{ scrollRef: { current: HTMLElement | null }, placeKey: string, ready: boolean, run: boolean,
 *   gate: import('./gate.js').GateState | null, onClose: () => void }} props
 *   run: starts at once (the ... menu's Auto-scroll, a gate state); else it waits paused (main's Auto-scroll setting on)
 */
export function AutoScrollPill({ scrollRef, placeKey, ready, run, gate, onClose }) {
  const [prefs, setPrefs] = React.useState(() => autoPrefs(gate ? {} : savedSettings()));
  const readyRef = React.useRef(ready);
  readyRef.current = ready;
  const pager = React.useMemo(() => nextCardPager(scrollRef), [scrollRef]);
  const io = React.useMemo(() => (gate ? FROZEN : { isModalOpen: anySheetOpen, isRestoring: () => !readyRef.current }), [gate]);
  const auto = useAutoScroll(scrollRef, {
    enabled: true, speedLpm: prefs.lpm, autoNext: prefs.next, endDwellMs: prefs.endMs, keepScreenOnPref: prefs.keepOn,
    placeKey, pager, io,
  });
  const { state, running, advanceAt, start, stop, toggle, getProgress } = auto;

  // Started once, on a page that has loaded (a gate's letter loads after the shell; its run starts with the kit's faces in,
  // so the time left is measured on the text as it is drawn).
  const started = React.useRef(false);
  React.useEffect(() => {
    if (!run || !ready || started.current) return undefined;
    started.current = true;
    if (!gate) { start(); return undefined; }
    let live = true;
    const fonts = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => { if (live) start(); });
    return () => { live = false; };
  }, [run, ready, gate, start]);

  // Main's fade while it runs; any touch brings it back. Never on a gate boot (drawn at full strength).
  const [dim, setDim] = React.useState(false);
  React.useEffect(() => {
    setDim(false);
    if (!running || gate) return undefined;
    const t = setTimeout(() => setDim(true), DIM_AFTER_MS);
    const wake = () => { setDim(false); clearTimeout(t); };
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', wake, true); };
  }, [running, state, gate]);

  // The readouts on cheap intervals, as main (a 60 Hz state would redraw the page while it scrolls).
  const [remainingMs, setRemainingMs] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'running') return undefined;
    const read = () => setRemainingMs(getProgress().remainingMs);
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [state, getProgress]);
  const [countdown, setCountdown] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'enddwell' || !advanceAt) { setCountdown(0); return undefined; }
    const read = () => setCountdown(Math.max(0, Math.ceil((advanceAt - Date.now()) / 1000)));
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, [state, advanceAt]);
  // Words a line, measured once a page in idle time (main's measureWordsPerLine: a made-up rate is worse than none).
  const [wordsPerLine, setWordsPerLine] = React.useState(0);
  React.useEffect(() => {
    setWordsPerLine(0);
    const el = scrollRef.current;
    if (!el || !ready) return undefined;
    return onIdle(() => setWordsPerLine(measureWordsPerLine(el)), { timeout: 1500, fallbackDelay: 0 });
  }, [scrollRef, placeKey, ready]);

  const [dwellOpen, setDwellOpen] = React.useState(false);
  const change = (/** @type {Partial<AutoPrefs>} */ next) => {
    setPrefs((p) => ({ ...p, ...next }));
    if (gate) return;
    if (next.lpm != null) writeSetting('autoScrollLpm', String(next.lpm));
    if (next.endMs != null) writeSetting('autoScrollEndMs', String(next.endMs));
  };
  const lpmBy = (/** @type {number} */ d) => change({ lpm: clampLpm(prefs.lpm + d) });
  const pauseBy = (/** @type {number} */ d) => change({ endMs: clampEndDwell(prefs.endMs + d) });

  const on = running || state === 'enddwell';
  // the countdown before the next page takes Slower and Faster's room for its Cancel (a phone's pill holds no more)
  const counting = state === 'enddwell';
  const wpm = wordsPerLine > 0 ? Math.round(wordsPerLine * prefs.lpm) : 0;
  const words = readout({ state, remainingMs, countdown, wpm, lpm: prefs.lpm });
  return (
    <>
      {dwellOpen && prefs.next && (
        <div className="asp dw" role="group" aria-label="Pause before the next page">
          <span className="asp-r">Pause</span>
          <button type="button" className="ic" aria-label="Shorter pause before the next page" disabled={prefs.endMs <= 0}
            onClick={() => pauseBy(-DWELL_STEP_MS)}><Icon name="minus" /></button>
          <span className="asp-r num">{pauseWords(prefs.endMs)}</span>
          <button type="button" className="ic" aria-label="Longer pause before the next page" disabled={prefs.endMs >= 15000}
            onClick={() => pauseBy(DWELL_STEP_MS)}><Icon name="plus" /></button>
        </div>
      )}
      <div className={'asp' + (dim ? ' dim' : '')} role="toolbar" aria-label="Auto-scroll" data-zone="asp">
        {!counting && (
          <button type="button" className="ic" aria-label="Slower" disabled={prefs.lpm <= 4} onClick={() => lpmBy(-LPM_STEP)}>
            <Icon name="minus" />
          </button>
        )}
        <button type="button" className="pp" aria-label={on ? 'Pause auto-scroll' : 'Start auto-scroll'} aria-pressed={on}
          onClick={toggle}>
          <Icon name={on ? 'pause' : 'play'} size={20} />
        </button>
        {!counting && (
          <button type="button" className="ic" aria-label="Faster" disabled={prefs.lpm >= 40} onClick={() => lpmBy(LPM_STEP)}>
            <Icon name="plus" />
          </button>
        )}
        <span className="sep" />
        {/* the time left changes every minute: kept out of the live region, which says the pace and "End of text" */}
        <span className={'asp-r num' + (words.length > 1 ? ' st' : '')} role="status" aria-live={running ? 'off' : 'polite'}>
          {words.length > 1 ? <><span>{words[0]}</span> <span className="sub">{words[1]}</span></> : words[0]}
        </span>
        {counting && <button type="button" className="asp-x" onClick={stop}>Cancel</button>}
        {prefs.next && (
          <>
            <span className="sep" />
            <button type="button" className={'ic' + (dwellOpen ? ' opn' : '')} aria-label="Adjust the pause before the next page"
              aria-pressed={dwellOpen} onClick={() => setDwellOpen((v) => !v)}>
              <Icon name="hourglass" />
            </button>
          </>
        )}
        <span className="sep" />
        <button type="button" className="ic" aria-label="Stop auto-scroll" onClick={() => { stop(); onClose(); }}>
          <Icon name="close" />
        </button>
      </div>
    </>
  );
}
