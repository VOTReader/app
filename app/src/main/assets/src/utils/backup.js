/* Backup data plane — export-payload build + import-apply (U1/U14).
   ──────────────────────────────────────────────────────────────────
   Export/Import is the ONLY backup mechanism in VOTReader
   (allowBackup=false, no cloud sync, no account). Per
   [[user-data-paramount]] this is one of the most load-bearing
   surfaces in the codebase, so the DATA path is extracted here as
   pure, dependency-injected functions that can be exercised
   end-to-end against the real stores + a fake IndexedDB — a true
   export → wipe → import → reload round-trip (backup.test.js).

   SettingsScreen owns only the UI ORCHESTRATION around these:
   the "Preparing…/Importing…" toasts, the confirm dialog + summary,
   the degraded-store precondition guard, the completion toast, the
   reload timer, and the PlatformBridge.saveToFile / openFilePicker
   wiring. Everything that touches user DATA lives here.

   Nothing in this module reaches a global: every store, adapter,
   media store, validator, and clock is passed in via the ctx object.
   That is what makes the round-trip test possible without loading the
   whole bundle-b global surface — and it keeps the data path honest
   about exactly what it depends on.
*/

/**
 * @typedef {{ store: any, method: string }} ExportableEntry
 * @typedef {Record<string, ExportableEntry>} StoresMap
 * @typedef {Record<string, any>} FlagMap
 */

/** 100 MB hard guard — a backup larger than this is refused (the JSON
 *  base64 round-trip would OOM a budget device). */
export const DEFAULT_MEDIA_LIMIT_BYTES = 100 * 1024 * 1024;

/** localStorage keys carried verbatim in the payload's `data` block
 *  (the boot-shim StateStore mirror; a V1 client restores theme +
 *  fontStyle from this). */
export const DEFAULT_DATA_LS_KEYS = ['vot-state'];

/**
 * Encode a Blob to base64 by streaming it in small chunks — never
 * loads the whole blob into a single string via FileReader, which would
 * OOM on >1 MB media on budget devices (see CLAUDE.md rule 5). 8192 is
 * below the String.fromCharCode.apply argument-count limit on every
 * engine we target (chrome69+).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function blobToBase64(blob) {
  const CHUNK = 8192;
  const reader = blob.stream().getReader();
  let binary = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i += CHUNK) {
      const slice = value.subarray(i, Math.min(i + CHUNK, value.length));
      binary += String.fromCharCode.apply(null, /** @type {any} */ (slice));
    }
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to a Blob. Caller owns the lifetime.
 * @param {string} b64
 * @param {string} [mime]
 * @returns {Blob}
 */
export function base64ToBlob(b64, mime) {
  // U19: validate the FULL base64 string up front. validateMediaRecord only
  // sniffs the first ~100 chars (import-validators), so a record can pass that
  // yet carry corruption deeper in. atob throws on bad input anyway (the import
  // media loop catches it), but a precise check gives a clear error + defends
  // any future caller that doesn't wrap this in try/catch.
  if (typeof b64 !== 'string' || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error('base64ToBlob: malformed base64 input');
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

/**
 * Best-effort storage-estimate read, feature-detected. Returns raw
 * bytes (quota + usage) or nulls if the API is unavailable / throws.
 * @returns {Promise<{ quota: number | null, usage: number | null }>}
 */
async function _defaultStorageEstimate() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      return {
        quota: est && typeof est.quota === 'number' ? est.quota : null,
        usage: est && typeof est.usage === 'number' ? est.usage : null,
      };
    }
  } catch (_e) { /* best-effort diagnostic; null on failure */ }
  return { quota: null, usage: null };
}

/**
 * @typedef {Object} BuildExportCtx
 * @property {StoresMap} storesMap   store-name → { store, method }
 * @property {FlagMap}   flagMap     store-name → flag store
 * @property {{ get(name: string, key: string): Promise<any> }} idbAdapter
 * @property {{ allIds(): Promise<string[]>, get(id: string): Promise<any> }} mediaStore
 * @property {any[]} [diagnosticLog] diagnostic ring-buffer entries to embed
 * @property {number} [mediaLimitBytes]
 * @property {string[]} [dataLsKeys]
 * @property {() => string} [nowIso]
 * @property {() => Promise<{ quota: number | null, usage: number | null }>} [storageEstimate]
 */

/**
 * @typedef {(
 *   | { ok: true, payload: any }
 *   | { ok: false, reason: 'media-limit' }
 *   | { ok: false, reason: 'read-failure', problems: string[] }
 * )} BuildExportResult
 */

/**
 * Read every store + flag + media blob into a V2 backup payload. Reads
 * stores STRAIGHT FROM IDB (the durable truth), not the in-memory cache.
 *
 * Fails LOUD (U6): if ANY store read or the media loop throws, returns
 * `{ ok:false, reason:'read-failure', problems }` instead of a
 * silently-incomplete-but-valid-looking payload — the caller must abort,
 * never write a half backup. Media over the limit returns
 * `{ ok:false, reason:'media-limit' }`.
 *
 * @param {BuildExportCtx} ctx
 * @returns {Promise<BuildExportResult>}
 */
export async function buildExportPayload(ctx) {
  const {
    storesMap, flagMap, idbAdapter, mediaStore,
    diagnosticLog = [],
    mediaLimitBytes = DEFAULT_MEDIA_LIMIT_BYTES,
    dataLsKeys = DEFAULT_DATA_LS_KEYS,
    nowIso = () => new Date().toISOString(),
    storageEstimate = _defaultStorageEstimate,
  } = ctx;

  // (a) data: LS boot-shim only. V1 clients reading this file see just
  //     theme + fontStyle restored (intentional limitation).
  /** @type {Record<string, string>} */
  const data = {};
  for (const k of dataLsKeys) {
    const v = localStorage.getItem(k);
    if (v != null) data[k] = v;
  }

  // (b) stores: every IDB-backed store, keyed by store name.
  // Track read failures instead of silently swallowing them (U6) — a
  // backup that LOOKS complete but dropped a store is the worst failure
  // for the ONLY backup mechanism, so any failure aborts loudly below.
  /** @type {Record<string, any>} */
  const stores = {};
  /** @type {string[]} */
  const exportProblems = [];
  for (const name of Object.keys(storesMap)) {
    try {
      const v = await idbAdapter.get(name, 'v');
      if (v !== undefined) stores[name] = v;
    } catch (e) { console.warn('export: store read failed', name, e); exportProblems.push(name); }
  }
  for (const name of Object.keys(flagMap)) {
    try {
      const v = await idbAdapter.get(name, 'v');
      if (v !== undefined) stores[name] = !!v;
    } catch (e) { console.warn('export: flag read failed', name, e); exportProblems.push(name); }
  }

  // (c) media: encode JournalMediaStore blobs as base64.
  /** @type {Record<string, any>} */
  const media = {};
  let totalMediaBytes = 0;
  try {
    const ids = await mediaStore.allIds();
    for (const id of ids) {
      const rec = await mediaStore.get(id);
      if (!rec || !rec.blob) continue;
      totalMediaBytes += rec.blob.size || 0;
      if (totalMediaBytes > mediaLimitBytes) {
        return { ok: false, reason: 'media-limit' };
      }
      const b64 = await blobToBase64(rec.blob);
      media[id] = {
        type: rec.type, mime: rec.mime, size: rec.size,
        width: rec.width, height: rec.height, duration: rec.duration,
        created: rec.created,
        data: b64,
      };
    }
  } catch (e) {
    console.warn('media export failed', e);
    exportProblems.push('journal media');
  }

  // W2.5 — storageQuota + storageUsed diagnostic fields (raw bytes).
  const { quota: storageQuota, usage: storageUsed } = await storageEstimate();

  // Abort loudly on any read failure rather than write a misleading,
  // incomplete-but-valid-looking backup file (U6).
  if (exportProblems.length) {
    return { ok: false, reason: 'read-failure', problems: exportProblems };
  }

  // Integrity manifest: per-store entry count + media count, so an
  // import can verify the round-trip captured everything (U14 check).
  /** @type {Record<string, number>} */
  const counts = { _media: Object.keys(media).length };
  for (const name of Object.keys(stores)) {
    const v = stores[name];
    counts[name] = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
  }

  const payload = {
    app: 'VOTReader',
    exportVersion: 2,
    exportDate: nowIso(),
    diagnosticLog: diagnosticLog,
    storageQuota: storageQuota,
    storageUsed: storageUsed,
    counts: counts,
    data: data,
    stores: stores,
    media: media,
  };
  return { ok: true, payload };
}

/**
 * Resolve a store's durability barrier without throwing. `true` for a
 * store with no whenSaved() (LS-mode / never-written); the store's own
 * promise otherwise.
 * @param {any} s
 * @returns {Promise<boolean>}
 */
function _whenSaved(s) {
  return (s && typeof s.whenSaved === 'function') ? s.whenSaved() : Promise.resolve(true);
}

/**
 * @typedef {Object} ApplyImportCtx
 * @property {StoresMap} storesMap
 * @property {FlagMap}   flagMap
 * @property {{ allIds(): Promise<string[]>, delete(id: string): Promise<any>, put(rec: any): Promise<any> }} mediaStore
 * @property {(name: string, payload: any) => string[]} validateStorePayload
 * @property {(id: string, record: any) => string[]} validateMediaRecord
 * @property {string[]} [dataLsKeys]
 */

/**
 * Apply a parsed backup payload to the live stores, then WAIT for every
 * write to durably land in IDB before returning (U1 barrier). Because
 * `_save()` is fire-and-forget, returning before the writes flush would
 * let the caller's reload tear down the page mid-transaction and
 * silently drop the just-imported data — and this is the only backup.
 *
 * A store/media section that fails shape validation is SKIPPED (never
 * written) so a corrupt section can't overwrite good data. Caller is
 * responsible for the envelope check, the confirm dialog, and the
 * degraded-store precondition guard.
 *
 * @param {any} parsed                 the parsed backup envelope
 * @param {ApplyImportCtx} ctx
 * @returns {Promise<{ importFailures: number, writeFailures: number, skippedStores: string[] }>}
 */
export async function applyImportPayload(parsed, ctx) {
  const {
    storesMap, flagMap, mediaStore,
    validateStorePayload, validateMediaRecord,
    dataLsKeys = DEFAULT_DATA_LS_KEYS,
  } = ctx;

  const exportVersion = (parsed && parsed.exportVersion) || 1;
  let importFailures = 0;
  // Stores whose payload failed shape validation — skipped (not written)
  // so a corrupt section can't overwrite good data or, for the
  // non-coercing stores (state, home-order), persist garbage.
  /** @type {string[]} */
  const skippedStores = [];

  // (1) Clear the shim LS keys and re-seed from `data`.
  dataLsKeys.forEach((k) => {
    try { localStorage.removeItem(k); } catch (_e) { /* non-fatal */ }
  });
  Object.keys((parsed && parsed.data) || {}).forEach((k) => {
    if (k.indexOf('vot-') !== 0) return;
    const v = parsed.data[k];
    if (typeof v === 'string') {
      try { localStorage.setItem(k, v); } catch (e) { console.warn('LS write failed for', k, e); }
    }
  });

  // (2) Apply stores → IDB-backed stores.
  if (exportVersion >= 2 && parsed.stores && typeof parsed.stores === 'object') {
    for (const name of Object.keys(storesMap)) {
      if (!(name in parsed.stores)) continue;
      const violations = validateStorePayload(name, parsed.stores[name]);
      if (violations.length) {
        skippedStores.push(name);
        console.warn('skipping store with invalid payload:', name, violations);
        continue;
      }
      const { store, method } = storesMap[name];
      try { store[method](parsed.stores[name]); }
      catch (e) { importFailures += 1; console.warn('store import failed for', name, e); }
    }
    for (const name of Object.keys(flagMap)) {
      if (!(name in parsed.stores)) continue;
      const truthy = !!parsed.stores[name];
      try { if (truthy) flagMap[name].set(); else flagMap[name].clear(); }
      catch (e) { importFailures += 1; console.warn('flag import failed for', name, e); }
    }
  } else {
    // V1 fallback: parse each LS-shape value in `data` and call the
    // store's replaceAll/setAll/set with the parsed object.
    for (const name of Object.keys(storesMap)) {
      const raw = parsed && parsed.data && parsed.data[name];
      if (typeof raw !== 'string') continue;
      try {
        const obj = JSON.parse(raw);
        const violations = validateStorePayload(name, obj);
        if (violations.length) {
          skippedStores.push(name);
          console.warn('skipping V1 store with invalid payload:', name, violations);
          continue;
        }
        const { store, method } = storesMap[name];
        store[method](obj);
      } catch (e) { importFailures += 1; console.warn('V1 import parse failed for', name, e); }
    }
    for (const name of Object.keys(flagMap)) {
      if (parsed && parsed.data && (parsed.data[name] === '1' || parsed.data[name] === 1)) {
        flagMap[name].set();
      }
    }
  }

  // (3) Apply media → JournalMediaStore (v2 only). Clear existing media
  //     first so this is a true REPLACE.
  if (exportVersion >= 2 && parsed.media && typeof parsed.media === 'object') {
    try {
      const existingIds = await mediaStore.allIds();
      for (const id of existingIds) await mediaStore.delete(id);
    } catch (e) { console.warn('clear existing media failed', e); }
    for (const id of Object.keys(parsed.media)) {
      const record = parsed.media[id];
      const mediaViolations = validateMediaRecord(id, record);
      if (mediaViolations.length) {
        importFailures += 1;
        console.warn('skipping invalid media record:', id, mediaViolations);
        continue;
      }
      try {
        const blob = base64ToBlob(record.data, record.mime);
        await mediaStore.put({
          id: id, type: record.type, blob: blob,
          mime: record.mime, size: record.size,
          width: record.width, height: record.height, duration: record.duration,
          created: record.created,
        });
      } catch (e) { importFailures += 1; console.warn('media import failed for', id, e); }
    }
  }

  // (4) U1 DURABILITY BARRIER. Wait for every imported store's IDB write
  // to actually land before returning (the caller reloads right after).
  // Media is already durable: JournalMediaStore.put is awaited above.
  // whenSaved() never rejects — false means that store's write failed.
  const saveResults = await Promise.all(
    Object.values(storesMap).map(({ store }) => _whenSaved(store))
      .concat(Object.values(flagMap).map((s) => _whenSaved(s)))
  );
  const writeFailures = saveResults.filter((ok) => !ok).length;

  return { importFailures, writeFailures, skippedStores };
}
