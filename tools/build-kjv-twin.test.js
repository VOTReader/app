/**
 * tools/build-kjv-twin.test.js — tests for tools/build-kjv-twin.mjs.
 *
 * The script runs at import, exports nothing, and writes the real
 * search-kjv-twin.json, so it cannot be imported into vitest. Each case
 * mirrors the real script (plus corpus.mjs and the two search files it
 * reaches) into a throwaway repo tree with stub data files and a tiny
 * fixture bible-kjv.js, then runs the script as a child process, exactly
 * as the build does. VOT_ASSETS points the mirror at its own assets, so
 * nothing is read from or written to the real tree. Fully offline,
 * deterministic. Precedent: tools/check-app-size.test.js,
 * tools/sync-sw-version.test.js (votreader-tests-2).
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
const SCRIPT = resolve(HERE, 'build-kjv-twin.mjs');
const CORPUS = resolve(HERE, 'search-bench', 'corpus.mjs');
const KJV_TWIN = resolve(ROOT, 'app/src/main/assets/src/search/kjv-twin.js');
const TOKENIZE = resolve(ROOT, 'app/src/main/assets/src/search/tokenize.js');

// The corpus files loadCorpus() runs (tools/search-bench/corpus.mjs CORPORA).
const CORPORA = ['books', 'matthew', 'matthew-plain', 'volume-one', 'volume-two', 'volume-three', 'volume-four', 'volume-five', 'volume-six', 'volume-seven', 'letters-timothy', 'letters-flock', 'lords-rebuke', 'wtlb-one', 'wtlb-two', 'the-blessed', 'holy-days', 'answers', 'bible-studies'];

const BIBLE_FIXTURE = `var BIBLE_KJV = {
  genesis: { 1: [
    { n: 1, text: 'In the beginning God created the heaven and the earth.' },
    { n: 2, text: 'And the earth was without form, and void; and darkness was upon the face of the deep.' },
  ] },
  exodus: { 1: [
    { n: 1, text: 'Now these are the names of the children of Israel, which came into Egypt.' },
  ] },
};
`;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + stub data + fixture bible. */
function mirror({ bible = BIBLE_FIXTURE } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-kjv-twin-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(join(toolsDir, 'search-bench'), { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'build-kjv-twin.mjs'));
  copyFileSync(CORPUS, join(toolsDir, 'search-bench', 'corpus.mjs'));
  const assetsDir = join(root, 'app', 'src', 'main', 'assets');
  const dataDir = join(assetsDir, 'src', 'data');
  const searchDir = join(assetsDir, 'src', 'search');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(searchDir, { recursive: true });
  writeFileSync(join(assetsDir, 'search-data.js'), 'var VotSearchData = { VOLUME_COLLECTIONS: [] };\n');
  for (const f of CORPORA) {
    writeFileSync(join(dataDir, f + '.js'), f === 'books' ? 'var BOOKS = {};\n' : '');
  }
  writeFileSync(join(dataDir, 'bible-kjv.js'), bible);
  copyFileSync(KJV_TWIN, join(searchDir, 'kjv-twin.js'));
  copyFileSync(TOKENIZE, join(searchDir, 'tokenize.js'));
  return { root, assetsDir, out: join(assetsDir, 'search-kjv-twin.json') };
}

function runScript(root, assetsDir, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'build-kjv-twin.mjs'), ...args], {
    encoding: 'utf8', cwd: root, env: { ...process.env, VOT_ASSETS: assetsDir },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('build-kjv-twin', () => {
  it('writes the twin file for the fixture bible and reports its counts', () => {
    const { root, assetsDir, out } = mirror();
    const r = runScript(root, assetsDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[kjv-twin] wrote');
    expect(r.stdout).toContain('3 verses');
    expect(existsSync(out)).toBe(true);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    expect(j.format).toBe(1);
    expect(j.books).toEqual(['genesis', 'exodus']);
    expect(j.chapters).toEqual([[2], [1]]);
    expect(j.words).toContain('beginning');
    expect(typeof j.verses).toBe('string');
    expect(j.verses.length).toBeGreaterThan(0);
  });

  it('--check passes once the file is written and names it current', () => {
    const { root, assetsDir } = mirror();
    expect(runScript(root, assetsDir).status).toBe(0);
    const r = runScript(root, assetsDir, ['--check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[kjv-twin] current (3 verses');
  });

  it('--check fails when the file is missing and says stale', () => {
    const { root, assetsDir } = mirror();
    const r = runScript(root, assetsDir, ['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[kjv-twin] search-kjv-twin.json is stale');
  });

  it('--check fails when the file is stale', () => {
    const { root, assetsDir, out } = mirror();
    expect(runScript(root, assetsDir).status).toBe(0);
    writeFileSync(out, '{"format":1}\n');
    const r = runScript(root, assetsDir, ['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[kjv-twin] search-kjv-twin.json is stale');
  });

  it('fails loud on a bible whose verses are out of order', () => {
    const bad = `var BIBLE_KJV = { genesis: { 1: [
      { n: 2, text: 'Second verse first.' },
      { n: 1, text: 'First verse second.' },
    ] } };
`;
    const { root, assetsDir } = mirror({ bible: bad });
    const r = runScript(root, assetsDir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('out of order');
  });
});
