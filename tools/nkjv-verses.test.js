/**
 * tools/nkjv-verses.test.js — tests for tools/nkjv-verses.js.
 *
 * The script runs at import, exports nothing, and reads the repo's own
 * books.js and matthew-plain.js, so it cannot be imported into vitest.
 * The cases run the real script as a child process, exactly as a reader
 * would, against a throwaway repo mirror holding copies of those two real
 * data files (read-only inputs, never written). The script writes nothing,
 * so one mirror serves the whole file. Fully offline, deterministic.
 * Precedent: tools/check-app-size.test.js, tools/sync-sw-version.test.js
 * (votreader-tests-2).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = resolve(HERE, 'nkjv-verses.js');
const DATA = resolve(ROOT, 'app/src/main/assets/src/data');

let mirrorRoot;
beforeAll(() => {
  mirrorRoot = mkdtempSync(join(tmpdir(), 'vot-nkjv-verses-'));
  writeFileSync(join(mirrorRoot, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(mirrorRoot, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'nkjv-verses.js'));
  const dataDir = join(mirrorRoot, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  copyFileSync(join(DATA, 'books.js'), join(dataDir, 'books.js'));
  copyFileSync(join(DATA, 'matthew-plain.js'), join(dataDir, 'matthew-plain.js'));
});
afterAll(() => { if (mirrorRoot) rmSync(mirrorRoot, { recursive: true, force: true }); });

function runScript(args = []) {
  const r = spawnSync(process.execPath, [join(mirrorRoot, 'tools', 'nkjv-verses.js'), ...args], {
    encoding: 'utf8', cwd: mirrorRoot,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('nkjv-verses', () => {
  it('prints one verse with its "N." marker', () => {
    const r = runScript(['Genesis 1:1']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('──── Genesis 1:1 ────');
    expect(r.stdout).toContain('1. In the beginning God created the heavens and the earth.');
  });

  it('prints a range, each verse with its own marker', () => {
    const r = runScript(['Genesis 1:1-3']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1. In the beginning God created the heavens and the earth.');
    expect(r.stdout).toContain('2. ');
    expect(r.stdout).toContain('without form, and void');
    expect(r.stdout).toContain('3. ');
  });

  it('finds a book by alias (Psalm -> Psalms, Revelations -> Revelation)', () => {
    const ps = runScript(['Psalm 23:1']);
    expect(ps.status).toBe(0);
    expect(ps.stdout).toContain('1. A Psalm of David. The LORD is my shepherd; I shall not want.');
    const rev = runScript(['Revelations 1:1']);
    expect(rev.status).toBe(0);
    expect(rev.stdout).not.toContain('book not found');
    expect(rev.stdout).toContain('1. ');
  });

  it('reads Matthew from matthew-plain.js, not books.js', () => {
    const r = runScript(['Matthew 1:1']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1. The book of the genealogy of Jesus Christ');
  });

  it('says so when the book is not found', () => {
    const r = runScript(['Enoch 1:1']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('(book not found: Enoch)');
  });

  it('says so when the ref does not parse', () => {
    const r = runScript(['Genesis']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('(unparseable ref)');
  });

  it('marks a verse past the chapter end MISSING', () => {
    const r = runScript(['Genesis 1:32']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('32. *** MISSING ***');
  });

  it('prints nothing and exits 0 with no refs', () => {
    const r = runScript([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});
