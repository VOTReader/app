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

  it('saves a recording through the relay, and with no signal the player loads the service worker copy', async () => {
    await ready();
    define(navigator, 'onLine', false);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe(URL_OF('a'));   // not saved: GitHub's own URL
    expect(OfflineAudio.download([{ url: URL_OF('a'), key: 'one:a', title: 'A Letter' }])).toBe(true);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('a'))).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(RELAY + 'audio-v1/a.mp3', expect.objectContaining({ credentials: 'omit' }));
    expect(OfflineAudio.items()).toEqual([expect.objectContaining({ url: URL_OF('a'), key: 'one:a', title: 'A Letter', bytes: 5000 })]);
    expect(OfflineAudio.totalBytes()).toBe(5000);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe('https://votreader.github.io/app/offline-audio/audio-v1/a.mp3');
    // With a signal a saved recording streams from GitHub as before: a browser whose media skips the worker loses nothing.
    define(navigator, 'onLine', true);
    expect(OfflineAudio.webSrc(URL_OF('a'))).toBe(URL_OF('a'));
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
    const stored = await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('a'));
    expect((await stored.arrayBuffer()).byteLength).toBe(5000);
  });

  it('what was saved is still there after a reload', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('b'), key: 'two:b', title: 'Título “quoted”' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    WebOfflineAudio._reset();
    OfflineAudio._reset();
    expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(false);          // not read yet
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('b'))).toBe(true));
    expect(OfflineAudio.items()[0]).toEqual(expect.objectContaining({ key: 'two:b', title: 'Título “quoted”', bytes: 5000 }));
  });

  it('a cut-off download is failed and nothing half-saved stays', async () => {
    await ready();
    fetchMock.mockImplementationOnce(async () => relayResponse(3000, 5000));
    OfflineAudio.download([{ url: URL_OF('c'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.failureOf(URL_OF('c'))).toBe('short'));
    expect(OfflineAudio.isSaved(URL_OF('c'))).toBe(false);
    expect(await (await caches.open(OFFLINE_AUDIO_CACHE)).match(URL_OF('c'))).toBeUndefined();
  });

  it('a relay refusal or no signal is a network failure; no room is a space failure', async () => {
    await ready();
    fetchMock.mockImplementationOnce(async () => relayResponse(0, 0, 404));
    fetchMock.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
    OfflineAudio.download([{ url: URL_OF('d'), key: 'k', title: 't' }, { url: URL_OF('e'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.failureOf(URL_OF('e'))).toBe('network'));
    expect(OfflineAudio.failureOf(URL_OF('d'))).toBe('network');
    navigator.storage.estimate = async () => ({ quota: 1e6, usage: 999000 });
    OfflineAudio.download([{ url: URL_OF('f'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.failureOf(URL_OF('f'))).toBe('space'));
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

  it('keeps the saved copy the element already plays when the signal comes back', async () => {
    await ready();
    OfflineAudio.download([{ url: URL_OF('h'), key: 'k', title: 't' }]);
    await vi.waitFor(() => expect(OfflineAudio.isSaved(URL_OF('h'))).toBe(true));
    const local = 'https://votreader.github.io/app/offline-audio/audio-v1/h.mp3';
    expect(OfflineAudio.webSrc(URL_OF('h'), local)).toBe(local);             // online, holding the copy
    expect(OfflineAudio.webSrc(URL_OF('h'), URL_OF('h'))).toBe(URL_OF('h')); // online, streaming
    define(navigator, 'onLine', false);
    expect(OfflineAudio.webSrc(URL_OF('h'), URL_OF('h'))).toBe(local);       // offline: the copy, even from a stream
    expect(OfflineAudio.webSameRecording(URL_OF('h'), local)).toBe(true);
    expect(OfflineAudio.webSameRecording(URL_OF('h'), URL_OF('h'))).toBe(true);
    expect(OfflineAudio.webSameRecording(URL_OF('h'), URL_OF('other'))).toBe(false);
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
