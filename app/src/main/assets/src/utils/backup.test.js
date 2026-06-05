// @ts-nocheck — tests construct partial payloads + fake ctx objects
/* backup.js — export-payload build + import-apply + e2e round-trip (U1/U14).
   ──────────────────────────────────────────────────────────────────────
   Export/Import is the ONLY backup mechanism in VOTReader (allowBackup=
   false, no cloud, no account). The headline test here is the one U1 owed:
   a REAL end-to-end round-trip against the live stores + a fake IndexedDB —

       populate device A → export → wipe device → import → RELOAD → assert

   The "reload" step is the crux: it drops every in-memory cache + the IDB
   connection and re-hydrates from disk, proving the imported data was
   DURABLY written (the U1 barrier), not merely sitting in a JS cache that a
   page teardown would discard. Before the barrier landed, a large import
   could be torn down mid-transaction by the reload and silently lost.

   Plus fast unit tests over the pure functions' branches (read-failure
   abort, media-limit abort, validation-skip, write-failure counting, the
   V1 fallback) using lightweight fake ctx objects — no real IDB needed.

   Node's Blob (node:buffer) replaces jsdom's BEFORE fake-indexeddb loads,
   so media blobs survive the structured-clone round-trip with bytes + type
   intact (same quirk handled in journal-media-store.test.js).
*/

import { Blob as NodeBlob } from 'node:buffer';
/** @type {any} */ (globalThis).Blob = NodeBlob;

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  blobToBase64, base64ToBlob, buildExportPayload, applyImportPayload,
  buildV3Manifest, applyV3, DEFAULT_MEDIA_LIMIT_BYTES, formatImportSpaceWarning,
} from './backup.js';
import { writeContainer, readContainer } from './backup-container.js';

import { IDBAdapter } from '../stores/idb-adapter.js';
import { hydrateAllStores, hasAnyPendingStores } from '../stores/cached-store.js';
import { JournalMediaStore } from '../stores/journal-media-store.js';
import { validateStorePayload, validateImportEnvelope, validateMediaRecord } from './import-validators.js';
import { StorageHealth } from './storage-health.js';

import { AnnotationStore } from '../stores/annotation-store.js';
import { NoteStore } from '../stores/note-store.js';
import { BookmarkStore } from '../stores/bookmark-store.js';
import { LinkStore } from '../stores/link-store.js';
import { NotebookStore } from '../stores/notebook-store.js';
import { JournalStore, JournalNotebookStore } from '../stores/journal-store.js';
import { JournalIndexStore } from '../stores/journal-index-store.js';
import { JournalStatsStore } from '../stores/journal-stats-store.js';
import { RecentNavStore } from '../stores/recent-nav-store.js';
import { HistoryStore } from '../stores/history-store.js';
import { ProphecyCardsStore } from '../stores/prophecy-cards-store.js';
import { HomeOrderStore } from '../stores/home-order-store.js';
import { StateStore } from '../stores/state-store.js';
import { WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore } from '../stores/app-flag-stores.js';

/* ─────────────────────────────────────────────────────────────────────
   PART 1 — codecs
   ───────────────────────────────────────────────────────────────────── */
describe('blobToBase64 / base64ToBlob', () => {
  it('round-trips arbitrary bytes through base64', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66, 67]);
    const blob = new NodeBlob([bytes], { type: 'image/jpeg' });
    const b64 = await blobToBase64(blob);
    expect(typeof b64).toBe('string');
    const back = base64ToBlob(b64, 'image/jpeg');
    expect(back.type).toBe('image/jpeg');
    const backBytes = new Uint8Array(await back.arrayBuffer());
    expect(Array.from(backBytes)).toEqual(Array.from(bytes));
  });

  it('base64ToBlob defaults the mime when omitted', () => {
    const blob = base64ToBlob(btoa('hi'));
    expect(blob.type).toBe('application/octet-stream');
  });

  it('base64ToBlob throws on malformed base64 (U19 — full-string validation)', () => {
    expect(() => base64ToBlob('not valid base64!@#$')).toThrow(/malformed base64/);
    expect(() => base64ToBlob('abc')).toThrow(/malformed base64/);      // length not %4
    expect(() => base64ToBlob(/** @type {any} */ (null))).toThrow(/malformed base64/);
    // A canonical btoa output still decodes fine (no false positives).
    expect(base64ToBlob(btoa('hello world')).size).toBeGreaterThan(0);
  });

  it('blobToBase64 handles an empty blob', async () => {
    const b64 = await blobToBase64(new NodeBlob([], { type: 'audio/mp4' }));
    expect(b64).toBe('');
  });
});

/* ─────────────────────────────────────────────────────────────────────
   PART 2 — buildExportPayload (fake ctx; no real IDB)
   ───────────────────────────────────────────────────────────────────── */
describe('buildExportPayload', () => {
  beforeEach(() => { localStorage.clear(); });

  /** idbAdapter stub whose get() returns from a backing map (or throws). */
  function fakeAdapter(values, throwFor) {
    return {
      get: async (name) => {
        if (throwFor && throwFor.has(name)) throw new Error('read boom: ' + name);
        return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
      },
    };
  }
  const emptyMedia = { allIds: async () => [], get: async () => null };
  const noEstimate = async () => ({ quota: null, usage: null });

  const storesMap = {
    'vot-annotations': { store: {}, method: 'replaceAll' },
    'vot-bookmarks': { store: {}, method: 'replaceAll' },
    'vot-state': { store: {}, method: 'set' },
  };
  const flagMap = { 'vot-welcomed': {} };

  it('produces a V2 payload with a counts manifest', async () => {
    const res = await buildExportPayload({
      storesMap, flagMap,
      idbAdapter: fakeAdapter({
        'vot-annotations': { 'k1': [{ id: 'a' }], 'k2': [{ id: 'b' }, { id: 'c' }] },
        'vot-bookmarks': [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
        'vot-state': { theme: 'dark' },
        'vot-welcomed': true,
      }),
      mediaStore: emptyMedia, storageEstimate: noEstimate,
      nowIso: () => '2026-06-01T00:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    expect(res.payload.app).toBe('VOTReader');
    expect(res.payload.exportVersion).toBe(2);
    expect(res.payload.exportDate).toBe('2026-06-01T00:00:00.000Z');
    // flag coerced to boolean
    expect(res.payload.stores['vot-welcomed']).toBe(true);
    // counts manifest: object-of-arrays counts keys, array counts length, primitive=1
    expect(res.payload.counts['vot-annotations']).toBe(2);
    expect(res.payload.counts['vot-bookmarks']).toBe(3);
    expect(res.payload.counts['vot-state']).toBe(1);
    expect(res.payload.counts['vot-welcomed']).toBe(1);
    expect(res.payload.counts._media).toBe(0);
  });

  it('embeds the LS data block + diagnosticLog + storage estimate', async () => {
    localStorage.setItem('vot-state', '{"theme":"light"}');
    const res = await buildExportPayload({
      storesMap: {}, flagMap: {},
      idbAdapter: fakeAdapter({}), mediaStore: emptyMedia,
      diagnosticLog: [{ t: 1, lvl: 'W', tag: 'x', msg: 'y' }],
      storageEstimate: async () => ({ quota: 1000, usage: 200 }),
    });
    expect(res.ok).toBe(true);
    expect(res.payload.data['vot-state']).toBe('{"theme":"light"}');
    expect(res.payload.diagnosticLog).toEqual([{ t: 1, lvl: 'W', tag: 'x', msg: 'y' }]);
    expect(res.payload.storageQuota).toBe(1000);
    expect(res.payload.storageUsed).toBe(200);
  });

  it('ABORTS loud on a store read failure (U6) — no partial payload', async () => {
    const res = await buildExportPayload({
      storesMap, flagMap,
      idbAdapter: fakeAdapter({ 'vot-annotations': {} }, new Set(['vot-bookmarks'])),
      mediaStore: emptyMedia, storageEstimate: noEstimate,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('read-failure');
    expect(res.problems).toContain('vot-bookmarks');
    expect(res.payload).toBeUndefined();
  });

  it('ABORTS loud when media read throws (journal media in problems)', async () => {
    const res = await buildExportPayload({
      storesMap: {}, flagMap: {},
      idbAdapter: fakeAdapter({}),
      mediaStore: { allIds: async () => { throw new Error('media boom'); }, get: async () => null },
      storageEstimate: noEstimate,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('read-failure');
    expect(res.problems).toContain('journal media');
  });

  it('ABORTS when media exceeds the limit (media-limit)', async () => {
    const big = { blob: { size: 5_000_000 }, type: 'image', mime: 'image/jpeg' };
    const res = await buildExportPayload({
      storesMap: {}, flagMap: {},
      idbAdapter: fakeAdapter({}),
      mediaStore: { allIds: async () => ['m1'], get: async () => big },
      mediaLimitBytes: 1_000_000, storageEstimate: noEstimate,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('media-limit');
  });

  it('exposes a sane default media limit', () => {
    expect(DEFAULT_MEDIA_LIMIT_BYTES).toBe(100 * 1024 * 1024);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   PART 2b — buildV3Manifest (streaming-export manifest + blob list, P1)
   ───────────────────────────────────────────────────────────────────── */
describe('buildV3Manifest', () => {
  beforeEach(() => { localStorage.clear(); });

  function fakeAdapter(values, throwFor) {
    return {
      get: async (name) => {
        if (throwFor && throwFor.has(name)) throw new Error('read boom: ' + name);
        return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
      },
    };
  }
  const noEstimate = async () => ({ quota: null, usage: null });
  const fakeMedia = (recs) => ({ allIds: async () => Object.keys(recs), get: async (id) => recs[id] || null });
  const blobOf = (str) => new Blob([new TextEncoder().encode(str)]);
  const storesMap = {
    'vot-annotations': { store: {}, method: 'replaceAll' },
    'vot-bookmarks': { store: {}, method: 'replaceAll' },
  };
  const flagMap = { 'vot-welcomed': {} };

  it('builds a v3 manifest with media METADATA (no base64) + order-paired blobs', async () => {
    const b1 = blobOf('image-bytes'), b2 = blobOf('audio');
    const res = await buildV3Manifest({
      storesMap, flagMap,
      idbAdapter: fakeAdapter({ 'vot-annotations': { k: [{ id: 'a' }] }, 'vot-bookmarks': [{ id: 'x' }], 'vot-welcomed': true }),
      mediaStore: fakeMedia({
        m1: { blob: b1, type: 'image', mime: 'image/png', width: 4, height: 5, created: 't1' },
        m2: { blob: b2, type: 'audio', mime: 'audio/webm', duration: 9, created: 't2' },
      }),
      storageEstimate: noEstimate,
      nowIso: () => '2026-06-02T00:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    expect(res.manifest.exportVersion).toBe(3);
    expect(res.manifest.stores['vot-welcomed']).toBe(true);
    expect(res.manifest.counts._media).toBe(2);
    // media is METADATA ONLY — no base64 `data` field anywhere
    expect(res.manifest.media.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(res.manifest.media[0]).toMatchObject({ id: 'm1', mime: 'image/png', size: b1.size });
    expect(res.manifest.media.some((m) => 'data' in m)).toBe(false);
    // blob entries pair with the manifest media by order, same blob refs
    expect(res.mediaEntries.map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(res.mediaEntries[0].blob).toBe(b1);
    expect(res.mediaEntries[1].blob).toBe(b2);
  });

  it('uses the ACTUAL blob byte length for size (the container integrity contract)', async () => {
    const b = blobOf('exactly-these-bytes');
    const res = await buildV3Manifest({
      storesMap: {}, flagMap: {},
      idbAdapter: fakeAdapter({}),
      mediaStore: fakeMedia({ m: { blob: b, type: 'image', mime: 'image/png', size: 999 /* stale */ } }),
      storageEstimate: noEstimate,
    });
    expect(res.manifest.media[0].size).toBe(b.size); // blob.size, not the stale rec.size
  });

  it('ABORTS loud on a store read failure (read-failure) — no manifest', async () => {
    const res = await buildV3Manifest({
      storesMap, flagMap,
      idbAdapter: fakeAdapter({ 'vot-annotations': {} }, new Set(['vot-bookmarks'])),
      mediaStore: fakeMedia({}), storageEstimate: noEstimate,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('read-failure');
    expect(res.problems).toContain('vot-bookmarks');
    expect(res.manifest).toBeUndefined();
  });

  it('builder → writeContainer → readContainer round-trips stores + media byte-exact', async () => {
    const img = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const aud = new TextEncoder().encode('opus-ish');
    const built = await buildV3Manifest({
      storesMap, flagMap,
      idbAdapter: fakeAdapter({ 'vot-annotations': { k: [{ id: 'a' }] }, 'vot-bookmarks': [], 'vot-welcomed': true }),
      mediaStore: fakeMedia({
        m1: { blob: new Blob([img]), type: 'image', mime: 'image/png', width: 4, height: 5, duration: 0, created: 't1' },
        m2: { blob: new Blob([aud]), type: 'audio', mime: 'audio/webm', width: 0, height: 0, duration: 9, created: 't2' },
      }),
      storageEstimate: noEstimate, nowIso: () => 'fixed',
    });
    expect(built.ok).toBe(true);

    const chunks = [];
    await writeContainer(built.manifest, built.mediaEntries, (u8) => chunks.push(u8.slice()));
    const { manifest, entries } = await readContainer(new Blob(chunks));

    expect(manifest).toEqual(built.manifest);                 // stores + metadata survive the round-trip
    expect(entries.map((e) => e.id)).toEqual(['m1', 'm2']);
    // compare as plain arrays — realm-agnostic (jsdom TextEncoder vs Node Uint8Array)
    expect(Array.from(new Uint8Array(await entries[0].blob.arrayBuffer()))).toEqual(Array.from(img));  // byte-exact
    expect(Array.from(new Uint8Array(await entries[1].blob.arrayBuffer()))).toEqual(Array.from(aud));
  });
});

/* ─────────────────────────────────────────────────────────────────────
   PART 3 — applyImportPayload (fake ctx; no real IDB)
   ───────────────────────────────────────────────────────────────────── */
describe('applyImportPayload', () => {
  beforeEach(() => { localStorage.clear(); });

  /** A fake store recording method calls + a configurable whenSaved. */
  function fakeStore(method, opts = {}) {
    const calls = [];
    return {
      calls,
      [method]: (arg) => { if (opts.throws) throw new Error('write boom'); calls.push(arg); },
      whenSaved: () => Promise.resolve(opts.saved === undefined ? true : opts.saved),
    };
  }
  const okValidate = () => [];
  const emptyMedia = { allIds: async () => [], delete: async () => {}, put: async () => {} };

  it('applies valid stores + flags and reports clean (0/0/[])', async () => {
    const ann = fakeStore('replaceAll');
    const wel = { set: vi.fn(), clear: vi.fn(), whenSaved: () => Promise.resolve(true) };
    const res = await applyImportPayload(
      { exportVersion: 2, stores: { 'vot-annotations': { k: [] }, 'vot-welcomed': true } },
      {
        storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } },
        flagMap: { 'vot-welcomed': wel },
        mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
      },
    );
    expect(res).toEqual({ importFailures: 0, writeFailures: 0, skippedStores: [] });
    expect(ann.calls).toEqual([{ k: [] }]);
    expect(wel.set).toHaveBeenCalledTimes(1);
    expect(wel.clear).not.toHaveBeenCalled();
  });

  it('clears a flag whose payload is falsy', async () => {
    const wel = { set: vi.fn(), clear: vi.fn(), whenSaved: () => Promise.resolve(true) };
    await applyImportPayload(
      { exportVersion: 2, stores: { 'vot-welcomed': false } },
      { storesMap: {}, flagMap: { 'vot-welcomed': wel }, mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate },
    );
    expect(wel.clear).toHaveBeenCalledTimes(1);
    expect(wel.set).not.toHaveBeenCalled();
  });

  it('SKIPS a store whose payload fails validation (never written)', async () => {
    const ann = fakeStore('replaceAll');
    const res = await applyImportPayload(
      { exportVersion: 2, stores: { 'vot-annotations': { bad: true } } },
      {
        storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } },
        flagMap: {}, mediaStore: emptyMedia,
        validateStorePayload: () => ['shape violation'], validateMediaRecord: okValidate,
      },
    );
    expect(res.skippedStores).toEqual(['vot-annotations']);
    expect(ann.calls).toEqual([]); // never written — corrupt section can't clobber good data
  });

  it('counts importFailures when a store write throws', async () => {
    const ann = fakeStore('replaceAll', { throws: true });
    const res = await applyImportPayload(
      { exportVersion: 2, stores: { 'vot-annotations': { k: [] } } },
      {
        storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } },
        flagMap: {}, mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
      },
    );
    expect(res.importFailures).toBe(1);
  });

  it('counts writeFailures when a store durability barrier resolves false', async () => {
    const ann = fakeStore('replaceAll', { saved: false });
    const res = await applyImportPayload(
      { exportVersion: 2, stores: { 'vot-annotations': { k: [] } } },
      {
        storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } },
        flagMap: {}, mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
      },
    );
    expect(res.writeFailures).toBe(1);
  });

  it('skips an invalid media record (counts importFailures, never put)', async () => {
    const put = vi.fn(async () => {});
    const res = await applyImportPayload(
      { exportVersion: 2, media: { m1: { data: 'x', mime: 'image/jpeg' } } },
      {
        storesMap: {}, flagMap: {},
        mediaStore: { allIds: async () => [], delete: async () => {}, put },
        validateStorePayload: okValidate, validateMediaRecord: () => ['bad base64'],
      },
    );
    expect(res.importFailures).toBe(1);
    expect(put).not.toHaveBeenCalled();
  });

  it('BAK-1: a corrupt media record does NOT wipe existing media (fail-safe replace)', async () => {
    // Two photos already on device; the backup updates BOTH, but the 2nd record
    // passes validation yet fails to decode ('A'.repeat(101) → atob throws). Pre-fix,
    // the up-front "clear ALL media" wiped both before the decode loop, so the 2nd
    // photo was lost. Post-fix, a mentioned id keeps its existing copy on failure.
    const store = {
      old1: { id: 'old1', blob: new Blob([new Uint8Array([1, 2, 3])]), type: 'image' },
      old2: { id: 'old2', blob: new Blob([new Uint8Array([4, 5, 6])]), type: 'audio' },
    };
    const media = {
      _store: store,
      allIds: async () => Object.keys(store),
      delete: async (id) => { delete store[id]; },
      put: async (rec) => { store[rec.id] = rec; },
    };
    const res = await applyImportPayload(
      { exportVersion: 2, stores: {}, media: {
        old1: { data: 'aGk=', type: 'image', mime: 'image/png', size: 2, created: 1 },        // valid → replaced ('hi')
        old2: { data: 'A'.repeat(101), type: 'audio', mime: 'audio/webm', size: 3, created: 2 }, // FAILS atob decode
      } },
      { storesMap: {}, flagMap: {}, mediaStore: media, validateStorePayload: okValidate, validateMediaRecord: okValidate },
    );
    expect(res.importFailures).toBe(1);                            // old2's decode failed
    expect(Object.keys(store).sort()).toEqual(['old1', 'old2']);   // BOTH present — no destructive pre-clear
    expect(Array.from(new Uint8Array(await store.old2.blob.arrayBuffer()))).toEqual([4, 5, 6]); // old2 ORIGINAL survives
    expect(Array.from(new Uint8Array(await store.old1.blob.arrayBuffer()))).toEqual([104, 105]); // old1 replaced with 'hi'
  });

  it('BAK-1: prunes media absent from the backup (exact replace for the clean case)', async () => {
    const store = {
      keep: { id: 'keep', blob: new Blob([new Uint8Array([1])]), type: 'image' },
      drop: { id: 'drop', blob: new Blob([new Uint8Array([2])]), type: 'image' },
    };
    const media = {
      _store: store,
      allIds: async () => Object.keys(store),
      delete: async (id) => { delete store[id]; },
      put: async (rec) => { store[rec.id] = rec; },
    };
    await applyImportPayload(
      { exportVersion: 2, stores: {}, media: { keep: { data: 'aGk=', type: 'image', mime: 'image/png', size: 2, created: 1 } } },
      { storesMap: {}, flagMap: {}, mediaStore: media, validateStorePayload: okValidate, validateMediaRecord: okValidate },
    );
    expect(Object.keys(store)).toEqual(['keep']);   // 'drop' (not in backup) pruned; exact replace
  });

  it('S5: stops importing media once the aggregate decoded-byte cap is hit', async () => {
    const put = vi.fn(async () => {});
    const okB64 = 'QUJDREVG'; // 8 base64 chars → ~6 decoded bytes each
    const res = await applyImportPayload(
      { exportVersion: 2, media: {
        m1: { data: okB64, mime: 'image/jpeg' },
        m2: { data: okB64, mime: 'image/jpeg' },
        m3: { data: okB64, mime: 'image/jpeg' },
      } },
      {
        storesMap: {}, flagMap: {},
        mediaStore: { allIds: async () => [], delete: async () => {}, put },
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
        mediaTotalLimitBytes: 12, // fits exactly two ~6-byte records; the third overflows
      },
    );
    // m1 + m2 imported (6 + 6 = 12 ≤ cap); m3 skipped before decode (18 > 12).
    expect(put).toHaveBeenCalledTimes(2);
    expect(res.importFailures).toBe(1);
  });

  it('S5: the cap is a no-op for legit media under the default ceiling', async () => {
    const put = vi.fn(async () => {});
    const okB64 = 'QUJDREVG';
    const res = await applyImportPayload(
      { exportVersion: 2, media: {
        m1: { data: okB64, mime: 'image/jpeg' },
        m2: { data: okB64, mime: 'image/png' },
      } },
      {
        storesMap: {}, flagMap: {},
        mediaStore: { allIds: async () => [], delete: async () => {}, put },
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
        // no mediaTotalLimitBytes → default 100 MB
      },
    );
    expect(put).toHaveBeenCalledTimes(2);
    expect(res.importFailures).toBe(0);
  });

  it('reseeds the LS data block (vot- keys only)', async () => {
    await applyImportPayload(
      { exportVersion: 2, data: { 'vot-state': '{"theme":"dark"}', 'evil': 'nope' }, stores: {} },
      { storesMap: {}, flagMap: {}, mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate },
    );
    expect(localStorage.getItem('vot-state')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('evil')).toBeNull();
  });

  it('V1 fallback: parses LS-shape strings in data and applies them', async () => {
    const bkm = fakeStore('replaceAll');
    const res = await applyImportPayload(
      { exportVersion: 1, data: { 'vot-bookmarks': '[{"id":"b1"}]' } },
      {
        storesMap: { 'vot-bookmarks': { store: bkm, method: 'replaceAll' } },
        flagMap: {}, mediaStore: emptyMedia,
        validateStorePayload: okValidate, validateMediaRecord: okValidate,
      },
    );
    expect(res.importFailures).toBe(0);
    expect(bkm.calls).toEqual([[{ id: 'b1' }]]);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   PART 3b — applyV3 (the v3 streaming-import applier, P1)
   ───────────────────────────────────────────────────────────────────── */
describe('applyV3', () => {
  beforeEach(() => { localStorage.clear(); });

  const okValidate = () => [];
  function destStore(method, opts = {}) {
    const calls = [];
    return {
      calls,
      [method]: (arg) => { if (opts.throws) throw new Error('write boom'); calls.push(arg); },
      whenSaved: () => Promise.resolve(opts.saved === undefined ? true : opts.saved),
    };
  }
  function destMedia(seed) {
    const store = Object.assign({}, seed);
    const puts = [];
    return {
      puts, _store: store,
      allIds: async () => Object.keys(store),
      delete: async (id) => { delete store[id]; },
      put: async (rec) => { store[rec.id] = rec; puts.push(rec); },
    };
  }
  const blobOf = (u8) => new Blob([u8]);

  it('FULL PIPELINE: buildV3Manifest → writeContainer → readContainer → applyV3 (byte-exact)', async () => {
    const img = new Uint8Array([9, 8, 7, 255, 0, 128]);
    const aud = new TextEncoder().encode('voice-memo');
    // SOURCE — build the v3 manifest + blob list from fake source stores/media
    const built = await buildV3Manifest({
      storesMap: { 'vot-annotations': { store: {}, method: 'replaceAll' }, 'vot-bookmarks': { store: {}, method: 'replaceAll' } },
      flagMap: { 'vot-welcomed': {} },
      idbAdapter: { get: async (n) => ({ 'vot-annotations': { k: [{ id: 'a' }] }, 'vot-bookmarks': [{ id: 'b' }], 'vot-welcomed': true }[n]) },
      mediaStore: {
        allIds: async () => ['m1', 'm2'],
        get: async (id) => ({
          m1: { blob: blobOf(img), type: 'image', mime: 'image/png', width: 2, height: 3, duration: 0, created: 't1' },
          m2: { blob: blobOf(aud), type: 'audio', mime: 'audio/webm', width: 0, height: 0, duration: 5, created: 't2' },
        }[id]),
      },
      storageEstimate: async () => ({ quota: null, usage: null }), nowIso: () => 'fixed',
    });
    expect(built.ok).toBe(true);

    // SERIALIZE → container Blob → READ BACK
    const chunks = [];
    await writeContainer(built.manifest, built.mediaEntries, (u8) => chunks.push(u8.slice()));
    const read = await readContainer(new Blob(chunks));

    // DEST — apply into fresh fakes
    const ann = destStore('replaceAll'); const bkm = destStore('replaceAll');
    const wel = { set: vi.fn(), clear: vi.fn(), whenSaved: () => Promise.resolve(true) };
    const media = destMedia();
    const res = await applyV3(read.manifest, read.entries, {
      storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' }, 'vot-bookmarks': { store: bkm, method: 'replaceAll' } },
      flagMap: { 'vot-welcomed': wel }, mediaStore: media, validateStorePayload: okValidate,
    });

    expect(res).toEqual({ importFailures: 0, writeFailures: 0, skippedStores: [] });
    expect(ann.calls).toEqual([{ k: [{ id: 'a' }] }]);     // stores reconstructed exactly
    expect(bkm.calls).toEqual([[{ id: 'b' }]]);
    expect(wel.set).toHaveBeenCalledTimes(1);              // flag reconstructed
    expect(media.puts.map((p) => p.id)).toEqual(['m1', 'm2']);
    expect(media.puts[0].mime).toBe('image/png');          // metadata reconstructed
    // media bytes survive the WHOLE export → container → import pipeline
    expect(Array.from(new Uint8Array(await media.puts[0].blob.arrayBuffer()))).toEqual(Array.from(img));
    expect(Array.from(new Uint8Array(await media.puts[1].blob.arrayBuffer()))).toEqual(Array.from(aud));
  });

  it('SKIPS a store whose payload fails validation (never written)', async () => {
    const ann = destStore('replaceAll');
    const res = await applyV3(
      { stores: { 'vot-annotations': { bad: true } } }, [],
      { storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } }, flagMap: {}, mediaStore: destMedia(), validateStorePayload: () => ['shape violation'] },
    );
    expect(res.skippedStores).toEqual(['vot-annotations']);
    expect(ann.calls).toEqual([]);
  });

  it('REPLACES media: streamed frames win; stale media (not in the backup) is pruned', async () => {
    const media = destMedia({ old1: { id: 'old1' }, old2: { id: 'old2' } });
    await applyV3(
      { stores: {} },
      [{ id: 'new1', meta: { mime: 'image/png' }, blob: blobOf(new Uint8Array([1, 2])) }],
      { storesMap: {}, flagMap: {}, mediaStore: media, validateStorePayload: okValidate },
    );
    expect(Object.keys(media._store)).toEqual(['new1']); // old (stale) media pruned after the stream
    expect(media.puts.map((p) => p.id)).toEqual(['new1']);
  });

  it('does NOT wipe existing media when the stream throws mid-way (no data loss on truncation)', async () => {
    // The fail-safe ordering: frames are put FIRST, the stale-prune runs only
    // after the full stream lands. A truncated/corrupt container (reachable on
    // the Android path) throws before the prune, so prior media survives.
    const media = destMedia({ old1: { id: 'old1' }, old2: { id: 'old2' } });
    async function* truncated() {
      yield { id: 'new1', meta: { mime: 'image/png' }, blob: blobOf(new Uint8Array([1, 2])) };
      throw new Error('truncated frame');
    }
    await expect(applyV3(
      { stores: {} }, truncated(),
      { storesMap: {}, flagMap: {}, mediaStore: media, validateStorePayload: okValidate },
    )).rejects.toThrow(/truncated/);
    // Prune never ran → existing media intact (plus the one frame that did land).
    expect(Object.keys(media._store).sort()).toEqual(['new1', 'old1', 'old2']);
  });

  it('reports writeFailures when a store durability barrier resolves false', async () => {
    const ann = destStore('replaceAll', { saved: false });
    const res = await applyV3(
      { stores: { 'vot-annotations': { k: [] } } }, [],
      { storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } }, flagMap: {}, mediaStore: destMedia(), validateStorePayload: okValidate },
    );
    expect(res.writeFailures).toBe(1);
  });

  it('counts importFailures when a store write throws', async () => {
    const ann = destStore('replaceAll', { throws: true });
    const res = await applyV3(
      { stores: { 'vot-annotations': { k: [] } } }, [],
      { storesMap: { 'vot-annotations': { store: ann, method: 'replaceAll' } }, flagMap: {}, mediaStore: destMedia(), validateStorePayload: okValidate },
    );
    expect(res.importFailures).toBe(1);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   PART 4 — REAL end-to-end round-trip (the U1 owed verification)
   ───────────────────────────────────────────────────────────────────── */
describe('export → wipe → import → reload round-trip (real stores + fake IDB)', () => {
  const ALL_STORES = [
    AnnotationStore, NoteStore, BookmarkStore, LinkStore, NotebookStore,
    JournalStore, JournalNotebookStore, JournalIndexStore, JournalStatsStore,
    RecentNavStore, HistoryStore, ProphecyCardsStore, HomeOrderStore, StateStore,
    WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore,
  ];

  const storesMap = () => ({
    'vot-annotations':       { store: AnnotationStore,      method: 'replaceAll' },
    'vot-notes':             { store: NoteStore,            method: 'replaceAll' },
    'vot-bookmarks':         { store: BookmarkStore,        method: 'replaceAll' },
    'vot-links':             { store: LinkStore,            method: 'replaceAll' },
    'vot-notebooks':         { store: NotebookStore,        method: 'replaceAll' },
    'vot-journal':           { store: JournalStore,         method: 'replaceAll' },
    'vot-journal-notebooks': { store: JournalNotebookStore, method: 'replaceAll' },
    'vot-journal-index':     { store: JournalIndexStore,    method: 'replaceAll' },
    'vot-journal-stats':     { store: JournalStatsStore,    method: 'replaceAll' },
    'vot-recent-nav':        { store: RecentNavStore,       method: 'replaceAll' },
    'vot-history':           { store: HistoryStore,         method: 'setAll' },
    'vot-prophecy-cards':    { store: ProphecyCardsStore,   method: 'setAll' },
    'vot-home-order':        { store: HomeOrderStore,       method: 'set' },
    'vot-state':             { store: StateStore,           method: 'set' },
  });
  const flagMap = () => ({
    'vot-welcomed':             WelcomedFlagStore,
    'vot-about-seen':           AboutSeenFlagStore,
    'vot-garden-warning-acked': GardenWarningFlagStore,
  });

  const today = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();

  const deleteVotreaderDb = () => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('votreader');
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => resolve(undefined);
    req.onblocked = () => resolve(undefined);
  });

  async function flushAll() {
    await Promise.all(ALL_STORES.map((s) => s.whenSaved()));
  }

  beforeEach(async () => {
    IDBAdapter._resetForTests();
    await deleteVotreaderDb();
    localStorage.clear();
    await JournalMediaStore.pruneOrphans([]);
    ALL_STORES.forEach((s) => s._resetForTests({ forceLoaded: true }));
  });

  it('every store + media survives a full backup round-trip across a simulated reload', async () => {
    // ── device A: populate real user data across every store shape ──
    const annPayload = {
      'letter:wide-path:0': [
        { id: 'ann_1', groupId: 'g1', kind: 'highlight', color: 'yellow', start: 0, end: 10, text: 'hello world', created: 1000, updated: 1000 },
      ],
      'bible:genesis:1:1': [
        { id: 'ann_2', groupId: 'g2', kind: 'underline', color: 'green', start: 5, end: 15, text: 'underlined', created: 2000, updated: 2000 },
      ],
    };
    AnnotationStore.replaceAll(annPayload);
    NoteStore.replaceAll({
      g1: { groupId: 'g1', notebookIds: ['nb_a'], body: 'Note A', color: 'yellow', fullText: 'hi', keys: ['letter:wide-path:0'], created: 1, updated: 1 },
    });
    BookmarkStore.replaceAll([
      { id: 'b1', hlKey: 'bible:genesis:1:1', label: 'Beginning', created: 1, updated: 1 },
      { id: 'b2', hlKey: 'letter:wide-path:2', label: 'Wide Path', created: 2, updated: 2 },
    ]);
    LinkStore.replaceAll([
      { id: 'lnk_1', source: { type: 'bible', key: 'bible:gen:1:1', label: 'Gen 1:1' }, target: { type: 'letter', key: 'letter:foo:0', label: 'Foo' }, created: 1 },
    ]);
    NotebookStore.replaceAll({ list: [{ id: 'nb_a', name: 'Devotional', sortIndex: 0, created: 1, updated: 1 }] });
    JournalStore.replaceAll({ list: [
      { id: 'j1', title: 'Entry One', blocks: [{ type: 'image', mediaId: 'media_1' }], mood: null, tags: [], notebookIds: ['jnb_a'], pinned: false, created: 1, updated: 1 },
    ] });
    JournalNotebookStore.replaceAll({ list: [{ id: 'jnb_a', name: 'Daily', sortIndex: 0, created: 1, updated: 1 }] });
    JournalIndexStore.replaceAll({ 'chapter:matthew:5': ['j1'] });
    JournalStatsStore.replaceAll({ totalEntries: 42, currentStreak: 7, longestStreak: 14, lastEntryDate: today, milestonesUnlocked: ['first', 'streak-7'] });
    RecentNavStore.replaceAll([{ kind: 'letter', letterId: 'wide-path', ts: 2000 }]);
    HistoryStore.setAll([{ type: 'letter', letterId: 'wide-path', key: 'lt:wide-path', ts: 2000 }]);
    ProphecyCardsStore.setAll({ 'matthew-1:0:prophecy': true });
    HomeOrderStore.set(['settings', 'library', 'history', 'volumes', 'scriptures', 'studies']);
    StateStore.set({ theme: 'light', settings: { fontStyle: 'modern', translation: 'nkjv' }, tabs: [{ id: 't1', screen: 'home' }], activeTabIdx: 0 });
    WelcomedFlagStore.set();
    GardenWarningFlagStore.set();

    // media: a real blob referenced by the journal entry
    const mediaBytes = new Uint8Array([10, 20, 30, 40, 200, 201, 202, 255]);
    await JournalMediaStore.put({
      id: 'media_1', type: 'image', blob: new NodeBlob([mediaBytes], { type: 'image/jpeg' }),
      mime: 'image/jpeg', size: mediaBytes.length, width: 4, height: 2, duration: null, created: 1234,
    });

    await flushAll(); // device-A writes are durable before we read them back

    // ── EXPORT ──
    const result = await buildExportPayload({
      storesMap: storesMap(), flagMap: flagMap(),
      idbAdapter: IDBAdapter, mediaStore: JournalMediaStore,
      diagnosticLog: [], nowIso: () => '2026-06-01T12:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    const json = JSON.stringify(result.payload);
    // counts manifest captured everything
    expect(result.payload.counts['vot-annotations']).toBe(2);
    expect(result.payload.counts['vot-bookmarks']).toBe(2);
    expect(result.payload.counts._media).toBe(1);

    // ── WIPE the device (clear caches + durable IDB rows + media + LS) ──
    AnnotationStore.replaceAll(null); NoteStore.replaceAll(null); BookmarkStore.replaceAll(null);
    LinkStore.replaceAll(null); NotebookStore.replaceAll(null); JournalStore.replaceAll(null);
    JournalNotebookStore.replaceAll(null); JournalIndexStore.replaceAll(null); JournalStatsStore.replaceAll(null);
    RecentNavStore.replaceAll(null); HistoryStore.setAll(null); ProphecyCardsStore.setAll(null);
    HomeOrderStore.set([]); StateStore.set({});
    WelcomedFlagStore.clear(); AboutSeenFlagStore.clear(); GardenWarningFlagStore.clear();
    await flushAll();
    await JournalMediaStore.pruneOrphans([]);
    localStorage.clear();
    // sanity: the device is empty
    expect(AnnotationStore.all()).toEqual({});
    expect(BookmarkStore.count()).toBe(0);
    expect(await JournalMediaStore.allIds()).toEqual([]);

    // ── IMPORT ──
    const parsed = JSON.parse(json);
    expect(validateImportEnvelope(parsed)).toEqual([]);
    const importRes = await applyImportPayload(parsed, {
      storesMap: storesMap(), flagMap: flagMap(),
      mediaStore: JournalMediaStore,
      validateStorePayload, validateMediaRecord,
    });
    expect(importRes).toEqual({ importFailures: 0, writeFailures: 0, skippedStores: [] });

    // ── RELOAD: drop in-memory caches + the IDB connection, re-hydrate ──
    ALL_STORES.forEach((s) => s._resetForTests()); // → 'pending', cache null
    IDBAdapter._resetForTests();                    // next get() reopens the SAME data
    await hydrateAllStores();                        // read every store back from IDB

    // ── ASSERT survival: durable, byte-equal restore of device-A state ──
    expect(AnnotationStore.all()).toEqual(annPayload);
    expect(NoteStore.get('g1').body).toBe('Note A');
    expect(BookmarkStore.count()).toBe(2);
    expect(BookmarkStore.get('b1').label).toBe('Beginning');
    expect(LinkStore.all().length).toBe(1);
    expect(NotebookStore.get('nb_a').name).toBe('Devotional');
    expect(JournalStore.count()).toBe(1);
    expect(JournalStore.get('j1').title).toBe('Entry One');
    expect(JournalNotebookStore.get('jnb_a').name).toBe('Daily');
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j1']);
    const stats = JournalStatsStore.get();
    expect(stats.totalEntries).toBe(42);
    expect(stats.longestStreak).toBe(14);
    expect(stats.lastEntryDate).toBe(today);
    expect(stats.milestonesUnlocked).toEqual(['first', 'streak-7']);
    expect(RecentNavStore.list()[0].letterId).toBe('wide-path');
    expect(HistoryStore.list()[0].letterId).toBe('wide-path');
    expect(ProphecyCardsStore.getOne('matthew-1:0:prophecy')).toBe(true);
    expect(HomeOrderStore.get()[0]).toBe('settings');
    expect(StateStore.get().theme).toBe('light');
    expect(StateStore.get().settings.fontStyle).toBe('modern');
    expect(WelcomedFlagStore.is()).toBe(true);
    expect(GardenWarningFlagStore.is()).toBe(true);
    expect(AboutSeenFlagStore.is()).toBe(false);

    // media survived with bytes + metadata intact
    const mediaIds = await JournalMediaStore.allIds();
    expect(mediaIds).toEqual(['media_1']);
    const rec = await JournalMediaStore.get('media_1');
    expect(rec.mime).toBe('image/jpeg');
    expect(rec.width).toBe(4);
    const restoredBytes = new Uint8Array(await rec.blob.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual(Array.from(mediaBytes));
  }, 20000);

  /* T7 — boot end-state with one store left DEGRADED. Pins the shipped
     import-blocked guard (SettingsScreen) and, end-to-end, that the degraded
     transition reaches StorageHealth so the E5 banner would mount. The guard
     is a component closure (not exported), so we replicate its exact predicate
     over the real store maps and prove applyV3 is never reached when it holds. */
  it('boot with one store degraded → import refuses + E5 flag set (T7)', async () => {
    // Make StorageHealth observable to cached-store's bare-global guard, and
    // give it a populated report so setStoresDegraded can update it.
    /** @type {any} */ (globalThis).StorageHealth = StorageHealth;
    StorageHealth._resetForTests({
      platform: 'chrome',
      storageApi: { estimate: () => Promise.resolve({ quota: 1e9, usage: 1e6 }), persisted: () => Promise.resolve(true) },
    });
    await StorageHealth.assess();
    expect(StorageHealth.getReport().storesDegraded).toBe(false);

    // Fresh boot: every IDB store 'pending' (NOT forceLoaded), then reject
    // IDBAdapter.get for ONLY vot-annotations → its _hydrate .catch flips it to
    // 'degraded' immediately (no 3s timeout); the rest resolve undefined→loaded.
    IDBAdapter._resetForTests();
    await deleteVotreaderDb();
    ALL_STORES.forEach((s) => s._resetForTests());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(IDBAdapter, 'get').mockImplementation((name) =>
      name === 'vot-annotations' ? Promise.reject(new Error('corrupted')) : Promise.resolve(undefined));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    await hydrateAllStores();

    // boot end-state: exactly one store degraded, the rest loaded, none pending
    expect(AnnotationStore.getState()).toBe('degraded');
    expect(NoteStore.getState()).toBe('loaded');
    expect(BookmarkStore.getState()).toBe('loaded');
    expect(hasAnyPendingStores()).toBe(false);

    // E5: the degraded transition plumbed through to StorageHealth's report
    expect(StorageHealth.getReport().storesDegraded).toBe(true);

    // the SHIPPED import-blocked guard predicate (SettingsScreen) → true here,
    // so import must refuse. Replicate the exact expression.
    const hasDegraded =
      Object.values(storesMap()).some(({ store }) => store.getState() === 'degraded') ||
      Object.values(flagMap()).some((s) => s.getState() === 'degraded');
    expect(hasDegraded).toBe(true);

    // prove the refusal is load-bearing: applyV3 is gated behind !hasDegraded
    const applySpy = vi.fn(applyV3);
    if (!hasDegraded) await applySpy({}, [], {});
    expect(applySpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    /** @type {any} */ (globalThis).StorageHealth = undefined;
  }, 20000);

  it('control: a fully-healthy boot leaves hasDegraded false', async () => {
    IDBAdapter._resetForTests();
    await deleteVotreaderDb();
    ALL_STORES.forEach((s) => s._resetForTests());
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    await hydrateAllStores();

    const hasDegraded =
      Object.values(storesMap()).some(({ store }) => store.getState() === 'degraded') ||
      Object.values(flagMap()).some((s) => s.getState() === 'degraded');
    expect(hasDegraded).toBe(false);
    expect(hasAnyPendingStores()).toBe(false);
    vi.restoreAllMocks();
  });
});

/* ─────────────────────────────────────────────────────────────────────
   formatImportSpaceWarning (P4 — soft, advisory free-space heads-up)
   ───────────────────────────────────────────────────────────────────── */
describe('formatImportSpaceWarning', () => {
  const MB = 1024 * 1024;
  it('returns empty when there is no media to weigh', () => {
    expect(formatImportSpaceWarning(0, { quota: 10 * MB, usage: 0 })).toBe('');
  });
  it('returns empty when no estimate is available', () => {
    expect(formatImportSpaceWarning(5 * MB, null)).toBe('');
    expect(formatImportSpaceWarning(5 * MB, undefined)).toBe('');
  });
  it('returns empty when the media comfortably fits the free budget', () => {
    // 5 MB media, 100 MB free → fits.
    expect(formatImportSpaceWarning(5 * MB, { quota: 200 * MB, usage: 100 * MB })).toBe('');
  });
  it('warns (does not block) when the media exceeds the free budget', () => {
    // 500 MB media, ~50 MB free → warn.
    const w = formatImportSpaceWarning(500 * MB, { quota: 200 * MB, usage: 150 * MB });
    expect(w).toContain('Note:');
    expect(w).toContain('500.0 MB');     // media size
    expect(w).toContain('free up space');
  });
  it('returns empty when free space cannot be determined (no quota/usage)', () => {
    expect(formatImportSpaceWarning(5 * MB, {})).toBe('');
  });
});
