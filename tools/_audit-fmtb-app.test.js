/* _audit-fmtb-app — Format B audit dump: VM-load each WTLB/Blessed data file
   and dump a normalized JSON record per entry. The script exports nothing
   and runs at import, so each case mirrors the real
   tools/_audit-fmtb-app.mjs into a throwaway repo tree with fixture data
   files and runs it as a child process, exactly as the check-app-size
   precedent does. Fixtures only, never the real corpus. Fully offline,
   deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '_audit-fmtb-app.mjs');

// file -> the collection label used in the comparison report (mirrors the script)
const FILES = { 'wtlb-one': 'WTLB One', 'wtlb-two': 'WTLB Two', 'the-blessed': 'The Blessed' };

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

function minimalEntry(file) {
  return { id: `e-${file}`, num: 1, title: `Entry ${file}`, paragraphs: [{ text: 'hello world' }] };
}

/** A throwaway repo mirror with the real script + one fixture data file per
 * FILES key. `overrides[file]` replaces that file's source outright,
 * `broken` files get a syntax error, `omit` files are left out entirely. */
function mirror({ overrides = {}, broken = [], omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-audit-b-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, '_audit-fmtb-app.mjs'));
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  for (const file of Object.keys(FILES)) {
    if (omit.includes(file)) continue;
    if (broken.includes(file)) { writeFileSync(join(dataDir, `${file}.js`), 'var BROKEN = [;\n'); continue; }
    const src = overrides[file] ?? `var DATA = [${JSON.stringify(minimalEntry(file))}];\n`;
    writeFileSync(join(dataDir, `${file}.js`), src);
  }
  return { root };
}

function run(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', '_audit-fmtb-app.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function dump(root) {
  return JSON.parse(readFileSync(join(root, 'tools', '_audit-fmtb-app.json'), 'utf-8'));
}

describe('_audit-fmtb-app', () => {
  it('dumps one normalized entry per file, under the script labels', () => {
    const { root } = mirror();
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Dumped Format B app data:');
    const out = dump(root);
    expect(Object.keys(out).sort()).toEqual(Object.values(FILES).sort());
    for (const [file, label] of Object.entries(FILES)) {
      expect(r.stdout).toContain(`${label}: 1 entries`);
      expect(out[label]).toHaveLength(1);
      expect(out[label][0]).toMatchObject({
        id: `e-${file}`, num: 1, title: `Entry ${file}`, paraCount: 1,
        bodyText: 'hello world', bodyWords: 2,
        bodyHead: 'hello world', bodyTail: 'hello world',
        refs: [], navs: [], attribs: [], scripturesKeys: [], prev: null, next: null,
      });
    }
  });

  it('strips Format B markup and collects refs, navs and attribs', () => {
    const entry = {
      id: 'e1', num: 1, title: '  Entry  One ',
      paragraphs: [
        { text: 'Hello {{ref:John 3:16}} world {{nav:next}} ~ [From The Lord] **bold** _it_ † end' },
        { text: 'Second para' },
      ],
      scriptures: { a: 1 },
      prevEntry: { id: 'p' }, nextEntry: { id: 'n' },
    };
    const { root } = mirror({ overrides: { 'wtlb-one': `var DATA = [${JSON.stringify(entry)}];\n` } });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(dump(root)['WTLB One'][0]).toEqual({
      id: 'e1', num: 1, title: 'Entry One', paraCount: 2,
      bodyText: 'Hello world bold it end Second para', bodyWords: 7,
      bodyHead: 'Hello world bold it end Second para',
      bodyTail: 'Hello world bold it end Second para',
      refs: ['John 3:16'], navs: ['next'], attribs: ['The Lord'],
      scripturesKeys: ['a'], prev: 'p', next: 'n',
    });
  });

  it('head is the first twelve words and tail the last twelve', () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i + 1}`);
    const entry = { id: 'long', num: 2, title: 'Long', paragraphs: [{ text: words.join(' ') }] };
    const { root } = mirror({ overrides: { 'wtlb-two': `var DATA = [${JSON.stringify(entry)}];\n` } });
    const r = run(root);
    expect(r.status).toBe(0);
    const rec = dump(root)['WTLB Two'][0];
    expect(rec.bodyWords).toBe(20);
    expect(rec.bodyHead).toBe(words.slice(0, 12).join(' '));
    expect(rec.bodyTail).toBe(words.slice(-12).join(' '));
  });

  it('skips entries without paragraphs', () => {
    // the script gates the array on its first entry, so the paragraphs entry
    // must come first; the paragraph-less entry after it is skipped
    const src = `var DATA = [${JSON.stringify(minimalEntry('wtlb-two'))}, { "id": "nope", "num": 2, "title": "No Paras" }];\n`;
    const { root } = mirror({ overrides: { 'wtlb-two': src } });
    const r = run(root);
    expect(r.status).toBe(0);
    const two = dump(root)['WTLB Two'];
    expect(two).toHaveLength(1);
    expect(two[0].id).toBe('e-wtlb-two');
  });

  it('skips a file whose source fails to eval and keeps the rest', () => {
    const { root } = mirror({ broken: ['the-blessed'] });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[the-blessed] EVAL ERROR');
    // the script continues before out[label] is set, so the label is absent
    // from the dump and the report, not present with zero entries
    expect(r.stdout).not.toContain('The Blessed');
    expect(dump(root)['The Blessed']).toBeUndefined();
    expect(dump(root)['WTLB One']).toHaveLength(1);
  });

  it('crashes (non-zero) when a data file is missing — a crash, not a verdict', () => {
    const { root } = mirror({ omit: ['wtlb-two'] });
    const r = run(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('ENOENT');
  });
});
