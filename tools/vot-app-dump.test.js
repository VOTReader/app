/* vot-app-dump — dump the app's shipped corpus text as JSON per collection.
 * The script exports nothing and runs at import, so each case mirrors the
 * real tools/vot-app-dump.mjs into a throwaway repo tree with fixture data
 * files and runs it as a child process, exactly as the _audit-dump-app
 * precedent (votreader-tests-5 item 1) does. Fixtures only, never the real
 * corpus. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'vot-app-dump.mjs');

// The script's own FILES table: only these two get fixtures; the other 15
// are omitted on purpose, so the run also proves the missing-file path.
const VOLUME_ONE = `var LETTERS_V1 = {
  "id": "a-word-of-warning",
  "title": "A Word of Warning",
  "blocks": [
    { "type": "poetry", "lines": [[{ "t": "italic", "v": "Thus says The Lord" }]] },
    { "type": "verse", "lines": [[{ "t": "plain", "v": "To everyone who hears" }]] }
  ],
  "nkjv": { "1:1": "In the beginning God created" },
  "footnotes": ["note one", "note two"],
  "audioUrl": "https://example.com/audio.mp3",
  "see": "https://example.com/see",
  "notes": [{ "text": "a reader note" }]
};
var SECOND = {
  "title": "Second letter",
  "blocks": [{ "lines": [[{ "v": "Peace be upon you" }, { "v": "double  spaced   words" }]] }]
};
`;

const WTLB_ONE = `var WTLB = {
  "title": "WTLB One",
  "blocks": [{ "lines": [[{ "v": "Blessed are the poor" }]] }]
};
`;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

function mirror({ volumeOne = VOLUME_ONE, wtlbOne = WTLB_ONE } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-app-dump-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'vot-app-dump.mjs'));
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'volume-one.js'), volumeOne);
  writeFileSync(join(dataDir, 'wtlb-one.js'), wtlbOne);
  return { root };
}

function run(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'vot-app-dump.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function dumpJson(root, name) {
  return JSON.parse(readFileSync(join(root, '_ocr_out', 'vot', '_app-text', `${name}.json`), 'utf-8'));
}

describe('vot-app-dump', () => {
  it('collects body strings and splits apparatus off, with word counts', () => {
    const { root } = mirror();
    const r = run(root);
    expect(r.status).toBe(0);
    const out = dumpJson(root, 'volume-one');
    expect(out.collection).toBe('volume-one');
    expect(out.file).toBe('volume-one.js');
    expect(out.globals.sort()).toEqual(['LETTERS_V1', 'SECOND']);
    // Body: title + the v strings; the double-spaced string counts 3 words.
    expect(out.strings).toEqual([
      'A Word of Warning',
      'Thus says The Lord',
      'To everyone who hears',
      'Second letter',
      'Peace be upon you',
      'double  spaced   words',
    ]);
    expect(out.words).toBe(21);
    // Apparatus: nkjv + footnotes + notes, including nested under apparatus keys.
    expect(out.apparatus).toEqual([
      'In the beginning God created',
      'note one',
      'note two',
      'a reader note',
    ]);
    expect(out.apparatus_words).toBe(12);
  });

  it('skips machinery keys and https URLs, even under plain keys', () => {
    const { root } = mirror();
    const r = run(root);
    expect(r.status).toBe(0);
    const out = dumpJson(root, 'volume-one');
    const all = [...out.strings, ...out.apparatus];
    expect(all).not.toContain('a-word-of-warning'); // id: skip key
    expect(all).not.toContain('poetry'); // type: skip key
    expect(all).not.toContain('italic'); // t: skip key
    expect(all).not.toContain('https://example.com/audio.mp3'); // audioUrl: skip key
    expect(all).not.toContain('https://example.com/see'); // https URL under a plain key
  });

  it('dumps every fixture collection and logs the missing ones', () => {
    const { root } = mirror();
    const r = run(root);
    expect(r.status).toBe(0);
    const wtlb = dumpJson(root, 'wtlb-one');
    expect(wtlb.strings).toEqual(['WTLB One', 'Blessed are the poor']);
    expect(wtlb.words).toBe(6);
    expect(wtlb.apparatus).toEqual([]);
    expect(wtlb.apparatus_words).toBe(0);
    expect(existsSync(join(root, '_ocr_out', 'vot', '_app-text', 'volume-two.json'))).toBe(false);
    expect(r.stdout).toContain('missing volume-two.js');
    expect(r.stdout).toContain('total app words dumped: 27');
  });

  it('fails loudly on a broken data file instead of dumping half a corpus', () => {
    const { root } = mirror({ volumeOne: 'var BROKEN = [;\n' });
    const r = run(root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('volume-one.js');
    expect(existsSync(join(root, '_ocr_out', 'vot', '_app-text', 'volume-one.json'))).toBe(false);
  });
});
