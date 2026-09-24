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
