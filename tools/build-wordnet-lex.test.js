/**
 * tools/build-wordnet-lex.test.js — tests for tools/build-wordnet-lex.mjs.
 *
 * The script runs at import, exports nothing, and writes the lexicon file it
 * is given (defaulting to the assets root), so it cannot be imported into
 * vitest. Each case mirrors the real script (plus lexicon-lib.mjs, corpus.mjs
 * and the search files they reach) into a throwaway repo tree with a fixture
 * pairs.tsv, then runs the script as a child process, exactly as the build
 * does. VOT_ASSETS points the mirror at its own assets, and --out always
 * points at a temp file, so nothing is read from or written to the real tree.
 * Fully offline, deterministic. Precedent: tools/build-slips.test.js
 * (votreader-tests-3 item 5b), which shares this mirror shape.
 *
 * Fixture pairs (word, word, relation, sense ranks — what
 * tools/wordnet-pairs.py writes):
 *   creator/maker syn 1 1     one synset, close senses -> 0.7, kept
 *   wide/broad sim 1 2        similar-to, close senses -> 0.6, kept
 *   silent/quiet syn 1 3      one synset, a loose sense -> 0.5, kept
 *   tread/walk hyp 1 1        hypernym, close senses -> 0.5, kept
 *   walk/run hyp 1 3          hypernym through a rarer sense -> dropped
 *   walk/walking syn 1 1      one lemma -> dropped
 *   quixotic/zanzibar syn 1 1 outside the corpus -> dropped
 *   the/quick syn 1 1         a stop word -> dropped
 *   mercy/compassion syn 1 3  already credited by align.js (SYNONYM_MAP,
 *            probed 2026-11-20: credited at 0.5 both ways, not at 0.7, so
 *            the loose 0.5 tier is what drops it) -> dropped
 * The kept words all sit in the fixture vocabulary (the BOOKS-only seeder
 * verse, john 1:10 — see build-slips.test.js). Pairs pack under the lemma
 * that sorts first (formatLexicon), so wide/broad packs as "broad wid6" and
 * silent/quiet as "quiet silent5". The bible files ride along
 * from the shared mirror shape; this script never reads them.
 *
 * The mirror carries the REAL search-data.js, not a stub: the builders' known()
 * check runs align.js against its SYNONYM_MAP, and a stub would answer
 * differently from the app. The corpus files are stubs, so the vocabulary is
 * the fixture BOOKS alone.
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
const SCRIPT = resolve(HERE, 'build-wordnet-lex.mjs');
const LEXICON_LIB = resolve(HERE, 'lexicon-lib.mjs');
const CORPUS = resolve(HERE, 'search-bench', 'corpus.mjs');
const SEARCH_DATA = resolve(ROOT, 'app/src/main/assets/search-data.js');
const SEARCH_SRC = resolve(ROOT, 'app/src/main/assets/src/search');
const UTILS_SRC = resolve(ROOT, 'app/src/main/assets/src/utils');

// The search files the script reaches (dynamic imports in
// build-wordnet-lex.mjs, plus what corpus.mjs/index-builder.js pull in).
const SEARCH_FILES = ['tokenize.js', 'ranking.js', 'passage.js', 'align.js', 'lexicon.js', 'word-forms.js', 'search-data.js', 'index-builder.js'];
const UTILS_FILES = ['segment-dom-text.js', 'format-b-inline.js'];

// The corpus files loadCorpus() runs (tools/search-bench/corpus.mjs CORPORA).
const CORPORA = ['books', 'matthew', 'matthew-plain', 'volume-one', 'volume-two', 'volume-three', 'volume-four', 'volume-five', 'volume-six', 'volume-seven', 'letters-timothy', 'letters-flock', 'lords-rebuke', 'wtlb-one', 'wtlb-two', 'the-blessed', 'holy-days', 'answers', 'bible-studies'];
const BIBLE_VERSIONS = ['kjv', 'asv', 'web', 'bsb', 'ylt', 'lsv', 'hnv'];

// The NKJV text of every fixture verse (the Y-side wording), plus the
// BOOKS-only vocab seeder at 1:10 — shared with build-slips.test.js.
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
          // says: dish (the NKJV verses all say platter), and this file's
          // fixture words.
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

const PAIRS_TSV = [
  'creator\tmaker\tsyn\t1\t1',
  'mercy\tcompassion\tsyn\t1\t3',
  'quixotic\tzanzibar\tsyn\t1\t1',
  'silent\tquiet\tsyn\t1\t3',
  'the\tquick\tsyn\t1\t1',
  'tread\twalk\thyp\t1\t1',
  'walk\trun\thyp\t1\t3',
  'walk\twalking\tsyn\t1\t1',
  'wide\tbroad\tsim\t1\t2',
].join('\n') + '\n';

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + fixture data + pairs.tsv. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-wordnet-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(join(toolsDir, 'search-bench'), { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'build-wordnet-lex.mjs'));
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
  const pairsFile = join(root, 'pairs.tsv');
  writeFileSync(pairsFile, PAIRS_TSV);
  return { root, assetsDir, pairsFile };
}

function runScript(root, assetsDir, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'build-wordnet-lex.mjs'), ...args], {
    encoding: 'utf8', cwd: root, env: { ...process.env, VOT_ASSETS: assetsDir },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('build-wordnet-lex', () => {
  it('writes the wordnet lexicon for the fixture pairs and reports its counts', () => {
    const { root, assetsDir, pairsFile } = mirror();
    const out = join(root, 'out.json');
    const r = runScript(root, assetsDir, [pairsFile, '--out', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[wordnet-lex\] 9 WordNet pairs: 2 with a word outside the corpus or a stop word, 1 one lemma, 0 under another word's lemma, 1 a kind of the other through a rarer sense, 1 already credited -> 4 lemma pairs \(credits \[\["5",2\],\["6",1\],\["7",1\]\]\), \d+ bytes/);
    expect(existsSync(out)).toBe(true);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    expect(j.name).toBe('wordnet');
    expect(j.generator).toBe('tools/wordnet-pairs.py, then tools/build-wordnet-lex.mjs');
    expect(j.pairs).toBe(4);
    // The four kept pairs, one per credit tier. The dropped rows leave no
    // pair behind, and the counts above pin that each was seen and left out
    // for its own reason rather than never read.
    expect(j.lexicon).toBe('broad wid6\ncreator maker7\nquiet silent5\ntread walk5');
    expect(j.license).toContain('WordNet 3.1 Copyright 2011 by Princeton University');
  });

  it('--no-hyp leaves the hypernym tier out', () => {
    const { root, assetsDir, pairsFile } = mirror();
    const out = join(root, 'out.json');
    const r = runScript(root, assetsDir, [pairsFile, '--out', out, '--no-hyp']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[wordnet-lex\] 7 WordNet pairs: 2 with a word outside the corpus or a stop word, 1 one lemma, 0 under another word's lemma, 0 a kind of the other through a rarer sense, 1 already credited -> 3 lemma pairs \(credits \[\["5",1\],\["6",1\],\["7",1\]\]\), \d+ bytes/);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    expect(j.name).toBe('wordnet-synonyms');
    expect(j.pairs).toBe(3);
    expect(j.lexicon).toBe('broad wid6\ncreator maker7\nquiet silent5');
  });

  it('--check passes once the file is written and names it current', () => {
    const { root, assetsDir, pairsFile } = mirror();
    const out = join(root, 'out.json');
    expect(runScript(root, assetsDir, [pairsFile, '--out', out]).status).toBe(0);
    const r = runScript(root, assetsDir, [pairsFile, '--out', out, '--check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('9 WordNet pairs');
    expect(r.stdout).toContain(': current');
  });

  it('--check fails when the file is missing and when it is stale', () => {
    const { root, assetsDir, pairsFile } = mirror();
    const out = join(root, 'out.json');
    const missing = runScript(root, assetsDir, [pairsFile, '--out', out, '--check']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('is stale');
    expect(runScript(root, assetsDir, [pairsFile, '--out', out]).status).toBe(0);
    writeFileSync(out, '{"pairs":0}\n');
    const stale = runScript(root, assetsDir, [pairsFile, '--out', out, '--check']);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('is stale');
  });

  it('is deterministic: a second run writes byte-identical output', () => {
    const { root, assetsDir, pairsFile } = mirror();
    const out = join(root, 'out.json');
    expect(runScript(root, assetsDir, [pairsFile, '--out', out]).status).toBe(0);
    const first = readFileSync(out, 'utf8');
    expect(runScript(root, assetsDir, [pairsFile, '--out', out]).status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(first);
  });

  it('exits 2 with usage and no pairs file', () => {
    const { root, assetsDir } = mirror();
    const r = runScript(root, assetsDir, []);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: node tools/build-wordnet-lex.mjs');
    expect(existsSync(join(root, 'out.json'))).toBe(false);
  });
});
