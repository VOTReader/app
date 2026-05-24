/* ═══════════════════════════════════════════════════════════════════════
   JournalRecordingSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

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

  var mediaRecorderRef = useRef(null);
  var streamRef = useRef(null);
  var chunksRef = useRef([]);
  var startTimeRef = useRef(0);          // wall-clock when current record segment started
  var accumulatedMsRef = useRef(0);       // total recorded ms across pause/resume cycles
  var rafRef = useRef(0);
  var tickRef = useRef(0);
  var audioCtxRef = useRef(null);
  var analyserRef = useRef(null);
  var samplesAccumRef = useRef([]);       // continuously growing sample buffer
  var previewBlobRef = useRef(null);
  var previewDurationRef = useRef(0);
  var previewUrlRef = useRef(null);
  var previewAudioRef = useRef(null);
  var pendingSaveRef = useRef(false);   // true if Save was tapped before onstop flushed the blob
  var nativeRef = useRef(false);        // true when using the Android native recorder bridge
  var nativeStateRef = useRef('inactive'); // 'recording' | 'paused' | 'inactive' (native mode)
  var ampRef = useRef(0);               // setInterval id polling native getMaxAmplitude

  // Cleanup helper — releases mic, stops timers, frees blob URL
  function cleanup() {
    // Safety net: restore the audio mode if recording was cancelled/errored
    // before rec.onstop fired. Idempotent — endAudioSession just re-applies
    // the saved mode, so calling it again after onstop is harmless.
    var _abc = (typeof window !== 'undefined') ? window.AndroidBridge : null;
    if (_abc && typeof _abc.endAudioSession === 'function') {
      try { _abc.endAudioSession(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    }
    // Native mode: abort the OS recorder + delete its temp file. Safe to call
    // even after a successful stop — Kotlin no-ops when the recorder is null.
    if (nativeRef.current && _abc && typeof _abc.nativeRecordCancel === 'function') {
      try { _abc.nativeRecordCancel(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    }
    nativeStateRef.current = 'inactive';
    try { if (ampRef.current) clearInterval(ampRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    ampRef.current = 0;
    try { if (rafRef.current) cancelAnimationFrame(rafRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    try { if (tickRef.current) clearInterval(tickRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    rafRef.current = 0;
    tickRef.current = 0;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(function(t) { t.stop(); }); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      audioCtxRef.current = null;
    }
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      previewUrlRef.current = null;
    }
  }

  // Mount: request mic, start MediaRecorder
  useEffect(function() {
    var cancelled = false;
    var settled = false;     // true once getUserMedia resolves OR rejects
    var watchdog = 0;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Recording is not supported in this browser.');
      setStage('error');
      return cleanup;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.');
      setStage('error');
      return cleanup;
    }

    // Actual capture — only called once the OS mic permission is settled
    // (Android) or immediately (PC/preview). Defined here, invoked by the
    // permission gate below.
    function beginCapture() {
    if (cancelled || settled) return;
    var retryCount = 0;
    var MAX_RETRIES = 3;

    // doAttempt wraps getUserMedia with automatic retry for transient Android
    // audio-hardware errors (NotReadableError / TrackStartError / AbortError).
    function doAttempt() {
    if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
    watchdog = setTimeout(function() {
      if (cancelled || settled) return;
      settled = true;
      setError('Microphone request timed out. If a permission prompt appeared, try again; otherwise enable mic access in settings.');
      setStage('error');
    }, 20000);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      settled = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
      if (cancelled) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }
      streamRef.current = stream;

      var _ab = (typeof window !== 'undefined') ? window.AndroidBridge : null;
      if (_ab && typeof _ab.startAudioSession === 'function') {
        try { _ab.startAudioSession(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      }

      var mime = '';
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < candidates.length; i++) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
          mime = candidates[i]; break;
        }
      }
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (ctorErr) {
        try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        streamRef.current = null;
        console.warn('MediaRecorder construction failed', ctorErr);
        setError('Audio recording is not supported on this device.');
        setStage('error');
        return;
      }
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      samplesAccumRef.current = [];

      rec.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = function() {
        var _ab2 = (typeof window !== 'undefined') ? window.AndroidBridge : null;
        if (_ab2 && typeof _ab2.endAudioSession === 'function') {
          try { _ab2.endAudioSession(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        }
        var type = rec.mimeType || 'audio/webm';
        var blob = new Blob(chunksRef.current, { type: type });
        previewBlobRef.current = blob;
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach(function(t) { t.stop(); }); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
          streamRef.current = null;
        }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ } audioCtxRef.current = null; }
        analyserRef.current = null;
        try { previewUrlRef.current = URL.createObjectURL(blob); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        setWaveFinal(samplesAccumRef.current.slice());
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          persistRecording();
        }
      };

      rec.start(250);
      startTimeRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setStage('recording');

      tickRef.current = setInterval(function() {
        if (rec.state === 'recording') {
          var sinceResume = Date.now() - startTimeRef.current;
          var totalMs = accumulatedMsRef.current + sinceResume;
          var s = Math.floor(totalMs / 1000);
          setSeconds(s);
          if (s >= 300) {
            previewDurationRef.current = s;
            try { rec.stop(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
            if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
            setSeconds(s);
            setStage('preview');
          }
        }
      }, 200);

      var isAndroid = !!(typeof window !== 'undefined' && window.AndroidBridge);
      if (!isAndroid) {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          var ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          var source = ctx.createMediaStreamSource(stream);
          var analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;
          var buf = new Uint8Array(analyser.frequencyBinCount);
          var lastSample = 0;
          var loop = function() {
            if (!analyserRef.current) return;
            analyser.getByteTimeDomainData(buf);
            var sum = 0;
            for (var i = 0; i < buf.length; i++) {
              var v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            var rms = Math.sqrt(sum / buf.length);
            var now = performance.now();
            if (now - lastSample > 80) {
              lastSample = now;
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                var lvl = Math.min(1, rms * 8);
                samplesAccumRef.current.push(lvl);
                var live = samplesAccumRef.current.slice(-48);
                setWaveLive(live);
              }
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          loop();
        }
      } catch (e) { /* analyser optional */ }
      }
    }).catch(function(err) {
      if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
      if (cancelled) return;
      var name = err && err.name;
      var retriable = name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError';
      if (retriable && retryCount < MAX_RETRIES && !cancelled) {
        retryCount++;
        console.warn('JRN: mic unavailable (' + name + '), retry ' + retryCount + '/' + MAX_RETRIES + ' in ' + (retryCount * 400) + ' ms');
        setTimeout(function() { if (!cancelled) doAttempt(); }, retryCount * 400);
        return;
      }
      settled = true;
      console.warn('getUserMedia rejected', err);
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission denied. Enable mic access in settings to record.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No microphone was found on this device.'
            : name === 'NotReadableError' || name === 'TrackStartError'
              ? 'Could not open the microphone. Close any app currently recording audio, then try again.'
              : 'Could not access microphone.'
      );
      setStage('error');
    });
    } // end doAttempt
    doAttempt();
    } // end beginCapture

    // ── Native Android recorder path ─────────────────────────
    function beginNativeCapture() {
      if (cancelled || settled) return;
      settled = true;
      var AB = window.AndroidBridge;
      nativeRef.current = true;
      var res;
      try { res = AB.nativeRecordStart(); } catch (e) { res = 'error:exception'; }
      if (res !== 'ok') {
        nativeRef.current = false;
        setError(
          res === 'error:permission'
            ? 'Microphone permission denied. Enable mic access for this app in Android Settings → Apps, then try again.'
            : 'Could not start the recorder. Please try again.'
        );
        setStage('error');
        return;
      }
      nativeStateRef.current = 'recording';
      chunksRef.current = [];
      samplesAccumRef.current = [];
      startTimeRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setStage('recording');

      tickRef.current = setInterval(function() {
        if (nativeStateRef.current === 'recording') {
          var sinceResume = Date.now() - startTimeRef.current;
          var s = Math.floor((accumulatedMsRef.current + sinceResume) / 1000);
          setSeconds(s);
          if (s >= 300) {
            previewDurationRef.current = s;
            stopRecording();
          }
        }
      }, 200);

      ampRef.current = setInterval(function() {
        if (nativeStateRef.current !== 'recording') return;
        var amp = 0;
        try { amp = AB.nativeRecordAmplitude() || 0; } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
        var lvl = Math.min(1, Math.sqrt(amp / 32767) * 1.8);
        samplesAccumRef.current.push(lvl);
        setWaveLive(samplesAccumRef.current.slice(-48));
      }, 80);
    }

    window.__onNativeRecordingComplete = function(b64, durMs, mime) {
      if (cancelled) return;
      nativeStateRef.current = 'inactive';
      try { if (ampRef.current) clearInterval(ampRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      ampRef.current = 0;
      try { if (tickRef.current) clearInterval(tickRef.current); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      tickRef.current = 0;
      if (!b64) {
        setError('Nothing was recorded. Try again and speak after the timer starts.');
        setStage('error');
        return;
      }
      try {
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var blob = new Blob([arr], { type: mime || 'audio/mp4' });
        previewBlobRef.current = blob;
        try { previewUrlRef.current = URL.createObjectURL(blob); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
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
        console.warn('native recording decode failed', e);
        setError('Could not process the recording. Please try again.');
        setStage('error');
      }
    };

    function startCapture() {
      var _ab = (typeof window !== 'undefined') ? window.AndroidBridge : null;
      if (_ab && typeof _ab.nativeRecordStart === 'function') {
        beginNativeCapture();
      } else {
        beginCapture();
      }
    }

    var permTimer = 0;
    var AB = (typeof window !== 'undefined') ? window.AndroidBridge : null;
    if (AB && typeof AB.requestMicPermission === 'function') {
      var permDecided = false;
      window.__onMicPermissionResult = function(granted) {
        if (permDecided || cancelled) return;
        permDecided = true;
        if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
        try { delete window.__onMicPermissionResult; } catch (e) { window.__onMicPermissionResult = undefined; }
        if (granted) {
          startCapture();
        } else {
          settled = true;
          setError('Microphone permission denied. Enable mic access for this app in Android Settings → Apps, then try again.');
          setStage('error');
        }
      };
      permTimer = setTimeout(function() {
        if (permDecided || cancelled) return;
        permDecided = true;
        try { delete window.__onMicPermissionResult; } catch (e) { window.__onMicPermissionResult = undefined; }
        startCapture();
      }, 15000);
      try { AB.requestMicPermission(); }
      catch (e) {
        permDecided = true;
        if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
        startCapture();
      }
    } else {
      startCapture();
    }

    return function() {
      cancelled = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
      if (permTimer) { clearTimeout(permTimer); permTimer = 0; }
      try { delete window.__onMicPermissionResult; } catch (e) { window.__onMicPermissionResult = undefined; }
      try { delete window.__onNativeRecordingComplete; } catch (e) { window.__onNativeRecordingComplete = undefined; }
      cleanup();
    };
  }, []);

  function pauseRecording() {
    if (nativeRef.current) {
      if (nativeStateRef.current !== 'recording') return;
      var _ab = window.AndroidBridge;
      try { if (_ab) _ab.nativeRecordPause(); } catch (e) { return; }
      accumulatedMsRef.current += (Date.now() - startTimeRef.current);
      nativeStateRef.current = 'paused';
      setStage('paused');
      return;
    }
    var rec = mediaRecorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    try { rec.pause(); } catch (e) { return; }
    accumulatedMsRef.current += (Date.now() - startTimeRef.current);
    setStage('paused');
  }

  function resumeRecording() {
    if (nativeRef.current) {
      if (nativeStateRef.current !== 'paused') return;
      var _ab = window.AndroidBridge;
      try { if (_ab) _ab.nativeRecordResume(); } catch (e) { return; }
      startTimeRef.current = Date.now();
      nativeStateRef.current = 'recording';
      setStage('recording');
      return;
    }
    var rec = mediaRecorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    try { rec.resume(); } catch (e) { return; }
    startTimeRef.current = Date.now();
    setStage('recording');
  }

  function stopRecording() {
    if (nativeRef.current) {
      var totalMs = accumulatedMsRef.current;
      if (nativeStateRef.current === 'recording') totalMs += (Date.now() - startTimeRef.current);
      previewDurationRef.current = Math.max(1, Math.floor(totalMs / 1000));
      nativeStateRef.current = 'inactive';
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
      if (ampRef.current) { clearInterval(ampRef.current); ampRef.current = 0; }
      var _ab = window.AndroidBridge;
      try { if (_ab) _ab.nativeRecordStop(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
      setStage('preview');
      return;
    }
    var rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      var totalMs2 = accumulatedMsRef.current;
      if (rec.state === 'recording') totalMs2 += (Date.now() - startTimeRef.current);
      previewDurationRef.current = Math.max(1, Math.floor(totalMs2 / 1000));
      try { rec.stop(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
    }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
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
    var samplesOut = (samplesAccumRef.current && samplesAccumRef.current.length)
      ? samplesAccumRef.current.slice()
      : (waveFinal && waveFinal.length ? waveFinal.slice() : null);
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
      console.warn('Save failed', err);
      setError('Failed to save recording.');
      setStage('error');
    });
  }

  function save() {
    if (!previewBlobRef.current) {
      var rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        pendingSaveRef.current = true;
        try { rec.stop(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
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
