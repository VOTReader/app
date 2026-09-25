/**
 * n4-02 (improvement sweep 2, 2026-09-25) - a corpus edit must not move readers' marks.
 *
 * A mark on a letter, a Words To Live By / Answers / Blessed / Holy Days entry or a
 * Bible Study chapter is keyed by its block's POSITION in the entry
 * (letter:<id>:<blockIdx>, wtlb:<id>:<paraIdx>; utils/hl-keys.js). A corpus fix
 * that inserts or removes a paragraph above others moves every mark below it
 * onto the wrong words, in silence: c62 did it live to 'Regarding Spiritual
 * Gifts' (171 unchanged paragraphs at a new index). Answers' own converter
 * refuses such a regeneration (tools/fetch-answers.py --accept-shift, n5-08);
 * this gate covers every keyed collection, whatever edits it.
 *
 * It compares each staged keyed data file with HEAD's copy, entry by entry: an
 * unchanged block (same content, found once in each version) at a new index
 * is a shift. Edits in place, and additions or removals after the last
 * unchanged block, move nothing and pass.
 *
 * Usage:
 *   node tools/check-mark-anchors.mjs              (pre-commit) staged vs HEAD
 *   node tools/check-mark-anchors.mjs --base <ref> (CI) working tree vs <ref>
 *   ACCEPT_MARK_SHIFT=1 git commit ...             a shift that is intended:
 *       say so in the commit, and remap the marks (the boot remap is owed).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'app/src/main/assets/src/data/';

/** The data files whose entries readers mark by block position. */
export const KEYED = /^app\/src\/main\/assets\/src\/data\/(volume-[a-z]+|lords-rebuke|letters-[a-z]+|wtlb-(one|two|scriptures)|the-blessed|holy-days|answers|bible-studies)\.js$/;

/**
 * Every entry a data file's source defines: an object with a string id and a
 * `blocks` (letters, study chapters) or `paragraphs` (WTLB-shaped) array, found
 * anywhere in the globals the file declares.
 * @param {string} src
 * @returns {Map<string, string[]>} id -> each block serialized
 */
export function entriesOf(src) {
  /** @type {Record<string, any>} */ const sandbox = {};
  vm.runInNewContext(src + '\n;', sandbox, { timeout: 20000 });
  /** @type {Map<string, string[]>} */ const out = new Map();
  const seen = new Set();
  /** @param {any} v @param {number} depth */
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 6) return;
    seen.add(v);
    if (typeof v.id === 'string') {
      const list = Array.isArray(v.blocks) ? v.blocks : Array.isArray(v.paragraphs) ? v.paragraphs : null;
      if (list && !out.has(v.id)) { out.set(v.id, list.map((b) => JSON.stringify(b))); return; }
    }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const k of Object.keys(sandbox)) walk(sandbox[k], 0);
  return out;
}

/**
 * The unchanged blocks that moved: content found exactly once in each version
 * of an entry, at a different index.
 * @param {Map<string, string[]>} before
 * @param {Map<string, string[]>} after
 * @returns {Array<{ id: string, moved: number, from: number, to: number }>}
 */
export function shiftedEntries(before, after) {
  /** @param {string[]} list */
  const once = (list) => {
    /** @type {Map<string, number>} */ const at = new Map();
    /** @type {Set<string>} */ const dup = new Set();
    list.forEach((s, i) => { if (at.has(s)) dup.add(s); else at.set(s, i); });
    dup.forEach((s) => at.delete(s));
    return at;
  };
  /** @type {Array<{ id: string, moved: number, from: number, to: number }>} */ const out = [];
  for (const [id, oldList] of before) {
    const newList = after.get(id);
    if (!newList) continue;
    const a = once(oldList), b = once(newList);
    let moved = 0, from = -1, to = -1;
    for (const [s, i] of a) {
      const j = b.get(s);
      if (j !== undefined && j !== i) { if (!moved) { from = i; to = j; } moved++; }
    }
    if (moved) out.push({ id, moved, from, to });
  }
  return out;
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function main() {
  const bi = process.argv.indexOf('--base');
  const base = bi >= 0 ? process.argv[bi + 1] : null;
  const files = (base
    ? git(['diff', '--name-only', base, '--', DATA])
    : git(['diff', '--cached', '--name-only', '--diff-filter=M', '--', DATA]))
    .split('\n').map((s) => s.trim()).filter((f) => KEYED.test(f));
  if (!files.length) return 0;
  let bad = 0;
  for (const f of files) {
    let before, after;
    try {
      before = entriesOf(git(['show', (base || 'HEAD') + ':' + f]));
      const now = base ? (existsSync(resolve(root, f)) ? readFileSync(resolve(root, f), 'utf8') : null) : git(['show', ':' + f]);
      if (now == null) continue;
      after = entriesOf(now);
    } catch (e) {
      console.log('[mark-anchors] could not read ' + f + ' (' + (e && e.message) + ') - skipped');
      continue;
    }
    const shifts = shiftedEntries(before, after);
    for (const s of shifts) {
      bad++;
      console.log('[mark-anchors] ' + f.slice(DATA.length) + ': ' + s.id + ' - ' + s.moved
        + ' unchanged block' + (s.moved === 1 ? '' : 's') + ' at a new index (first: ' + s.from + ' -> ' + s.to + ')');
    }
  }
  if (!bad) { console.log('[mark-anchors] ok - no unchanged block moved in ' + files.length + ' keyed file(s)'); return 0; }
  if (process.env.ACCEPT_MARK_SHIFT === '1') {
    console.log('[mark-anchors] ACCEPT_MARK_SHIFT=1: ' + bad + ' shifted entr' + (bad === 1 ? 'y' : 'ies') + ' let through; say so in the commit.');
    return 0;
  }
  console.log('[mark-anchors] FAIL: readers\' marks on these entries would move onto other words.');
  console.log('  Edit in place, or add new paragraphs after the last unchanged one; if the move is intended,');
  console.log('  commit with ACCEPT_MARK_SHIFT=1 and say so (marks are keyed by position: utils/hl-keys.js).');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
