/**
 * n4-02 - the paragraph moves past corpus edits made, for the corpus mark remap.
 *
 * A mark on a letter or a WTLB / Answers / Blessed / Holy Days entry is keyed by
 * its block's POSITION (utils/hl-keys.js). tools/check-mark-anchors.mjs stops an
 * edit that moves unchanged blocks; this lists the moves the edits before it
 * made, so the app can put readers' marks back (stores/corpus-mark-remap.js).
 *
 * For every keyed data file, every version in git history (--follow) is
 * compared with HEAD's, entry by entry: a block whose content is found once in
 * that version and once in HEAD's, at another index, where HEAD's block at the
 * old index is a different one, is a move old -> new. The moves of every version
 * are merged per entry. An entry id found in more than one keyed file under the
 * same key prefix (WTLB One / Two / The Blessed each have an 'introduction') is
 * left out: its keys cannot say which book a mark is in.
 *
 * Writes app/src/main/assets/src/stores/mark-shifts.js. Run it after any commit
 * that passes the gate with ACCEPT_MARK_SHIFT=1, and commit the result.
 *
 * Usage: node tools/gen-mark-shifts.mjs [--check]   (--check: exit 1 when the file is stale)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entriesOf, KEYED } from './check-mark-anchors.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'app/src/main/assets/src/data/';
const OUT = 'app/src/main/assets/src/stores/mark-shifts.js';

/** The key prefix a data file's entries are marked under (LetterView: letter:, WtlbEntryView: wtlb:). */
export function kindOf(file) {
  return /\/(wtlb-(one|two|scriptures)|the-blessed|holy-days|answers)\.js$/.test(file) ? 'wtlb' : 'letter';
}

/**
 * The moves between one version of an entry and HEAD's.
 * @param {string[]} oldList @param {string[]} newList
 * @returns {Array<[number, number]>} [old index, new index]
 */
export function movesOf(oldList, newList) {
  /** @param {string[]} list */
  const once = (list) => {
    /** @type {Map<string, number>} */ const at = new Map();
    /** @type {Set<string>} */ const dup = new Set();
    list.forEach((s, i) => { if (at.has(s)) dup.add(s); else at.set(s, i); });
    dup.forEach((s) => at.delete(s));
    return at;
  };
  const inNew = once(newList);
  /** @type {Array<[number, number]>} */ const out = [];
  once(oldList).forEach((i, s) => {
    const j = inNew.get(s);
    if (j != null && j !== i && newList[i] !== s) out.push([i, j]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

const git = (/** @type {string[]} */ args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });

/** @returns {Record<string, number[]>} prefix -> [old, new, old, new, ...] */
export function buildShifts() {
  const files = git(['ls-files', DATA]).split('\n').filter((f) => KEYED.test(f));
  /** @type {Map<string, Set<string>>} prefix -> files holding that entry id */
  const owners = new Map();
  /** @type {Map<string, Set<string>>} prefix -> "old,new" pairs */
  const pairs = new Map();
  for (const file of files) {
    const kind = kindOf(file);
    const head = entriesOf(readFileSync(resolve(root, file), 'utf8'));
    for (const id of head.keys()) {
      const p = kind + ':' + id + ':';
      if (!owners.has(p)) owners.set(p, new Set());
      /** @type {Set<string>} */ (owners.get(p)).add(file);
    }
    // Every version in history, under whatever path it had then.
    const log = git(['log', '--follow', '--format=%H', '--name-only', '--', file]).split('\n').map((l) => l.trim()).filter(Boolean);
    /** @type {Array<[string, string]>} */ const versions = [];
    for (let i = 0; i < log.length; i++) {
      if (/^[0-9a-f]{40}$/.test(log[i]) && log[i + 1] && !/^[0-9a-f]{40}$/.test(log[i + 1])) versions.push([log[i], log[i + 1]]);
    }
    for (const [sha, path] of versions) {
      let src;
      try { src = git(['show', sha + ':' + path]); } catch (_e) { continue; }
      let old;
      try { old = entriesOf(src); } catch (_e) { continue; }
      for (const [id, oldList] of old) {
        const newList = head.get(id);
        if (!newList) continue;
        const moves = movesOf(oldList, newList);
        if (!moves.length) continue;
        const p = kind + ':' + id + ':';
        if (!pairs.has(p)) pairs.set(p, new Set());
        moves.forEach(([a, b]) => /** @type {Set<string>} */ (pairs.get(p)).add(a + ',' + b));
      }
    }
  }
  /** @type {Record<string, number[]>} */ const out = {};
  [...pairs.keys()].sort().forEach((p) => {
    if (/** @type {Set<string>} */ (owners.get(p) || new Set()).size > 1) return;
    const flat = [...(/** @type {Set<string>} */ (pairs.get(p)))].map((s) => s.split(',').map(Number))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]).flat();
    out[p] = flat;
  });
  return out;
}

/** @param {Record<string, number[]>} shifts */
export function render(shifts) {
  const lines = Object.keys(shifts).map((p) => '  ' + JSON.stringify(p) + ': [' + shifts[p].join(',') + '],');
  return '/* GENERATED by tools/gen-mark-shifts.mjs - do not edit (n4-02).\n' +
    '   The paragraph moves past corpus edits made: per entry key prefix, pairs of\n' +
    '   [old index, new index] of unchanged blocks that moved (every version in\n' +
    '   git history against HEAD). stores/corpus-mark-remap.js moves a mark only\n' +
    '   along one of these, and only when its words confirm it. */\n' +
    '/** @type {Record<string, number[]>} */\n' +
    'export const MARK_SHIFTS = {\n' + lines.join('\n') + (lines.length ? '\n' : '') + '};\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(buildShifts());
  const path = resolve(root, OUT);
  if (process.argv.includes('--check')) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== text) { console.error('[mark-shifts] ' + OUT + ' is stale: run node tools/gen-mark-shifts.mjs'); process.exit(1); }
    console.log('[mark-shifts] current');
  } else {
    writeFileSync(path, text);
    const n = (text.match(/^ {2}"/gm) || []).length;
    console.log('[mark-shifts] wrote ' + OUT + ' (' + n + ' entries, ' + text.length + ' bytes)');
  }
}
