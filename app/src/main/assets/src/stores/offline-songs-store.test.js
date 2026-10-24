// @ts-nocheck — node:buffer has no type definitions here (journal-media-store.test.js does the same)
/* id-datasafe 246 (L5.1): every song test replaced OfflineSongsStore with a stub, so the store
   itself never met IndexedDB. Here it runs on fake-indexeddb through the real IDBAdapter: a kept
   song comes back with its bytes, records this build did not write are left out, a bad id is
   refused on the way in and ignored on the way out, and delete removes only its own song. */

import { Blob as NodeBlob } from 'node:buffer';
// Node's Blob, so fake-indexeddb's structured clone keeps the bytes (journal-media-store.test.js).
/** @type {any} */ (globalThis).Blob = NodeBlob;

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBAdapter } from './idb-adapter.js';
import { OfflineSongsStore } from './offline-songs-store.js';

async function resetIdb() {
  IDBAdapter._resetForTests();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDBAdapter.DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => resolve(undefined);
    req.onblocked = () => resolve(undefined);
  });
}

beforeEach(resetIdb);
afterEach(resetIdb);

const ID_A = '0123456789ab';
const ID_B = 'ba9876543210';
const song = (id, text) => {
  const blob = new Blob([text], { type: 'audio/mpeg' });
  return { id, blob, bytes: blob.size, sha256: 'f'.repeat(64), keptAt: 1760000000000 };
};

describe('OfflineSongsStore on IndexedDB', () => {
  it('keeps a song and hands back its bytes', async () => {
    await OfflineSongsStore.put(song(ID_A, 'mp3 bytes of A'));
    const got = await OfflineSongsStore.get(ID_A);
    expect(got).toMatchObject({ id: ID_A, bytes: 14, sha256: 'f'.repeat(64), keptAt: 1760000000000 });
    expect(await got.blob.text()).toBe('mp3 bytes of A');
    expect(got.blob.type).toBe('audio/mpeg');
    expect((await OfflineSongsStore.all()).map((s) => s.id)).toEqual([ID_A]);
  });

  it('leaves out records this build did not write, and keeps them on disk', async () => {
    await OfflineSongsStore.put(song(ID_A, 'a'));
    await IDBAdapter.put(OfflineSongsStore.STORE, ID_B, { id: ID_B, bytes: 3 });            // no blob
    await IDBAdapter.put(OfflineSongsStore.STORE, 'not-an-id', { id: 'not-an-id', blob: new Blob(['x']), bytes: 1 });
    expect((await OfflineSongsStore.all()).map((s) => s.id)).toEqual([ID_A]);
    expect(await OfflineSongsStore.get(ID_B)).toBeNull();
    expect(await IDBAdapter.get(OfflineSongsStore.STORE, ID_B)).toEqual({ id: ID_B, bytes: 3 });  // not deleted
  });

  it('refuses a bad id or missing bytes on the way in', async () => {
    await expect(OfflineSongsStore.put(song('XYZ', 'a'))).rejects.toThrow(/not a song id/);
    await expect(OfflineSongsStore.put({ ...song(ID_A, 'a'), blob: /** @type {any} */ ('a') })).rejects.toThrow(/no song bytes/);
    await expect(OfflineSongsStore.put({ ...song(ID_A, 'a'), bytes: 0 })).rejects.toThrow(/no song bytes/);
    expect(await OfflineSongsStore.all()).toEqual([]);
    expect(await OfflineSongsStore.get('../meta')).toBeNull();
  });

  it('delete removes only its own song; a bad id deletes nothing', async () => {
    await OfflineSongsStore.put(song(ID_A, 'a'));
    await OfflineSongsStore.put(song(ID_B, 'b'));
    await OfflineSongsStore.delete('');
    await OfflineSongsStore.delete(ID_A);
    expect((await OfflineSongsStore.all()).map((s) => s.id)).toEqual([ID_B]);
  });
});
