/* ds5 s10.3: a CachedStore built with { idb: true } whose store name is not in
   IDBAdapter.STORE_NAMES has no object store to hydrate from: it degrades at the
   timeout and queues every write for the session, with nothing said. Every
   IDB-backed store in this folder must be listed, and an unlisted one warns once
   when it is built. */
import { describe, it, expect, vi } from 'vitest';
import { CachedStore } from './cached-store.js';
import { IDBAdapter } from './idb-adapter.js';
import { DiagnosticLog } from '../utils/diagnostic-log.js';

const modules = /** @type {Record<string, Record<string, any>>} */ (/** @type {any} */ (import.meta).glob(['./*.js', '!./*.test.js'], { eager: true }));

describe('every IDB-backed store is in STORE_NAMES (ds5 s10.3)', () => {
  const stores = [];
  for (const [file, mod] of Object.entries(modules)) {
    for (const [name, v] of Object.entries(mod)) {
      if (v && typeof v === 'object' && v._idb === true && typeof v._idbStoreName === 'string') stores.push([file + ' ' + name, v._idbStoreName]);
    }
  }

  it('finds the IDB-backed stores', () => {
    expect(stores.length).toBeGreaterThan(15);
  });

  it.each(stores)('%s: its store name %s is listed', (_label, storeName) => {
    expect(IDBAdapter.STORE_NAMES).toContain(storeName);
  });

  it('a store built with a name missing from STORE_NAMES warns once', () => {
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    CachedStore('vot-ds5-unlisted', {}, { idb: true, hydrationTimeoutMs: 1e9 });
    CachedStore('vot-ds5-unlisted', {}, { idb: true, hydrationTimeoutMs: 1e9 });
    const hits = warn.mock.calls.filter((c) => String(c[1]).includes('vot-ds5-unlisted'));
    expect(hits).toHaveLength(1);
    warn.mockRestore();
  });
});
