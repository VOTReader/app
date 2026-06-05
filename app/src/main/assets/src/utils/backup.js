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
 * engine we target (chrome108+).
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

  // S1: flush any in-flight store writes to IDB BEFORE reading. Stores _save()
  // fire-and-forget and the loops below read STRAIGHT FROM IDB (the durable
  // truth), so an edit made moments before Export could otherwise be missed from
  // the ONLY backup. whenSaved() awaits the captured put and never rejects.
  // Mirrors the import durability barrier (applyImportPayload).
  await Promise.all(
    Object.values(storesMap).map(({ store }) => _whenSaved(store))
      .concat(Object.values(flagMap).map((s) => _whenSaved(s)))
  );

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
 * Build a v3 streaming-export MANIFEST + the ordered media blob list
 * (BACKUP-STREAMING-PLAN.txt). Unlike buildExportPayload (v2), media is NOT
 * base64-inlined: the manifest carries per-blob METADATA only, and the blobs are
 * returned separately for the container codec (writeContainer) to stream as raw
 * frames — so peak memory is the (small) store data + one blob at a time, which
 * is what makes GB-scale export safe.
 *
 * Same loud-abort contract as buildExportPayload (U6): any store/media read
 * failure returns { ok:false, reason:'read-failure', problems } so the caller
 * never writes a silently-incomplete backup.
 *
 * The flush + store/data read here intentionally MIRRORS buildExportPayload's
 * rather than sharing a helper yet — v2 stays untouched while v3 is built
 * alongside and proven end-to-end. Folding the shared read into one helper is a
 * tracked P5 cleanup (BACKUP-STREAMING-PLAN.txt), once v3 ships.
 *
 * @param {BuildExportCtx} ctx
 * @returns {Promise<{ ok:true, manifest:any, mediaEntries: Array<{id:string, blob:Blob}> }
 *   | { ok:false, reason:'read-failure', problems:string[] }>}
 */
export async function buildV3Manifest(ctx) {
  const {
    storesMap, flagMap, idbAdapter, mediaStore,
    diagnosticLog = [],
    dataLsKeys = DEFAULT_DATA_LS_KEYS,
    nowIso = () => new Date().toISOString(),
    storageEstimate = _defaultStorageEstimate,
  } = ctx;

  // S1: flush in-flight writes before reading STRAIGHT FROM IDB — the only backup
  // must not miss an edit made moments before export. whenSaved never rejects.
  await Promise.all(
    Object.values(storesMap).map(({ store }) => _whenSaved(store))
      .concat(Object.values(flagMap).map((s) => _whenSaved(s)))
  );

  /** @type {Record<string, string>} */
  const data = {};
  for (const k of dataLsKeys) { const v = localStorage.getItem(k); if (v != null) data[k] = v; }

  // Stores + flags from IDB; collect read failures (U6) — abort loudly below.
  /** @type {Record<string, any>} */
  const stores = {};
  /** @type {string[]} */
  const exportProblems = [];
  for (const name of Object.keys(storesMap)) {
    try { const v = await idbAdapter.get(name, 'v'); if (v !== undefined) stores[name] = v; }
    catch (e) { console.warn('export: store read failed', name, e); exportProblems.push(name); }
  }
  for (const name of Object.keys(flagMap)) {
    try { const v = await idbAdapter.get(name, 'v'); if (v !== undefined) stores[name] = !!v; }
    catch (e) { console.warn('export: flag read failed', name, e); exportProblems.push(name); }
  }

  // Media: per-blob METADATA for the manifest + the blob refs (SAME order) for
  // the container to stream. No base64, no size cap (streaming is bounded). The
  // manifest `size` is the ACTUAL blob byte length — readContainer checks each
  // frame's length against it, so it must be the real size.
  /** @type {Array<any>} */
  const mediaMeta = [];
  /** @type {Array<{id:string, blob:Blob}>} */
  const mediaEntries = [];
  try {
    const ids = await mediaStore.allIds();
    for (const id of ids) {
      const rec = await mediaStore.get(id);
      if (!rec || !rec.blob) continue;
      mediaMeta.push({
        id: id, type: rec.type, mime: rec.mime, size: rec.blob.size,
        width: rec.width, height: rec.height, duration: rec.duration, created: rec.created,
      });
      mediaEntries.push({ id: id, blob: rec.blob });
    }
  } catch (e) {
    console.warn('media export failed', e);
    exportProblems.push('journal media');
  }

  const { quota: storageQuota, usage: storageUsed } = await storageEstimate();

  if (exportProblems.length) {
    return { ok: false, reason: 'read-failure', problems: exportProblems };
  }

  /** @type {Record<string, number>} */
  const counts = { _media: mediaMeta.length };
  for (const name of Object.keys(stores)) {
    const v = stores[name];
    counts[name] = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
  }

  const manifest = {
    app: 'VOTReader',
    exportVersion: 3,
    exportDate: nowIso(),
    diagnosticLog: diagnosticLog,
    storageQuota: storageQuota,
    storageUsed: storageUsed,
    counts: counts,
    data: data,
    stores: stores,
    media: mediaMeta,
  };
  return { ok: true, manifest, mediaEntries };
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

// ── Shared import apply (folds the v2 applyImportPayload + the v3 applyV3) ──
// The LS reseed, the v2-shape store/flag apply, and the U1 durability barrier
// were duplicated verbatim across both appliers (only the MEDIA handling — v2
// base64 decode vs v3 streamed frames — and applyImportPayload's V1 fallback
// genuinely differ). These three helpers are the single source of truth for the
// shared parts (the BACKUP-STREAMING-PLAN P5 fold). Module-private; covered by
// the applyImportPayload + applyV3 integration tests.

/**
 * Reseed the localStorage shim keys from a backup's `data` map: clear each known
 * key, then restore the string value for any `vot-`-prefixed key.
 * @param {Record<string, any> | null | undefined} dataObj
 * @param {string[]} dataLsKeys
 */
function _reseedLsData(dataObj, dataLsKeys) {
  dataLsKeys.forEach((k) => {
    try { localStorage.removeItem(k); } catch (_e) { /* non-fatal */ }
  });
  Object.keys(dataObj || {}).forEach((k) => {
    if (k.indexOf('vot-') !== 0) return;
    const v = dataObj[k];
    if (typeof v === 'string') {
      try { localStorage.setItem(k, v); } catch (e) { console.warn('LS write failed for', k, e); }
    }
  });
}

/**
 * Apply a v2-shape `stores` object to the IDB-backed stores + flags: SKIP any
 * section that fails shape validation (so a corrupt section can't overwrite good
 * data), call the store's import method otherwise, set/clear each flag. Returns
 * the failure tallies for the caller to fold into its running totals (its media
 * step also contributes to importFailures).
 * @param {Record<string, any>} storesObj
 * @param {StoresMap} storesMap
 * @param {FlagMap} flagMap
 * @param {(name: string, payload: any) => string[]} validateStorePayload
 * @returns {{ importFailures: number, skippedStores: string[] }}
 */
function _applyStoresAndFlags(storesObj, storesMap, flagMap, validateStorePayload) {
  let importFailures = 0;
  /** @type {string[]} */
  const skippedStores = [];
  for (const name of Object.keys(storesMap)) {
    if (!(name in storesObj)) continue;
    const violations = validateStorePayload(name, storesObj[name]);
    if (violations.length) {
      skippedStores.push(name);
      console.warn('skipping store with invalid payload:', name, violations);
      continue;
    }
    const { store, method } = storesMap[name];
    try { store[method](storesObj[name]); }
    catch (e) { importFailures += 1; console.warn('store import failed for', name, e); }
  }
  for (const name of Object.keys(flagMap)) {
    if (!(name in storesObj)) continue;
    const truthy = !!storesObj[name];
    try { if (truthy) flagMap[name].set(); else flagMap[name].clear(); }
    catch (e) { importFailures += 1; console.warn('flag import failed for', name, e); }
  }
  return { importFailures, skippedStores };
}

/**
 * The U1 durability barrier: wait for every store + flag write to durably land in
 * IDB before returning (the caller reloads right after, and `_save` is
 * fire-and-forget — returning early would drop the just-imported data). Media is
 * already durable (its put() is awaited by the caller). whenSaved never rejects;
 * `false` means that store's write failed.
 * @param {StoresMap} storesMap
 * @param {FlagMap} flagMap
 * @returns {Promise<number>} writeFailures
 */
async function _awaitDurability(storesMap, flagMap) {
  const saveResults = await Promise.all(
    Object.values(storesMap).map(({ store }) => _whenSaved(store))
      .concat(Object.values(flagMap).map((s) => _whenSaved(s)))
  );
  return saveResults.filter((ok) => !ok).length;
}

/**
 * @typedef {Object} ApplyImportCtx
 * @property {StoresMap} storesMap
 * @property {FlagMap}   flagMap
 * @property {{ allIds(): Promise<string[]>, delete(id: string): Promise<any>, put(rec: any): Promise<any> }} mediaStore
 * @property {(name: string, payload: any) => string[]} validateStorePayload
 * @property {(id: string, record: any) => string[]} validateMediaRecord
 * @property {string[]} [dataLsKeys]
 * @property {number} [mediaTotalLimitBytes] - aggregate decoded-media ceiling (S5)
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
    mediaTotalLimitBytes = DEFAULT_MEDIA_LIMIT_BYTES,
  } = ctx;

  const exportVersion = (parsed && parsed.exportVersion) || 1;
  let importFailures = 0;
  // Stores whose payload failed shape validation — skipped (not written)
  // so a corrupt section can't overwrite good data or, for the
  // non-coercing stores (state, home-order), persist garbage.
  /** @type {string[]} */
  const skippedStores = [];

  // (1) Reseed the LS shim keys from `data`.
  _reseedLsData(parsed && parsed.data, dataLsKeys);

  // (2) Apply stores → IDB-backed stores.
  if (exportVersion >= 2 && parsed.stores && typeof parsed.stores === 'object') {
    const applied = _applyStoresAndFlags(parsed.stores, storesMap, flagMap, validateStorePayload);
    importFailures += applied.importFailures;
    skippedStores.push(...applied.skippedStores);
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

  // (3) Apply media → JournalMediaStore (v2 only). BAK-1 FAIL-SAFE REPLACE
  //     (mirror applyV3): decode + put each record (put = overwrite by id)
  //     WITHOUT clearing existing media up front, then PRUNE only the ids ABSENT
  //     from this backup AFTER the loop. The pre-fix order (clear ALL media, THEN
  //     decode) destroyed the user's prior media whenever ANY single per-record
  //     base64 decode failed — the only backup must never lose data on a partial /
  //     corrupt import. Now a validation / cap / decode failure leaves that id's
  //     existing copy intact (the backup MENTIONS the id, so it's never pruned);
  //     only ids the backup OMITS are removed, an exact REPLACE for the clean case.
  if (exportVersion >= 2 && parsed.media && typeof parsed.media === 'object') {
    const backupIds = Object.keys(parsed.media);
    // S5: aggregate decoded-byte guard. validateMediaRecord caps EACH record
    // (100 MB), but a hand-edited backup can carry many sub-cap records that sum
    // to GBs; our own export refuses a backup whose TOTAL decoded media exceeds
    // DEFAULT_MEDIA_LIMIT_BYTES (buildExportPayload :196), so anything past that
    // isn't a backup we produced. Stop decoding once the running total would
    // exceed the cap so the base64->Blob decode can't OOM a budget device. (The
    // raw import FILE is also size-capped upstream — platform-bridge /
    // StorageManager — so this is defense-in-depth for the decode phase + any
    // path that bypasses that file cap.) Skipped records count as importFailures
    // so the caller's summary toast reports them.
    let totalMediaBytes = 0;
    let mediaCapHit = false;
    for (const id of backupIds) {
      const record = parsed.media[id];
      const mediaViolations = validateMediaRecord(id, record);
      if (mediaViolations.length) {
        importFailures += 1;
        console.warn('skipping invalid media record:', id, mediaViolations);
        continue;
      }
      // 4 base64 chars -> 3 bytes (same estimate validateMediaRecord uses).
      const approxBytes = Math.floor((record.data.length * 3) / 4);
      if (totalMediaBytes + approxBytes > mediaTotalLimitBytes) {
        importFailures += 1;
        mediaCapHit = true;
        console.warn('skipping media past aggregate cap:', id);
        continue;
      }
      totalMediaBytes += approxBytes; // count what we're about to decode
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
    if (mediaCapHit) {
      console.warn('import: media aggregate cap (' + mediaTotalLimitBytes + ' bytes) reached; some media skipped');
    }
    // Prune stale media — present on the device but NOT mentioned by this backup —
    // for an exact REPLACE. An id the backup mentions is NEVER pruned (its existing
    // copy survives even if the new record failed to decode), so a corrupt backup
    // can't wipe data.
    try {
      const inBackup = new Set(backupIds);
      const existingIds = await mediaStore.allIds();
      for (const id of existingIds) { if (!inBackup.has(id)) await mediaStore.delete(id); }
    } catch (e) { console.warn('prune stale media failed', e); }
  }

  // (4) U1 DURABILITY BARRIER — wait for every imported store's IDB write to land
  // before returning (the caller reloads right after; media is already durable).
  const writeFailures = await _awaitDurability(storesMap, flagMap);

  return { importFailures, writeFailures, skippedStores };
}

/**
 * Apply a v3 STREAMING import to the live stores: reseed LS data, apply the
 * manifest's stores + flags (validated, skip-on-violation like applyImportPayload),
 * REPLACE media by streaming each container frame's Blob straight to IDB (no
 * base64 — the frame already IS a Blob), then await the U1 durability barrier.
 *
 * `entries` are readContainer()'s lazy {id, meta, blob} frames (in manifest.media
 * order); each blob's bytes are read only when JournalMediaStore.put consumes it,
 * one at a time — bounded memory, GB-scale safe. No aggregate media cap (S5) is
 * needed on this path: streaming never holds more than one blob, so the OOM that
 * cap defends against cannot happen. The container reader already integrity-checked
 * each frame's length against the manifest.
 *
 * Returns the SAME shape as applyImportPayload so SettingsScreen treats v3 and the
 * legacy v1/v2 path identically. The LS reseed, the v2-shape store/flag apply, and
 * the durability barrier are SHARED with applyImportPayload via the _reseedLsData /
 * _applyStoresAndFlags / _awaitDurability helpers (the P5 fold); only the MEDIA
 * handling differs — v3 streams frame Blobs (below), v2 base64-decodes a media map.
 *
 * @param {any} manifest - the v3 manifest (readContainer().manifest)
 * @param {Iterable<{id:any, meta:any, blob:Blob}> | AsyncIterable<{id:any, meta:any, blob:Blob}>} entries
 * @param {ApplyImportCtx} ctx
 * @returns {Promise<{ importFailures: number, writeFailures: number, skippedStores: string[] }>}
 */
export async function applyV3(manifest, entries, ctx) {
  const {
    storesMap, flagMap, mediaStore,
    validateStorePayload,
    dataLsKeys = DEFAULT_DATA_LS_KEYS,
  } = ctx;

  // (1) Reseed the LS shim keys from the manifest's `data`.
  _reseedLsData(manifest && manifest.data, dataLsKeys);

  // (2) Apply stores + flags (v3 is always v2-shape — no V1 fallback; SHARED with
  // applyImportPayload's v2 branch). The media step below also adds to importFailures.
  const stores = (manifest && manifest.stores) || {};
  const applied = _applyStoresAndFlags(stores, storesMap, flagMap, validateStorePayload);
  let importFailures = applied.importFailures;
  const skippedStores = applied.skippedStores;

  // (3) REPLACE media — FAIL-SAFE ordering. Stream each frame's Blob in FIRST
  // (put = overwrite by id), recording every id streamed. Existing media is NOT
  // cleared up front: if the stream fails partway (a truncated / corrupt
  // container — reachable on the Android path, which reads frames straight off
  // the file; the web readContainer pre-validates every frame so it can't fail
  // there), the for-await throws BEFORE the prune below, leaving the prior media
  // INTACT rather than wiped. The only backup must never destroy data on a
  // partial import (BACKUP-STREAMING-PLAN verification bar). The manifest — and
  // therefore every store — was read atomically upstream, so the sole thing that
  // can truncate after a valid manifest is a media frame, which this handles
  // non-destructively. No base64, no aggregate cap — streaming is bounded per-blob.
  /** @type {Record<string, boolean>} */
  const streamedIds = {};
  for await (const entry of entries) {
    const m = entry.meta || {};
    streamedIds[entry.id] = true;  // intended import — recorded even if the put fails
    try {
      await mediaStore.put({
        id: entry.id, type: m.type, blob: entry.blob,
        mime: m.mime, size: m.size,
        width: m.width, height: m.height, duration: m.duration,
        created: m.created,
      });
    } catch (e) { importFailures += 1; console.warn('media import failed for', entry.id, e); }
  }
  // Reached ONLY after the full stream landed (a throw above skips it): prune the
  // stale media — present on the device but NOT in this backup — so the end state
  // is an exact REPLACE. An id we tried-but-failed to put stays in streamedIds, so
  // it is NOT pruned (its existing copy is preserved; the failure is in importFailures).
  try {
    const existingIds = await mediaStore.allIds();
    for (const id of existingIds) { if (!streamedIds[id]) await mediaStore.delete(id); }
  } catch (e) { console.warn('prune stale media failed', e); }

  // (4) U1 DURABILITY BARRIER — media already durable (JournalMediaStore.put is
  // awaited above). whenSaved never rejects.
  const saveResults = await Promise.all(
    Object.values(storesMap).map(({ store }) => _whenSaved(store))
      .concat(Object.values(flagMap).map((s) => _whenSaved(s)))
  );
  const writeFailures = saveResults.filter((ok) => !ok).length;

  return { importFailures, writeFailures, skippedStores };
}

/**
 * Soft, ADVISORY free-space check for an import (P4). v3 streaming removed the hard
 * import/export caps (they existed only to dodge OOM, which streaming makes
 * impossible — the v3 path is now uncapped on both platforms; the legacy 50 MB caps
 * correctly remain only on the non-streaming whole-file v1/v2 read). In their place,
 * this returns a human-readable heads-up string IF the backup's media likely won't
 * fit in the device's remaining IndexedDB budget, or '' if it should fit / can't be
 * determined. ADVISORY ONLY — the caller surfaces it in the confirm dialog but never
 * blocks; the user owns their device's limits, and a genuine write failure is still
 * caught + reported (S3 / the U1 barrier).
 *
 * @param {number} mediaTotalBytes - sum of the backup's media sizes (manifest.media[].size)
 * @param {{ quota?: number, usage?: number } | null | undefined} estimate - a
 *   navigator.storage.estimate() result (Chromium-61+)
 * @returns {string} a warning to append to the confirm message, or ''
 */
export function formatImportSpaceWarning(mediaTotalBytes, estimate) {
  if (!mediaTotalBytes || mediaTotalBytes <= 0 || !estimate) return '';
  const quota = typeof estimate.quota === 'number' ? estimate.quota : 0;
  const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;
  const free = quota - usage;
  if (free <= 0 || mediaTotalBytes <= free) return '';
  const mb = (n) => (n / (1024 * 1024)).toFixed(n >= 1024 * 1024 * 1024 ? 0 : 1) + ' MB';
  return '\n\nNote: this backup’s media is about ' + mb(mediaTotalBytes) +
    ', but only about ' + mb(free) + ' appears free on this device. The import may not ' +
    'complete; free up space first if you can.';
}
