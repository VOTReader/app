/* ═══════════════════════════════════════════════════════════════
   KEY-PREFIX INDEX — getForKeyPrefix without a whole-store scan
   ═══════════════════════════════════════════════════════════════
   LinkStore and BookmarkStore.getForKeyPrefix filtered the whole store on
   every call, and the reading view calls them once per paragraph on every
   page turn and mark edit (the pre-mounted neighbour pages included), and
   LinkIcon/BookmarkIcon once per verse: paragraphs x records string tests
   per pass, a hitch on every turn in a library of thousands (sweep W69).

   This indexes a store's records under every colon-boundary prefix of
   their keys ("letter:x:2:10-40" under "letter", "letter:x",
   "letter:x:2" and itself), rebuilt only when the store's array, version
   or length changes (every write path ends in _save + _bump or
   replaceAll), so a lookup costs the depth of its key. Results keep the
   store's order and each record appears once, exactly as the filters did.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Every `p` with `key === p` or `key.startsWith(p + ':')`, shortest first:
 * "a:b:c" -> ["a", "a:b", "a:b:c"].
 * @param {string} key
 * @returns {string[]}
 */
export function colonPrefixes(key) {
  const out = [];
  let i = key.indexOf(':');
  while (i !== -1) { out.push(key.slice(0, i)); i = key.indexOf(':', i + 1); }
  out.push(key);
  return out;
}

/** @typedef {{ arr: any[], ver: number, len: number, under: Map<string, number[]>, exact: Map<string, number[]> }} KeyIndex */

/** @type {WeakMap<object, KeyIndex>} */
const _memo = new WeakMap();

/** @param {Map<string, number[]>} map @param {string} k @param {number} i */
function _add(map, k, i) {
  const l = map.get(k);
  if (!l) map.set(k, [i]);
  else if (l[l.length - 1] !== i) l.push(i);   // a record's two keys can share a prefix: list it once
}

/**
 * @param {{ _load(): any[], getVersion(): number }} store
 * @param {(rec: any) => any[]} keysOf  the record's keys; [] for a record that never matches
 * @returns {KeyIndex}
 */
function _index(store, keysOf) {
  const arr = store._load();
  const ver = store.getVersion();
  const m = _memo.get(store);
  if (m && m.arr === arr && m.ver === ver && m.len === arr.length) return m;
  /** @type {Map<string, number[]>} */ const under = new Map();
  /** @type {Map<string, number[]>} */ const exact = new Map();
  for (let i = 0; i < arr.length; i++) {
    for (const k of keysOf(arr[i])) {
      if (typeof k !== 'string') continue;
      _add(exact, k, i);
      for (const p of colonPrefixes(k)) _add(under, p, i);
    }
  }
  const next = { arr, ver, len: arr.length, under, exact };
  _memo.set(store, next);
  return next;
}

/**
 * Records with a key equal to `prefix` or finer than it (`prefix + ':' ...`).
 * @template T
 * @param {{ _load(): T[], getVersion(): number }} store
 * @param {(rec: T) => any[]} keysOf
 * @param {string} prefix
 * @returns {T[]}
 */
export function recordsAtOrBelow(store, keysOf, prefix) {
  const ix = _index(store, keysOf);
  const l = ix.under.get(prefix);
  return l ? l.map((i) => ix.arr[i]) : [];
}

/**
 * Records with a key equal to `prefix`, finer than it, or coarser than it
 * (a key that `prefix` itself starts with, plus ':').
 * @template T
 * @param {{ _load(): T[], getVersion(): number }} store
 * @param {(rec: T) => any[]} keysOf
 * @param {string} prefix
 * @returns {T[]}
 */
export function recordsAlongKey(store, keysOf, prefix) {
  const ix = _index(store, keysOf);
  const hits = (ix.under.get(prefix) || []).slice();
  const coarser = colonPrefixes(prefix);
  coarser.pop();
  let more = false;
  for (const p of coarser) {
    const l = ix.exact.get(p);
    if (l) { for (const i of l) hits.push(i); more = true; }
  }
  if (more) hits.sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < hits.length; j++) if (j === 0 || hits[j] !== hits[j - 1]) out.push(ix.arr[hits[j]]);
  return out;
}
