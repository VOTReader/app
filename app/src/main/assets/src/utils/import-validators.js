/* ═══════════════════════════════════════════════════════════════════════
   Import payload validators (W9.3)
   ═══════════════════════════════════════════════════════════════════════

   A corrupted or hand-edited backup file can write arbitrary shapes into
   IndexedDB-backed stores. Some store write paths coerce a bad payload to
   an empty default (silently losing data); two (StateStore, HomeOrderStore)
   do NOT coerce and would persist the corrupt value as-is. These validators
   check the TOP-LEVEL shape of each store payload BEFORE the write, so the
   import path can SKIP a bad store (and tell the user) instead of writing
   garbage or silently emptying it.

   Depth is deliberately shallow — top-level shape + the one or two
   always-present container fields. We do NOT deep-validate every record:
   the data was valid when exported, and a per-record sweep is too costly
   for import. The goal is "plausible structure," not "every field correct."

   Each validator returns a string[] of violations (empty array = valid).
   ═══════════════════════════════════════════════════════════════════════ */

/** @param {*} v */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {*} v */
function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// SE1 — prototype-pollution defense. INERT today (V8's JSON.parse stores a
// "__proto__" JSON key as a regular OWN property, NOT the prototype setter, and
// the stores assign payloads wholesale with no deep-merge that would walk into
// it) — but a backup carrying one of these keys is corrupt or hostile, so refuse
// it rather than persist a booby-trapped shape. Cheap: walks own KEYS only
// (string/number values aren't recursed), so cost is payload-proportional.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Recursively scan an object graph's OWN keys for a prototype-pollution vector.
 * Returns the offending key path (e.g. "stores.vot-notes.__proto__"), or null.
 * Uses getOwnPropertyNames so a JSON-parsed own "__proto__" is seen, and returns
 * on detection BEFORE dereferencing the dangerous key (value['__proto__'] would
 * hit the inherited accessor, not the own value).
 * @param {*} value
 * @param {string} [path]
 * @returns {string|null}
 */
function findUnsafeKey(value, path = '') {
  if (value === null || typeof value !== 'object') return null;
  for (const k of Object.getOwnPropertyNames(value)) {
    const here = path ? path + '.' + k : k;
    if (DANGEROUS_KEYS.includes(k)) return here;
    const child = findUnsafeKey(value[k], here);
    if (child) return child;
  }
  return null;
}

// Top-level shape category for each IDB store, keyed by store name.
//   'objectOfArrays'   — plain object, every value is an array
//   'objectOfObjects'  — plain object, every value is a plain object
//   'object'           — any plain object (fields tolerated/defaulted)
//   'listObject'       — plain object with an array `list` field
//   'array'            — any array
//   'stringArray'      — array whose entries are all strings
// offline-songs (IDB v12, kept songs' bytes) has no shape on purpose: no backup
// carries it, so nothing is ever restored into it (user-data-parity.test.js).
const STORE_SHAPES = {
  'vot-annotations': 'objectOfArrays',     // hlKey → annotation[]
  'vot-journal-index': 'objectOfArrays',   // refKey → entryId[]
  'vot-notes': 'objectOfObjects',          // groupId → note
  'vot-prophecy-cards': 'object',          // "id:idx:type" → boolean
  'vot-journal-stats': 'object',           // {totalEntries, currentStreak, …}
  'vot-reading-streak': 'object',          // {currentStreak, lastReadDate, …}
  'vot-reading-stats': 'object',           // {totalWordsRead, wordsByDay, progress, …}
  'vot-garden-pos': 'object',              // {lastPage}
  'vot-audio-library': 'object',           // {saved, recent, rate, songSaved, songRecent, songKept}; store normalizes nested fields
  'vot-audio-positions': 'object',         // {positions}; store re-checks every URL key + clamps
  'vot-state': 'object',                   // {tabs?, settings?, …} — store does NOT coerce
  'vot-note-default': 'object',            // {style, color}; replaceAll routes through set(), which normalizes
  'vot-bookmarks': 'array',
  'vot-links': 'array',
  'vot-recent-nav': 'array',
  'vot-history': 'array',
  'vot-home-order': 'stringArray',         // tile-id[] — store does NOT coerce
  'vot-library-order': 'stringArray',      // tile-id[] — get() re-merges against DEFAULT_LIBRARY_ORDER
  'vot-notebooks': 'listObject',
  'vot-journal': 'listObject',
  'vot-journal-notebooks': 'listObject',
};

/**
 * Validate one store's import payload against its expected top-level shape.
 * Unknown store names return [] (tolerated — forward-compat with newer
 * backups that carry stores this client version doesn't know about).
 *
 * @param {string} name - IDB store name (e.g. "vot-annotations")
 * @param {*} payload
 * @returns {string[]} violations (empty = valid)
 */
export function validateStorePayload(name, payload) {
  const shape = STORE_SHAPES[name];
  if (!shape) return [];                    // unknown store — tolerate
  const errs = [];

  switch (shape) {
    case 'objectOfArrays':
      if (!isPlainObject(payload)) { errs.push(`${name}: expected an object, got ${typeName(payload)}`); break; }
      for (const k of Object.keys(payload)) {
        if (!Array.isArray(payload[k])) errs.push(`${name}: value for "${k}" must be an array`);
      }
      break;

    case 'objectOfObjects':
      if (!isPlainObject(payload)) { errs.push(`${name}: expected an object, got ${typeName(payload)}`); break; }
      for (const k of Object.keys(payload)) {
        if (!isPlainObject(payload[k])) errs.push(`${name}: value for "${k}" must be an object`);
      }
      break;

    case 'object':
      if (!isPlainObject(payload)) errs.push(`${name}: expected an object, got ${typeName(payload)}`);
      break;

    case 'listObject':
      if (!isPlainObject(payload)) { errs.push(`${name}: expected an object, got ${typeName(payload)}`); break; }
      if (!Array.isArray(payload.list)) errs.push(`${name}: "list" must be an array`);
      break;

    case 'array':
      if (!Array.isArray(payload)) errs.push(`${name}: expected an array, got ${typeName(payload)}`);
      break;

    case 'stringArray':
      if (!Array.isArray(payload)) { errs.push(`${name}: expected an array, got ${typeName(payload)}`); break; }
      if (!payload.every((x) => typeof x === 'string')) errs.push(`${name}: all entries must be strings`);
      break;

    default:
      break;
  }
  return errs;
}

/**
 * Validate the v3 container manifest's media table before any existing data is
 * changed. The table is authoritative: applyV3 uses it to prove that every
 * streamed frame arrived in the declared order before stale media is pruned.
 *
 * @param {*} media
 * @returns {string[]} violations (empty = valid)
 */
export function validateV3MediaMetadata(media) {
  if (!Array.isArray(media)) return ['"media" must be an array for a v3 backup'];

  const errs = [];
  const ids = new Set();
  for (let i = 0; i < media.length; i += 1) {
    const item = media[i];
    const label = `media[${i}]`;
    if (!isPlainObject(item)) { errs.push(`${label}: must be an object`); continue; }

    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errs.push(`${label}: "id" must be a non-empty string`);
    } else if (ids.has(item.id)) {
      errs.push(`${label}: duplicate id "${item.id}"`);
    } else {
      ids.add(item.id);
    }
    if (item.type !== 'image' && item.type !== 'audio') {
      errs.push(`${label}: "type" must be "image" or "audio"`);
    }
    if (!Number.isSafeInteger(item.size) || item.size < 0) {
      errs.push(`${label}: "size" must be a non-negative safe integer`);
    }
    if (item.mime !== undefined && (typeof item.mime !== 'string' || item.mime.trim() === '')) {
      errs.push(`${label}: "mime" must be a non-empty string when present`);
    }
  }
  return errs;
}

/** The newest exportVersion this build reads (v3 = the .votbak container). */
const MAX_EXPORT_VERSION = 3;

/**
 * Validate the top-level import envelope (Layer 1). Hard failures mean the
 * file isn't a usable VOTReader backup and import should not proceed.
 *
 * `json: true` for a plain JSON file (the v1/v2 path). v3 exists only as a
 * .votbak container whose media bytes are frames after the manifest; a JSON file
 * stamped 3 is a hand-made or extracted manifest, and the v1/v2 applier read its
 * media ARRAY as an id map and pruned every attachment on the device (W10).
 *
 * @param {*} parsed - the JSON.parse'd backup object
 * @param {{ json?: boolean }} [opts]
 * @returns {string[]} violations (empty = valid envelope)
 */
export function validateImportEnvelope(parsed, opts = {}) {
  const errs = [];
  if (!isPlainObject(parsed)) { errs.push('backup is not an object'); return errs; }
  // SE1: hard-refuse a payload carrying a prototype-pollution key anywhere.
  const unsafe = findUnsafeKey(parsed);
  if (unsafe) { errs.push(`backup contains an unsafe key ("${unsafe}")`); return errs; }
  if (parsed.app !== 'VOTReader') errs.push('not a VOTReader backup (missing app="VOTReader")');
  const ver = parsed.exportVersion === undefined ? 1 : parsed.exportVersion;
  const validVersion = Number.isInteger(ver) && ver >= 1;
  if (!validVersion) errs.push(`invalid exportVersion ${JSON.stringify(parsed.exportVersion)}`);
  if (validVersion && ver > MAX_EXPORT_VERSION) errs.push(`unsupported exportVersion ${ver}`);
  if (validVersion && ver >= 3 && opts.json) errs.push(`exportVersion ${ver} is a .votbak container, not a JSON file`);
  // Every backup (V1 and V2) carries `data` (the boot-shim LS keys);
  // V2 adds stores + media. `data` is required; stores/media optional.
  if (!isPlainObject(parsed.data)) errs.push('"data" must be an object');
  if (parsed.stores !== undefined && !isPlainObject(parsed.stores)) errs.push('"stores" must be an object');
  // media is an OBJECT in v1/v2 (id → {data:base64,…}) but a required ARRAY of
  // metadata in v3+ (the bytes live in container frames). Keep the contracts
  // version-gated so a damaged v3 manifest can never masquerade as no media.
  if (validVersion && ver === 3) {
    errs.push(...validateV3MediaMetadata(parsed.media));
  } else if (parsed.media !== undefined && !isPlainObject(parsed.media)) {
    errs.push('"media" must be an object for a v1/v2 backup');
  }
  return errs;
}

/**
 * True for a VOTReader backup stamped with an exportVersion past what this build
 * reads, so the reader is told to update the app instead of hearing that a good
 * backup "does not look like a VOTReader backup" (W10).
 *
 * @param {*} parsed
 * @returns {boolean}
 */
export function isNewerBackup(parsed) {
  return isPlainObject(parsed) && parsed.app === 'VOTReader'
    && Number.isInteger(parsed.exportVersion) && parsed.exportVersion > MAX_EXPORT_VERSION;
}

// base64 alphabet (standard, with optional trailing padding).
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
// Matches the export-side per-blob guard.
const MEDIA_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Validate one media record from the import payload (Layer 4). The full
 * base64 decode happens at write time; here we sanity-check the head and
 * the approximate decoded size so a malformed/oversized blob is skipped
 * before it reaches JournalMediaStore.
 *
 * The id, type, mime and size follow validateV3MediaMetadata's rule (size and
 * mime may be absent here). A record is stored as it arrives and the next
 * .votbak export writes these fields into its manifest, so a value v3 refuses
 * made every later backup unimportable (W10).
 *
 * @param {string} id - blob id (key in parsed.media)
 * @param {*} record - { data: base64, mime, type, size, ... }
 * @param {number} [maxBytes] - decoded-size ceiling (defaults to 100 MB;
 *   overridable for tests)
 * @returns {string[]} violations (empty = valid)
 */
export function validateMediaRecord(id, record, maxBytes = MEDIA_MAX_BYTES) {
  const errs = [];
  if (!isPlainObject(record)) { errs.push(`media "${id}": not an object`); return errs; }
  if (typeof record.data !== 'string' || record.data.length === 0) {
    errs.push(`media "${id}": missing base64 "data"`);
    return errs;
  }
  // The first 100 chars are pure base64 alphabet for any blob > ~75 bytes
  // (padding only ever appears at the very end); for tiny blobs the slice
  // is the whole string incl. its padding.
  if (!BASE64_RE.test(record.data.slice(0, 100))) {
    errs.push(`media "${id}": "data" is not valid base64`);
  }
  // 4 base64 chars → 3 bytes.
  const approxBytes = Math.floor(record.data.length * 3 / 4);
  if (approxBytes > maxBytes) {
    errs.push(`media "${id}": decoded size ~${approxBytes} bytes exceeds the limit`);
  }
  if (typeof id !== 'string' || id.trim() === '') errs.push('media: "id" must be a non-empty string');
  if (record.type !== 'image' && record.type !== 'audio') {
    errs.push(`media "${id}": "type" must be "image" or "audio"`);
  }
  if (record.mime !== undefined && (typeof record.mime !== 'string' || record.mime.trim() === '')) {
    errs.push(`media "${id}": "mime" must be a non-empty string when present`);
  }
  if (record.size !== undefined && (!Number.isSafeInteger(record.size) || record.size < 0)) {
    errs.push(`media "${id}": "size" must be a non-negative safe integer when present`);
  }
  return errs;
}
