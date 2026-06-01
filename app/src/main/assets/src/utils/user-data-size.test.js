// @ts-nocheck — test injects fake IDBAdapter / JournalMediaStore globals
/* user-data-size — measureUserData()
   ────────────────────────────────────────────────────────────────
   measureUserData() reads two globals at call time: IDBAdapter (the
   main `votreader` DB accessor) and JournalMediaStore (journal blob
   metadata). Both are window globals in production (bundle-b). The
   tests inject minimal fakes on globalThis so we can assert the
   summing logic without spinning up fake-indexeddb.

   What's under test is the CONTRACT that backs the Settings "Your
   data" number:
     - structured = sum of UTF-8 JSON byte-length across the
       USER_DATA_STORES set (the same set Export backs up).
     - media = sum of JournalMediaStore blob sizes (images + audio).
     - a failed store read contributes 0, never rejects the whole
       measurement (a single degraded store can't blank the number).
     - Garden / search-cache / thumbnails are NOT in USER_DATA_STORES,
       so they can never inflate "your data".
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { measureUserData, USER_DATA_STORES } from './user-data-size.js';

/** @type {any} */
const realIDB = globalThis.IDBAdapter;
/** @type {any} */
const realJMS = globalThis.JournalMediaStore;

afterEach(() => {
  /** @type {any} */ (globalThis).IDBAdapter = realIDB;
  /** @type {any} */ (globalThis).JournalMediaStore = realJMS;
});

/** Install a fake IDBAdapter whose get(name,'v') returns values[name]. */
function fakeStores(values, opts = {}) {
  /** @type {any} */ (globalThis).IDBAdapter = {
    get: (name, _key) => {
      if (opts.throwFor && opts.throwFor.includes(name)) {
        return Promise.reject(new Error('degraded store ' + name));
      }
      return Promise.resolve(Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined);
    },
  };
}

/** Install a fake JournalMediaStore.list() returning the given metas. */
function fakeMedia(metas, opts = {}) {
  /** @type {any} */ (globalThis).JournalMediaStore = {
    list: () => opts.throws ? Promise.reject(new Error('media degraded')) : Promise.resolve(metas),
  };
}

describe('measureUserData — structured stores', () => {
  beforeEach(() => { fakeMedia([]); });

  it('sums UTF-8 JSON byte-length across stores with values', async () => {
    const ann = { 'a:1': [{ t: 'x' }] };       // some annotation-shaped value
    const notes = { 'n:1': { text: 'hello' } };
    fakeStores({ 'vot-annotations': ann, 'vot-notes': notes });

    const r = await measureUserData();
    const expected = new TextEncoder().encode(JSON.stringify(ann)).length
                   + new TextEncoder().encode(JSON.stringify(notes)).length;
    expect(r.structured).toBe(expected);
    expect(r.media).toBe(0);
    expect(r.total).toBe(expected);
  });

  it('treats undefined / null store values as 0 bytes', async () => {
    fakeStores({ 'vot-annotations': undefined, 'vot-notes': null });
    const r = await measureUserData();
    expect(r.structured).toBe(0);
    expect(r.total).toBe(0);
  });

  it('a throwing (degraded) store contributes 0 rather than rejecting', async () => {
    const notes = { 'n:1': { text: 'survives' } };
    fakeStores({ 'vot-annotations': { huge: 'ignored' }, 'vot-notes': notes }, { throwFor: ['vot-annotations'] });
    const r = await measureUserData();
    // annotations threw → 0; notes still counted.
    expect(r.structured).toBe(new TextEncoder().encode(JSON.stringify(notes)).length);
  });

  it('counts multi-byte UTF-8 content by bytes, not characters', async () => {
    const v = { s: '— … 你好' };                // each non-ASCII char is >1 byte
    fakeStores({ 'vot-state': v });
    const r = await measureUserData();
    expect(r.structured).toBe(new TextEncoder().encode(JSON.stringify(v)).length);
    expect(r.structured).toBeGreaterThan(JSON.stringify(v).length); // bytes > chars
  });
});

describe('measureUserData — journal media', () => {
  beforeEach(() => { fakeStores({}); });

  it('sums blob sizes from JournalMediaStore.list() metadata', async () => {
    fakeMedia([
      { id: 'm1', type: 'image', size: 150000 },
      { id: 'm2', type: 'audio', size: 320000 },
    ]);
    const r = await measureUserData();
    expect(r.media).toBe(470000);
    expect(r.mediaCount).toBe(2);
    expect(r.total).toBe(470000); // structured is 0 (empty stores)
  });

  it('tolerates media metas missing a size field (counts 0 for them)', async () => {
    fakeMedia([{ id: 'm1', type: 'image' }, { id: 'm2', type: 'audio', size: 1000 }]);
    const r = await measureUserData();
    expect(r.media).toBe(1000);
    expect(r.mediaCount).toBe(2);
  });

  it('a throwing JournalMediaStore.list() contributes 0 media, never rejects', async () => {
    fakeMedia([], { throws: true });
    const r = await measureUserData();
    expect(r.media).toBe(0);
    expect(r.mediaCount).toBe(0);
  });

  it('total = structured + media', async () => {
    fakeStores({ 'vot-notes': { a: 1 } });
    fakeMedia([{ id: 'm1', type: 'image', size: 2048 }]);
    const r = await measureUserData();
    expect(r.total).toBe(r.structured + r.media);
    expect(r.media).toBe(2048);
    expect(r.structured).toBeGreaterThan(0);
  });
});

describe('USER_DATA_STORES — the backed-up set', () => {
  it('includes the core user-content stores', async () => {
    for (const name of [
      'vot-annotations', 'vot-notes', 'vot-bookmarks', 'vot-links',
      'vot-notebooks', 'vot-journal', 'vot-history', 'vot-state',
    ]) {
      expect(USER_DATA_STORES).toContain(name);
    }
  });

  it('EXCLUDES app-data caches (garden / search / thumbs) so they never inflate "your data"', () => {
    expect(USER_DATA_STORES).not.toContain('vot-garden-cache');
    expect(USER_DATA_STORES).not.toContain('vot-search-cache');
    expect(USER_DATA_STORES).not.toContain('vot-thumbs');
  });
});
