// @ts-nocheck — tests construct partial media records
/* JournalMediaStore — IDB-backed blob storage + orphan pruning.
   ────────────────────────────────────────────────────────────────
   This store uses its OWN IDB database (`vot-journal-media`,
   distinct from the main `votreader` database that idb-adapter
   serves). Tests need fake-indexeddb just like idb-adapter.test.js
   so the IIFE's internal `openDb()` resolves against an in-memory
   IDB instead of throwing.

   Test environment quirk: fake-indexeddb's structured-clone shim
   doesn't recognize jsdom's Blob — round-tripped blobs come back
   as empty `{}` objects, losing size + type + the instanceof check.
   Node's native Blob (`node:buffer`) round-trips correctly. The
   setup block below installs Node's Blob as the global before
   importing the store so its IIFE module-load + every test sees
   a working Blob type.

   The store closes its cached connection on versionchange so Clear All
   can delete this database. Per-test isolation still uses
   `pruneOrphans([])` to keep the ordinary cases cheap.

   Per [[user-data-paramount]] orphan pruning is one of the most
   dangerous "user data deleter" surfaces in the app: a bug here
   silently deletes voice memos / captured images that the user
   trusted to be safe in their journal. The `pruneOrphans(set)`
   contract must:
     - Delete only blobs whose id is NOT in `set`.
     - Tolerate `set` containing unknown ids (they're just ignored).
     - Tolerate an empty `set` (deletes everything — used by Clear
       All Personal Data path).
     - Never throw on a malformed input (no `set` argument at all).
*/

import { Blob as NodeBlob } from 'node:buffer';
// Override jsdom's Blob with Node's native so fake-indexeddb's
// structured-clone shim preserves blob bytes + type on round-trip.
// MUST happen BEFORE fake-indexeddb/auto + before importing the
// store (whose IIFE captures the global Blob lazily, but openDb is
// also lazy so this is safe in practice).
/** @type {any} */ (globalThis).Blob = NodeBlob;

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { JournalMediaStore } from './journal-media-store.js';

beforeAll(async () => {
  // One-time clean slate at suite start. After this the store's
  // private `_dbPromise` opens against the empty database and
  // holds the connection for the lifetime of the test process.
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('vot-journal-media');
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => resolve(undefined);
    req.onblocked = () => resolve(undefined);
  });
});

// Per-test isolation: wipe every blob before each case so accumulated
// state from prior tests doesn't bleed into the next. pruneOrphans([])
// goes through the store's own delete path so the URL cache stays
// consistent with the underlying object store.
beforeEach(async () => {
  await JournalMediaStore.abortImportReplace();
  await JournalMediaStore.pruneOrphans([]);
});

/* Helper: build a small Blob with deterministic bytes so we can
   assert size/type on round-trip without coupling to image/audio
   encoding. */
function makeBlob(bytes, type) {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = i & 0xff;
  return new Blob([buf], { type });
}

/* ── Real image headers, for compressImage's size probe ─────────────────
   compressImage decides whether a resize hint can be applied WITHOUT
   upscaling by reading the source's own header. A blob of arbitrary bytes
   has no size to read, so these build the smallest genuinely valid headers
   for the two formats that carry every real case: a phone photo (JPEG) and
   a stitched screenshot (PNG). The parser under test reads these; nothing
   here is stubbed. */
function jpegHeader(w, h) {
  return new Uint8Array([
    0xFF, 0xD8,                                        // SOI
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,    // APP0/JFIF, len 16
    0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08,                      // SOF0, len 17, 8-bit
    (h >> 8) & 0xFF, h & 0xFF, (w >> 8) & 0xFF, w & 0xFF, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
}
function pngHeader(w, h) {
  const u = new Uint8Array(24);
  u.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
  const dv = new DataView(u.buffer);
  dv.setUint32(8, 13);                                 // IHDR length
  u.set([0x49, 0x48, 0x44, 0x52], 12);                 // 'IHDR'
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return u;
}
const jpegBlob = (w, h) => new Blob([jpegHeader(w, h)], { type: 'image/jpeg' });
const pngBlob = (w, h) => new Blob([pngHeader(w, h)], { type: 'image/png' });

/* A createImageBitmap that behaves like a DECODER: it honours the resize
   hint it is handed, including by upscaling a source narrower than the hint,
   which is exactly what the spec mandates and what real Chromium does. The
   mock this replaces returned a fixed 1600x1200 whatever it was given, so
   the suite could only ever assert what was REQUESTED — never what a decoder
   does with it. That is how an upscale on every under-target photo passed
   4,509 tests. */
function decoderMock(srcW, srcH) {
  return vi.fn((_blob, opts) => {
    let w = srcW;
    let h = srcH;
    const rw = opts && opts.resizeWidth;
    const rh = opts && opts.resizeHeight;
    if (rw) { w = rw; h = Math.round(srcH * (rw / srcW)); }
    else if (rh) { h = rh; w = Math.round(srcW * (rh / srcH)); }
    return Promise.resolve({ width: w, height: h, close: vi.fn() });
  });
}

describe('JournalMediaStore — put() + get() round-trip', () => {
  it('stores a small image blob and reads it back with same size/type', async () => {
    const blob = makeBlob(128, 'image/jpeg');
    const id = await JournalMediaStore.put({ id: 'm_test_1', type: 'image', blob });
    expect(id).toBe('m_test_1');

    const rec = await JournalMediaStore.get('m_test_1');
    expect(rec).not.toBeNull();
    expect(rec.id).toBe('m_test_1');
    expect(rec.type).toBe('image');
    expect(rec.blob).toBeInstanceOf(Blob);
    expect(rec.blob.size).toBe(128);
    expect(rec.blob.type).toBe('image/jpeg');
  });

  it('auto-generates an id when not provided', async () => {
    const blob = makeBlob(64, 'audio/webm');
    const id = await JournalMediaStore.put({ type: 'audio', blob });
    expect(id).toMatch(/^m_\d+_[a-z0-9]+$/);

    const rec = await JournalMediaStore.get(id);
    expect(rec.type).toBe('audio');
    expect(rec.blob.size).toBe(64);
  });

  it('stamps `size` and `mime` from the blob when absent', async () => {
    const blob = makeBlob(200, 'audio/mp4');
    await JournalMediaStore.put({ id: 'm_stamp', type: 'audio', blob });
    const rec = await JournalMediaStore.get('m_stamp');
    expect(rec.size).toBe(200);
    expect(rec.mime).toBe('audio/mp4');
  });

  it('rejects when blob is missing', async () => {
    /** @type {any} */
    const bad = { id: 'm_x', type: 'image' };
    await expect(JournalMediaStore.put(bad)).rejects.toThrow(/Invalid media record/);
  });

  it('rejects when type is missing', async () => {
    /** @type {any} */
    const bad = { id: 'm_y', blob: makeBlob(10, 'image/jpeg') };
    await expect(JournalMediaStore.put(bad)).rejects.toThrow(/Invalid media record/);
  });

  it('get() returns null for an unknown id', async () => {
    const rec = await JournalMediaStore.get('m_never');
    expect(rec).toBeNull();
  });

  it('get() returns null for a falsy id', async () => {
    expect(await JournalMediaStore.get(null)).toBeNull();
    expect(await JournalMediaStore.get(undefined)).toBeNull();
    expect(await JournalMediaStore.get('')).toBeNull();
  });
});

describe('JournalMediaStore — delete()', () => {
  it('removes the entry (subsequent get() returns null)', async () => {
    await JournalMediaStore.put({ id: 'm_del', type: 'image', blob: makeBlob(32, 'image/jpeg') });
    expect(await JournalMediaStore.get('m_del')).not.toBeNull();

    await JournalMediaStore.delete('m_del');
    expect(await JournalMediaStore.get('m_del')).toBeNull();
  });

  it('is idempotent on unknown id', async () => {
    await expect(JournalMediaStore.delete('m_never')).resolves.toBeUndefined();
  });

  it('is a no-op on falsy id', async () => {
    await expect(JournalMediaStore.delete(null)).resolves.toBeUndefined();
    await expect(JournalMediaStore.delete(undefined)).resolves.toBeUndefined();
    await expect(JournalMediaStore.delete('')).resolves.toBeUndefined();
  });
});

describe('JournalMediaStore — allIds()', () => {
  it('returns an empty array when the store is empty', async () => {
    const ids = await JournalMediaStore.allIds();
    expect(ids).toEqual([]);
  });

  it('returns the ids of all stored media', async () => {
    await JournalMediaStore.put({ id: 'm_a', type: 'image', blob: makeBlob(16, 'image/jpeg') });
    await JournalMediaStore.put({ id: 'm_b', type: 'audio', blob: makeBlob(16, 'audio/webm') });
    await JournalMediaStore.put({ id: 'm_c', type: 'image', blob: makeBlob(16, 'image/jpeg') });

    const ids = await JournalMediaStore.allIds();
    expect(new Set(ids)).toEqual(new Set(['m_a', 'm_b', 'm_c']));
  });
});

describe('JournalMediaStore — atomic import replacement', () => {
  it('keeps staged records invisible and abort preserves the live set', async () => {
    await JournalMediaStore.put({ id: 'old', type: 'image', blob: makeBlob(8, 'image/jpeg') });
    await JournalMediaStore.beginImportReplace();
    await JournalMediaStore.stageImportRecord({ id: 'new', type: 'audio', blob: makeBlob(12, 'audio/webm') });

    expect(await JournalMediaStore.allIds()).toEqual(['old']);
    expect(await JournalMediaStore.get('new')).toBeNull();

    await JournalMediaStore.abortImportReplace();
    expect(await JournalMediaStore.allIds()).toEqual(['old']);
  });

  it('commits the fully staged set as an exact replacement', async () => {
    await JournalMediaStore.put({ id: 'stale', type: 'image', blob: makeBlob(8, 'image/jpeg') });
    await JournalMediaStore.beginImportReplace();
    await JournalMediaStore.stageImportRecord({ id: 'm1', type: 'image', blob: makeBlob(16, 'image/png') });
    await JournalMediaStore.stageImportRecord({ id: 'm2', type: 'audio', blob: makeBlob(24, 'audio/webm') });

    await JournalMediaStore.commitImportReplace();

    expect(new Set(await JournalMediaStore.allIds())).toEqual(new Set(['m1', 'm2']));
    expect(await JournalMediaStore.get('stale')).toBeNull();
    expect((await JournalMediaStore.get('m1')).blob.size).toBe(16);
    expect((await JournalMediaStore.get('m2')).blob.size).toBe(24);
  });

  it('merge commit lands staged records by id without deleting existing media', async () => {
    await JournalMediaStore.put({ id: 'keep', type: 'image', blob: makeBlob(8, 'image/jpeg') });
    await JournalMediaStore.put({ id: 'overwrite', type: 'image', blob: makeBlob(8, 'image/jpeg') });
    await JournalMediaStore.beginImportReplace();
    await JournalMediaStore.stageImportRecord({ id: 'overwrite', type: 'image', blob: makeBlob(16, 'image/png') });
    await JournalMediaStore.stageImportRecord({ id: 'added', type: 'audio', blob: makeBlob(24, 'audio/webm') });

    await JournalMediaStore.commitImportMerge();

    expect(new Set(await JournalMediaStore.allIds())).toEqual(new Set(['keep', 'overwrite', 'added']));
    expect((await JournalMediaStore.get('overwrite')).blob.size).toBe(16); // staged copy wins by id
    expect((await JournalMediaStore.get('keep')).blob.size).toBe(8);      // untouched
    // Staging emptied — a later exact replace can't resurrect these records.
    await JournalMediaStore.commitImportReplace();
    expect(await JournalMediaStore.allIds()).toEqual([]);
  });
});

describe('JournalMediaStore — pruneOrphans() — the user-data deleter contract', () => {
  beforeEach(async () => {
    // Seed three media records before each pruneOrphans test.
    await JournalMediaStore.put({ id: 'm1', type: 'image', blob: makeBlob(8, 'image/jpeg') });
    await JournalMediaStore.put({ id: 'm2', type: 'audio', blob: makeBlob(8, 'audio/webm') });
    await JournalMediaStore.put({ id: 'm3', type: 'image', blob: makeBlob(8, 'image/jpeg') });
  });

  it('deletes unreferenced media, keeps referenced (the canonical case)', async () => {
    // Only m1 is referenced — m2 and m3 are orphans.
    const removed = await JournalMediaStore.pruneOrphans(['m1']);
    expect(removed).toBe(2);

    expect(await JournalMediaStore.get('m1')).not.toBeNull();
    expect(await JournalMediaStore.get('m2')).toBeNull();
    expect(await JournalMediaStore.get('m3')).toBeNull();
  });

  it('keeps every blob when all are referenced', async () => {
    const removed = await JournalMediaStore.pruneOrphans(['m1', 'm2', 'm3']);
    expect(removed).toBe(0);

    expect(await JournalMediaStore.get('m1')).not.toBeNull();
    expect(await JournalMediaStore.get('m2')).not.toBeNull();
    expect(await JournalMediaStore.get('m3')).not.toBeNull();
  });

  it('deletes everything when the referenced list is empty', async () => {
    // The "Clear All Personal Data" path — wipes every blob.
    const removed = await JournalMediaStore.pruneOrphans([]);
    expect(removed).toBe(3);

    expect(await JournalMediaStore.get('m1')).toBeNull();
    expect(await JournalMediaStore.get('m2')).toBeNull();
    expect(await JournalMediaStore.get('m3')).toBeNull();
  });

  it('STORE-2: never prunes a record created AT/AFTER the sweep cutoff (TOCTOU guard)', async () => {
    // A photo captured AFTER the boot sweep's synchronous snapshot but read by
    // the async prune pass: durable in IDB, absent from `referencedIds`. Without
    // the cutoff it would be reclaimed (data loss). Stamp it in the far future to
    // stand in for "newer than the sweep started".
    await JournalMediaStore.put({ id: 'm_fresh', type: 'image', blob: makeBlob(8, 'image/jpeg'), created: 9_000_000_000_000 });
    const cutoff = 8_000_000_000_000; // after m1/m2/m3 (real now), before m_fresh
    const removed = await JournalMediaStore.pruneOrphans([], cutoff);
    expect(removed).toBe(3);                                         // m1/m2/m3 (pre-cutoff, unreferenced) pruned
    expect(await JournalMediaStore.get('m_fresh')).not.toBeNull();   // post-cutoff blob SURVIVES
    expect(await JournalMediaStore.get('m1')).toBeNull();
  });

  it('STORE-2: omitting the cutoff keeps the legacy prune-all-unreferenced behavior', async () => {
    await JournalMediaStore.put({ id: 'm_fresh', type: 'image', blob: makeBlob(8, 'image/jpeg'), created: 9_000_000_000_000 });
    const removed = await JournalMediaStore.pruneOrphans([]);        // no cutoff → no time guard
    expect(removed).toBe(4);                                         // m1/m2/m3 + m_fresh all pruned
    expect(await JournalMediaStore.get('m_fresh')).toBeNull();
  });

  it('does not crash when the referenced list includes unknown ids', async () => {
    // The set has 'm_never' which doesn't exist + 'm1' which does.
    // The unknown id is just ignored on the filter side; m2+m3 still get
    // deleted because they're not in the referenced set.
    const removed = await JournalMediaStore.pruneOrphans(['m1', 'm_never']);
    expect(removed).toBe(2);

    expect(await JournalMediaStore.get('m1')).not.toBeNull();
    expect(await JournalMediaStore.get('m2')).toBeNull();
    expect(await JournalMediaStore.get('m3')).toBeNull();
  });

  it('handles a null/undefined referenced list as if it were empty (delete all)', async () => {
    // The store guards with `(referencedIds || []).forEach(...)` so the
    // empty-array branch fires when callers pass null/undefined. This
    // is the documented behavior — important to pin because a wrong-shape
    // payload (e.g. JournalStore.collectAllMediaIds returning undefined
    // during a pending/degraded state) must NOT silently wipe every blob.
    // The current behavior IS "wipe everything" — if that changes to
    // be defensive (return early on null/undefined), this test will
    // need updating intentionally.
    /** @type {any} */
    const noList = null;
    const removed = await JournalMediaStore.pruneOrphans(noList);
    expect(removed).toBe(3);
  });
});

describe('JournalMediaStore — list() metadata-only reads', () => {
  it('returns metadata for every record without the blob field', async () => {
    await JournalMediaStore.put({ id: 'm_a', type: 'image', blob: makeBlob(64, 'image/jpeg') });
    await JournalMediaStore.put({ id: 'm_b', type: 'audio', blob: makeBlob(128, 'audio/webm') });

    const meta = await JournalMediaStore.list();
    expect(meta.length).toBe(2);
    const byId = Object.fromEntries(meta.map(m => [m.id, m]));
    expect(byId.m_a.type).toBe('image');
    expect(byId.m_a.size).toBe(64);
    expect(byId.m_a.mime).toBe('image/jpeg');
    // Crucially — no blob field on the metadata-only shape.
    expect(byId.m_a.blob).toBeUndefined();
    expect(byId.m_b.size).toBe(128);
    expect(byId.m_b.blob).toBeUndefined();
  });

  it('returns an empty array when the store is empty', async () => {
    const meta = await JournalMediaStore.list();
    expect(meta).toEqual([]);
  });
});

describe('JournalMediaStore — mediaId()', () => {
  it('returns a fresh unique id each call', () => {
    const a = JournalMediaStore.mediaId();
    const b = JournalMediaStore.mediaId();
    expect(a).toMatch(/^m_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe('JournalMediaStore — objectUrl LRU cap (PERF2)', () => {
  it('evicts + revokes the least-recently-used URL once over the cap', async () => {
    const revoked = [];
    let n = 0;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:vot-' + (++n);
    URL.revokeObjectURL = (u) => { revoked.push(u); };
    try {
      // 30 distinct media > the 24-entry cap → the 6 oldest URLs are evicted + revoked
      // (each pins a blob in heap; the old code never freed one without a delete()).
      for (let i = 0; i < 30; i++) {
        await JournalMediaStore.put({ id: 'lru' + i, type: 'image', blob: new Blob([new Uint8Array([i & 255])]) });
      }
      expect(revoked.length).toBe(6);
      // Eviction is invisible: the blob is still in IDB, so objectUrl re-creates a URL.
      const url = await JournalMediaStore.objectUrl('lru0');
      expect(typeof url).toBe('string');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('releaseObjectUrls revokes every cached URL, empties the cache, and stays regenerable', async () => {
    // The memory-trim purge (window.__onTrimMemory → releaseObjectUrls). Each
    // cached URL pins a blob in heap; on an OS memory-pressure signal we revoke
    // them all. It must be a CACHE DROP (objectUrl re-creates from IDB), not data
    // loss, and must report how many it freed.
    const revoked = [];
    let n = 0;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:trim-' + (++n);
    URL.revokeObjectURL = (u) => { revoked.push(u); };
    try {
      await JournalMediaStore.pruneOrphans([]); // clean slate
      await JournalMediaStore.put({ id: 't1', type: 'image', blob: new Blob([new Uint8Array([1])]) });
      await JournalMediaStore.put({ id: 't2', type: 'image', blob: new Blob([new Uint8Array([2])]) });
      const u1 = await JournalMediaStore.objectUrl('t1'); // populate the LRU
      const u2 = await JournalMediaStore.objectUrl('t2');
      expect(typeof u1).toBe('string');
      expect(typeof u2).toBe('string');

      const freed = JournalMediaStore.releaseObjectUrls();
      expect(freed).toBe(2);                 // reported both
      expect(revoked).toContain(u1);         // revoked both cached URLs
      expect(revoked).toContain(u2);

      // Regenerable: a fresh objectUrl() call re-creates a NEW url from IDB —
      // the blob was never deleted, only its in-memory URL dropped.
      const u1b = await JournalMediaStore.objectUrl('t1');
      expect(typeof u1b).toBe('string');
      expect(u1b).not.toBe(u1);

      // A second release with nothing new cached reports 0 (the fresh u1b aside).
      expect(JournalMediaStore.releaseObjectUrls()).toBe(1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});

describe('JournalMediaStore — compressImage() (journal-5: decode-time downscale + byte ceiling)', () => {
  /** @type {any} */
  let fakeCanvas;
  /** @type {any} */
  let createElementSpy;

  /** Stub document.createElement('canvas') so encodeFrom's draw+encode step
   *  is observable without a real 2D context (jsdom has none). */
  function installFakeCanvas() {
    fakeCanvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb) => cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))),
    };
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return fakeCanvas;
      return realCreate(tag);
    });
  }

  afterEach(() => {
    if (createElementSpy) { createElementSpy.mockRestore(); createElementSpy = null; }
    delete /** @type {any} */ (globalThis).createImageBitmap;
  });

  it('REPRO: passes resizeWidth + resizeQuality to createImageBitmap so the decoder never builds the full-resolution bitmap', async () => {
    installFakeCanvas();
    const cib = decoderMock(3000, 2250);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    // A source comfortably larger than maxDim on BOTH axes — the case where
    // the hint is unambiguously a downscale.
    await JournalMediaStore.compressImage(jpegBlob(3000, 2250), { maxDim: 1600, quality: 0.8 });

    expect(cib).toHaveBeenCalledTimes(1);
    const optsArg = cib.mock.calls[0][1];
    expect(optsArg.resizeWidth).toBe(1600);
    expect(optsArg.resizeQuality).toBe('high');
    // Orientation correction is still requested on the primary attempt.
    expect(optsArg.imageOrientation).toBe('from-image');
  });

  it('a decode that is STILL oversized (an aspect ratio the resize hint alone cannot tame) is rejected before the canvas ever sees it', async () => {
    installFakeCanvas();
    // The finding's own worst case: a 50 MP shot's raw dimensions, as if the
    // resize hint had no effect (an old host silently ignoring it, or the
    // portrait-orientation overshoot this hint's aspect-ratio math allows).
    const bmp = { width: 8160, height: 6120, close: vi.fn() };
    /** @type {any} */ (globalThis).createImageBitmap = vi.fn().mockResolvedValue(bmp);

    await expect(JournalMediaStore.compressImage(makeBlob(10, 'image/jpeg'), { maxDim: 1600, quality: 0.8 }))
      .rejects.toThrow(/too large to process/);

    // The ceiling check runs BEFORE any canvas work — no 191 MB draw is attempted.
    expect(fakeCanvas.getContext).not.toHaveBeenCalled();
    // The oversized bitmap is still released, not leaked.
    expect(bmp.close).toHaveBeenCalledTimes(1);
  });

  it('a properly downscaled bitmap (within the ceiling) still succeeds end to end', async () => {
    installFakeCanvas();
    const bmp = { width: 1600, height: 1200, close: vi.fn() };
    /** @type {any} */ (globalThis).createImageBitmap = vi.fn().mockResolvedValue(bmp);

    const out = await JournalMediaStore.compressImage(jpegBlob(3000, 2250), { maxDim: 1600, quality: 0.8 });

    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.blob.type).toBe('image/jpeg');
    expect(bmp.close).toHaveBeenCalledTimes(1);
  });

  it('the imageOrientation retry (unsupported option) keeps the resize hint, only dropping orientation', async () => {
    installFakeCanvas();
    const bmp = { width: 1600, height: 1200, close: vi.fn() };
    const cib = vi.fn()
      .mockRejectedValueOnce(new Error('imageOrientation unsupported'))
      .mockResolvedValueOnce(bmp);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    await JournalMediaStore.compressImage(jpegBlob(3000, 2250), { maxDim: 1600, quality: 0.8 });

    expect(cib).toHaveBeenCalledTimes(2);
    const retryOpts = cib.mock.calls[1][1];
    expect(retryOpts.resizeWidth).toBe(1600);
    expect(retryOpts.resizeQuality).toBe('high');
    expect(retryOpts.imageOrientation).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   journal-5 follow-up: the resize hint SETS the decode width, it does not
   cap it.
   ─────────────────────────────────────────────────────────────────────────
   `createImageBitmap(blob, { resizeWidth: 1600 })` produces a bitmap of
   exactly 1600 px wide -- INCLUDING when the source is narrower, in which
   case the decoder upscales and encodeFrom then derives its scale from an
   inflated size it believes is the source. Measured in real Chromium on the
   unfixed tree: an 800x600 / 4,177 B photo came back 1600x1200 / 13,429 B,
   and a 1080x6000 stitched screenshot (6.5 Mpx, under the ceiling) was
   inflated to 14.2 Mpx and then REJECTED by the ceiling the same commit
   added -- terminal, so the attach is dropped with "Could not save that
   image."

   Every test above this block ran against a createImageBitmap stubbed to
   return a fixed 1600x1200 whatever options it was handed, so they asserted
   what was REQUESTED and never what a decoder does with it. These use
   decoderMock, which honours the hint, and real headers, which is how
   compressImage now learns whether the hint can be applied at all.
   ═══════════════════════════════════════════════════════════════════════ */
describe('JournalMediaStore — compressImage() never upscales a source below the target', () => {
  /** @type {any} */
  let fakeCanvas;
  /** @type {any} */
  let createElementSpy;

  function installFakeCanvas() {
    fakeCanvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb) => cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))),
    };
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return fakeCanvas;
      return realCreate(tag);
    });
  }

  afterEach(() => {
    if (createElementSpy) { createElementSpy.mockRestore(); createElementSpy = null; }
    delete /** @type {any} */ (globalThis).createImageBitmap;
  });

  const hintOf = (cib) => {
    const opts = cib.mock.calls[0][1] || {};
    return opts.resizeWidth;
  };

  it('REPRO: an 800x600 photo is stored at 800x600, not decoded up to 1600x1200', async () => {
    installFakeCanvas();
    const cib = decoderMock(800, 600);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    const out = await JournalMediaStore.compressImage(jpegBlob(800, 600), { maxDim: 1600, quality: 0.8 });

    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
    // The hint is what did the upscaling, so it must not be requested here.
    expect(hintOf(cib)).toBeUndefined();
  });

  it('REPRO: a 1080x6000 stitched screenshot still attaches, at 288x1600', async () => {
    installFakeCanvas();
    const cib = decoderMock(1080, 6000);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    // 1080*6000 = 6.48 Mpx, under the 10.24 Mpx ceiling. The hint inflated it
    // to 1600x8889 = 14.2 Mpx, and the ceiling then rejected the image the
    // hint had made oversized -- with `terminal` set, so no fallback ran.
    const out = await JournalMediaStore.compressImage(pngBlob(1080, 6000), { maxDim: 1600, quality: 0.8 });

    expect(out.width).toBe(288);
    expect(out.height).toBe(1600);
    expect(hintOf(cib)).toBeUndefined();
  });

  it('a portrait phone photo (3024x4032) still decodes small — the case the hint exists for', async () => {
    installFakeCanvas();
    const cib = decoderMock(3024, 4032);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    const out = await JournalMediaStore.compressImage(jpegBlob(3024, 4032), { maxDim: 1600, quality: 0.8 });

    expect(hintOf(cib)).toBe(1600);
    expect(out.width).toBe(1200);
    expect(out.height).toBe(1600);
  });

  it('a 50 MP flagship shot (8160x6120) is hinted down, not rejected', async () => {
    installFakeCanvas();
    const cib = decoderMock(8160, 6120);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    const out = await JournalMediaStore.compressImage(jpegBlob(8160, 6120), { maxDim: 1600, quality: 0.8 });

    expect(hintOf(cib)).toBe(1600);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
  });

  it('a source whose header cannot be read is decoded un-hinted rather than guessed at', async () => {
    installFakeCanvas();
    const cib = decoderMock(900, 700);
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    // 10 arbitrary bytes: no magic this parser knows. Guessing a hint here is
    // what produced the upscale; the post-decode ceiling is the guard instead.
    const out = await JournalMediaStore.compressImage(makeBlob(10, 'image/heic'), { maxDim: 1600, quality: 0.8 });

    expect(hintOf(cib)).toBeUndefined();
    expect(out.width).toBe(900);
    expect(out.height).toBe(700);
  });

  it('the imageOrientation retry carries the same hint decision, not a fresh guess', async () => {
    installFakeCanvas();
    const cib = vi.fn()
      .mockRejectedValueOnce(new Error('imageOrientation unsupported'))
      .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() });
    /** @type {any} */ (globalThis).createImageBitmap = cib;

    const out = await JournalMediaStore.compressImage(jpegBlob(800, 600), { maxDim: 1600, quality: 0.8 });

    expect(cib).toHaveBeenCalledTimes(2);
    expect((cib.mock.calls[1][1] || {}).resizeWidth).toBeUndefined();
    expect(out.width).toBe(800);
  });
});

describe('JournalMediaStore connection lifecycle', () => {
  it('closes on versionchange so Clear All can delete and then reopen the database', async () => {
    await JournalMediaStore.put({ id: 'before-clear', type: 'image', blob: makeBlob(8, 'image/jpeg') });

    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('vot-journal-media');
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error || new Error('delete failed'));
      req.onblocked = () => reject(new Error('delete was blocked by the cached connection'));
    });

    await JournalMediaStore.put({ id: 'after-clear', type: 'audio', blob: makeBlob(4, 'audio/webm') });
    expect(await JournalMediaStore.get('before-clear')).toBeNull();
    expect((await JournalMediaStore.get('after-clear')).type).toBe('audio');
  });
});
