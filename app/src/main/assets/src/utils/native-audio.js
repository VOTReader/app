// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   native-audio — the page's stand-in <audio> for the Android app (m3)
   ═══════════════════════════════════════════════════════════════════════
   In the APK the recording plays in ExoPlayer inside a Media3 media
   service (PlaybackService.kt), not in the WebView: Android 17 mutes a
   background app's playback unless a media foreground service is live, and
   the WebView's <audio> lost that service at every chapter end with the
   screen off (sf1 patched it; this cures it).

   audio-player.js keeps every listening rule it has (queue, sections,
   credit, resume, sleep, repeat, songs at 1x, offline substitution) and
   drives THIS object exactly as it drove <audio>: the same properties, the
   same methods, the same events. Only the part of HTMLMediaElement the
   player touches is here.

   The seam: the player tells native which recording comes next
   (setUpcoming); ExoPlayer moves into it with no page, so the service never
   drops. Native reports a `transition`; this fires 'ended' for the finished
   recording (credit, forget its place, next()), and next()'s `src = url`
   finds native already on that url and ADOPTS it: no reload, no gap. A page
   that slept through seams replays them from the journal on its return.

   The clock: native sends its position with every edge and once a second
   while playing; currentTime runs on from that anchor at the playing speed
   (at most 1.5 s past it), and 'timeupdate' fires 4x a second while the page
   is on screen, as <audio> does.

   Bridge: window.AndroidBridge.audioLoad / audioPlay / audioPause /
   audioSeek / audioRate / audioVolume / audioUpcoming / audioRelease /
   audioJournal, called directly (the setAudioActive pattern;
   BridgeContractTest pins the nine). Events: window.__votNativeAudio(json)
   (JsEvent.NativeAudio).
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {{ title?: string, artist?: string, album?: string }} NativeMeta */
/** @typedef {{ url: string, title?: string, artist?: string, album?: string, rate?: number }} NativeNext */
/** @typedef {{ meta?: (url: string) => NativeMeta, upcoming?: () => NativeNext[] }} NativeHooks */

/** How far currentTime may run on past native's last word before it waits for the next. */
const MAX_EXTRAPOLATE_S = 1.5;
/** <audio> fires timeupdate every 250 ms or so while playing. */
const TICK_MS = 250;
/** MediaError codes (the player only reads that one exists). */
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

const _g = () => /** @type {any} */ (globalThis);

/** @returns {any} the bridge when it carries the native player, else null */
function nativeBridge() {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  return b && typeof b.audioLoad === 'function' && typeof b.audioJournal === 'function' ? b : null;
}

/**
 * Does this page play through the native player? Only in an APK whose bridge carries it, and (until m3 step e flips
 * the default) only when `vot.audioEngine` is 'native'. 'html' always keeps the WebView's <audio>.
 * @returns {boolean}
 */
function nativeAudioAvailable() {
  if (!nativeBridge()) return false;
  let choice = null;
  try { choice = typeof localStorage !== 'undefined' ? localStorage.getItem('vot.audioEngine') : null; } catch (_e) { /* storage off */ }
  return choice === 'native';
}

/** The one live instance (the player makes one element per page). */
/** @type {NativeAudio | null} */
let _live = null;

class NativeAudio extends EventTarget {
  /** @param {NativeHooks} [hooks] */
  constructor(hooks) {
    super();
    /** @type {NativeHooks} */
    this.hooks = hooks || {};
    this.preload = 'none';
    /** @type {{ code: number } | null} */
    this.error = null;
    this._src = '';
    /** The url native plays or last reported (after a seam, before the player adopts it). */
    this._nativeUrl = '';
    this._loaded = false;         // native was handed _src
    this._paused = true;
    this._ended = false;
    this._ready = 0;              // readyState
    this._dur = NaN;
    this._buf = 0;
    this._pos = 0;                // seconds, at _anchorAt
    this._anchorAt = 0;
    this._playing = false;        // native says it is producing sound
    this._want = false;           // native's playWhenReady
    this._buffering = false;
    this._rate = 1;
    this._default = 1;
    this._volume = 1;
    this._startMs = 0;
    this._lastSeq = 0;
    this._upcomingSent = '';
    this._gen = 0;                // bumps at every src change: stale async work checks it
    /** @type {ReturnType<typeof setInterval> | null} */
    this._ticker = null;
    _live = this;
    _g().__votNativeAudio = receive;
    if (typeof document !== 'undefined' && document.addEventListener) {
      this._onVisibility = () => { if (document.visibilityState === 'visible') this.reconcile(); this._syncTicker(); };
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  /* ── the <audio> surface ─────────────────────────────────────────── */

  get src() { return this._src; }
  set src(v) {
    const url = v ? String(v) : '';
    if (url === this._src && this._loaded) return;
    this._gen++;
    this.error = null;
    this._ended = false;
    if (url && url === this._nativeUrl && this._loaded) {
      // A seam native already crossed: native plays this url now. Adopt it.
      this._src = url;
      return;
    }
    if (this._loaded && !this._paused) nativeBridge()?.audioPause();
    this._src = url;
    this._loaded = false;
    this._paused = true;
    this._ready = 0;
    this._dur = NaN;
    this._buf = 0;
    this._pos = 0;
    this._startMs = 0;
    this._playing = false;
    this._syncTicker();
    if (!url) this._release();
  }

  get currentTime() {
    if (!this._playing || !this._anchorAt) return this._pos;
    const ran = Math.min(MAX_EXTRAPOLATE_S, ((now() - this._anchorAt) / 1000) * this._rate);
    const t = this._pos + Math.max(0, ran);
    return this._dur > 0 ? Math.min(t, this._dur) : t;
  }
  set currentTime(v) {
    const t = Math.max(0, Number(v) || 0);
    this._pos = t;
    this._anchorAt = now();
    this._ended = false;
    if (this._loaded) nativeBridge()?.audioSeek(Math.round(t * 1000));
    else this._startMs = Math.round(t * 1000);
    const gen = this._gen;
    queueMicrotask(() => { if (gen === this._gen) this._fire('timeupdate'); });
  }

  get duration() { return this._dur; }
  get paused() { return this._paused; }
  get ended() { return this._ended; }
  get readyState() { return this._ready; }
  get buffered() {
    const end = this._buf;
    return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end };
  }

  get playbackRate() { return this._rate; }
  set playbackRate(v) {
    const r = Number(v) > 0 ? Number(v) : 1;
    if (Math.abs(r - this._rate) < 1e-6) return;
    this._pos = this.currentTime;
    this._anchorAt = now();
    this._rate = r;
    if (this._loaded) nativeBridge()?.audioRate(r);
  }
  get defaultPlaybackRate() { return this._default; }
  set defaultPlaybackRate(v) { this._default = Number(v) > 0 ? Number(v) : 1; }

  get volume() { return this._volume; }
  set volume(v) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(vol) || Math.abs(vol - this._volume) < 0.001) return;
    this._volume = vol;
    if (this._loaded) nativeBridge()?.audioVolume(vol);
  }

  /** @returns {Promise<void>} */
  play() {
    const b = nativeBridge();
    if (!this._src || !b) return Promise.reject(new DOMException('no source', 'NotSupportedError'));
    const wasPaused = this._paused;
    this._paused = false;
    this._ended = false;
    if (!this._loaded) {
      this._loaded = true;
      this._nativeUrl = this._src;
      const meta = this._meta(this._src);
      const upcoming = this._upcoming();
      this._upcomingSent = JSON.stringify(upcoming);
      b.audioLoad(JSON.stringify({
        url: this._src, startMs: this._startMs, rate: this._rate, volume: this._volume, autoplay: false,
        title: meta.title || '', artist: meta.artist || '', album: meta.album || '', upcoming,
      }));
      this._pos = this._startMs / 1000;
      this._anchorAt = now();
    }
    b.audioPlay();
    if (wasPaused) this._fire('play');
    // Adopted after a seam: native is already producing sound for this url, and says so only at its next edge.
    if (this._playing && this._nativeUrl === this._src) {
      const gen = this._gen;
      queueMicrotask(() => { if (gen === this._gen && !this._paused) this._fire('playing'); });
    }
    return Promise.resolve();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._pos = this.currentTime;
    this._anchorAt = now();
    this._playing = false;
    this._syncTicker();
    if (this._loaded) nativeBridge()?.audioPause();
    const gen = this._gen;
    queueMicrotask(() => { if (gen === this._gen && this._paused) this._fire('pause'); });
  }

  /** The media load algorithm: with no src it lets go of the recording. */
  load() { if (!this._src) this._release(); }

  /** @param {string} name */
  removeAttribute(name) { if (name === 'src') this.src = ''; }

  /* ── the seam ────────────────────────────────────────────────────── */

  /** Tell native what plays after this recording (only when it changed). The player calls this at each start and
   *  once a second. */
  syncUpcoming() {
    if (!this._loaded) return;
    const list = this._upcoming();
    const json = JSON.stringify(list);
    if (json === this._upcomingSent) return;
    this._upcomingSent = json;
    nativeBridge()?.audioUpcoming(json);
  }

  /** Back on screen: replay the seams native crossed that this page never heard, then take native's state. */
  reconcile() {
    const b = nativeBridge();
    if (!b || !this._loaded) return;
    let j = null;
    try { j = JSON.parse(b.audioJournal() || 'null'); } catch (_e) { j = null; }
    if (!j || typeof j !== 'object') return;
    for (const seam of Array.isArray(j.seams) ? j.seams : []) this._seam(seam);
    this.handle(Object.assign({}, j, { type: 'state' }));
  }

  /**
   * One native event (JsEvent.NativeAudio).
   * @param {any} e
   */
  handle(e) {
    if (!e || typeof e !== 'object') return;
    if (e.type === 'transition') { this._seam({ seq: e.seq, from: e.from, url: e.url }); }
    const url = typeof e.url === 'string' ? e.url : '';
    // Native still on a recording the page has left (a src change it has not heard yet): not this element's news.
    if (!this._loaded || (url && url !== this._src && url !== this._nativeUrl)) return;
    if (e.type === 'error') { this._error(e); return; }
    if (url === this._nativeUrl && url !== this._src) return;   // crossed a seam the page has not adopted yet
    const wasPlaying = this._playing;
    const wasWant = this._want;
    const wasBuffering = this._buffering;
    const dur = Number(e.dur) > 0 ? Number(e.dur) / 1000 : NaN;
    this._pos = Math.max(0, Number(e.pos) || 0) / 1000;
    this._anchorAt = now();
    this._rate = Number(e.rate) > 0 ? Number(e.rate) : this._rate;
    this._buf = Math.max(0, Number(e.buf) || 0) / 1000;
    this._playing = !!e.playing;
    this._want = !!e.want;
    this._buffering = !!e.buffering;
    if (dur > 0 && dur !== this._dur) {
      const first = !(this._dur > 0);
      this._dur = dur;
      if (this._ready < 4) this._ready = 4;
      if (first) this._fire('loadedmetadata');
      this._fire('durationchange');
    }
    if (this._playing && this._ready < 4) this._ready = 4;
    if (e.ended) {
      if (!this._ended) {
        this._ended = true;
        this._paused = true;
        this._playing = false;
        this._syncTicker();
        this._fire('pause');
        this._fire('ended');
      }
      return;
    }
    // Native's own pause: audio focus lost, headphones out, the lock screen's button.
    if (wasWant && !this._want && !this._paused) {
      this._paused = true;
      this._fire('pause');
    } else if (!wasWant && this._want && this._paused) {
      // Native's own play (the lock screen, a headset): the page follows.
      this._paused = false;
      this._fire('play');
    }
    if (this._want && this._buffering && !wasBuffering) this._fire('waiting');
    if (this._playing && !wasPlaying) this._fire('playing');
    this._fire('timeupdate');
    if (e.type === 'tick') this._fire('progress');
    this._syncTicker();
  }

  /* ── inside ──────────────────────────────────────────────────────── */

  /**
   * One seam native crossed: `from` finished and `url` began. Fires 'ended' for `from` when this element is still on
   * it; the player's next() then points src at `url`, which adopts native's recording. Each seam counts once.
   * @param {{ seq?: number, from?: string, url?: string }} seam
   */
  _seam(seam) {
    const seq = Number(seam && seam.seq) || 0;
    if (seq && seq <= this._lastSeq) return;
    if (seq) this._lastSeq = seq;
    const url = seam && typeof seam.url === 'string' ? seam.url : '';
    if (!url) return;
    this._nativeUrl = url;
    if (!this._loaded || seam.from !== this._src) return;
    this._ended = true;
    this._pos = this._dur > 0 ? this._dur : this._pos;
    this._fire('ended');
    // The player moved on (src now native's url, adopted): the new recording starts at native's clock.
    if (this._src === url) {
      this._ended = false;
      this._paused = false;
      this._dur = NaN;
      this._ready = 1;
      this._pos = 0;
      this._anchorAt = now();
    }
  }

  /** @param {any} e */
  _error(e) {
    this._playing = false;
    this._paused = true;
    this._syncTicker();
    this.error = { code: e.name === 'not-playable' ? MEDIA_ERR_SRC_NOT_SUPPORTED : MEDIA_ERR_NETWORK };
    this._loaded = false;   // play() loads it afresh (the player's retry)
    this._fire('error');
  }

  _release() {
    this._loaded = false;
    this._nativeUrl = '';
    this._paused = true;
    this._playing = false;
    this._syncTicker();
    nativeBridge()?.audioRelease();
  }

  /** @param {string} url @returns {NativeMeta} */
  _meta(url) {
    try { return (this.hooks.meta && this.hooks.meta(url)) || {}; } catch (_e) { return {}; }
  }

  /** @returns {NativeNext[]} */
  _upcoming() {
    try {
      const list = this.hooks.upcoming ? this.hooks.upcoming() : [];
      return Array.isArray(list) ? list.filter((t) => t && typeof t.url === 'string' && t.url) : [];
    } catch (_e) { return []; }
  }

  /** 4 Hz 'timeupdate' while playing on screen (native's 1 Hz ticks carry it while hidden). */
  _syncTicker() {
    const want = this._playing && !(typeof document !== 'undefined' && document.visibilityState === 'hidden');
    if (want && !this._ticker) this._ticker = setInterval(() => this._fire('timeupdate'), TICK_MS);
    else if (!want && this._ticker) { clearInterval(this._ticker); this._ticker = null; }
  }

  /** @param {string} type */
  _fire(type) {
    try { this.dispatchEvent(new Event(type)); } catch (_e) { /* a listener's throw must not stop the next event */ }
  }
}

/** @param {string} json */
function receive(json) {
  if (!_live) return;
  let e = null;
  try { e = typeof json === 'string' ? JSON.parse(json) : json; } catch (_e) { return; }
  _live.handle(e);
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export { NativeAudio, nativeAudioAvailable };
