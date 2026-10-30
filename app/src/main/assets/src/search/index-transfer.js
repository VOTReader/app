/* ═══════════════════════════════════════════════════════════════════════
   search/index-transfer.js — the warm index, read on the search worker and
   handed to the page in parts (sr9, 2026-10-14)
   ═══════════════════════════════════════════════════════════════════════
   Restoring the cached index (MiniSearch.loadJSON) was one block on the page's
   thread: JSON.parse of ~21 MB, then a Map per document field and per term,
   244-262 ms on the S22 inside init. The worker (worker-ops.js) reads and parses
   it and posts it in parts small enough to take no long task to receive; the
   page builds MiniSearch's maps from each part as it arrives, which is what
   MiniSearch.loadJS does in one pass. The index that results is the one
   loadJSON makes (index-transfer.test.js compares their toJSON). */

/** Entries per part of the id and length maps; postings (a term in a document's field) per part of the term index. */
const KEYS_PER_PART = 4000;
const POSTINGS_PER_PART = 20000;
/** About this many characters of stored text per part of the stored fields (a long letter is one part). */
const STORED_CHARS_PER_PART = 200000;

/**
 * Post a parsed index (MiniSearch toJSON) in parts: one `head`, then `part` messages, in loadJS's order.
 * @param {any} js
 * @param {(m: any) => void} post
 */
export function postIndexParts(js, post) {
  const { index, documentIds, fieldLength, storedFields, ...head } = js;
  post({ head });
  for (const [name, obj] of /** @type {Array<[string, any]>} */ ([['documentIds', documentIds], ['fieldLength', fieldLength]])) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i += KEYS_PER_PART) post({ part: name, entries: keys.slice(i, i + KEYS_PER_PART).map((k) => [k, obj[k]]) });
  }
  let entries = [];
  let chars = 0;
  for (const k of Object.keys(storedFields)) {
    const f = storedFields[k];
    entries.push([k, f]);
    chars += 64 + (f && typeof f.text === 'string' ? f.text.length : 0);
    if (chars >= STORED_CHARS_PER_PART) { post({ part: 'storedFields', entries }); entries = []; chars = 0; }
  }
  if (entries.length) post({ part: 'storedFields', entries });
  entries = [];
  let postings = 0;
  for (const term of index) {
    entries.push(term);
    for (const fieldId of Object.keys(term[1])) {
      const e = term[1][fieldId];
      postings += Object.keys(js.serializationVersion === 1 ? e.ds : e).length;
    }
    if (postings >= POSTINGS_PER_PART) { post({ part: 'index', entries }); entries = []; postings = 0; }
  }
  if (entries.length) post({ part: 'index', entries });
}

/** An object keyed by numbers, as a Map with number keys (MiniSearch's objectToNumericMap). */
function numericMap(/** @type {Record<string, any>} */ obj) {
  const m = new Map();
  for (const k of Object.keys(obj)) m.set(parseInt(k, 10), obj[k]);
  return m;
}

/**
 * A MiniSearch index built from the parts postIndexParts posts, part by part.
 * @param {any} MiniSearch  the class
 * @param {any} head  the index's own fields (documentCount, nextId, fieldIds, averageFieldLength, dirtCount, serializationVersion)
 * @param {any} options  the options it was built with
 */
export function indexAssembler(MiniSearch, head, options) {
  const ms = MiniSearch.instantiateMiniSearch(head, options);
  const v1 = head.serializationVersion === 1;
  return {
    ms,
    /** @param {string} part @param {Array<[any, any]>} entries */
    add(part, entries) {
      if (part === 'index') {
        for (const [term, data] of entries) {
          const fields = new Map();
          for (const fieldId of Object.keys(data)) fields.set(parseInt(fieldId, 10), numericMap(v1 ? data[fieldId].ds : data[fieldId]));
          ms._index.set(term, fields);
        }
        return;
      }
      const m = part === 'documentIds' ? ms._documentIds : part === 'fieldLength' ? ms._fieldLength : part === 'storedFields' ? ms._storedFields : null;
      if (!m) throw new Error('index-transfer: unknown part ' + part);
      for (const [k, v] of entries) {
        const shortId = parseInt(k, 10);
        m.set(shortId, v);
        if (m === ms._documentIds) ms._idToShortId.set(v, shortId);
      }
    },
  };
}

/* THE WARM INDEX IS WRITTEN A SLICE AT A TIME (measure:s22, 2026-10-29). JSON.stringify(ms) after a cold build was
   one task of ~580 ms on the S22 (toJSON 127 ms, the stringify 305, the 21 MB Response 152), and its idle turn
   fell between two frames of a Scripture Web pan. indexJSONParts writes what toJSON gives, member by member, a
   slice at a time; cache.js saveCached streams the parts in. Joined, they are the JSON JSON.stringify(ms) writes
   (index-transfer.test.js parses both). */

/**
 * The JSON of a MiniSearch index in parts, written `sliceMs` at a time with a `turn` between.
 * @param {any} ms
 * @param {{ live?: () => boolean, sliceMs?: number, turn?: () => Promise<any> }} [opts]
 *   `live` false drops the write (another index came in), checked at each turn
 * @returns {Promise<string[]|null>} the parts in order, or null when dropped
 */
export async function indexJSONParts(ms, opts = {}) {
  const live = opts.live || (() => true);
  const sliceMs = opts.sliceMs || 8;
  const turn = opts.turn || (() => new Promise((r) => setTimeout(r, 0)));
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  /** @type {string[]} */ const parts = [];
  /** @type {string[]} */ let run = [];
  let end = clock() + sliceMs;
  let n = 0;
  /** Past the slice: close a part and give the page a turn. false when the write is dropped. */
  const next = async () => {
    if ((++n & 63) !== 0 || clock() < end) return true;
    parts.push(run.join('')); run = [];
    await turn();
    end = clock() + sliceMs;
    return live();
  };
  const str = (/** @type {any} */ v) => JSON.stringify(v);
  /** A Map as the object Object.fromEntries makes of it; a member JSON leaves out (undefined) is left out. */
  const object = async (/** @type {Iterable<[any, any]>} */ entries) => {
    run.push('{');
    let first = true;
    for (const [k, v] of entries) {
      const s = str(v);
      if (s === undefined) continue;
      run.push((first ? '' : ',') + str(String(k)) + ':' + s);
      first = false;
      if (!(await next())) return false;
    }
    run.push('}');
    return true;
  };
  run.push('{"documentCount":' + str(ms._documentCount) + ',"nextId":' + str(ms._nextId) + ',"documentIds":');
  if (!(await object(ms._documentIds))) return null;
  run.push(',"fieldIds":' + str(ms._fieldIds) + ',"fieldLength":');
  if (!(await object(ms._fieldLength))) return null;
  run.push(',"averageFieldLength":' + str(ms._avgFieldLength) + ',"storedFields":');
  if (!(await object(ms._storedFields))) return null;
  run.push(',"dirtCount":' + str(ms._dirtCount) + ',"index":[');
  let first = true;
  for (const [term, fieldIndex] of ms._index) {
    /** @type {Record<string, any>} */ const data = {};
    for (const [fieldId, freqs] of fieldIndex) data[fieldId] = Object.fromEntries(freqs);
    run.push((first ? '' : ',') + str([term, data]));
    first = false;
    if (!(await next())) return null;
  }
  run.push('],"serializationVersion":2}');
  parts.push(run.join(''));
  return parts;
}
