// cf1: recordings saved for offline in a browser, through the relay into Cache Storage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineAudio } from './offline-audio.js';
import { WebOfflineAudio, OFFLINE_AUDIO_CACHE, RELAY, relayUrl } from './offline-audio-web.js';

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const SW_URL = 'https://votreader.github.io/app/service-worker.js';

/** Cache Storage as the browser keeps it: a put reads the whole body, keys are URLs. */
function fakeCaches() {
  const buckets = new Map();
  const bucket = (name) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const m = buckets.get(name);
    const k = (r) => (typeof r === 'string' ? r : r.url);
    return {
      keys: async () => [...m.keys()].map((url) => ({ url })),
      match: async (r) => { const e = m.get(k(r)); return e ? new Response(e.bytes.slice(0), { headers: e.headers }) : undefined; },
      put: async (r, res) => { const bytes = new Uint8Array(await res.arrayBuffer()); m.set(k(r), { bytes, headers: new Headers(res.headers) }); },
      delete: async (r) => m.delete(k(r)),
    };
  };
  return { open: async (name) => bucket(name), _buckets: buckets };
}

/** The relay: a body of `n` bytes, a Content-Length of `len` (a cut-off download when they differ). */
function relayResponse(n, len = n, status = 200) {
  return new Response(status === 200 ? new Uint8Array(n) : null, { status, headers: { 'Content-Length': String(len) } });
}

let caches;
let fetchMock;
const defs = [];
function define(obj, name, value) {
  const had = Object.getOwnPropertyDescriptor(obj, name);
  Object.defineProperty(obj, name, { value, configurable: true, writable: true });
  defs.push(() => { if (had) Object.defineProperty(obj, name, had); else delete obj[name]; });
}

beforeEach(() => {
  caches = fakeCaches();
  fetchMock = vi.fn(async (url, init) => (init && init.method === 'HEAD' ? relayResponse(0, 1234) : relayResponse(5000)));
  define(window, 'isSecureContext', true);
  define(window, 'caches', caches);
  define(globalThis, 'caches', caches);
  define(globalThis, 'fetch', fetchMock);
  define(navigator, 'serviceWorker', { controller: { scriptURL: SW_URL } });
  define(navigator, 'storage', { estimate: async () => ({ quota: 1e9, usage: 1e6 }), persist: vi.fn(async () => true) });
  try { localStorage.clear(); } catch (_e) { /* no storage */ }
  WebOfflineAudio._reset();
  OfflineAudio._reset();
});
afterEach(() => {
  while (defs.length) defs.pop()();
  WebOfflineAudio._reset();
  OfflineAudio._reset();
});

const ready = () => vi.waitFor(() => expect(OfflineAudio.freeBytes()).toBeGreaterThan(0));

describe('offline-audio-web (cf1)', () => {
  it('reading the cache at boot tells a screen reader nothing: no "Download finished" with nothing downloaded', async () => {
    const heard = vi.fn();
    OfflineAudio.subscribe(heard);
    expect(OfflineAudio.items()).toEqual([]);
    await ready();
    expect(heard).toHaveBeenCalled();             // the screens still hear that the store has read its cache
    expect(OfflineAudio.news().seq).toBe(0);
  });
  it('maps only votreader-assets audio releases to the relay', () => {
    expect(relayUrl(URL_OF('abc'))).toBe(RELAY + 'audio-v1/abc.mp3');
    expect(relayUrl('https://github.com/VOTReader/votreader-songs/releases/download/songs-v1/a.mp3')).toBeNull();
    expect(relayUrl('https://github.com/VOTReader/votreader-assets/releases/download/garden-standard/a.jpg')).toBeNull();
  });

  it('is offered in a browser with Cache Storage and a service worker, never in the phone app or a Safari tab', () => {
    expect(OfflineAudio.available()).toBe(true);
    expect(OfflineAudio.native()).toBe(false);
    define(window, 'AndroidBridge', {});
    expect(WebOfflineAudio.supported()).toBe(false);
    delete window.AndroidBridge;
    define(navigator, 'standalone', false);   // iOS Safari, in a tab
    expect(OfflineAudio.available()).toBe(false);
    define(navigator, 'standalone', true);    // added to the Home Screen
    expect(OfflineAudio.available()).toBe(true);
    define(window, 'isSecureContext', false);
    expect(OfflineAudio.available()).toBe(false);
  });

  it('saves a recording through the relay, and the player loads the service worker copy, signal or none', async () => {
    await ready();
    define(navigator, 'onLine', false);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe(URL_OF('a'));   // not saved: GitHub's own URL
    define(navigator, 'onLine', true);
    expect(OfflineAudio.download([{ url: URL_OF('a'), key: 'one:a', title: 'A Letter' }])).toBe(true);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('a'))).toBe(true));
    define(navigator, 'onLine', false);
    expect(fetchMock).toHaveBeenCalledWith(RELAY + 'audio-v1/a.mp3', expect.objectContaining({ credentials: 'omit' }));
    expect(OfflineAudio.items()).toEqual([expect.objectContaining({ url: URL_OF('a'), key: 'one:a', title: 'A Letter', bytes: 5000 })]);
    expect(OfflineAudio.totalBytes()).toBe(5000);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe('https://votreader.github.io/app/offline-audio/audio-v1/a.mp3');
    // With a signal too, a saved recording plays its saved copy (brief section 7 item 2): on a weak signal the stream
    // failed and said "No signal" with the file on the phone.
    define(navigator, 'onLine', true);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe('https://votreader.github.io/app/offline-audio/audio-v1/a.mp3');
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
    const stored = await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('a'));
    expect((await stored.arrayBuffer()).byteLength).toBe(5000);
  });

  // Brief section 7 item 3: the persist() answer was ignored, so downloads this browser may clear carried no warning.
  it('says when the browser will not promise to keep the downloads, and stays quiet when it does', async () => {
    define(navigator, 'storage', { estimate: async () => ({ quota: 1e9, usage: 1e6 }), persisted: async () => false, persist: vi.fn(async () => false) });
    await ready();
    expect(OfflineAudio.evictable()).toBe(true);
    OfflineAudio.download([{ url: URL_OF('p'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('p'))).toBe(true));
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
    expect(OfflineAudio.evictable()).toBe(true);
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    define(navigator, 'storage', { estimate: async () => ({ quota: 1e9, usage: 1e6 }), persisted: async () => true, persist: vi.fn(async () => true) });
    await ready();
    expect(OfflineAudio.evictable()).toBe(false);
  });

  it('what was saved is still there after a reload', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('b'), key: 'two:b', title: 'Título “quoted”' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    expect(OfflineAudio.items()[0]).toEqual(expect.objectContaining({ key: 'two:b', title: 'Título “quoted”', bytes: 5000 }));
  });

  // Downloads brief 2026-10-23 section 7 item 18: the cache was read one entry at a time at a cold start, so for a
  // moment nothing looked saved (Play on a saved row offline said "needs a connection").
  it('what was saved looks saved at the first look after a reload, before the cache is read', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('b'), key: 'two:b', title: 'B' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true);
    expect(WebOfflineAudio.srcFor(URL_OF('b'))).toBe('https://votreader.github.io/app/offline-audio/audio-v1/b.mp3');
    expect(OfflineAudio.items()[0]).toEqual(expect.objectContaining({ key: 'two:b', title: 'B', bytes: 5000 }));
  });

  it('a recording the browser cleared from the cache stops looking saved once the cache is read', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('b'), key: 'two:b', title: 'B' }, { url: URL_OF('c'), key: 'two:c', title: 'C' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('c'))).toBe(true));
    await (await caches.open(OFFLINE_AUDIO_CACHE)).delete(URL_OF('b'));   // evicted under storage pressure
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true);              // the index still says so for a moment
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(false));
    expect(OfflineAudio.isSaved(URL_OF('c'))).toBe(true);
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(false);             // and the index learned it
  });

  it('a removed recording does not look saved after a reload', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('b'), key: 'two:b', title: 'B' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    OfflineAudio.remove([URL_OF('b')]);
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(false);
  });

  it('a cut-off download is failed and nothing half-saved stays', async () => {
    await ready();
    fetchMock.mockImplementationOnce(async () => relayResponse(3000, 5000));
    OfflineAudio.download([{ url: URL_OF('c'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.failureOf(URL_OF('c'))).toBe('short'));
    expect(OfflineAudio.isSaved(URL_OF('c'))).toBe(false);
    expect(await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('c'))).toBeUndefined();
  });

  // dl-d2: a failed fetch is tried again at 5, 20 and 60 s before it is a failure; no room is a wait, never a failure.
  it('a relay refusal or a failed fetch is tried 3 more times, then a network failure', async () => {
    await ready();
    WebOfflineAudio._setTiming({ retry: [5, 5, 5] });
    fetchMock.mockImplementation(async () => relayResponse(0, 0, 404));
    OfflineAudio.download([{ url: URL_OF('d'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.failureOf(URL_OF('d'))).toBe('network'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(OfflineAudio.batch()).toEqual({ done: 0, total: 1, failed: 1 });
  });

  it('a fetch that fails once waits as retrying, then saves on the next try', async () => {
    await ready();
    WebOfflineAudio._setTiming({ retry: [60, 60, 60] });
    fetchMock.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
    OfflineAudio.download([{ url: URL_OF('e'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('retrying'));
    expect(OfflineAudio.statusOf(URL_OF('e'))).toBe('queued');
    expect(OfflineAudio.failureOf(URL_OF('e'))).toBe(null);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('e'))).toBe(true));
    expect(OfflineAudio.reason()).toBe(null);
  });

  it('no room waits for space (said once to a screen reader), and a Remove lets it go on', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('g'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('g'))).toBe(true));
    navigator.storage.estimate = async () => ({ quota: 1e6, usage: 999000 });
    OfflineAudio.download([{ url: URL_OF('f'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('space'));
    expect(OfflineAudio.failureOf(URL_OF('f'))).toBe(null);
    expect(OfflineAudio.statusOf(URL_OF('f'))).toBe('queued');
    expect(OfflineAudio.news().text).toBe('Not enough room on this phone. Downloads wait until there is.');
    navigator.storage.estimate = async () => ({ quota: 1e9, usage: 1e6 });
    OfflineAudio.remove([URL_OF('g')]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('f'))).toBe(true));
  });

  it('with its size known, no room is seen before a byte is fetched', async () => {
    await ready();
    navigator.storage.estimate = async () => ({ quota: 1e6, usage: 999000 });
    OfflineAudio.download([{ url: URL_OF('h'), key: 'k', title: 't', bytes: 5000 }]);
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('space'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads one at a time and a cancel stops the queue', async () => {
    await ready();
    let release;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { release = () => r(relayResponse(5000)); }));
    OfflineAudio.download([1, 2, 3].map((i) => ({ url: URL_OF('q' + i), key: 'k', title: 't' })));
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('q1'))).toBe('downloading'));
    expect(OfflineAudio.statusOf(URL_OF('q2'))).toBe('queued');
    OfflineAudio.cancel([URL_OF('q2'), URL_OF('q3')]);
    release();
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('q1'))).toBe(true));
    expect(OfflineAudio.statusOf(URL_OF('q2'))).toBe('none');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes one, then all', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('r1'), key: 'k', title: 't' }, { url: URL_OF('r2'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.items()).toHaveLength(2));
    define(navigator, 'onLine', false);
    OfflineAudio.remove([URL_OF('r1')]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r1'))).toBe(false));
    expect(await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('r1'))).toBeUndefined();
    expect(OfflineAudio.webSrc(URL_OF('r1'))).toBe(URL_OF('r1'));
    OfflineAudio.removeAll();
    await vi.waitFor(() => expect(OfflineAudio.items()).toHaveLength(0));
  });

  // Sweep W63: on the web Remove all removed only what was saved; what was queued or on its way went on
  // downloading, so removed recordings came back. The phone app's removeAll cancels first.
  it('Remove all stops what is queued and on its way too: nothing comes back', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('s1'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('s1'))).toBe(true));
    let release;
    fetchMock.mockImplementationOnce((_u, init) => new Promise((r, j) => {
      release = () => r(relayResponse(5000));
      if (init && init.signal) init.signal.addEventListener('abort', () => j(new DOMException('aborted', 'AbortError')));
    }));
    OfflineAudio.download([1, 2].map((i) => ({ url: URL_OF('w' + i), key: 'k', title: 't' })));
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('w1'))).toBe('downloading'));
    OfflineAudio.removeAll();
    release();
    await vi.waitFor(() => expect(OfflineAudio.items()).toHaveLength(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(OfflineAudio.items()).toHaveLength(0);
    expect(OfflineAudio.statusOf(URL_OF('w1'))).toBe('none');
    expect(OfflineAudio.statusOf(URL_OF('w2'))).toBe('none');
    expect((await (await caches.open(OFFLINE_AUDIO_CACHE)).keys())).toEqual([]);
    expect(fetchMock.mock.calls.filter((c) => !(c[1] && c[1].method === 'HEAD'))).toHaveLength(2);   // s1, w1: w2 never
  });

  it('a download whose cancel lands as its last bytes are stored does not stay saved', async () => {
    await ready();
    let put;
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    const realOpen = caches.open;
    caches.open = async (name) => {
      const b = await realOpen(name);
      return { ...b, put: (r, res) => new Promise((ok) => { put = async () => { await b.put(r, res); ok(undefined); }; }) };
    };
    OfflineAudio.download([{ url: URL_OF('x1'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(put).toBeTypeOf('function'));
    OfflineAudio.cancel([URL_OF('x1')]);
    await put();
    caches.open = realOpen;
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('x1'))).toBe('none'));
    expect(OfflineAudio.isSaved(URL_OF('x1'))).toBe(false);
    expect(await cache.match(URL_OF('x1'))).toBeUndefined();
  });

  it('looks sizes up with HEAD through the relay', async () => {
    await ready();
    OfflineAudio.requestSizes([URL_OF('s1'), URL_OF('s2')]);
    await vi.waitFor(() => expect(OfflineAudio.sizeOf(URL_OF('s2'))).toBe(1234));
    expect(fetchMock.mock.calls.filter((c) => c[1] && c[1].method === 'HEAD')).toHaveLength(2);
  });

  it('a save asked before the cache is read never fetches a saved recording again', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('x'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('x'))).toBe(true));
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    OfflineAudio.download([{ url: URL_OF('x'), key: 'k', title: 't' }]);   // looks unsaved: the cache is not read yet
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('x'))).toBe(true));
    expect(fetchMock.mock.calls.filter((c) => !(c[1] && c[1].method === 'HEAD'))).toHaveLength(1);
    expect(await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('x'))).toBeDefined();
  });

  it('loads the saved copy whatever the signal and whatever the element held', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('h'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('h'))).toBe(true));
    const local = 'https://votreader.github.io/app/offline-audio/audio-v1/h.mp3';
    expect(OfflineAudio.webSrc(URL_OF('h'), local)).toBe(local);             // online, holding the copy
    expect(OfflineAudio.webSrc(URL_OF('h'), URL_OF('h'))).toBe(local);       // online, streaming: the next load takes the copy
    define(navigator, 'onLine', false);
    expect(OfflineAudio.webSrc(URL_OF('h'), URL_OF('h'))).toBe(local);       // offline: the copy, even from a stream
    expect(OfflineAudio.webSameRecording(URL_OF('h'), local)).toBe(true);
    expect(OfflineAudio.webSameRecording(URL_OF('h'), URL_OF('h'))).toBe(true);
    expect(OfflineAudio.webSameRecording(URL_OF('h'), URL_OF('other'))).toBe(false);
  });

  // Refuter of dl-d0 batch A: online the element now holds the saved copy, so a Remove while paused left it holding a
  // URL that no longer counted as the same recording, and Play reloaded it from 0:00 instead of where it was paused.
  it('the saved copy the element holds is still the same recording after it is removed', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('r'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r'))).toBe(true));
    const local = OfflineAudio.webSrc(URL_OF('r'));
    expect(local).toBe('https://votreader.github.io/app/offline-audio/audio-v1/r.mp3');
    OfflineAudio.remove([URL_OF('r')]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r'))).toBe(false));
    expect(OfflineAudio.webSrc(URL_OF('r'))).toBe(URL_OF('r'));
    expect(OfflineAudio.webSameRecording(URL_OF('r'), local)).toBe(true);
    expect(OfflineAudio.webSameRecording(URL_OF('other'), local)).toBe(false);
  });

  it('with no worker controlling the page a saved recording loads the GitHub URL', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('w'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('w'))).toBe(true));
    define(navigator, 'onLine', false);
    expect(OfflineAudio.webSrc(URL_OF('w'))).not.toBe(URL_OF('w'));
    define(navigator, 'serviceWorker', { controller: null });
    expect(OfflineAudio.webSrc(URL_OF('w'))).toBe(URL_OF('w'));
  });
});

/* ra6 (Corbin 2026-10-14, brief design-10): Download only on Wi-Fi. Chrome on Android reports
   navigator.connection.type; on 'cellular' with the switch on, the queue waits and the rows say so. */
describe('offline-audio-web: Download only on Wi-Fi (ra6)', () => {
  let gate;
  let conn;
  beforeEach(async () => {
    gate = await import('./download-gate.js');
    gate._resetDownloadGate();
    conn = new EventTarget();
    conn.type = 'cellular';
    conn.move = (t) => { conn.type = t; conn.dispatchEvent(new Event('change')); };
    define(navigator, 'connection', conn);
  });
  afterEach(() => { gate._resetDownloadGate(); });
  const gets = () => fetchMock.mock.calls.filter((c) => !(c[1] && c[1].method === 'HEAD'));

  it('on mobile data a download waits, the rows hear it waits, and it goes on by itself on Wi-Fi', async () => {
    await ready();
    gate.setWifiOnly(true);
    OfflineAudio.download([{ url: URL_OF('m1'), key: 'one:m1', title: 'M1' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(0);
    expect(OfflineAudio.statusOf(URL_OF('m1'))).toBe('queued');
    await vi.waitFor(() => expect(OfflineAudio.waiting()).toBe(true));
    conn.move('wifi');
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('m1'))).toBe(true));
    expect(OfflineAudio.waiting()).toBe(false);
  });

  it('dl-d5: an automatic download never starts on mobile data; the listener’s own go past it; Wi-Fi starts it', async () => {
    await ready();   // the switch off (the default): only the automatic one waits
    OfflineAudio.download([{ url: URL_OF('a1'), key: 'k', title: 'auto', wifi: true }, { url: URL_OF('o1'), key: 'k', title: 'own' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('o1'))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(OfflineAudio.statusOf(URL_OF('a1'))).toBe('queued');
    expect(gets().map((c) => c[0])).toEqual([RELAY + 'audio-v1/o1.mp3']);
    expect(OfflineAudio.reason()).toBe('wifi');
    expect(JSON.parse(localStorage.getItem('vot.offlineAudioQueue')).items[0].wifi).toBe(true);   // kept across a close
    conn.move('wifi');
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('a1'))).toBe(true));
  });

  it('dl-d5: the listener’s own Download of one waiting for Wi-Fi starts it on mobile data', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('a2'), key: 'k', title: 'auto', wifi: true }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(0);
    OfflineAudio.download([{ url: URL_OF('a2'), key: 'k', title: 'auto' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('a2'))).toBe(true));
  });

  it('off (the default), mobile data downloads as before', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('m2'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('m2'))).toBe(true));
    expect(OfflineAudio.waiting()).toBe(false);
  });

  it('turning the switch off lets a waiting download go on', async () => {
    await ready();
    gate.setWifiOnly(true);
    OfflineAudio.download([{ url: URL_OF('m3'), key: 'k', title: 't' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(0);
    gate.setWifiOnly(false);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('m3'))).toBe(true));
  });

  it('one on its way stops when the phone moves to mobile data, keeps nothing, and starts again from the top on Wi-Fi', async () => {
    conn.type = 'wifi';
    await ready();
    gate.setWifiOnly(true);
    fetchMock.mockImplementationOnce((_u, init) => new Promise((r, j) => {
      if (init && init.signal) init.signal.addEventListener('abort', () => j(new DOMException('aborted', 'AbortError')));
    }));
    OfflineAudio.download([{ url: URL_OF('m4'), key: 'k', title: 't' }, { url: URL_OF('m5'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('m4'))).toBe('downloading'));
    conn.move('cellular');
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('m4'))).toBe('queued'));
    expect(OfflineAudio.waiting()).toBe(true);
    expect(OfflineAudio.failureOf(URL_OF('m4'))).toBe(null);
    expect(gets()).toHaveLength(1);   // m5 never started on mobile data
    expect((await (await caches.open(OFFLINE_AUDIO_CACHE)).keys())).toEqual([]);
    conn.move('wifi');
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('m5'))).toBe(true));
    expect(OfflineAudio.isSaved(URL_OF('m4'))).toBe(true);
    // Back at the head of the queue: m4 again before m5.
    expect(gets().map((c) => c[0])).toEqual([RELAY + 'audio-v1/m4.mp3', RELAY + 'audio-v1/m4.mp3', RELAY + 'audio-v1/m5.mp3']);
  });

  it('a cancel while it waits takes it off the queue: Wi-Fi afterwards fetches nothing', async () => {
    await ready();
    gate.setWifiOnly(true);
    OfflineAudio.download([{ url: URL_OF('m6'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('m6'))).toBe('queued'));
    OfflineAudio.cancel([URL_OF('m6')]);
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('m6'))).toBe('none'));
    conn.move('wifi');
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(0);
  });
});

// dl-d2 in a browser (BRIDGE.md, downloads brief 3f): Pause / Resume all, the saved queue, waits, left and batch.
describe('offline-audio-web: the queue (dl-d2)', () => {
  const gets = () => fetchMock.mock.calls.filter((c) => !(c[1] && c[1].method === 'HEAD')).map((c) => c[0]);
  /** The next GET hangs until aborted, or until the returned release() answers it. */
  const hangNext = () => {
    let release = () => {};
    fetchMock.mockImplementationOnce((_u, init) => new Promise((r, j) => {
      release = () => r(relayResponse(5000));
      if (init && init.signal) init.signal.addEventListener('abort', () => j(new DOMException('aborted', 'AbortError')));
    }));
    return () => release();
  };
  const three = () => [1, 2, 3].map((i) => ({ url: URL_OF('r' + i), key: 'one:r' + i, title: 'Letter ' + i, bytes: 5000 }));

  it('Pause all stops the one on its way and holds the queue; Resume all goes on from the head', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three().slice(0, 2));
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    expect(OfflineAudio.pause()).toBe(true);
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('r1'))).toBe('queued'));
    expect(OfflineAudio.paused()).toBe(true);
    expect(OfflineAudio.reason()).toBe('paused');
    expect(OfflineAudio.failureOf(URL_OF('r1'))).toBe(null);
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(1);
    expect(OfflineAudio.resume()).toBe(true);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r2'))).toBe(true));
    expect(gets()).toEqual([RELAY + 'audio-v1/r1.mp3', RELAY + 'audio-v1/r1.mp3', RELAY + 'audio-v1/r2.mp3']);
    expect(OfflineAudio.batch()).toEqual({ done: 2, total: 2, failed: 0 });
    expect(OfflineAudio.paused()).toBe(false);
  });

  it('left counts what is still to come with its known bytes; batch counts "N of M"; a cancel leaves the count', async () => {
    await ready();
    hangNext();
    OfflineAudio.download([...three(), { url: URL_OF('r4'), key: 'k', title: 'no size' }]);
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    expect(OfflineAudio.left()).toEqual({ count: 4, bytes: 15000, unknown: 1 });
    expect(OfflineAudio.batch()).toEqual({ done: 0, total: 4, failed: 0 });
    OfflineAudio.cancel([URL_OF('r3')]);
    await vi.waitFor(() => expect(OfflineAudio.batch().total).toBe(3));
    expect(OfflineAudio.queue().map((q) => q.title)).toEqual(['Letter 1', 'Letter 2', 'no size']);
  });

  it('a queue left when the page closed comes back waiting as closed, fetches nothing, and Resume downloads it', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three());
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    WebOfflineAudio._reset();   // the page closes
    OfflineAudio._reset();
    fetchMock.mockClear();
    await ready();
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('closed'));
    expect(OfflineAudio.paused()).toBe(true);
    expect(OfflineAudio.left()).toEqual({ count: 3, bytes: 15000, unknown: 0 });
    expect(OfflineAudio.queue().map((q) => q.title)).toEqual(['Letter 1', 'Letter 2', 'Letter 3']);
    expect(OfflineAudio.statusOf(URL_OF('r2'))).toBe('queued');
    await new Promise((r) => setTimeout(r, 20));
    expect(gets()).toHaveLength(0);
    OfflineAudio.resume();
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r3'))).toBe(true));
    expect(OfflineAudio.reason()).toBe(null);
    expect(localStorage.getItem('vot.offlineAudioQueue')).toBe(null);
  });

  it('dl-d5: an automatic download is not the listener asking: a closed queue stays closed', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three());
    await vi.waitFor(() => expect(gets()).toHaveLength(1));
    WebOfflineAudio._reset();   // the page closes
    OfflineAudio._reset();
    fetchMock.mockClear();
    await ready();
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('closed'));
    OfflineAudio.download([{ url: URL_OF('auto'), key: 'k', title: 'auto', wifi: true }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(OfflineAudio.reason()).toBe('closed');
    expect(gets()).toHaveLength(0);
  });

  it('a queue paused by Pause all is still paused, not closed, after a reload', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three());
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    OfflineAudio.pause();
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    await ready();
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('paused'));
  });

  it('asking for another download after a close is a yes: the whole queue goes on', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three().slice(0, 1));
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    await ready();
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('closed'));
    OfflineAudio.download(three().slice(2));
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r3'))).toBe(true));
    expect(OfflineAudio.isSaved(URL_OF('r1'))).toBe(true);
    expect(OfflineAudio.batch()).toEqual({ done: 2, total: 2, failed: 0 });
  });

  it('Cancel all empties the queue and a later download starts unpaused', async () => {
    await ready();
    hangNext();
    OfflineAudio.download(three());
    await vi.waitFor(() => expect(gets()).toHaveLength(1));   // on its way: the relay asked
    OfflineAudio.pause();
    OfflineAudio.cancelAll();
    await vi.waitFor(() => expect(OfflineAudio.statusOf(URL_OF('r1'))).toBe('none'));
    expect(OfflineAudio.paused()).toBe(false);
    expect(localStorage.getItem('vot.offlineAudioQueue')).toBe(null);
    OfflineAudio.download([{ url: URL_OF('r9'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r9'))).toBe(true));
  });

  it('with no signal the queue waits as offline, spends no retry, and goes on when the signal is back', async () => {
    await ready();
    define(navigator, 'onLine', false);
    OfflineAudio.download(three().slice(0, 1));
    await vi.waitFor(() => expect(OfflineAudio.reason()).toBe('offline'));
    expect(gets()).toHaveLength(0);
    define(navigator, 'onLine', true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r1'))).toBe(true));
  });

  it('holds a screen wake lock while a download runs in view and lets it go after', async () => {
    const lock = { release: vi.fn(async () => {}), addEventListener: vi.fn() };
    define(navigator, 'wakeLock', { request: vi.fn(async () => lock) });
    define(document, 'visibilityState', 'visible');
    await ready();
    const release = hangNext();
    OfflineAudio.download(three().slice(0, 1));
    await vi.waitFor(() => expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen'));
    release();
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('r1'))).toBe(true));
    await vi.waitFor(() => expect(lock.release).toHaveBeenCalled());
  });
});
