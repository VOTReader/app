/* _audit-dump-app — Format A audit dump: VM-load each data file and dump a
   normalized JSON record per letter. The script exports nothing and runs at
   import, so each case mirrors the real tools/_audit-dump-app.mjs into a
   throwaway repo tree with fixture data files and runs it as a child
   process, exactly as the check-app-size precedent does. Fixtures only,
   never the real corpus. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '_audit-dump-app.mjs');

// file -> the collection label used in the comparison report (mirrors the script)
const FILES = {
  'volume-one': 'Volume One', 'volume-two': 'Volume Two', 'volume-three': 'Volume Three',
  'volume-four': 'Volume Four', 'volume-five': 'Volume Five', 'volume-six': 'Volume Six',
  'volume-seven': 'Volume Seven', 'lords-rebuke': "The Lord's Rebuke",
  'letters-flock': 'Letters to the Flock', 'letters-timothy': 'Letters from Timothy',
  'hidden-manna': 'Hidden Manna',
};

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

function minimalLetter(file) {
  return { id: `id-${file}`, title: `Title ${file}`, blocks: [{ segments: [{ v: 'hello' }] }] };
}

/** A throwaway repo mirror with the real script + one fixture data file per
 * FILES key. `overrides[file]` replaces that file's source outright,
 * `broken` files get a syntax error, `omit` files are left out entirely. */
function mirror({ overrides = {}, broken = [], omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-audit-a-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, '_audit-dump-app.mjs'));
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  for (const file of Object.keys(FILES)) {
    if (omit.includes(file)) continue;
    if (broken.includes(file)) { writeFileSync(join(dataDir, `${file}.js`), 'var BROKEN = [;\n'); continue; }
    const src = overrides[file] ?? `var DATA = [${JSON.stringify(minimalLetter(file))}];\n`;
    writeFileSync(join(dataDir, `${file}.js`), src);
  }
  return { root };
}

function run(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', '_audit-dump-app.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function dump(root) {
  return JSON.parse(readFileSync(join(root, 'tools', '_audit-app.json'), 'utf-8'));
}

describe('_audit-dump-app', () => {
  it('dumps one normalized letter per file, under the script labels', () => {
    const { root } = mirror();
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Dumped app data:');
    const out = dump(root);
    expect(Object.keys(out).sort()).toEqual(Object.values(FILES).sort());
    for (const [file, label] of Object.entries(FILES)) {
      expect(r.stdout).toContain(`${label}: 1 letters`);
      expect(out[label]).toHaveLength(1);
      expect(out[label][0]).toMatchObject({
        id: `id-${file}`, title: `Title ${file}`,
        bodyText: 'hello', bodyWords: 1, fnCount: 0,
      });
    }
  });

  it('normalizes the full letter shape: headers, blocks, footnotes, links', () => {
    const letter = {
      id: 'l1', title: '  Title   One  ',
      date: [{ v: 'Jan ' }, { v: '1' }], from: [{ v: 'From ' }, { v: 'The Lord' }],
      spoken: 'Spoken', forLine: 'For',
      noteLine: [{ v: 'note ' }, { v: 'text' }],
      sectionIntro: [{ segments: [{ v: 'Intro' }, { v: 'words' }] }],
      blocks: [
        { segments: [{ v: 'Body' }, { v: 'one' }] },
        { lines: [[{ v: 'line' }, { v: 'a' }], [{ v: 'line' }, { v: 'b' }]] },
        { text: 'plain text' },
        null, 'junk', { nope: true },
      ],
      footnotes: { 1: { type: 'note', ref: 'r1', text: ' fn  text ', seeAlso: true, url: 'http://x' } },
      relatedTopics: [{ label: '  Topic ', url: 'http://t' }],
      nkjv: { a: 1, b: 2 },
      metaAddendum: '  add  ', metaAddendumInternal: 'int',
      metaAddendumLink: 'lnk', metaAddendumUrl: 'http://u',
      prevLetter: { id: 'prev' }, nextLetter: { id: 'next' },
    };
    const { root } = mirror({ overrides: { 'volume-one': `var DATA = [${JSON.stringify(letter)}];\n` } });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(dump(root)['Volume One'][0]).toEqual({
      id: 'l1', title: 'Title One',
      date: 'Jan 1', from: 'From The Lord', spoken: 'Spoken', forLine: 'For',
      noteLine: 'note  text', // segText joins with ' ' and is not normed
      sectionIntroText: 'Intro words',
      bodyText: 'Intro words Body one line a line b plain text', bodyWords: 10,
      fnCount: 1,
      footnotes: [{ n: '1', type: 'note', ref: 'r1', text: 'fn text', hasSeeAlso: true, url: 'http://x' }],
      nkjvKeys: ['a', 'b'],
      relatedTopics: [{ label: 'Topic', url: 'http://t' }],
      metaAddendum: 'add', metaAddendumInternal: 'int',
      metaAddendumLink: 'lnk', metaAddendumUrl: 'http://u',
      prev: 'prev', next: 'next',
    });
  });

  it('unshifts a preface object ahead of the letters, flagged _preface', () => {
    const preface = { id: 'pref', title: 'Preface', blocks: [{ segments: [{ v: 'pre' }] }] };
    const src = `var PREFACE = ${JSON.stringify(preface)};\nvar DATA = [${JSON.stringify(minimalLetter('volume-two'))}];\n`;
    const { root } = mirror({ overrides: { 'volume-two': src } });
    const r = run(root);
    expect(r.status).toBe(0);
    const two = dump(root)['Volume Two'];
    expect(two).toHaveLength(2);
    expect(two[0]).toMatchObject({ id: 'pref', _preface: true });
    expect(two[1].id).toBe('id-volume-two');
  });

  it('skips a file whose source fails to eval and keeps the rest', () => {
    const { root } = mirror({ broken: ['volume-three'] });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[volume-three] EVAL ERROR');
    // the script continues before out[label] is set, so the label is absent
    // from the dump and the report, not present with zero letters
    expect(r.stdout).not.toContain('Volume Three');
    expect(dump(root)['Volume Three']).toBeUndefined();
    expect(dump(root)['Volume One']).toHaveLength(1);
  });

  it('dumps zero letters for an empty array file', () => {
    const { root } = mirror({ overrides: { 'volume-four': 'var DATA = [];\n' } });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(dump(root)['Volume Four']).toEqual([]);
  });

  it('crashes (non-zero) when a data file is missing — a crash, not a verdict', () => {
    const { root } = mirror({ omit: ['volume-four'] });
    const r = run(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('ENOENT');
  });
});
