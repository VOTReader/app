/* ═══════════════════════════════════════════════════════════════
   JOURNAL RECORDING SHEET — voice memo capture UI
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalMediaStore, JournalHelpers.

   Flow:
     'requesting' → 'recording' ⇄ 'paused' → 'preview' → save | discard
                                                       → 'error'

   Recording stage:
     • live waveform sampled from AnalyserNode
     • pause / resume via MediaRecorder.pause()/resume()
     • cancel discards
   Preview stage:
     • plays back the captured Blob
     • scrub-through-waveform: tap anywhere on the bars to seek
     • Discard (×) drops everything, green ✓ saves to JournalMediaStore

   Props:
     onSave({mediaId, duration, samples})
     onClose()
═══════════════════════════════════════════════════════════════ */

function JournalRecordingSheet({ onSave, onClose }) {
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
      try { _abc.endAudioSession(); } catch (e) {}
    }
    // Native mode: abort the OS recorder + delete its temp file. Safe to call
    // even after a successful stop — Kotlin no-ops when the recorder is null.
    if (nativeRef.current && _abc && typeof _abc.nativeRecordCancel === 'function') {
      try { _abc.nativeRecordCancel(); } catch (e) {}
    }
    nativeStateRef.current = 'inactive';
    try { if (ampRef.current) clearInterval(ampRef.current); } catch (e) {}
    ampRef.current = 0;
    try { if (rafRef.current) cancelAnimationFrame(rafRef.current); } catch (e) {}
    try { if (tickRef.current) clearInterval(tickRef.current); } catch (e) {}
    rafRef.current = 0;
    tickRef.current = 0;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {}
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch (e) {}
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
    // These fire on Pixel/Samsung devices when the mic hardware is momentarily
    // occupied — common right after the permission dialog closes or during a
    // Bluetooth audio handoff. Re-arming the watchdog on every attempt prevents
    // a hung promise leaving the sheet stuck on "Requesting microphone access…"
    // indefinitely. Each retry backs off 400 ms further (400 / 800 / 1200 ms).
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

      // Tell the Android shell to switch to MODE_IN_COMMUNICATION so the mic
      // AudioRecord session stays stable for the whole recording (Android 8+).
      // No-op on desktop (no AndroidBridge).
      var _ab = (typeof window !== 'undefined') ? window.AndroidBridge : null;
      if (_ab && typeof _ab.startAudioSession === 'function') {
        try { _ab.startAudioSession(); } catch (e) {}
      }

      // Pick a MIME type the WebView supports
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
        // Some old WebViews expose MediaRecorder but reject every container.
        try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
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
        // Recording is done — restore the normal audio mode immediately so the
        // preview <audio> plays through the speaker, not the call earpiece.
        var _ab2 = (typeof window !== 'undefined') ? window.AndroidBridge : null;
        if (_ab2 && typeof _ab2.endAudioSession === 'function') {
          try { _ab2.endAudioSession(); } catch (e) {}
        }
        var type = rec.mimeType || 'audio/webm';
        var blob = new Blob(chunksRef.current, { type: type });
        previewBlobRef.current = blob;
        // Release mic + analyser immediately
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
          streamRef.current = null;
        }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
        analyserRef.current = null;
        try { previewUrlRef.current = URL.createObjectURL(blob); } catch (e) {}
        // Snapshot the full sample buffer for the scrubbable preview waveform.
        setWaveFinal(samplesAccumRef.current.slice());
        // If the user already tapped Save while the recorder was still
        // flushing its final chunk (onstop is async), honour it now —
        // otherwise the blob was null and the recording would be silently
        // discarded.
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          persistRecording();
        }
      };

      rec.start(250);
      startTimeRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setStage('recording');

      // Time ticker (only counts time while actively recording — when paused
      // the accumulated total stays put).
      tickRef.current = setInterval(function() {
        if (rec.state === 'recording') {
          var sinceResume = Date.now() - startTimeRef.current;
          var totalMs = accumulatedMsRef.current + sinceResume;
          var s = Math.floor(totalMs / 1000);
          setSeconds(s);
          // Cap at 5 min — must mirror stopRecording()'s teardown, otherwise
          // the UI freezes on the recording screen, the tick interval keeps
          // firing forever, and the waveform RAF loop never stops.
          if (s >= 300) {
            previewDurationRef.current = s;
            try { rec.stop(); } catch (e) {}
            if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
            setSeconds(s);
            setStage('preview');
          }
        }
      }, 200);

      // Waveform sampling — runs continuously, only collects when recording.
      // SKIPPED ON ANDROID: creating an AudioContext + createMediaStreamSource
      // on the SAME getUserMedia stream that MediaRecorder is consuming triggers
      // AAUDIO_ERROR_DISCONNECTED on Pixel 6+ (AAUDIO backend) — the capture
      // drops out or never starts (a NotReadableError cause). Desktop browsers
      // handle dual stream consumers fine. Trade-off: the live + preview
      // waveform is flat on Android, but recording itself works reliably.
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
                // 8× amplification: speech RMS through a typical mic is ~0.02–0.06,
                // so 3× barely moved the 56px bars (read as flat). 8× maps normal
                // speech to ~22–45px without clipping on moderately loud input.
                var lvl = Math.min(1, rms * 8);
                samplesAccumRef.current.push(lvl);
                // Keep live display at ~48 samples
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
      // NotReadableError / TrackStartError / AbortError = the audio hardware was
      // transiently unavailable (common on Android WebView right after a permission
      // dialog closes, or during a Bluetooth audio handoff). Retry with exponential
      // back-off before surfacing an error to the user — on most devices the second
      // or third attempt succeeds within a second.
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
    // Records via the OS MediaRecorder (Kotlin bridge) instead of WebView
    // getUserMedia. This is the reliable path across the Android version /
    // OEM matrix — getUserMedia in Android WebView is the fragile component.
    // The live waveform is driven by MediaRecorder.getMaxAmplitude() polled
    // through the bridge, so Android keeps a moving waveform.
    function beginNativeCapture() {
      if (cancelled || settled) return;
      settled = true;   // native start is synchronous — no hanging promise to watchdog
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

      // Duration ticker — mirrors the getUserMedia path but keyed off
      // nativeStateRef (there is no MediaRecorder object in native mode).
      tickRef.current = setInterval(function() {
        if (nativeStateRef.current === 'recording') {
          var sinceResume = Date.now() - startTimeRef.current;
          var s = Math.floor((accumulatedMsRef.current + sinceResume) / 1000);
          setSeconds(s);
          if (s >= 300) {           // 5-min cap (mirror stopRecording)
            previewDurationRef.current = s;
            stopRecording();
          }
        }
      }, 200);

      // Live waveform from MediaRecorder.getMaxAmplitude() (0..32767). sqrt
      // curve so quiet speech is visible without loud speech clipping the bar.
      ampRef.current = setInterval(function() {
        if (nativeStateRef.current !== 'recording') return;
        var amp = 0;
        try { amp = AB.nativeRecordAmplitude() || 0; } catch (e) {}
        var lvl = Math.min(1, Math.sqrt(amp / 32767) * 1.8);
        samplesAccumRef.current.push(lvl);
        setWaveLive(samplesAccumRef.current.slice(-48));
      }, 80);
    }

    // Called by the Kotlin bridge when nativeRecordStop finishes (or fails).
    // Builds a Blob from the base64 AAC/MP4 and hands off to the existing
    // preview / persist pipeline — identical downstream of getUserMedia's onstop.
    window.__onNativeRecordingComplete = function(b64, durMs, mime) {
      if (cancelled) return;
      nativeStateRef.current = 'inactive';
      try { if (ampRef.current) clearInterval(ampRef.current); } catch (e) {}
      ampRef.current = 0;
      try { if (tickRef.current) clearInterval(tickRef.current); } catch (e) {}
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
        try { previewUrlRef.current = URL.createObjectURL(blob); } catch (e) {}
        var d = Math.max(1, Math.round((durMs || 0) / 1000));
        previewDurationRef.current = d;
        setWaveFinal(samplesAccumRef.current.slice());
        setSeconds(d);
        // Honour a Save tapped before the blob arrived (same as onstop path).
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

    // Pick the recorder: native bridge on Android, getUserMedia on desktop.
    function startCapture() {
      var _ab = (typeof window !== 'undefined') ? window.AndroidBridge : null;
      if (_ab && typeof _ab.nativeRecordStart === 'function') {
        beginNativeCapture();
      } else {
        beginCapture();
      }
    }

    // ── Permission gate ──────────────────────────────────────
    // On Android, proactively obtain the OS RECORD_AUDIO permission FIRST,
    // via the native bridge, before getUserMedia runs. That way the
    // WebView's onPermissionRequest sees the permission already granted and
    // resolves synchronously — eliminating the grant-after-dialog race that
    // left getUserMedia hanging on some devices (e.g. Pixel 9 Pro). On PC /
    // preview (no bridge) the browser handles its own prompt, so capture
    // begins immediately.
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
      // Fallback: if the bridge never calls back (unexpected), try capture
      // anyway so the sheet can't get permanently stuck on "Requesting…".
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
      // Finalise duration; the blob arrives async via __onNativeRecordingComplete.
      var totalMs = accumulatedMsRef.current;
      if (nativeStateRef.current === 'recording') totalMs += (Date.now() - startTimeRef.current);
      previewDurationRef.current = Math.max(1, Math.floor(totalMs / 1000));
      nativeStateRef.current = 'inactive';
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
      if (ampRef.current) { clearInterval(ampRef.current); ampRef.current = 0; }
      var _ab = window.AndroidBridge;
      try { if (_ab) _ab.nativeRecordStop(); } catch (e) {}
      setStage('preview');
      return;
    }
    var rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      // Finalise the total duration BEFORE rec.stop fires its onstop.
      var totalMs2 = accumulatedMsRef.current;
      if (rec.state === 'recording') totalMs2 += (Date.now() - startTimeRef.current);
      previewDurationRef.current = Math.max(1, Math.floor(totalMs2 / 1000));
      try { rec.stop(); } catch (e) {}
    }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    setStage('preview');
  }

  function discard() {
    // Clear any queued save so a late onstop can't resurrect a discarded clip.
    pendingSaveRef.current = false;
    cleanup();
    onClose && onClose();
  }

  // Actually write the captured blob to IDB. Only called once the blob is
  // known to exist (either save() saw it, or onstop fired a pending save).
  function persistRecording() {
    var blob = previewBlobRef.current;
    if (!blob || !blob.size) {
      // Recorder produced no audio at all (e.g. immediate stop, no chunks).
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
    // The recorder's onstop is async — if the user taps ✓ before the final
    // chunk flushed, previewBlobRef is still null. Queue the save instead of
    // discarding (the old behaviour silently lost the recording).
    if (!previewBlobRef.current) {
      var rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        // Still recording somehow (defensive) — stop, then onstop saves.
        pendingSaveRef.current = true;
        try { rec.stop(); } catch (e) {}
        return;
      }
      // rec already inactive but onstop hasn't run yet → wait for it.
      pendingSaveRef.current = true;
      return;
    }
    persistRecording();
  }

  // ─── Preview audio lifecycle ────────────────────────────────
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
      bars.push(React.createElement('div', { key: i, className: 'bar', style: { height: h + 'px' } }));
    }
    return React.createElement('div', { className: 'jrn-rec-waveform' }, bars);
  }

  function renderScrubWave(samples, prog) {
    var bars = [];
    var count = 48;
    var src = samples && samples.length ? samples : [];
    for (var i = 0; i < count; i++) {
      var v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.3;
      var h = Math.max(4, Math.min(56, Math.round(v * 56)));
      bars.push(React.createElement('div', {
        key: i,
        className: 'bar' + ((i / count) <= prog ? ' is-played' : ''),
        style: { height: h + 'px' }
      }));
    }
    return React.createElement('div', {
      className: 'jrn-rec-waveform is-scrubbable',
      onClick: seekPreviewFromEvent,
      role: 'slider', 'aria-label': 'Scrub recording'
    }, bars);
  }

  function renderContent() {
    if (stage === 'error') {
      return React.createElement('div', null,
        React.createElement('div', { className: 'jrn-rec-error' }, error || 'Recording failed.'),
        React.createElement('div', { className: 'jrn-rec-actions' },
          React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard }, 'Close')
        )
      );
    }
    if (stage === 'requesting') {
      return React.createElement('div', { className: 'jrn-rec-content' },
        React.createElement('div', { className: 'jrn-rec-requesting' }, 'Requesting microphone access…'),
        React.createElement('div', { className: 'jrn-rec-actions' },
          React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard }, 'Cancel')
        )
      );
    }
    if (stage === 'recording' || stage === 'paused') {
      var isPaused = stage === 'paused';
      return React.createElement('div', { className: 'jrn-rec-content' },
        React.createElement('div', { className: 'jrn-rec-status' + (isPaused ? ' is-paused' : '') }, isPaused ? 'Paused' : 'Recording'),
        React.createElement('div', { className: 'jrn-rec-time' }, fmtTime(seconds)),
        renderRecordingWave(waveLive),
        React.createElement('div', { className: 'jrn-rec-actions' },
          React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard, 'aria-label': 'Cancel' }, 'Cancel'),
          isPaused
            ? React.createElement('button', { className: 'jrn-rec-pause-btn', onClick: resumeRecording, 'aria-label': 'Resume', title: 'Resume' },
                React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
                  React.createElement('path', { d: 'M6 3v18l16-9z' })
                )
              )
            : React.createElement('button', { className: 'jrn-rec-pause-btn', onClick: pauseRecording, 'aria-label': 'Pause', title: 'Pause' },
                React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
                  React.createElement('path', { d: 'M6 4h4v16H6zM14 4h4v16h-4z' })
                )
              ),
          React.createElement('button', { className: 'jrn-rec-stop-btn', onClick: stopRecording, 'aria-label': 'Finish', title: 'Finish' },
            React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
              React.createElement('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 })
            )
          )
        )
      );
    }
    // preview — scrub through real waveform, green ✓ to confirm
    return React.createElement('div', { className: 'jrn-rec-content jrn-rec-preview' },
      React.createElement('div', { className: 'jrn-rec-status' }, 'Review'),
      React.createElement('div', { className: 'jrn-rec-time' },
        fmtTime(Math.floor((progress || 0) * (previewDurationRef.current || seconds))),
        React.createElement('span', { className: 'jrn-rec-time-total' }, ' / ' + fmtTime(previewDurationRef.current || seconds))
      ),
      renderScrubWave(waveFinal, progress),
      React.createElement('div', { className: 'jrn-rec-preview-actions' },
        React.createElement('button', { className: 'jrn-rec-pp', onClick: togglePreviewPlay, 'aria-label': previewPlaying ? 'Pause' : 'Play', title: previewPlaying ? 'Pause' : 'Play' },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
            previewPlaying
              ? React.createElement('path', { d: 'M6 4h4v16H6zM14 4h4v16h-4z' })
              : React.createElement('path', { d: 'M6 3v18l16-9z' })
          )
        )
      ),
      React.createElement('div', { className: 'jrn-rec-actions' },
        React.createElement('button', { className: 'jrn-rec-discard-btn', onClick: discard, 'aria-label': 'Discard', title: 'Discard' }, '×'),
        React.createElement('button', { className: 'jrn-rec-confirm-btn', onClick: save, 'aria-label': 'Save', title: 'Save' },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '20 6 9 17 4 12' })
          )
        )
      ),
      previewUrlRef.current && React.createElement('audio', {
        ref: previewAudioRef,
        src: previewUrlRef.current,
        style: { display: 'none' },
        onPlay: function() { setPreviewPlaying(true); },
        onPause: function() { setPreviewPlaying(false); },
        onEnded: function() { setPreviewPlaying(false); setProgress(0); },
        onTimeUpdate: onPreviewTimeUpdate
      })
    );
  }

  return React.createElement('div', { className: 'note-sheet-overlay', onClick: function(e) { if (e.target === e.currentTarget) discard(); } },
    React.createElement('div', { className: 'note-sheet jrn-rec-sheet', onClick: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'note-sheet-header' },
        React.createElement('span', { className: 'note-sheet-title', style: { flex: 1 } }, stage === 'preview' ? 'Review Recording' : 'Voice Recording'),
        stage !== 'preview' && React.createElement('button', { className: 'note-sheet-menu-btn', onClick: discard, 'aria-label': 'Close', style: { fontSize: '18px' } }, '×')
      ),
      renderContent()
    )
  );
}
