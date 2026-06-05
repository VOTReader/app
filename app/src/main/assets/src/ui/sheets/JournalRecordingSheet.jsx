/* ═══════════════════════════════════════════════════════════════════════
   JournalRecordingSheet — Cluster B (imported by _entry-b.js)
   ═══════════════════════════════════════════════════════════════════════
   Pure UI shell over PlatformBridge — owns stage state + UI timing + IDB
   save; the recording lifecycle (MediaRecorder + MediaStream + AnalyserNode
   on web, NativeAudioRecorder on Android) lives in PlatformBridge.*.

   Callback contract (per [[preserve-callback-contracts]] +
   [[callback-flow-unification]]):
     window.__onMicPermissionResult(granted: boolean)
       Fires after PlatformBridge.requestMicPermission().
     window.__onNativeRecordingComplete(base64: string|null, durMs: number, mime: string, blob?: Blob)
       Fires after PlatformBridge.nativeRecordStop() finalizes the recording.
       Web (J3) passes the Blob directly (base64 null); Android passes base64.
   The component installs both callbacks at mount, removes them on unmount.
   ═══════════════════════════════════════════════════════════════════════ */

import { PlatformBridge } from '../../utils/platform-bridge.js';

/** Bars stored for a saved voice-memo waveform (JRNL-3). Matches the live
 *  display count; bounds the inline waveform data to a constant size. */
const WAVE_STORE_BARS = 48;

/**
 * Max-pool a raw amplitude array down to `buckets` bars (JRNL-3). Peaks survive
 * (max, not average) so the stored waveform keeps its visual shape; the result
 * represents the WHOLE clip rather than the last N raw samples. Returns the
 * input unchanged when it's already at/under `buckets`, and null/[] passthrough.
 * @param {number[] | null | undefined} arr
 * @param {number} buckets
 * @returns {number[] | null}
 */
export function downsampleWave(arr, buckets) {
  if (!arr || !arr.length) return arr ? arr.slice() : null;
  if (arr.length <= buckets) return arr.slice();
  const out = [];
  const size = arr.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size);
    const end = Math.floor((i + 1) * size);
    let peak = 0;
    for (let j = start; j < end && j < arr.length; j++) { if (arr[j] > peak) peak = arr[j]; }
    out.push(peak);
  }
  return out;
}

export function JournalRecordingSheet({ onSave, onClose }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  // 'requesting' | 'recording' | 'paused' | 'preview' | 'error'
  var _stage = useState('requesting');
  var stage = _stage[0];
  var setStage = _stage[1];

  var _err = useState(null);
  var error = _err[0];
  var setError = _err[1];

  var _seconds = useState(0);
  var seconds = _seconds[0];
  var setSeconds = _seconds[1];

  var _waveLive = useState([]);    // live samples during recording (capped at 48 entries)
  var waveLive = _waveLive[0];
  var setWaveLive = _waveLive[1];

  var _waveFinal = useState([]);   // frozen sample array shown in preview
  var waveFinal = _waveFinal[0];
  var setWaveFinal = _waveFinal[1];

  var _progress = useState(0);     // 0..1 during preview playback
  var progress = _progress[0];
  var setProgress = _progress[1];

  var _previewPlaying = useState(false);
  var previewPlaying = _previewPlaying[0];
  var setPreviewPlaying = _previewPlaying[1];

  // Refs the component owns for UI display + IDB save. The bridge owns the
  // recorder + MediaStream + AudioContext + AnalyserNode; nothing about
  // platform branching lives in this file.
  var tickRef = useRef(0);                 // seconds-display interval id
  var ampRef = useRef(0);                  // amplitude-polling interval id
  var samplesAccumRef = useRef([]);        // waveform sample buffer (grows continuously)
  var startTimeRef = useRef(0);            // wall-clock at current segment start
  var accumulatedMsRef = useRef(0);        // total recorded ms across pause/resume
  var previewBlobRef = useRef(null);
  var previewDurationRef = useRef(0);
  var previewUrlRef = useRef(null);
  var previewAudioRef = useRef(null);
  var pendingSaveRef = useRef(false);      // Save tapped before recording finished

  // Cleanup helper — releases the bridge's recording resources + clears
  // UI intervals + frees the preview Blob URL. Idempotent; safe from any
  // exit path (cancel, unmount, error). Bridge owns MediaStream cleanup
  // per [[mediastream-track-cleanup]] — nativeRecordCancel stops tracks,
  // closes AudioContext, releases mic (mic indicator goes off).
  function cleanup() {
    PlatformBridge.endAudioSession();   // Android: restore audio mode; web: no-op
    PlatformBridge.nativeRecordCancel(); // safe even if already inactive
    try { if (ampRef.current) clearInterval(ampRef.current); } catch (_e) { /* best-effort */ }
    try { if (tickRef.current) clearInterval(tickRef.current); } catch (_e) { /* best-effort */ }
    ampRef.current = 0;
    tickRef.current = 0;
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch (_e) { /* best-effort */ }
      previewUrlRef.current = null;
    }
  }

  // Mount: install bridge callbacks → request mic → start recording on grant.
  // Single code path now (per [[callback-flow-unification]] + Tier C
  // consolidation); bridge owns all platform-conditional recording logic.
  useEffect(function() {
    var cancelled = false;
    var permDecided = false;
    var permTimer = 0;

    // __onNativeRecordingComplete: fires when the bridge finalizes the
    // recording (after PlatformBridge.nativeRecordStop). One callback shape for
    // both platforms ([[callback-flow-unification]]): (b64, durMs, mime, blob?).
    // Web (J3) passes the Blob DIRECTLY as the 4th arg — no base64 round-trip;
    // Android passes base64 (string-only bridge) which we decode here. Either
    // way we end with one audio Blob and transition to preview (or auto-save if
    // Save was tapped while still recording).
    window.__onNativeRecordingComplete = function(b64, durMs, mime, blob) {
      if (cancelled) return;
      try { if (ampRef.current) clearInterval(ampRef.current); } catch (_e) { /* best-effort */ }
      try { if (tickRef.current) clearInterval(tickRef.current); } catch (_e) { /* best-effort */ }
      ampRef.current = 0;
      tickRef.current = 0;
      try {
        // Prefer the Blob the web path hands us (J3 — avoids holding a redundant
        // ~1.33x base64 copy in heap); fall back to decoding Android's base64.
        var audioBlob = (blob && typeof blob.size === 'number') ? blob : null;
        if (!audioBlob && b64) {
          var bin = atob(b64);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          audioBlob = new Blob([arr], { type: mime || 'audio/webm' });
        }
        if (!audioBlob || audioBlob.size === 0) {
          setError('Nothing was recorded. Try again and speak after the timer starts.');
          setStage('error');
          return;
        }
        previewBlobRef.current = audioBlob;
        try { previewUrlRef.current = URL.createObjectURL(audioBlob); } catch (_e) { /* best-effort */ }
        var d = Math.max(1, Math.round((durMs || 0) / 1000));
        previewDurationRef.current = d;
        setWaveFinal(samplesAccumRef.current.slice());
        setSeconds(d);
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          persistRecording();
        } else {
          setStage('preview');
        }
      } catch (e) {
        console.warn('recording decode failed', e);
        setError('Could not process the recording. Please try again.');
        setStage('error');
      }
    };

    // Start the recorder + display tick + amplitude polling. Runs after
    // __onMicPermissionResult(true) fires.
    function startCapture() {
      if (cancelled) return;

      if (typeof StorageHealth !== 'undefined') {
        var check = StorageHealth.checkBeforeWrite(300 * 1024);
        if (!check.ok) {
          setError('Storage is full. Free up space before recording.');
          setStage('error');
          return;
        }
      }

      var res;
      try { res = PlatformBridge.nativeRecordStart(); } catch (_e) { res = 'error:exception'; }
      if (res !== 'ok') {
        setError(
          res === 'error:unsupported-codec'
            ? 'Recording is not supported in this browser.'
            : res === 'error:no-stream'
              ? 'Microphone access was not granted.'
              : res === 'error:permission'
                ? 'Microphone permission denied. Enable mic access for this app, then try again.'
                : 'Could not start the recorder. Please try again.'
        );
        setStage('error');
        return;
      }
      PlatformBridge.startAudioSession();  // Android: MODE_IN_COMMUNICATION; web: no-op
      samplesAccumRef.current = [];
      startTimeRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setStage('recording');

      // Seconds counter — auto-stops at MAX_RECORDING_SECONDS. NTV-1: this IS the
      // recording length cap (the blind audit's "no cap anywhere" was wrong — it
      // grepped for setMaxDuration and missed this inline foreground stop). It
      // bounds the native stop() whole-file read: 96 kbps × 5 min ≈ 3.6 MB, well
      // within budget-device heap, so the audit's unbounded-43 MB/hour scenario
      // cannot occur on the foreground path. (A native setMaxDuration/File backstop
      // for a backgrounded recording past the cap is device-walk-gated — it touches
      // the OEM MediaRecorder auto-stop behavior the native path exists to avoid.)
      var MAX_RECORDING_SECONDS = 300; // 5 min
      tickRef.current = setInterval(function() {
        var sinceResume = Date.now() - startTimeRef.current;
        var totalMs = accumulatedMsRef.current + sinceResume;
        var s = Math.floor(totalMs / 1000);
        setSeconds(s);
        if (s >= MAX_RECORDING_SECONDS) {
          previewDurationRef.current = s;
          stopRecording();
        }
      }, 200);

      // Amplitude polling — bridge handles the platform branch. Android:
      // MediaRecorder.getMaxAmplitude (one-shot 0-32767 peak). Web: AnalyserNode
      // RMS via pre-allocated Uint8Array buffer per [[amplitude-buffer-preallocation]]
      // mapped to 0-32767 to match the Android contract. Component then maps
      // 0-32767 → 0-1 via the Android-tuned sqrt formula for the waveform.
      ampRef.current = setInterval(function() {
        var amp = 0;
        try { amp = PlatformBridge.nativeRecordAmplitude() || 0; } catch (_e) { /* best-effort */ }
        var lvl = Math.min(1, Math.sqrt(amp / 32767) * 1.8);
        samplesAccumRef.current.push(lvl);
        setWaveLive(samplesAccumRef.current.slice(-48));
      }, 80);
    }

    // __onMicPermissionResult: fires from PlatformBridge.requestMicPermission.
    // Android: native permission flow (Activity launcher). Web: getUserMedia
    // resolution. The bridge stores the resulting MediaStream so that
    // nativeRecordStart can reuse it without re-prompting.
    window.__onMicPermissionResult = function(granted) {
      if (permDecided || cancelled) return;
      permDecided = true;
      if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
      try { delete window.__onMicPermissionResult; } catch (_e) { window.__onMicPermissionResult = undefined; }
      if (granted) {
        startCapture();
      } else {
        setError('Microphone permission denied. Enable mic access for this app, then try again.');
        setStage('error');
      }
    };

    // 20-second watchdog — handles permission prompts that never settle
    // (Android: hung dialog; web: rare but seen with locked OS-level prompts).
    permTimer = setTimeout(function() {
      if (permDecided || cancelled) return;
      permDecided = true;
      try { delete window.__onMicPermissionResult; } catch (_e) { window.__onMicPermissionResult = undefined; }
      setError('Microphone request timed out. If a permission prompt appeared, please try again.');
      setStage('error');
    }, 20000);

    try {
      PlatformBridge.requestMicPermission();
    } catch (_e) {
      permDecided = true;
      if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
      setError('Could not request microphone access.');
      setStage('error');
    }

    return function() {
      cancelled = true;
      if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
      try { delete window.__onMicPermissionResult; } catch (_e) { window.__onMicPermissionResult = undefined; }
      try { delete window.__onNativeRecordingComplete; } catch (_e) { window.__onNativeRecordingComplete = undefined; }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: one recording session per sheet open. setError/setSeconds/setStage/setWaveFinal/setWaveLive are useState setters (identity-stable); persistRecording/stopRecording are local functions whose closure reads the same setters + refs that this effect's closure does — same lifecycle, no stale-value risk.
  }, []);

  function pauseRecording() {
    if (stage !== 'recording') return;
    var res = PlatformBridge.nativeRecordPause();
    if (res !== 'ok') return;
    accumulatedMsRef.current += (Date.now() - startTimeRef.current);
    setStage('paused');
  }

  function resumeRecording() {
    if (stage !== 'paused') return;
    var res = PlatformBridge.nativeRecordResume();
    if (res !== 'ok') return;
    startTimeRef.current = Date.now();
    setStage('recording');
  }

  function stopRecording() {
    // Snapshot duration BEFORE asking the bridge to stop — its onstop runs
    // async and we want the UI to show the correct elapsed time immediately.
    var totalMs = accumulatedMsRef.current;
    if (stage === 'recording') totalMs += (Date.now() - startTimeRef.current);
    previewDurationRef.current = Math.max(1, Math.floor(totalMs / 1000));
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
    if (ampRef.current) { clearInterval(ampRef.current); ampRef.current = 0; }
    // Bridge fires window.__onNativeRecordingComplete from its async onstop
    // handler (Android: native callback; web: MediaRecorder.onstop →
    // FileReader.readAsDataURL). Component transitions to preview eagerly;
    // the callback then populates previewBlobRef + may trigger auto-save.
    PlatformBridge.nativeRecordStop();
    setStage('preview');
  }

  function discard() {
    pendingSaveRef.current = false;
    cleanup();
    onClose && onClose();
  }

  function persistRecording() {
    var blob = previewBlobRef.current;
    if (!blob || !blob.size) {
      setError('Nothing was recorded. Try again and speak after the timer starts.');
      setStage('error');
      return;
    }
    // JRNL-3: the amplitude poll accumulates one sample every 80ms (~3750 floats
    // for a 5-min clip), but the waveform UI only ever renders ~48 bars. Storing
    // the full array inflates EVERY journal autosave (the whole list is one IDB
    // value re-serialized on each _save) + every export with data never displayed
    // at that resolution. Max-pool down to WAVE_STORE_BARS buckets (peaks survive,
    // representing the WHOLE clip) before persisting.
    var rawSamples = (samplesAccumRef.current && samplesAccumRef.current.length)
      ? samplesAccumRef.current
      : (waveFinal && waveFinal.length ? waveFinal : null);
    var samplesOut = downsampleWave(rawSamples, WAVE_STORE_BARS);
    JournalMediaStore.put({
      type: 'audio',
      blob: blob,
      mime: blob.type || 'audio/webm',
      duration: previewDurationRef.current || seconds
    }).then(function(id) {
      onSave && onSave({
        mediaId: id,
        duration: previewDurationRef.current || seconds,
        samples: samplesOut
      });
      cleanup();
    }).catch(function(err) {
      if (typeof StorageHealth !== 'undefined') StorageHealth.onWriteFailure(err);
      setError('Failed to save recording.');
      setStage('error');
    });
  }

  function save() {
    if (!previewBlobRef.current) {
      // Recording not yet stopped — flag for auto-save when
      // __onNativeRecordingComplete fires after stopRecording()'s async stop.
      if (stage === 'recording' || stage === 'paused') {
        pendingSaveRef.current = true;
        stopRecording();
        return;
      }
      pendingSaveRef.current = true;
      return;
    }
    persistRecording();
  }

  function togglePreviewPlay() {
    var a = previewAudioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }

  function onPreviewTimeUpdate() {
    var a = previewAudioRef.current;
    if (!a) return;
    var dur = previewDurationRef.current || a.duration || 0;
    setProgress(dur > 0 ? Math.min(1, (a.currentTime || 0) / dur) : 0);
  }

  function seekPreviewFromEvent(e) {
    var a = previewAudioRef.current;
    if (!a) return;
    var rect = e.currentTarget.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var ratio = Math.max(0, Math.min(1, x / rect.width));
    var dur = previewDurationRef.current || a.duration || 0;
    if (dur > 0) {
      a.currentTime = ratio * dur;
      setProgress(ratio);
    }
  }

  var fmtTime = function(s) {
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  };

  function renderRecordingWave(samples) {
    var bars = [];
    var count = 48;
    var src = samples && samples.length ? samples : [];
    for (var i = 0; i < count; i++) {
      var v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.05;
      var h = Math.max(4, Math.min(56, Math.round(v * 56)));
      bars.push(<div key={i} className="bar" style={{ height: h + 'px' }} />);
    }
    return <div className="jrn-rec-waveform">{bars}</div>;
  }

  function renderScrubWave(samples, prog) {
    var bars = [];
    var count = 48;
    var src = samples && samples.length ? samples : [];
    for (var i = 0; i < count; i++) {
      var v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.3;
      var h = Math.max(4, Math.min(56, Math.round(v * 56)));
      bars.push(
        <div
          key={i}
          className={'bar' + ((i / count) <= prog ? ' is-played' : '')}
          style={{ height: h + 'px' }}
        />
      );
    }
    return (
      <div
        className="jrn-rec-waveform is-scrubbable"
        onClick={seekPreviewFromEvent}
        role="slider"
        aria-label="Scrub recording"
      >
        {bars}
      </div>
    );
  }

  function renderContent() {
    if (stage === 'error') {
      return (
        <div>
          <div className="jrn-rec-error">{error || 'Recording failed.'}</div>
          <div className="jrn-rec-actions">
            <button className="jrn-rec-cancel" onClick={discard}>Close</button>
          </div>
        </div>
      );
    }
    if (stage === 'requesting') {
      return (
        <div className="jrn-rec-content">
          <div className="jrn-rec-requesting">Requesting microphone access…</div>
          <div className="jrn-rec-actions">
            <button className="jrn-rec-cancel" onClick={discard}>Cancel</button>
          </div>
        </div>
      );
    }
    if (stage === 'recording' || stage === 'paused') {
      var isPaused = stage === 'paused';
      return (
        <div className="jrn-rec-content">
          <div className={"jrn-rec-status" + (isPaused ? ' is-paused' : '')}>{isPaused ? 'Paused' : 'Recording'}</div>
          <div className="jrn-rec-time">{fmtTime(seconds)}</div>
          {renderRecordingWave(waveLive)}
          <div className="jrn-rec-actions">
            <button className="jrn-rec-cancel" onClick={discard} aria-label="Cancel">Cancel</button>
            {isPaused ? (
              <button className="jrn-rec-pause-btn" onClick={resumeRecording} aria-label="Resume" title="Resume">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3v18l16-9z" />
                </svg>
              </button>
            ) : (
              <button className="jrn-rec-pause-btn" onClick={pauseRecording} aria-label="Pause" title="Pause">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              </button>
            )}
            <button className="jrn-rec-stop-btn" onClick={stopRecording} aria-label="Finish" title="Finish">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x={6} y={6} width={12} height={12} rx={2} />
              </svg>
            </button>
          </div>
        </div>
      );
    }
    // preview — scrub through real waveform, green ✓ to confirm
    return (
      <div className="jrn-rec-content jrn-rec-preview">
        <div className="jrn-rec-status">Review</div>
        <div className="jrn-rec-time">
          {fmtTime(Math.floor((progress || 0) * (previewDurationRef.current || seconds)))}
          <span className="jrn-rec-time-total">{' / ' + fmtTime(previewDurationRef.current || seconds)}</span>
        </div>
        {renderScrubWave(waveFinal, progress)}
        <div className="jrn-rec-preview-actions">
          <button className="jrn-rec-pp" onClick={togglePreviewPlay} aria-label={previewPlaying ? 'Pause' : 'Play'} title={previewPlaying ? 'Pause' : 'Play'}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              {previewPlaying
                ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                : <path d="M6 3v18l16-9z" />}
            </svg>
          </button>
        </div>
        <div className="jrn-rec-actions">
          <button className="jrn-rec-discard-btn" onClick={discard} aria-label="Discard" title="Discard">×</button>
          <button className="jrn-rec-confirm-btn" onClick={save} aria-label="Save" title="Save">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
        {previewUrlRef.current && (
          <audio
            ref={previewAudioRef}
            src={previewUrlRef.current}
            style={{ display: 'none' }}
            onPlay={function() { setPreviewPlaying(true); }}
            onPause={function() { setPreviewPlaying(false); }}
            onEnded={function() { setPreviewPlaying(false); setProgress(0); }}
            onTimeUpdate={onPreviewTimeUpdate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="note-sheet-overlay" onClick={function(e) { if (e.target === e.currentTarget) discard(); }}>
      <div className="note-sheet jrn-rec-sheet" onClick={function(e) { e.stopPropagation(); }}>
        <div className="note-sheet-header">
          <span className="note-sheet-title" style={{ flex: 1 }}>{stage === 'preview' ? 'Review Recording' : 'Voice Recording'}</span>
          {stage !== 'preview' && (
            <button className="note-sheet-menu-btn" onClick={discard} aria-label="Close" style={{ fontSize: '18px' }}>×</button>
          )}
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
