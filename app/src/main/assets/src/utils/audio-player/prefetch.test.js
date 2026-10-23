/* audio-player/prefetch — the gentle warm of the next queued recordings (n251).
   Pins every gate before a warm starts (native, offline, a 2g-class link), the kept-song
   skip, the 'suspend' finish (only with usable data buffered) and the 45 s backstop that
   frees a wedged fetch while leaving its URL retryable. core.js and offline.js are mocked:
   the player's shared state is a plain object the cases set. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: false,
  offline: false,
  el: /** @type {any} */ (null),
  pendingRestore: /** @type {any} */ (null),
  state: { status: 'playing', queue: /** @type {any[]} */ ([]), qi: 0 },
}));

vi.mock('./core.js', () => ({
  get _el() { return h.el; },
  get _native() { return h.native; },
  get _pendingRestore() { return h.pendingRestore; },
  get _state() { return h.state; },
  _offline: () => h.offline,
}));
vi.mock('./offline.js', () => ({ _songKept: (/** @type {any} */ t) => !!(t && t.kept) }));

/** The detached warmer: records its listeners and src, never loads anything. */
class FakeAudio {
  constructor() {
    /** @type {Record<string, () => void>} */
    this.listeners = {};
    this.src = '';
    this.readyState = 0;
    this.preload = '';
    FakeAudio.made.push(this);
  }
  /** @param {string} type @param {() => void} fn */
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeAttribute(/** @type {string} */ name) { if (name === 'src') this.src = ''; }
  load() {}
  /** @param {string} type */
  fire(type) { this.listeners[type](); }
}
/** @type {FakeAudio[]} */
FakeAudio.made = [];

/** @type {typeof import('./prefetch.js')} */
let P;

const fullyBuffered = () => ({ duration: 100, buffered: { length: 1, end: () => 100 } });
const track = (/** @type {string} */ id, extra = {}) => ({ key: id, url: 'https://cdn.example/' + id + '.mp3', ...extra });
const setConnection = (/** @type {any} */ c) => Object.defineProperty(navigator, 'connection', { value: c, configurable: true });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();   // a fresh warmer and warmed-set per case
  P = await import('./prefetch.js');
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  h.native = false;
  h.offline = false;
  h.pendingRestore = null;
  h.el = fullyBuffered();
  h.state = { status: 'playing', queue: [track('a'), track('b'), track('c'), track('d')], qi: 0 };
  setConnection({ effectiveType: '4g' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (/** @type {any} */ (navigator)).connection;
});

const warmer = () => FakeAudio.made[0];

describe('audio-player prefetch', () => {
  it('warms the next queued track when the current one is fully buffered', () => {
    P._maybePrefetchNext();
    expect(FakeAudio.made).toHaveLength(1);
    expect(warmer().src).toBe(track('b').url);
    expect(warmer().preload).toBe('auto');
  });

  it.each(['2g', 'slow-2g'])('a %s link spends no speculative bytes', (t) => {
    setConnection({ effectiveType: t });
    P._maybePrefetchNext();
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('Save-Data spends none either', () => {
    setConnection({ saveData: true, effectiveType: '4g' });
    P._maybePrefetchNext();
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('native returns early: it buffers the next recording itself', () => {
    h.native = true;
    P._maybePrefetchNext();
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('offline, nothing warms', () => {
    h.offline = true;
    P._maybePrefetchNext();
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('a kept song is on the phone already, so the warm skips to the next track', () => {
    h.state.queue[1] = track('b', { kept: true });
    P._maybePrefetchNext();
    expect(warmer().src).toBe(track('c').url);
  });

  it("'suspend' with usable data finishes the warm and walks on; without it, keeps waiting", () => {
    P._maybePrefetchNext();
    const w = warmer();
    w.readyState = 2;
    w.fire('suspend');
    expect(w.src).toBe(track('b').url);           // not enough buffered: still warming b
    w.readyState = 3;
    w.fire('suspend');
    expect(w.src).toBe(track('c').url);           // b done, the chain moved to the second target
    w.readyState = 4;
    w.fire('suspend');
    expect(w.src).toBe('');                       // window of two exhausted: idle
    expect(vi.getTimerCount()).toBe(0);           // each finish cleared its backstop
  });

  it('the 45 s backstop frees a wedged warm and leaves its URL retryable', () => {
    P._maybePrefetchNext();
    const w = warmer();
    vi.advanceTimersByTime(44999);
    expect(w.src).toBe(track('b').url);
    vi.advanceTimersByTime(1);
    expect(w.src).toBe('');                       // released, chain idle, nothing walked on
    P._maybePrefetchNext();
    expect(w.src).toBe(track('b').url);           // not marked warmed: the same URL is tried again
    expect(FakeAudio.made).toHaveLength(1);       // one warmer for the session
  });
});
