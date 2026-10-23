/* offline-audio — the page's mirror of the phone's downloaded recordings (listening item 8, 2026-09-24).
   ────────────────────────────────────────────────────────────────────────────────────────────────────────
   The Android app's OfflineAudioStore keeps downloads on the phone and serves them to the <audio> element
   from disk. This store mirrors it for the UI and the player: what is on the phone, what is downloading and
   how far, what failed and why. The native side is the truth: a 'done' or 'removed' event re-reads its whole
   state; progress, queued, failed and cancelled are applied as they come. On the web there is no bridge, so
   nothing is available and every call is a harmless no-op. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineAudio } from './offline-audio.js';

const U1 = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-christmas-B.mp3';
const U2 = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-wide-path-B.mp3';

/** @type {any} */ let native;
function fakeBridge(initial = []) {
  native = { items: initial.slice(), freeBytes: 5e9 };
  const b = {
    offlineAudioState: vi.fn(() => JSON.stringify({
      items: native.items, totalBytes: native.items.reduce((n, i) => n + i.bytes, 0), freeBytes: native.freeBytes, active: null, queued: [],
    })),
    offlineAudioSave: vi.fn(),
    offlineAudioRemove: vi.fn(),
    offlineAudioCancel: vi.fn(),
    offlineAudioSizes: vi.fn(),
  };
  /** @type {any} */ (window).AndroidBridge = b;
  return b;
}
const send = (o) => /** @type {any} */ (window).__votOfflineAudio(JSON.stringify(o));

beforeEach(() => { OfflineAudio._reset(); });
afterEach(() => { delete /** @type {any} */ (window).AndroidBridge; OfflineAudio._reset(); });

describe('offline-audio — on the web (no bridge)', () => {
  it('offers nothing and never throws', () => {
    expect(OfflineAudio.available()).toBe(false);
    expect(OfflineAudio.statusOf(U1)).toBe('none');
    expect(OfflineAudio.isSaved(U1)).toBe(false);
    expect(OfflineAudio.download([{ url: U1, key: 'one:christmas', title: 'Christmas' }])).toBe(false);
    expect(() => { OfflineAudio.remove([U1]); OfflineAudio.removeAll(); OfflineAudio.cancel([U1]); }).not.toThrow();
    expect(OfflineAudio.items()).toEqual([]);
  });
});

describe('offline-audio — in the phone app', () => {
  it('reads what is on the phone from the native store', () => {
    fakeBridge([{ url: U1, key: 'one:christmas', title: 'Christmas', bytes: 6_000_000, savedAt: 1 }]);
    OfflineAudio.refresh();
    expect(OfflineAudio.available()).toBe(true);
    expect(OfflineAudio.isSaved(U1)).toBe(true);
    expect(OfflineAudio.statusOf(U1)).toBe('saved');
    expect(OfflineAudio.isSaved(U2)).toBe(false);
    expect(OfflineAudio.totalBytes()).toBe(6_000_000);
    expect(OfflineAudio.freeBytes()).toBe(5e9);
    expect(OfflineAudio.items().map((i) => i.url)).toEqual([U1]);
  });

  it('download hands the list to the phone and shows it queued at once', () => {
    const b = fakeBridge();
    const cb = vi.fn();
    const off = OfflineAudio.subscribe(cb);
    expect(OfflineAudio.download([{ url: U1, key: 'one:christmas', title: 'Christmas' }])).toBe(true);
    expect(JSON.parse(b.offlineAudioSave.mock.calls[0][0])).toEqual([{ url: U1, key: 'one:christmas', title: 'Christmas' }]);
    expect(OfflineAudio.statusOf(U1)).toBe('queued');
    expect(cb).toHaveBeenCalled();
    off();
  });

  it('follows a download through progress to done, and a failure keeps its reason', () => {
    fakeBridge();
    send({ type: 'queued', url: U1 });
    expect(OfflineAudio.statusOf(U1)).toBe('queued');
    send({ type: 'progress', url: U1, bytes: 300, total: 1000 });
    expect(OfflineAudio.statusOf(U1)).toBe('downloading');
    expect(OfflineAudio.progressOf(U1)).toEqual({ bytes: 300, total: 1000 });
    native.items.push({ url: U1, key: 'one:christmas', title: 'Christmas', bytes: 1000, savedAt: 2 });
    send({ type: 'done', url: U1, bytes: 1000 });
    expect(OfflineAudio.statusOf(U1)).toBe('saved');
    expect(OfflineAudio.progressOf(U1)).toBeNull();

    send({ type: 'queued', url: U2 });
    send({ type: 'failed', url: U2, reason: 'space' });
    expect(OfflineAudio.statusOf(U2)).toBe('failed');
    expect(OfflineAudio.failureOf(U2)).toBe('space');
    // A new attempt clears the old failure.
    OfflineAudio.download([{ url: U2, key: 'one:wide-path', title: 'The Wide Path' }]);
    expect(OfflineAudio.statusOf(U2)).toBe('queued');
    expect(OfflineAudio.failureOf(U2)).toBeNull();
  });

  it('remove and remove-all go to the phone, and its removed event re-reads the shelf', () => {
    const b = fakeBridge([{ url: U1, key: 'k1', title: 't1', bytes: 10, savedAt: 1 }, { url: U2, key: 'k2', title: 't2', bytes: 20, savedAt: 1 }]);
    OfflineAudio.refresh();
    OfflineAudio.remove([U1]);
    expect(JSON.parse(b.offlineAudioRemove.mock.calls[0][0])).toEqual([U1]);
    native.items = native.items.filter((i) => i.url !== U1);
    send({ type: 'removed', urls: [U1] });
    expect(OfflineAudio.isSaved(U1)).toBe(false);
    expect(OfflineAudio.totalBytes()).toBe(20);
    OfflineAudio.removeAll();
    expect(JSON.parse(b.offlineAudioRemove.mock.calls[1][0])).toEqual(['*']);
    OfflineAudio.cancel([U2]);
    expect(JSON.parse(b.offlineAudioCancel.mock.calls[0][0])).toEqual([U2]);
  });

  it('keeps kept SONGS (K1) off the recordings shelf: items, total and Remove all leave them alone', () => {
    const S1 = 'https://votreader.github.io/songs-2/a1b2c3d4e5f6.mp3';
    const b = fakeBridge([
      { url: U1, key: 'k1', title: 't1', bytes: 10, savedAt: 1 },
      { url: S1, key: 'song:a1b2c3d4e5f6', title: 'A song', bytes: 3000, savedAt: 2 },
    ]);
    OfflineAudio.refresh();
    expect(OfflineAudio.items().map((i) => i.url)).toEqual([U1]);
    expect(OfflineAudio.songItems().map((i) => i.url)).toEqual([S1]);
    expect(OfflineAudio.totalBytes()).toBe(10);
    expect(OfflineAudio.isSaved(S1)).toBe(true);
    OfflineAudio.removeAll();
    expect(JSON.parse(b.offlineAudioRemove.mock.calls[0][0])).toEqual([U1]);   // never '*' while a song is kept
    OfflineAudio.cancelAll();
    expect(b.offlineAudioCancel).not.toHaveBeenCalled();                       // nothing of the recordings' on its way
  });

  it('names the songs on their way (queued or downloading), never a recording or a song already kept (sweep v037)', () => {
    const S1 = 'https://votreader.github.io/songs-2/a1b2c3d4e5f6.mp3';
    const S2 = 'https://votreader.github.io/songs-1/b1b2c3d4e5f6.mp3';
    const S3 = 'https://votreader.github.io/songs-1/c1b2c3d4e5f6.mp3';
    fakeBridge([{ url: S3, key: 'song:c1b2c3d4e5f6', title: 'Kept', bytes: 3000, savedAt: 2 }]);
    OfflineAudio.refresh();
    expect(OfflineAudio.songsOnTheirWay()).toEqual([]);
    OfflineAudio.download([
      { url: U1, key: 'one:christmas', title: 'Christmas' },
      { url: S1, key: 'song:a1b2c3d4e5f6', title: 'A song' },
      { url: S2, key: 'song:b1b2c3d4e5f6', title: 'Another' },
    ]);
    send({ type: 'progress', url: S1, bytes: 10, total: 3000 });
    expect(OfflineAudio.songsOnTheirWay().sort()).toEqual([S1, S2].sort());
    send({ type: 'cancelled', url: S2 });
    expect(OfflineAudio.songsOnTheirWay()).toEqual([S1]);
  });

  it('asks the phone for sizes before a download and answers them per recording', async () => {
    const b = fakeBridge([{ url: U2, key: 'k2', title: 't2', bytes: 20, savedAt: 1 }]);
    OfflineAudio.refresh();
    expect(OfflineAudio.sizeOf(U1)).toBeNull();
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[0][0])).toEqual([U1]);   // a download on the phone already knows its size
    send({ type: 'sizes', sizes: { [U1]: 18_000_000 } });
    expect(OfflineAudio.sizeOf(U1)).toBe(18_000_000);
    expect(OfflineAudio.sizeOf(U2)).toBe(20);
    OfflineAudio.requestSizes([U1]);
    await Promise.resolve();
    expect(b.offlineAudioSizes).toHaveBeenCalledTimes(1);                     // known sizes are not asked again
  });

  it('a size the phone could not give is asked again next time (not given up for the session)', async () => {
    const b = fakeBridge();
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    send({ type: 'sizes', sizes: { [U1]: 5 } });   // U2 went unanswered (no signal, a failed lookup)
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[1][0])).toEqual([U2]);
  });

  // Downloads brief section 7 item 9: a failed lookup hid the Download all total until the screen was opened again.
  it('a size that went unanswered is asked again on its own, a few times, while the screen stays open', async () => {
    vi.useFakeTimers();
    try {
      const b = fakeBridge();
      OfflineAudio.requestSizes([U1, U2]);
      await Promise.resolve();
      send({ type: 'sizes', sizes: { [U1]: 5 }, asked: [U1, U2] });
      expect(b.offlineAudioSizes).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(8000);
      expect(b.offlineAudioSizes).toHaveBeenCalledTimes(2);
      expect(JSON.parse(b.offlineAudioSizes.mock.calls[1][0])).toEqual([U2]);
      send({ type: 'sizes', sizes: { [U2]: 7 }, asked: [U2] });
      expect(OfflineAudio.sizeOf(U2)).toBe(7);
      await vi.advanceTimersByTimeAsync(120000);
      expect(b.offlineAudioSizes).toHaveBeenCalledTimes(2);   // answered: no more asks
    } finally { vi.useRealTimers(); }
  });

  it('every row of a screen asking in one turn is one call to the phone (n2-02)', async () => {
    const b = fakeBridge();
    const url = (i) => U1.replace('.mp3', '-' + i + '.mp3');
    for (let i = 0; i < 66; i++) OfflineAudio.requestSizes([url(i), url(i + 1)]);
    expect(b.offlineAudioSizes).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(b.offlineAudioSizes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[0][0])).toHaveLength(67);
  });

  it('an answer frees only what it was asked, not a later call still on its way (n2-02)', async () => {
    const b = fakeBridge();
    OfflineAudio.requestSizes([U1]);
    await Promise.resolve();
    OfflineAudio.requestSizes([U2]);
    await Promise.resolve();
    send({ type: 'sizes', sizes: {}, asked: [U1] });   // U1's lookup failed; U2's is still out
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[2][0])).toEqual([U1]);
  });

  it('one queued event carries a whole Download all (n2-03)', () => {
    fakeBridge();
    const seen = vi.fn();
    OfflineAudio.subscribe(seen);
    seen.mockClear();
    send({ type: 'queued', urls: [U1, U2, 7] });
    expect(OfflineAudio.statusOf(U1)).toBe('queued');
    expect(OfflineAudio.statusOf(U2)).toBe('queued');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('has news for a screen reader: a batch started, a failure, the queue finished (n2-06)', () => {
    const b = fakeBridge();
    expect(OfflineAudio.news().seq).toBe(0);
    send({ type: 'queued', urls: [U1, U2] });
    expect(OfflineAudio.news().text).toBe('Downloading 2 recordings');
    send({ type: 'progress', url: U1, bytes: 1, total: 10 });
    send({ type: 'failed', url: U1, reason: 'space' });
    expect(OfflineAudio.news().text).toBe('Download failed: not enough room on this phone');
    const seq = OfflineAudio.news().seq;
    send({ type: 'progress', url: U2, bytes: 1, total: 10 });
    expect(OfflineAudio.news().seq).toBe(seq);   // not per percent
    b.offlineAudioState.mockReturnValue(JSON.stringify({ items: [], queued: [] }));
    send({ type: 'done', url: U2 });
    expect(OfflineAudio.news().text).toBe('Download finished');
  });

  it('knows what is on its way and what failed, to retry from anywhere (n2-05)', () => {
    const b = fakeBridge();
    OfflineAudio.download([{ url: U1, key: 'k1', title: 't1' }, { url: U2, key: 'k2', title: 't2' }]);
    expect(OfflineAudio.pending()).toEqual({ busy: 2, failed: [] });
    send({ type: 'progress', url: U1, bytes: 1, total: 10 });
    expect(OfflineAudio.pending().busy).toBe(2);
    send({ type: 'failed', url: U1, reason: 'network' });
    expect(OfflineAudio.pending()).toEqual({ busy: 1, failed: [{ url: U1, key: 'k1', title: 't1' }] });
    expect(b.offlineAudioSave).toHaveBeenCalledTimes(1);
  });

  it('marks a download whose release was uploaded again, and updates it in place (n2-01)', () => {
    const b = fakeBridge([{ url: U1, key: 'k1', title: 't1', bytes: 20, savedAt: 1 }]);
    b.offlineAudioCheck = vi.fn();
    OfflineAudio.refresh();
    expect(OfflineAudio.items()[0].stale).toBe(false);
    OfflineAudio.checkForUpdates();
    expect(b.offlineAudioCheck).toHaveBeenCalledTimes(1);
    native.items[0].stale = true;
    send({ type: 'checked' });
    expect(OfflineAudio.items()[0].stale).toBe(true);
    expect(OfflineAudio.update([{ url: U2, key: 'k2', title: 't2' }])).toBe(false);   // not on the phone: no update
    expect(OfflineAudio.update([OfflineAudio.items()[0]])).toBe(true);
    expect(JSON.parse(b.offlineAudioSave.mock.calls[0][0])).toEqual([{ url: U1, key: 'k1', title: 't1', update: true }]);
    send({ type: 'queued', urls: [U1] });
    expect(OfflineAudio.isUpdating(U1)).toBe(true);
    expect(OfflineAudio.statusOf(U1)).toBe('saved');   // it plays from the old file meanwhile
  });

  it('a cancelled download is simply not there any more', () => {
    fakeBridge();
    send({ type: 'queued', url: U1 });
    send({ type: 'progress', url: U1, bytes: 10, total: 100 });
    send({ type: 'cancelled', url: U1 });
    expect(OfflineAudio.statusOf(U1)).toBe('none');
    expect(OfflineAudio.progressOf(U1)).toBeNull();
  });

  it('ignores a malformed event and a bridge that throws', () => {
    const b = fakeBridge();
    expect(() => /** @type {any} */ (window).__votOfflineAudio('not json')).not.toThrow();
    expect(() => /** @type {any} */ (window).__votOfflineAudio(JSON.stringify({ type: 'progress' }))).not.toThrow();
    b.offlineAudioState.mockImplementation(() => { throw new Error('native threw'); });
    expect(() => OfflineAudio.refresh()).not.toThrow();
  });
});

/* Downloads brief 2026-10-23, 3d: sizes are baked (tools/gen-audio-lengths.py -> AUDIO_LENGTHS, a lazy file), so a
   whole set's total is known at once and the phone is asked only for what the build did not see. */
describe('offline-audio — baked sizes', () => {
  afterEach(() => { delete /** @type {any} */ (globalThis).AUDIO_LENGTHS; delete /** @type {any} */ (globalThis).__makeLazyLoader; });

  it('a baked size answers at once and is never asked of the phone', async () => {
    const b = fakeBridge();
    /** @type {any} */ (globalThis).AUDIO_LENGTHS = { 'one-christmas-B': [18_000_000, 600] };
    expect(OfflineAudio.sizeOf(U1)).toBe(18_000_000);
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[0][0])).toEqual([U2]);
  });

  it('a size asked before the table lands waits for it, then asks only what it lacks', async () => {
    const b = fakeBridge();
    let land = () => {};
    const corpus = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 };
    /** @type {any} */ (globalThis).__makeLazyLoader = vi.fn(() => ({
      corpus,
      load: () => new Promise((res) => { land = () => { /** @type {any} */ (globalThis).AUDIO_LENGTHS = { 'one-christmas-B': [18_000_000, 600] }; corpus.loaded = true; res(undefined); }; }),
    }));
    const heard = vi.fn();
    OfflineAudio.subscribe(heard);
    OfflineAudio.requestSizes([U1, U2]);
    await Promise.resolve();
    expect(b.offlineAudioSizes).not.toHaveBeenCalled();
    land();
    await vi.waitFor(() => expect(b.offlineAudioSizes).toHaveBeenCalledTimes(1));
    expect(JSON.parse(b.offlineAudioSizes.mock.calls[0][0])).toEqual([U2]);
    expect(OfflineAudio.sizeOf(U1)).toBe(18_000_000);
    expect(heard).toHaveBeenCalled();                    // the screens repaint with the totals
  });
});
