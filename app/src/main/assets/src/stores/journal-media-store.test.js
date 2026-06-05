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

   The store closes over a module-private `_dbPromise` and has no
   public reset hook. We can't reliably wipe state between tests by
   deleting + re-opening (the held connection blocks deletion until
   the closure ref drops, which never happens at module scope). The
   tests below run sequentially and each uses unique ids so the
   accumulated state doesn't bleed between assertions; the
   `vot-journal-media` database is deleted ONCE in the top-level
   beforeAll for total isolation from other test files. Per-test
   isolation uses `pruneOrphans([])` to wipe between cases.

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
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
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
