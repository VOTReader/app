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
   can delete this database. Per-test isolation is an UNCONDITIONAL wipe
   (allIds + delete), deliberately not `pruneOrphans([])`: prune is policy
   and the isolation reset must not be. journal-3 makes prune skip records
   carrying the `unlinked` marker, so a prune-based reset would silently
   stop clearing exactly the records these tests seed — and the leak would
   surface as a phantom failure in whichever case ran next in file order.
   An isolation reset may never share code with the thing under test.

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
// state from prior tests doesn't bleed into the next. Goes through the
// store's own delete path so the URL cache stays consistent with the
// underlying object store.
//
// NOT `pruneOrphans([])`, though it once was: prune carries policy
// (journal-3 makes it skip `unlinked` records) and an isolation reset
// must clear unconditionally, or the suite stops being isolated the day
// that policy changes.
beforeEach(async () => {
  await JournalMediaStore.abortImportReplace();
  var ids = await JournalMediaStore.allIds();
  await Promise.all(ids.map(function(id) { return JournalMediaStore.delete(id); }));
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

  /* R3 — journal-3 (b). The load-bearing RED of this batch: it fails on a
     VALUE, not on a missing symbol.

     P3, the loss this closes: `persistRecording` awaits `put`, then calls
     `onSave({mediaId})` for the editor to autosave into the entry. A crash
     between those two leaves a media record no entry references. Four seconds
     after the next boot the sweep prunes it — correctly by its own lights,
     because it cannot tell "the owner was deleted" from "the link never
     landed". The `unlinked` marker is exactly the bit that distinguishes
     them, so prune must leave a marked record alone and let the Hub offer it
     back. Per [[user-data-paramount]] this is the difference between a memo
     the user can recover with one tap and one that is simply gone. */
  it('R3: leaves an unreferenced record carrying the unlinked marker (a link that never landed)', async () => {
    await JournalMediaStore.put({ id: 'm_unlinked', type: 'audio', blob: makeBlob(8, 'audio/webm'), unlinked: true });
    const removed = await JournalMediaStore.pruneOrphans([]);

    expect(removed).toBe(3);                                        // m1/m2/m3 only
    expect(await JournalMediaStore.allIds()).toEqual(['m_unlinked']);
    expect((await JournalMediaStore.get('m_unlinked')).unlinked).toBe(true);
  });

  /* R4 — journal-3 (b). Weaker RED than R3 (a missing method, not a wrong
     value), but it pins the AND: the authoritative test for "unclaimed" is
     marker AND unreferenced, never the marker alone. The marker is written in
     one transaction and cleared in another, so it can go stale; AND-ing it
     with the referenced set the sweep already computes makes a failed
     markLinked cost nothing. */
  it('R4: unclaimed() returns marked-and-unreferenced only', async () => {
    await JournalMediaStore.put({ id: 'm_unlinked', type: 'audio', blob: makeBlob(8, 'audio/webm'), unlinked: true });
    await JournalMediaStore.put({ id: 'm_claimed', type: 'audio', blob: makeBlob(8, 'audio/webm'), unlinked: true });

    const out = await JournalMediaStore.unclaimed(['m_claimed']);

    expect(out.map(function(r) { return r.id; })).toEqual(['m_unlinked']);
    // m2 is an ordinary unmarked orphan — prune's business, never the banner's.
    expect(out.some(function(r) { return r.id === 'm2'; })).toBe(false);
    // Metadata projection, no blobs: the banner needs duration to render a row.
    expect(out[0].duration === undefined || typeof out[0].duration === 'number').toBe(true);
    expect(out[0].blob).toBeUndefined();
    expect(out[0].unlinked).toBe(true);
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
      // Clean slate, unconditional — same reason as the beforeEach above.
      var seeded = await JournalMediaStore.allIds();
      await Promise.all(seeded.map(function(id) { return JournalMediaStore.delete(id); }));
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
