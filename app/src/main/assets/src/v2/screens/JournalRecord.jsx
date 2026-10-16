/* JournalRecord - Insert's Voice memo (mw9c, design dz20 3p): main's JournalRecordingSheet, ported (v2 reads window
   globals only, never main's modules) into the kit's sheet "Voice memo": "Recording" with a gold dot (or "Paused"), the
   time large, the live level, "Up to 5 minutes · 4:18 left", Cancel · Pause/Resume · Finish. Finish turns it into main's
   review: "Review", Play, "0:00 / 0:42", Discard and Save. Main's words stand for asking, failing and Try again.
   The take runs as main's does, through main's PlatformBridge (bundle-b's global): the mic asked first (20 s watchdog),
   the 300 s cap, pause and resume, the phone's own pause when the screen locks, the Android file fetched with main's
   retries, then read by name, then asked whether it was empty. Main's journal-3 order stands (do not "optimise" it): the
   finished take is committed to JournalMediaStore, marked unlinked, BEFORE it is shown; Discard deletes it, Save links it
   and hands main's { mediaId, duration, samples } to the editor. Cancel, the scrim, Escape and Android's Back ask first
   ("Discard this recording?") once something was recorded. A gate boot draws one state and never touches the mic. */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { playMemo } from '../journal-blocks.js';

const g = /** @type {any} */ (globalThis);

/** Bars stored with a saved memo (main's WAVE_STORE_BARS, the 3n memo's waveform). */
export const WAVE_STORE_BARS = 48;
/** Main's cap (NTV-1): the seconds tick stops the take here. */
export const MAX_RECORDING_SECONDS = 300;
/** The live level's bars (the picture's 40) and their tallest, in px (the kit's .recw is 48 high). */
const LEVEL_BARS = 40;
const LEVEL_MAX = 44;
/** Seconds the review's arrow keys move (main's). */
const SCRUB_STEP_SECONDS = 5;
const PERMISSION_DENIED = 'Microphone permission denied. Enable mic access for this app, then try again.';
// No Try again goes with these: there is no take to fetch again, only a new one to record (main's W15).
const NOTHING_RECORDED = 'Nothing was recorded. Close this and record again, speaking after the timer starts.';
const EMPTY_FILE = 'That recording is empty — nothing was captured. Close this and record again, speaking after the timer starts.';
/** Main's words for what nativeRecordStart answered. */
const START_ERRORS = {
  'error:unsupported-codec': 'Recording is not supported in this browser.',
  'error:no-stream': 'Microphone access was not granted.',
  'error:permission': PERMISSION_DENIED,
};

/**
 * Main's downsampleWave (JRNL-3): max-pools a level array to `buckets` bars, peaks kept, the whole clip represented.
 * @param {number[] | null | undefined} arr @param {number} buckets @returns {number[] | null}
 */
export function downsampleWave(arr, buckets) {
  if (!arr || !arr.length) return arr ? arr.slice() : null;
  if (arr.length <= buckets) return arr.slice();
  const out = [];
  const size = arr.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const end = Math.floor((i + 1) * size);
    let peak = 0;
    for (let j = Math.floor(i * size); j < end && j < arr.length; j++) if (arr[j] > peak) peak = arr[j];
    out.push(peak);
  }
  return out;
}

/**
 * Levels (0..1) read across `count` bars as main draws them, in px from 4 to LEVEL_MAX; `rest` stands in when none.
 * @param {number[]} levels @param {number} rest @returns {number[]}
 */
export function levelBars(levels, rest, count = LEVEL_BARS) {
  const src = levels && levels.length ? levels : [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : rest;
    out.push(Math.max(4, Math.min(LEVEL_MAX, Math.round(v * LEVEL_MAX))));
  }
  return out;
}

/** "4:18" @param {number} s */
export function clock(s) {
  const n = Math.max(0, Math.floor(s || 0));
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
}

/**
 * @param {{ desktop?: boolean, gate?: { state: 'recording' | 'paused', at: number, level: number[] } | null,
 *   onSave: (memo: { mediaId: string, duration: number, samples: number[] | null }) => void, onClose: () => void,
 *   onFail?: (text: string) => void }} props
 *   gate: the state a gate boot draws (3p), nothing started; onFail: a take that cannot play says so (as a memo does)
 */
export function JournalRecord({ desktop = false, gate = null, onSave, onClose, onFail }) {
  // 'requesting' | 'recording' | 'paused' | 'preview' | 'retrieving' | 'error' (main's stages)
  const [stage, setStage] = React.useState(gate ? gate.state : 'requesting');
  const stageRef = React.useRef(stage);
  stageRef.current = stage;
  const [error, setError] = React.useState(/** @type {string | null} */ (null));
  const [seconds, setSeconds] = React.useState(gate ? gate.at : 0);
  const [level, setLevel] = React.useState(/** @type {number[]} */ (gate ? gate.level : []));
  const [final, setFinal] = React.useState(/** @type {number[]} */ ([]));
  const [progress, setProgress] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => setConfirming(false), [stage]);
  // The take lives in memory until it is committed, so an app update waits while this is open (main's ds2).
  React.useEffect(() => (gate || typeof g.holdUpdateReload !== 'function' ? undefined : g.holdUpdateReload('recording')), [gate]);

  // What the take owns between renders (main's refs): timers, every level sample, the clock, the finished blob.
  const r = React.useRef({
    tick: 0, amp: 0, samples: /** @type {number[]} */ ([]), start: 0, accMs: 0,
    blob: /** @type {Blob | null} */ (null), dur: 0, url: /** @type {string | null} */ (null),
    pendingSave: false, committed: /** @type {string | null} */ (null), retry: /** @type {null | (() => void)} */ (null),
  }).current;
  const audioRef = React.useRef(/** @type {HTMLAudioElement | null} */ (null));
  // A Save tapped while the take is still stopping runs from the mount's callback: it must reach today's editor.
  const saveRef = React.useRef(onSave);
  saveRef.current = onSave;

  const stopTimers = () => {
    if (r.tick) clearInterval(r.tick);
    if (r.amp) clearInterval(r.amp);
    r.tick = 0;
    r.amp = 0;
  };
  // Lets go of the mic, the timers and the preview's url; safe from every exit, more than once (main's cleanup).
  const cleanup = () => {
    const PB = g.PlatformBridge;
    if (PB) {
      try { PB.endAudioSession(); } catch (_e) { /* Android restores its audio mode; the web has nothing */ }
      try { PB.nativeRecordCancel(); } catch (_e) { /* safe when nothing runs */ }
    }
    stopTimers();
    if (r.url) {
      try { URL.revokeObjectURL(r.url); } catch (_e) { /* best effort */ }
      r.url = null;
    }
  };

  // The seconds tick, which stops the take at the cap; cleared on pause so paused time never counts (main's).
  const startTick = () => {
    if (r.tick) clearInterval(r.tick);
    r.tick = setInterval(() => {
      const s = Math.floor((r.accMs + (Date.now() - r.start)) / 1000);
      setSeconds(s);
      if (s >= MAX_RECORDING_SECONDS) { r.dur = s; stopRecording(); }
    }, 200);
  };
  // The level: main's amplitude (0..32767) through its sqrt curve, one sample each 80 ms.
  const startLevel = () => {
    if (r.amp) clearInterval(r.amp);
    r.amp = setInterval(() => {
      let amp = 0;
      try { amp = g.PlatformBridge.nativeRecordAmplitude() || 0; } catch (_e) { /* best effort */ }
      r.samples.push(Math.min(1, Math.sqrt(amp / 32767) * 1.8));
      setLevel(r.samples.slice(-LEVEL_BARS));
    }, 80);
  };
  const freezeForPause = () => {
    r.accMs += Date.now() - r.start;
    stopTimers();
    setStage('paused');
  };
  const pause = () => {
    if (stage !== 'recording' || g.PlatformBridge.nativeRecordPause() !== 'ok') return;
    freezeForPause();
  };
  const resume = () => {
    if (stage !== 'paused' || g.PlatformBridge.nativeRecordResume() !== 'ok') return;
    r.start = Date.now();
    startTick();
    startLevel();
    setStage('recording');
  };
  // Finish: the time is taken before the bridge stops (its onstop is async); the review shows at once and the take
  // arrives through __onNativeRecordingComplete. stageRef: the cap calls this from the render that started the tick.
  function stopRecording() {
    const cur = stageRef.current;
    if (cur !== 'recording' && cur !== 'paused') return;
    const ms = r.accMs + (cur === 'recording' ? Date.now() - r.start : 0);
    r.dur = Math.max(1, Math.floor(ms / 1000));
    stopTimers();
    try {
      g.PlatformBridge.nativeRecordStop();
    } finally {
      g.PlatformBridge.endAudioSession();   // the review holds no audio focus (main's)
    }
    setStage('preview');
  }

  /** Main's save: the committed take linked, its 48 bars, then the editor puts it in. */
  function persist() {
    if (!r.blob || !r.blob.size) {
      r.retry = null;
      setError(NOTHING_RECORDED);
      setStage('error');
      return;
    }
    const id = r.committed;
    if (!id) {
      setError('Failed to save recording.');
      setStage('error');
      return;
    }
    saveRef.current({ mediaId: id, duration: r.dur || seconds, samples: downsampleWave(r.samples.length ? r.samples : final, WAVE_STORE_BARS) });
    // After onSave, never before: the unlinked mark is what keeps the boot sweep off a take nothing claims yet.
    const S = g.JournalMediaStore;
    if (S && typeof S.markLinked === 'function') S.markLinked(id);
    r.committed = null;
    cleanup();
  }

  const discard = () => {
    r.pendingSave = false;
    // committed before it was shown, so throwing it away deletes it (main's journal-3 (a))
    const id = r.committed;
    r.committed = null;
    const S = g.JournalMediaStore;
    if (id && S && typeof S.delete === 'function') S.delete(id);
    cleanup();
    onClose();
  };
  // Ask first whenever real audio would go: a take with seconds in it, or one under review (main's).
  const requestDiscard = () => {
    const atRisk = stage === 'preview' || ((stage === 'recording' || stage === 'paused') && seconds > 0);
    if (atRisk) setConfirming(true);
    else discard();
  };
  const save = () => {
    if (r.blob) { persist(); return; }
    // still stopping: saved the moment the take arrives
    r.pendingSave = true;
    if (stage === 'recording' || stage === 'paused') stopRecording();
  };

  // Mount: main's callbacks, then the mic, then the take on a yes. One take per sheet open.
  React.useEffect(() => {
    if (gate) return undefined;
    const PB = g.PlatformBridge;
    let cancelled = false;
    let decided = false;
    let permTimer = 0;
    const fail = (words) => { setError(words); setStage('error'); };
    if (!PB) { fail('Could not request microphone access.'); return undefined; }

    // The phone paused the take itself (the screen locked: Android hands a backgrounded app a silent mic).
    g.__onNativeRecordingPaused = () => {
      if (!cancelled && stageRef.current === 'recording') freezeForPause();
    };

    g.__onNativeRecordingComplete = (b64, durMs, mime, blob, url) => {
      if (cancelled) return;
      stopTimers();
      const decode = (str) => {
        const bin = atob(str);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime || 'audio/webm' });
      };
      // Android's served name, the url's last segment under /recordings/ (main's journal-3 (d)); null otherwise.
      const m = /\/recordings\/([^/?#]+)$/.exec(url || '');
      const servedName = m ? m[1] : null;

      // Commit, then preview (main's journal-3 (a)): put() resolving is the durability line.
      const finalize = (audio) => {
        if (cancelled) return;
        if (!audio || audio.size === 0) {
          r.retry = null;
          fail(NOTHING_RECORDED);
          return;
        }
        const d = Math.max(1, Math.round((durMs || 0) / 1000));
        const record = /** @type {Record<string, any>} */ ({ type: 'audio', blob: audio, mime: audio.type || 'audio/webm', duration: d, unlinked: true });
        if (servedName) record.sourceName = servedName;
        Promise.resolve(g.JournalMediaStore.put(record)).then((id) => {
          if (cancelled) return;
          r.committed = id;
          // native lets go of its file only now that the bytes are durable here (main's handshake)
          if (servedName) {
            try { PB.nativeDeleteRecording(servedName); } catch (_e) { /* housekeeping only */ }
          }
          r.blob = audio;
          try { r.url = URL.createObjectURL(audio); } catch (_e) { /* best effort */ }
          r.dur = d;
          setFinal(r.samples.slice());
          setSeconds(d);
          if (r.pendingSave) {
            r.pendingSave = false;
            persist();
          } else {
            setStage('preview');
          }
        }).catch((err) => {
          if (cancelled) return;
          if (g.StorageHealth) g.StorageHealth.onWriteFailure(err);
          fail('Failed to save recording.');
        });
      };
      const unreadable = (e) => {
        console.warn('recording decode failed', e);
        fail('Could not read the recording from the device.');
      };
      // Only a listed row with size 0 says the served file held nothing; everything else is a failure (main's 2b).
      const servedIsEmpty = (name) => {
        let rows = null;
        try { rows = JSON.parse(PB.nativeListRecordings()); } catch (_e) { return false; }
        if (!Array.isArray(rows)) return false;
        const row = rows.find((x) => x && x.name === name);
        return !!row && row.size === 0;
      };

      try {
        if (blob && typeof blob.size === 'number') { finalize(blob); return; }   // the web hands the Blob over
        if (url) {
          // Android: the served file, fetched with two retries inside native's 60 s keep; Try again starts a new
          // round; after a second round fails, the bytes are read by name (base64, costly: only to save the take).
          const DELAYS = [500, 1500];
          const attempt = (n) => fetch(url)
            .then((res) => { if (!res.ok) throw new Error('fetch ' + res.status); return res.blob(); })
            .catch((e) => {
              if (n >= DELAYS.length) throw e;
              return new Promise((ok) => setTimeout(ok, DELAYS[n])).then(() => attempt(n + 1));
            });
          let rounds = 0;
          const run = () => {
            rounds++;
            attempt(0)
              .then((fb) => finalize(fb && !fb.type ? new Blob([fb], { type: mime || 'audio/mp4' }) : fb))
              .catch((e) => {
                if (rounds < 2 || !servedName) { unreadable(e); return; }
                let back = null;
                try { back = PB.nativeReadRecording(servedName); } catch (_e) { back = null; }
                // never decode a null: atob('null') is three bytes of silence saved as the take (main's measured case)
                if (!back) {
                  if (servedIsEmpty(servedName)) {
                    r.retry = null;
                    fail(EMPTY_FILE);
                    return;
                  }
                  unreadable(e);
                  return;
                }
                try { finalize(decode(back)); } catch (e2) { unreadable(e2); }
              });
          };
          r.retry = run;
          run();
          return;
        }
        if (b64) { finalize(decode(b64)); return; }   // Android's older base64 path
        finalize(null);
      } catch (e) {
        unreadable(e);
      }
    };

    const startCapture = () => {
      if (cancelled) return;
      if (g.StorageHealth && typeof g.StorageHealth.checkBeforeWrite === 'function'
        && !g.StorageHealth.checkBeforeWrite(300 * 1024).ok) {
        fail('Storage is full. Free up space before recording.');
        return;
      }
      // a letter playing must not read over the memo or fight it for audio focus
      try { if (g.AudioPlayer) g.AudioPlayer.pauseIfPlaying(); } catch (_e) { /* best effort */ }
      let res;
      try {
        if (!PB.isAndroid) PB.startAudioSession();   // Android takes focus inside nativeRecordStart
        res = PB.nativeRecordStart();
      } catch (_e) { res = 'error:exception'; }
      if (res !== 'ok') {
        try { PB.endAudioSession(); } catch (_e) { /* best effort */ }
        fail(START_ERRORS[res] || 'Could not start the recorder. Please try again.');
        return;
      }
      r.samples = [];
      r.start = Date.now();
      r.accMs = 0;
      setStage('recording');
      startTick();
      startLevel();
    };

    const forget = () => {
      try { delete g.__onMicPermissionResult; } catch (_e) { g.__onMicPermissionResult = undefined; }
    };
    g.__onMicPermissionResult = (granted) => {
      if (decided || cancelled) return;
      decided = true;
      clearTimeout(permTimer);
      forget();
      if (granted) startCapture();
      else fail(PERMISSION_DENIED);
    };
    // a prompt that never settles (main's 20 s watchdog)
    permTimer = setTimeout(() => {
      if (decided || cancelled) return;
      decided = true;
      forget();
      fail('Microphone request timed out. If a permission prompt appeared, please try again.');
    }, 20000);
    try {
      PB.requestMicPermission();
    } catch (_e) {
      decided = true;
      clearTimeout(permTimer);
      fail('Could not request microphone access.');
    }

    return () => {
      cancelled = true;
      clearTimeout(permTimer);
      forget();
      try { delete g.__onNativeRecordingComplete; } catch (_e) { g.__onNativeRecordingComplete = undefined; }
      try { delete g.__onNativeRecordingPaused; } catch (_e) { g.__onNativeRecordingPaused = undefined; }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: one take per sheet open; the helpers read refs and setters
  }, []);

  // The review's player and scrubber (main's).
  const dur = r.dur || seconds;
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) playMemo(a, setPlaying, onFail); else a.pause();
  };
  const seekTo = (ratio) => {
    const a = audioRef.current;
    const to = Math.max(0, Math.min(1, ratio));
    if (!a || !(dur > 0)) return;
    try { a.currentTime = to * dur; } catch (_e) { /* not seekable yet: the bars still move */ }
    setProgress(to);
  };
  const onScrubKey = (e) => {
    if (!(dur > 0)) return;
    const at = progress * dur;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? at + SCRUB_STEP_SECONDS
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? at - SCRUB_STEP_SECONDS
        : e.key === 'Home' ? 0 : e.key === 'End' ? dur : null;
    if (to === null) return;
    e.preventDefault();
    seekTo(to / dur);
  };

  const ask = confirming ? (
    <div className="cfs recc" role="group" aria-label="Discard this recording?">
      <p className="fine">Discard this recording?</p>
      <div className="cfb">
        <button type="button" className="btn2 sm" onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="pill sm" onClick={discard}>Yes, discard</button>
      </div>
    </div>
  ) : null;
  const round = (label, icon, act, main = false) => (
    <button type="button" className={'rb' + (main ? ' main' : '')} onClick={act}>
      <span className="rc"><Icon name={icon} size={24} /></span>{label}
    </button>
  );
  const words = (text, btns, alert = false) => (
    <>
      <p className="recq" role={alert ? 'alert' : 'status'}>{text}</p>
      <div className="stack">{btns}</div>
    </>
  );

  let body;
  if (stage === 'error') {
    body = words(error || 'Recording failed.', (
      <>
        {r.retry && (
          <button type="button" className="pill block" onClick={() => { setError(null); setStage('retrieving'); if (r.retry) r.retry(); }}>
            <span>Try again</span>
          </button>
        )}
        <button type="button" className="btn2 block" onClick={discard}>Close</button>
      </>
    ), true);
  } else if (stage === 'retrieving') {
    body = words('Getting your recording…', <button type="button" className="btn2 block" onClick={discard}>Close</button>);
  } else if (stage === 'requesting') {
    body = words('Requesting microphone access…', <button type="button" className="btn2 block" onClick={discard}>Cancel</button>);
  } else if (stage === 'recording' || stage === 'paused') {
    const paused = stage === 'paused';
    body = (
      <>
        <div className={'recst' + (paused ? ' is-paused' : '')}><span className="recdot" />{paused ? 'Paused' : 'Recording'}</div>
        <div className="rect num">{clock(seconds)}</div>
        <div className="recw" aria-hidden="true">
          {levelBars(level, 0.05).map((h, i) => <span key={i} className="p" style={{ height: h + 'px' }} />)}
        </div>
        <p className="recn">Up to 5 minutes · <span className="num">{clock(MAX_RECORDING_SECONDS - seconds)}</span> left</p>
        {ask || (
          <div className="recb">
            {round('Cancel', 'close', requestDiscard)}
            {paused ? round('Resume', 'play', resume, true) : round('Pause', 'pause', pause, true)}
            {round('Finish', 'check', stopRecording)}
          </div>
        )}
      </>
    );
  } else {
    const now = Math.round(progress * dur);
    body = (
      <>
        <div className="recst">Review</div>
        <div className="rect num">{clock(Math.floor(progress * dur))}<span className="rectot">{' / ' + clock(dur)}</span></div>
        <div className="recw scrub" role="slider" tabIndex={0} aria-label="Scrub recording" aria-valuemin={0}
          aria-valuemax={dur} aria-valuenow={now} aria-valuetext={clock(now) + ' of ' + clock(dur)} onKeyDown={onScrubKey}
          onClick={(e) => { const box = e.currentTarget.getBoundingClientRect(); if (box.width) seekTo((e.clientX - box.left) / box.width); }}>
          {levelBars(final, 0.3).map((h, i) => <span key={i} className={i / LEVEL_BARS <= progress ? 'p' : ''} style={{ height: h + 'px' }} />)}
        </div>
        {ask || (
          <div className="recb">
            {round('Discard', 'close', requestDiscard)}
            {round(playing ? 'Pause' : 'Play', playing ? 'pause' : 'play', togglePlay, true)}
            {round('Save', 'check', save)}
          </div>
        )}
        {r.url && (
          <audio ref={audioRef} src={r.url} hidden
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setProgress(0); }}
            onTimeUpdate={(e) => {
              const a = e.currentTarget;
              const d = r.dur || a.duration || 0;
              setProgress(d > 0 ? Math.min(1, (a.currentTime || 0) / d) : 0);
            }} />
        )}
      </>
    );
  }

  return (
    // the scrim, Escape and Back: the open question's Cancel first, then main's ask-before-losing
    <Sheet kind="rec" label="Voice memo" desktop={desktop} closeX onClose={confirming ? () => setConfirming(false) : requestDiscard}>
      <div className="sh">Voice memo</div>
      {body}
    </Sheet>
  );
}
