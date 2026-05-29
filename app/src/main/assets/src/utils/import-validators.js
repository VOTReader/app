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

// Top-level shape category for each IDB store, keyed by store name.
//   'objectOfArrays'   — plain object, every value is an array
//   'objectOfObjects'  — plain object, every value is a plain object
//   'object'           — any plain object (fields tolerated/defaulted)
//   'listObject'       — plain object with an array `list` field
//   'array'            — any array
//   'stringArray'      — array whose entries are all strings
const STORE_SHAPES = {
  'vot-annotations': 'objectOfArrays',     // hlKey → annotation[]
  'vot-journal-index': 'objectOfArrays',   // refKey → entryId[]
  'vot-notes': 'objectOfObjects',          // groupId → note
  'vot-prophecy-cards': 'object',          // "id:idx:type" → boolean
  'vot-journal-stats': 'object',           // {totalEntries, currentStreak, …}
  'vot-state': 'object',                   // {tabs?, settings?, …} — store does NOT coerce
  'vot-bookmarks': 'array',
  'vot-links': 'array',
  'vot-recent-nav': 'array',
  'vot-history': 'array',
  'vot-home-order': 'stringArray',         // tile-id[] — store does NOT coerce
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
 * Validate the top-level import envelope (Layer 1). Hard failures mean the
 * file isn't a usable VOTReader backup and import should not proceed.
 *
 * @param {*} parsed - the JSON.parse'd backup object
 * @returns {string[]} violations (empty = valid envelope)
 */
export function validateImportEnvelope(parsed) {
  const errs = [];
  if (!isPlainObject(parsed)) { errs.push('backup is not an object'); return errs; }
  if (parsed.app !== 'VOTReader') errs.push('not a VOTReader backup (missing app="VOTReader")');
  const ver = parsed.exportVersion === undefined ? 1 : parsed.exportVersion;
  if (typeof ver !== 'number' || ver < 1) errs.push(`invalid exportVersion ${JSON.stringify(parsed.exportVersion)}`);
  // Every backup (V1 and V2) carries `data` (the boot-shim LS keys);
  // V2 adds stores + media. `data` is required; stores/media optional.
  if (!isPlainObject(parsed.data)) errs.push('"data" must be an object');
  if (parsed.stores !== undefined && !isPlainObject(parsed.stores)) errs.push('"stores" must be an object');
  if (parsed.media !== undefined && !isPlainObject(parsed.media)) errs.push('"media" must be an object');
  return errs;
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
  return errs;
}
