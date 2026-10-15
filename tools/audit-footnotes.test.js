/**
 * audit-footnotes --check (W74, sweep 2026-10-13): a data file that fails to
 * load must fail the gate, and a dict problem counts once. Before the fix a
 * LOAD ERROR was logged and skipped, so a deleted or unparsable volume passed
 * with exit 0, and a bad dict value was counted in both `problems` and
 * `dictHard`. Each case runs the tool's main() in-process against a stub data
 * directory of empty collections: a cold node per case (5 per file) timed out
 * under a loaded pre-push (nw27, as hone-bible-sample in bc06316c3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { main } from './audit-footnotes.js';

// Every file and global the tool reads, as an empty collection.
const STUBS = {
  'volume-one.js': 'var LETTERS_V1 = []; var LETTERS_V1_PREFACE = null;',
  'volume-two.js': 'var LETTERS = [];',
  'volume-three.js': 'var LETTERS_V3 = []; var LETTERS_V3_PREFACE = null;',
  'volume-four.js': 'var LETTERS_V4 = []; var LETTERS_V4_PREFACE = null;',
  'volume-five.js': 'var LETTERS_V5 = []; var LETTERS_V5_PREFACE = null;',
  'volume-six.js': 'var LETTERS_V6 = []; var LETTERS_V6_PREFACE = null;',
  'volume-seven.js': 'var LETTERS_V7 = []; var LETTERS_V7_PREFACE = null;',
  'lords-rebuke.js': 'var LETTERS_REBUKE = []; var LETTERS_REBUKE_PREFACE = null;',
  'letters-timothy.js': 'var LETTERS_TIMOTHY = []; var LETTERS_TIMOTHY_PREFACE = null;',
  'letters-flock.js': 'var LETTERS_FLOCK = []; var LETTERS_FLOCK_PREFACE = null;',
  'hidden-manna.js': 'var HIDDEN_MANNA = [];',
  'holy-days.js': 'var HOLY_DAYS = [];',
  'wtlb-scriptures.js': 'var WTLB_SCRIPTURES = {};',
  'the-blessed.js': 'var THE_BLESSED_SCRIPTURES = {};',
  'matthew-nkjv.js': 'var MATTHEW_NKJV = {};',
};

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-fn-'));
  for (const [f, src] of Object.entries(STUBS)) writeFileSync(join(dir, f), src);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function check() {
  let stdout = '', stderr = '';
  const status = main(['--check'], { dataDir: dir, log: (s) => { stdout += s + '\n'; }, error: (s) => { stderr += s + '\n'; } });
  return { status, stdout, stderr };
}

describe('audit-footnotes --check', () => {
  it('passes a clean data set', () => {
    const r = check();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails when a collection file is missing', () => {
    rmSync(join(dir, 'holy-days.js'));
    const r = check();
    expect(r.stderr).toMatch(/LOAD ERROR holy-days\.js/);
    expect(r.status).toBe(1);
  });

  it('fails when a collection file does not parse', () => {
    writeFileSync(join(dir, 'volume-two.js'), 'var LETTERS = [{"id": "x",];');
    const r = check();
    expect(r.stderr).toMatch(/LOAD ERROR volume-two\.js/);
    expect(r.status).toBe(1);
  });

  it('fails when a dict source is not an object', () => {
    writeFileSync(join(dir, 'the-blessed.js'), 'var THE_BLESSED_SCRIPTURES = undefined;');
    const r = check();
    expect(r.status).toBe(1);
  });

  it('counts one bad dict value once', () => {
    writeFileSync(join(dir, 'wtlb-scriptures.js'), 'var WTLB_SCRIPTURES = {"John 3:16-17 label": "For God so loved the world."};');
    const r = check();
    expect(r.stdout).toMatch(/hard problems \(dup \+ white\): 1\b/);
    expect(r.status).toBe(1);
  });
});
