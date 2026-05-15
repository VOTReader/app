/* ═══════════════════════════════════════════════════════════════
   JOURNAL RECORDING SHEET — voice memo capture UI
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalMediaStore, JournalHelpers.

   Renders a bottom sheet that:
     1. Requests microphone permission (browser/WebView handles UI)
     2. Streams audio via MediaRecorder API
     3. Shows live waveform + elapsed time
     4. On Stop: shows playback preview + Discard / Save buttons
     5. On Save: writes Blob to JournalMediaStore, returns mediaId + duration

   Props:
     onSave({mediaId, duration})  — called when user confirms a recording
     onClose()                    — called when user cancels or dismisses
═══════════════════════════════════════════════════════════════ */

function JournalRecordingSheet({ onSave, onClose }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  // 'requesting' | 'recording' | 'preview' | 'error'
  var stateRef = useRef({ stage: 'requesting' });
  var _stage = useState('requesting');
  var stage = _stage[0];
  var setStage = _stage[1];

  var _err = useState(null);
  var error = _err[0];
  var setError = _err[1];

  var _seconds = useState(0);
  var seconds = _seconds[0];
  var setSeconds = _seconds[1];

  var _waveform = useState([]);  // moving array of level samples (0..1)
  var waveform = _waveform[0];
  var setWaveform = _waveform[1];

  var mediaRecorderRef = useRef(null);
  var streamRef = useRef(null);
  var chunksRef = useRef([]);
  var startTimeRef = useRef(0);
  var rafRef = useRef(0);
  var tickRef = useRef(0);
  var audioCtxRef = useRef(null);
  var analyserRef = useRef(null);
  var previewBlobRef = useRef(null);
  var previewDurationRef = useRef(0);
  var previewUrlRef = useRef(null);

  // Cleanup helper — releases mic, stops timers, frees blob URL
  function cleanup() {
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

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      if (cancelled) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }
      streamRef.current = stream;

      // Pick a MIME type the WebView supports
      var mime = '';
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < candidates.length; i++) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
          mime = candidates[i]; break;
        }
      }
      var rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = function() {
        var type = rec.mimeType || 'audio/webm';
        var blob = new Blob(chunksRef.current, { type: type });
        previewBlobRef.current = blob;
        // Release the mic immediately — preview only needs the blob
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
          streamRef.current = null;
        }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
        try { previewUrlRef.current = URL.createObjectURL(blob); } catch (e) {}
      };

      rec.start(250);
      startTimeRef.current = Date.now();
      setStage('recording');
      stateRef.current.stage = 'recording';

      // Time ticker
      tickRef.current = setInterval(function() {
        var s = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setSeconds(s);
        // Cap at 5 min
        if (s >= 300 && rec.state !== 'inactive') {
          try { rec.stop(); } catch (e) {}
        }
      }, 200);

      // Waveform: sample analyser
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
          var samples = [];
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
            // Sample every ~80ms
            var now = performance.now();
            if (now - lastSample > 80) {
              lastSample = now;
              samples.push(Math.min(1, rms * 3));
              if (samples.length > 48) samples.shift();
              setWaveform(samples.slice());
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          loop();
        }
      } catch (e) { /* analyser optional */ }
    }).catch(function(err) {
      if (cancelled) return;
      console.warn('getUserMedia rejected', err);
      setError(err && err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Enable mic access in settings to record.'
        : 'Could not access microphone.');
      setStage('error');
    });

    return function() { cancelled = true; cleanup(); };
  }, []);

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      previewDurationRef.current = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = 0; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    setStage('preview');
  }

  function discard() {
    cleanup();
    onClose && onClose();
  }

  function save() {
    var blob = previewBlobRef.current;
    if (!blob || !blob.size) { discard(); return; }
    JournalMediaStore.put({
      type: 'audio',
      blob: blob,
      mime: blob.type || 'audio/webm',
      duration: previewDurationRef.current || seconds
    }).then(function(id) {
      onSave && onSave({ mediaId: id, duration: previewDurationRef.current || seconds });
      cleanup();
    }).catch(function(err) {
      console.warn('Save failed', err);
      setError('Failed to save recording.');
      setStage('error');
    });
  }

  var fmtTime = function(s) {
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  };

  // Render waveform bars
  function renderWaveform(samples, stagename) {
    var bars = [];
    var count = 40;
    var src = samples && samples.length ? samples : [];
    for (var i = 0; i < count; i++) {
      var v;
      if (stagename === 'recording') {
        v = src.length ? src[Math.min(src.length - 1, Math.floor(i * src.length / count))] : 0.05;
      } else {
        // Static gentle wave for preview/idle states
        v = 0.3 + 0.4 * Math.sin(i / 3.0);
      }
      var h = Math.max(4, Math.min(56, Math.round(v * 56)));
      bars.push(React.createElement('div', { key: i, className: 'bar', style: { height: h + 'px' } }));
    }
    return React.createElement('div', { className: 'jrn-rec-waveform' }, bars);
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
        React.createElement('div', { style: { fontFamily: 'EB Garamond, serif', fontStyle: 'italic', color: 'var(--cream-dim)', fontSize: '14px', padding: '20px 0' } }, 'Requesting microphone access…'),
        React.createElement('div', { className: 'jrn-rec-actions' },
          React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard }, 'Cancel')
        )
      );
    }
    if (stage === 'recording') {
      return React.createElement('div', { className: 'jrn-rec-content' },
        React.createElement('div', { className: 'jrn-rec-status' }, 'Recording'),
        React.createElement('div', { className: 'jrn-rec-time' }, fmtTime(seconds)),
        renderWaveform(waveform, 'recording'),
        React.createElement('div', { className: 'jrn-rec-actions' },
          React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard }, 'Cancel'),
          React.createElement('button', { className: 'jrn-rec-stop', onClick: stopRecording }, '■ Stop')
        )
      );
    }
    // preview
    return React.createElement('div', { className: 'jrn-rec-content jrn-rec-preview' },
      React.createElement('div', { className: 'jrn-rec-status' }, 'Recorded'),
      React.createElement('div', { className: 'jrn-rec-time' }, fmtTime(previewDurationRef.current || seconds)),
      previewUrlRef.current
        ? React.createElement('audio', { src: previewUrlRef.current, controls: true, style: { width: '100%', maxWidth: '320px', margin: '6px auto 4px', display: 'block' } })
        : renderWaveform(null, 'preview'),
      React.createElement('div', { className: 'jrn-rec-actions' },
        React.createElement('button', { className: 'jrn-rec-cancel', onClick: discard }, 'Discard'),
        React.createElement('button', { className: 'jrn-rec-stop', onClick: save }, 'Save')
      )
    );
  }

  return React.createElement('div', { className: 'note-sheet-overlay', onClick: function(e) { if (e.target === e.currentTarget) discard(); } },
    React.createElement('div', { className: 'note-sheet', onClick: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'note-sheet-header' },
        React.createElement('span', { className: 'note-sheet-title', style: { flex: 1 } }, 'Voice Recording'),
        React.createElement('button', { className: 'note-sheet-menu-btn', onClick: discard, 'aria-label': 'Close', style: { fontSize: '18px' } }, '×')
      ),
      renderContent()
    )
  );
}
