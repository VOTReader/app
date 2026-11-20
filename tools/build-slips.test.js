/**
 * tools/build-slips.test.js — tests for tools/build-slips.mjs.
 *
 * The script runs at import, exports nothing, and writes the lexicon file it
 * is given, so it cannot be imported into vitest. Each case mirrors the real
 * script (plus lexicon-lib.mjs, corpus.mjs and the search files they reach)
 * into a throwaway repo tree with fixture translations, then runs the script
 * as a child process, exactly as the build does. VOT_ASSETS points the mirror
 * at its own assets, so nothing is read from or written to the real tree.
 * Fully offline, deterministic. Precedent: tools/build-kjv-twin.test.js
 * (votreader-tests-3 item 1), tools/gen-restored-nt.test.js (item 5a).
 *
 * Fixture verses (book john, chapter 1) — KJV and YLT say the X word, ASV,
 * WEB, BSB, LSV, HNV and NKJV say the Y word, so each differing verse gives
 * 12 translation-pair observations (6 from KJV, 3 from YLT, 3 the other way
 * round: asv/web/bsb against YLT):
 *   1:1-1:3  amazed / astonished  (3 verses, 36 observations)
 *   1:4-1:6  dish / platter       (3 verses, 36 observations)
 *   1:7      the moved word: both sides say "amazed" as well, so the one
 *            swap is a word that moved, not one that was traded
 *   1:8      the stop word: "The" against "A"
 *   1:9      the short word: "go" (2 letters) against "run"
 * The two kept pairs are exclusive — each lemma trades only with the other —
 * so NPMI is 1 and both keep credit 0.9 (72 swaps in all, 12 moved).
 * The NKJV text is the Y-side wording, so the corpus vocabulary holds the
 * words only the other translations say. Verse 1:10 is BOOKS-only and seeds
 * the vocabulary with dish (the NKJV verses all say platter) and with the
 * wordnet-lex fixture's words (see build-wordnet-lex.test.js, which shares
 * this mirror shape).
 *
 * The mirror carries the REAL search-data.js, not a stub: the builders' known()
 * check runs align.js against its SYNONYM_MAP, and a stub would answer
 * differently from the app (probed 2026-11-20: mercy/compassion are credited
 * only through the real tables). The corpus files are stubs, so the vocabulary
 * is the fixture BOOKS alone.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = resolve(HERE, 'build-slips.mjs');
const LEXICON_LIB = resolve(HERE, 'lexicon-lib.mjs');
const CORPUS = resolve(HERE, 'search-bench', 'corpus.mjs');
const SEARCH_DATA = resolve(ROOT, 'app/src/main/assets/search-data.js');
const SEARCH_SRC = resolve(ROOT, 'app/src/main/assets/src/search');
const UTILS_SRC = resolve(ROOT, 'app/src/main/assets/src/utils');

// The search files the script reaches (dynamic imports in build-slips.mjs,
// plus what corpus.mjs/index-builder.js pull in). word-forms.js has no
// imports of its own; search-data.js (module) is the accessor, not the data.
const SEARCH_FILES = ['tokenize.js', 'ranking.js', 'passage.js', 'align.js', 'lexicon.js', 'word-forms.js', 'search-data.js', 'index-builder.js'];
const UTILS_FILES = ['segment-dom-text.js', 'format-b-inline.js'];

// The corpus files loadCorpus() runs (tools/search-bench/corpus.mjs CORPORA).
const CORPORA = ['books', 'matthew', 'matthew-plain', 'volume-one', 'volume-two', 'volume-three', 'volume-four', 'volume-five', 'volume-six', 'volume-seven', 'letters-timothy', 'letters-flock', 'lords-rebuke', 'wtlb-one', 'wtlb-two', 'the-blessed', 'holy-days', 'answers', 'bible-studies'];
const BIBLE_VERSIONS = ['kjv', 'asv', 'web', 'bsb', 'ylt', 'lsv', 'hnv'];

// The NKJV text of every fixture verse (the Y-side wording), plus the
// BOOKS-only vocab seeder at 1:10.
const BOOKS_OBJ = {
  john: {
    id: 'john', title: 'John',
    chapters: [
      {
        num: 1,
        sections: [{ verses: [
          { n: 1, text: 'And they were astonished at his teaching.' },
          { n: 2, text: 'The people were astonished at the words he spoke.' },
          { n: 3, text: 'They were astonished at the mighty works.' },
          { n: 4, text: 'He took the platter from the table.' },
          { n: 5, text: 'She set the platter before the guests.' },
          { n: 6, text: 'Bring the platter to the table.' },
          { n: 7, text: 'They were astonished at his teaching, and the crowd was amazed.' },
          { n: 8, text: 'A quick brown fox jumps over the lazy dog.' },
          { n: 9, text: 'He told them to run at once.' },
          // BOOKS-only: in no bible file, so it never takes part in a swap.
          // Seeds the vocabulary with the fixture words the NKJV text never
          // says: dish (the NKJV verses all say platter), and the
          // wordnet-lex fixture's words.
          { n: 10, text: 'The creator and maker walk the wide broad road, tread in silent quiet, showing mercy and compassion to all who are walking; a dish stands ready for the guests.' },
        ] }],
      },
    ],
  },
};

const X_VERSES = [ // kjv, ylt
  { n: 1, text: 'And they were amazed at his teaching.' },
  { n: 2, text: 'The people were amazed at the words he spoke.' },
  { n: 3, text: 'They were amazed at the mighty works.' },
  { n: 4, text: 'He took the dish from the table.' },
  { n: 5, text: 'She set the dish before the guests.' },
  { n: 6, text: 'Bring the dish to the table.' },
  { n: 7, text: 'They were amazed at his teaching, and the crowd was amazed.' },
  { n: 8, text: 'The quick brown fox jumps over the lazy dog.' },
  { n: 9, text: 'He told them to go at once.' },
];

const Y_VERSES = [ // asv, web, bsb, lsv, hnv
  { n: 1, text: 'And they were astonished at his teaching.' },
  { n: 2, text: 'The people were astonished at the words he spoke.' },
  { n: 3, text: 'They were astonished at the mighty works.' },
  { n: 4, text: 'He took the platter from the table.' },
  { n: 5, text: 'She set the platter before the guests.' },
  { n: 6, text: 'Bring the platter to the table.' },
  { n: 7, text: 'They were astonished at his teaching, and the crowd was amazed.' },
  { n: 8, text: 'A quick brown fox jumps over the lazy dog.' },
  { n: 9, text: 'He told them to run at once.' },
];

const BIBLES = {
  kjv: { john: { 1: X_VERSES } },
  ylt: { john: { 1: X_VERSES } },
  asv: { john: { 1: Y_VERSES } },
  web: { john: { 1: Y_VERSES } },
  bsb: { john: { 1: Y_VERSES } },
  lsv: { john: { 1: Y_VERSES } },
  hnv: { john: { 1: Y_VERSES } },
};

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + fixture data files. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-slips-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(join(toolsDir, 'search-bench'), { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'build-slips.mjs'));
  copyFileSync(LEXICON_LIB, join(toolsDir, 'lexicon-lib.mjs'));
  copyFileSync(CORPUS, join(toolsDir, 'search-bench', 'corpus.mjs'));
  const assetsDir = join(root, 'app', 'src', 'main', 'assets');
  const dataDir = join(assetsDir, 'src', 'data');
  const searchDir = join(assetsDir, 'src', 'search');
  const utilsDir = join(assetsDir, 'src', 'utils');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(searchDir, { recursive: true });
  mkdirSync(utilsDir, { recursive: true });
  copyFileSync(SEARCH_DATA, join(assetsDir, 'search-data.js'));
  for (const f of SEARCH_FILES) copyFileSync(resolve(SEARCH_SRC, f), join(searchDir, f));
  for (const f of UTILS_FILES) copyFileSync(resolve(UTILS_SRC, f), join(utilsDir, f));
  for (const f of CORPORA) {
    writeFileSync(join(dataDir, f + '.js'), f === 'books' ? `var BOOKS = ${JSON.stringify(BOOKS_OBJ)};\n` : f === 'matthew-plain' ? 'var MATTHEW_PLAIN = { chapters: [] };\n' : '');
  }
  for (const v of BIBLE_VERSIONS) writeFileSync(join(dataDir, `bible-${v}.js`), `var BIBLE_${v.toUpperCase()} = ${JSON.stringify(BIBLES[v])};\n`);
  return { root, assetsDir };
}

function runScript(root, assetsDir, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'build-slips.mjs'), ...args], {
    encoding: 'utf8', cwd: root, env: { ...process.env, VOT_ASSETS: assetsDir },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('build-slips', () => {
  it('writes the slips lexicon for the fixture verses and reports its counts', () => {
    const { root, assetsDir } = mirror();
    const out = join(root, 'out.json');
    const r = runScript(root, assetsDir, ['--out', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[slips\] 9 verses, 72 swaps \(12 moved words and 0 under another word's lemma left out\), 2 lemma pairs: 0 under 3, 0 in under 2 translation pairs, 0 unassociated, 0 already credited -> 2 kept, \d+ bytes -> /);
    expect(r.stdout).toContain(out);
    expect(existsSync(out)).toBe(true);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    expect(j.name).toBe('slips');
    expect(j.generator).toBe('tools/build-slips.mjs');
    expect(j.pairs).toBe(2);
    // The two kept pairs, both exclusive, both credit 0.9. Nothing else:
    // the moved verse (1:7), the stop word (1:8) and the short word (1:9)
    // leave no pair behind, and the counts above pin that they were seen
    // and left out rather than never detected.
    expect(j.lexicon).toBe('amaz astonish9\ndish platter9');
    expect(j.about).toContain('search200 B7');
    expect(j.source).toContain('tools/build-slips.mjs');
  });

  it('--stats prints the credit histogram and the strongest pairs', () => {
    const { root, assetsDir } = mirror();
    const out = join(root, 'out.json');
    const r = runScript(root, assetsDir, ['--out', out, '--stats']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[slips] credit histogram [[0.9,2]]');
    expect(r.stdout).toContain('  amaz astonish 0.9 n=36 vp=12');
    expect(r.stdout).toContain('  dish platter 0.9 n=36 vp=12');
  });

  it('is deterministic: a second run writes byte-identical output', () => {
    const { root, assetsDir } = mirror();
    const out = join(root, 'out.json');
    expect(runScript(root, assetsDir, ['--out', out]).status).toBe(0);
    const first = readFileSync(out, 'utf8');
    expect(runScript(root, assetsDir, ['--out', out]).status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(first);
  });

  it('exits 2 with usage and no --out', () => {
    const { root, assetsDir } = mirror();
    const r = runScript(root, assetsDir, []);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: node tools/build-slips.mjs --out <file.json> [--stats]');
    expect(existsSync(join(root, 'out.json'))).toBe(false);
  });
});
