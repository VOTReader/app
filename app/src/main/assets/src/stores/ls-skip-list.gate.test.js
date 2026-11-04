// @ts-nocheck
/* LS_SKIP_LIST gate (settings hunt, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────
   clearLegacyLs (cached-store.js, W2.4) deletes EVERY localStorage key that
   starts with `vot-` unless LS_SKIP_LIST names it. It is meant to run once,
   on the boot that moves a pre-W2.4 profile into IndexedDB, but it also runs
   on a fresh profile's first complete boot (a first boot with a store not
   loaded defers it, and the reader has been using the app meanwhile) and on
   the boot after Clear All. By then the only vot-* keys present are LIVE ones,
   and every live key the list did not name was deleted: the Notes tab the
   reader chose, the install offer and the tabs hint they had answered, the
   plan offer they had hidden, the tour's "Later", the weekly copy's failure
   record, and the one-time scroll heal's flag (whose loss clears every saved
   reading place the next boot). The list was kept by hand; home-order-store.js
   records the same miss once before (vot-home-order, W2.3b.4).

   So the source is the inventory. This reads every non-test module as TEXT and
   collects the vot-* keys handed to localStorage.getItem / setItem /
   removeItem: a literal, a constant the call names (declared in the file or
   exported by another), and, in a file whose calls take the key through a
   parameter (auto-download.js's helpers), every vot-* constant it declares.
   Each must be on LS_SKIP_LIST, or be one of the legacy keys the sweep exists
   to remove. LIMIT, stated so nobody trusts it further: a key built at run
   time ('vot-' + name) is invisible here, the way discard-queue-flag.test.js
   states its own limit. The reverse holds too: a skip entry no source writes
   any more is a key no code reads, and leaves the list.

   The non-vacuity test feeds the scanner a synthetic source, not the tree, so
   a scanner that matched nothing could not pass it. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LS_SKIP_LIST } from './cached-store.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Pre-W2.4 copies the sweep is FOR: each store seeds from its key when IndexedDB is empty, so a
 *  leftover would bring an old library back after a later wipe (backup.js W10). Named in the source
 *  only by the LS-mode fallbacks of their stores and by home-order-store.js's history comment. */
const LEGACY_SWEPT = ['vot-links', 'vot-reading-plans', 'vot-home-order'];

const CALL = /localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*([^,)]+?)\s*[,)]/g;
const VOT_CONST = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`](vot-[A-Za-z0-9-]+)['"`]/g;

/**
 * The vot-* keys a set of sources hands to localStorage.
 * @param {Map<string, string>} sources  file → text
 * @returns {Map<string, Set<string>>}   key → the files that use it
 */
export function lsKeysIn(sources) {
  // Only a module that names localStorage or declares a vot-* constant can matter (the corpora, 56 MB
  // of src/data, are neither), so the patterns below never walk them.
  const relevant = new Map([...sources].filter(([, src]) => src.includes('localStorage') || /['"`]vot-/.test(src)));
  /** @type {Map<string, Set<string>>} */
  const found = new Map();
  const add = (key, file) => {
    if (!key.startsWith('vot-') || key.startsWith('vot-toast-')) return;   // toast ids share the prefix
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(file);
  };
  const declIn = (src, name) => {
    const m = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\'"`]([^\'"`]+)[\'"`]').exec(src);
    return m ? m[1] : null;
  };
  const exported = (name) => {
    for (const src of relevant.values()) {
      const m = new RegExp('export\\s+(?:const|let|var)\\s+' + name + '\\s*=\\s*[\'"`]([^\'"`]+)[\'"`]').exec(src);
      if (m) return m[1];
    }
    return null;
  };
  for (const [file, src] of relevant) {
    let paramKeyed = false;
    for (const m of src.matchAll(CALL)) {
      const arg = m[1];
      const lit = /^['"`]([^'"`]+)['"`]$/.exec(arg);
      if (lit) { add(lit[1], file); continue; }
      if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
        const v = declIn(src, arg) || exported(arg);
        if (v) { add(v, file); continue; }
      }
      paramKeyed = true;
    }
    if (paramKeyed) for (const d of src.matchAll(VOT_CONST)) add(d[2], file);
  }
  return found;
}

/** Every non-test .js / .jsx module under src/. @returns {Map<string, string>} */
function sourceTree() {
  /** @type {Map<string, string>} */
  const out = new Map();
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.set(relative(SRC, p), readFileSync(p, 'utf8'));
    }
  })(SRC);
  return out;
}

describe('LS_SKIP_LIST names every live vot-* localStorage key', () => {
  const found = lsKeysIn(sourceTree());

  it('the scanner finds keys of each kind (not vacuous)', () => {
    const synthetic = new Map([
      ['a.js', "localStorage.setItem('vot-literal', '1');"],
      ['b.js', "const K = 'vot-by-const'; localStorage.getItem(K);"],
      ['c.js', "export const SHARED = 'vot-exported';"],
      ['d.js', "import { SHARED } from './c.js'; localStorage.removeItem(SHARED);"],
      ['e.js', "const A = 'vot-param-a'; const T = 'vot-toast-x'; function r(key) { return localStorage.getItem(key); } r(A);"],
      ['f.js', "localStorage.getItem('other-prefix'); sessionStorage.getItem('vot-session');"],
    ]);
    expect([...lsKeysIn(synthetic).keys()].sort()).toEqual(['vot-by-const', 'vot-exported', 'vot-literal', 'vot-param-a']);
    // and on the real tree: one key of each kind
    for (const key of ['vot-state', 'vot-notes-tab', 'vot-auto-downloads', 'vot-restore-inflight']) {
      expect(found.has(key), key).toBe(true);
    }
  });

  it('every live key survives the legacy sweep', () => {
    const unnamed = [...found.keys()]
      .filter((k) => !LS_SKIP_LIST.includes(k) && !LEGACY_SWEPT.includes(k))
      .map((k) => k + ' (' + [...found.get(k)].join(', ') + ')');
    expect(unnamed).toEqual([]);
  });

  it('every skip entry is a key the source still uses', () => {
    expect(LS_SKIP_LIST.filter((k) => !found.has(k))).toEqual([]);
  });
});
