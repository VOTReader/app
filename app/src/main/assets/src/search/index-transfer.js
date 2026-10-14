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
