/**
 * tools/extract-audio-fragments.test.js — tests for tools/extract-audio-fragments.mjs.
 *
 * The script runs at import, exports nothing, takes no arguments, and writes
 * tools/_align-work/fragments-all.json over the REAL corpus, so it cannot be
 * imported into vitest. Each case mirrors the real script into a throwaway
 * repo tree with fixture data files, then runs the script as a child process,
 * exactly as the build does. The script resolves its data dir from its own
 * location, so the mirror's layout is the whole trick: nothing is read from
 * or written to the real tree. Fully offline, deterministic. Precedent:
 * tools/gen-restored-nt.test.js (votreader-tests-3 item 5a).
 *
 * The fragment domain itself (sentence spans, clause splits, poetry joins)
 * is already pinned by tools/audio-fragments-lib.test.js; this file pins
 * only what the CLI adds: the mirror read, the keying, the counts line, and
 * the written file. The lib and segment-dom-text.js are copied into the
 * mirror as dependencies, not as things under test. A package.json
 * {"type":"module"} rides at the mirror root because segment-dom-text.js
 * is .js ESM (the mark-footnote-verses precedent).
 *
 * Fixture verses are short invented lines; the one rule they exercise is
 * the CLI's, not the corpus's.
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
const SCRIPT = resolve(HERE, 'extract-audio-fragments.mjs');
const LIB = resolve(HERE, 'audio-fragments-lib.mjs');
const SEGMENTS = resolve(ROOT, 'app', 'src', 'main', 'assets', 'src', 'utils', 'segment-dom-text.js');

/** One para block over a single-segment run: no collision-guard spaces. */
const para = (text) => ({ type: 'para', segments: [{ t: 'text', v: text }] });

const RICH_LETTER = {
  id: 'v1-preface',
  blocks: [
    { type: 'heading', text: 'A Heading' },
    para('One short sentence. Two short sentences here.'),
    {
      type: 'poetry',
      lines: [
        [{ t: 'text', v: 'Line one of the poem' }],
        [{ t: 'text', v: 'Line two follows' }],
      ],
    },
    { type: 'closing', text: 'Says The Lord.' },
  ],
};

const LONG_LETTER = {
  id: 'v1-letter-1',
  blocks: [
    para('The Lord speaks, and the people listen; and the earth trembles at His voice, for He is holy.'),
  ],
};

const SHORT_LETTER = (id) => ({ id, blocks: [para('One short sentence. Two short sentences here.')] });

const WTLB_ONE = [
  {
    id: 'wtlb-entry-1',
    paragraphs: [
      { text: 'First paragraph here. {{ref:John 1:1}} speaks truth.' },
      { text: 'Second paragraph, plain and short.' },
    ],
  },
];

const WTLB_TWO = [
  {
    id: 'wtlb-entry-2',
    paragraphs: [{ text: 'A **bold** claim stands. Plain after.' }],
  },
];

const BLESSED = [
  {
    id: 'blessed-entry-1',
    paragraphs: [{ text: 'Blessed are the meek. They shall inherit.' }],
  },
];

const HOLY_DAYS = [
  { id: 'passover', blocks: [para('Holy day words. Short and true.')] },
  { id: 'tabernacles', paragraphs: [{ text: 'A holy convocation. Rejoice seven days.' }] },
];

const BIBLE_STUDIES = [
  {
    id: 'purity',
    title: 'Purity',
    chapters: [{ id: 'purity-ch1', blocks: [para('Study the word. Keep it close.')] }],
  },
];

/** Fixture data files: var name -> value, per the real files' declarations. */
const DATA_FILES = {
  'volume-one.js': { LETTERS_V1_PREFACE: RICH_LETTER, LETTERS_V1: [LONG_LETTER, null] },
  'volume-two.js': { LETTERS: [SHORT_LETTER('v2-letter-1')] },
  'volume-three.js': { LETTERS_V3_PREFACE: null, LETTERS_V3: [] },
  'volume-four.js': { LETTERS_V4_PREFACE: null, LETTERS_V4: [] },
  'volume-five.js': { LETTERS_V5_PREFACE: null, LETTERS_V5: [] },
  'volume-six.js': { LETTERS_V6_PREFACE: null, LETTERS_V6: [] },
  'volume-seven.js': { LETTERS_V7_PREFACE: null, LETTERS_V7: [] },
  'letters-timothy.js': {
    LETTERS_TIMOTHY_PREFACE: SHORT_LETTER('timothy-preface'),
    LETTERS_TIMOTHY: [SHORT_LETTER('timothy-letter-1')],
  },
  'letters-flock.js': { LETTERS_FLOCK_PREFACE: null, LETTERS_FLOCK: [SHORT_LETTER('flock-letter-1')] },
  'lords-rebuke.js': { LETTERS_REBUKE_PREFACE: null, LETTERS_REBUKE: [SHORT_LETTER('rebuke-letter-1')] },
  'wtlb-one.js': { WTLB_ONE },
  'wtlb-two.js': { WTLB_TWO },
  'the-blessed.js': { THE_BLESSED: BLESSED, THE_BLESSED_SCRIPTURES: {} },
  'holy-days.js': { HOLY_DAYS, HOLY_DAYS_META: {} },
  'bible-studies.js': { BIBLE_STUDIES },
};

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + lib + fixture data files. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-extract-fragments-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'extract-audio-fragments.mjs'));
  copyFileSync(LIB, join(toolsDir, 'audio-fragments-lib.mjs'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  for (const [file, vars] of Object.entries(DATA_FILES)) {
    const body = Object.entries(vars)
      .map(([name, value]) => `var ${name} = ${JSON.stringify(value)};`)
      .join('\n');
    writeFileSync(join(dataDir, file), body + '\n');
  }
  const utilsDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'utils');
  mkdirSync(utilsDir, { recursive: true });
  copyFileSync(SEGMENTS, join(utilsDir, 'segment-dom-text.js'));
  return root;
}

function runScript(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'extract-audio-fragments.mjs')], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function readOutput(root) {
  return JSON.parse(readFileSync(join(root, 'tools', '_align-work', 'fragments-all.json'), 'utf8'));
}

describe('extract-audio-fragments', () => {
  it('writes fragments-all.json keyed by collection, and prints the counts line', () => {
    const root = mirror();
    const r = runScript(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('fragments-all.json: 13 letters (A:9 B:4)');
    expect(existsSync(join(root, 'tools', '_align-work', 'fragments-all.json'))).toBe(true);

    const out = readOutput(root);
    expect(Object.keys(out).sort()).toEqual([
      'blessed:blessed-entry-1',
      'flock:flock-letter-1',
      'holydays:passover',
      'holydays:tabernacles',
      'one:v1-letter-1',
      'one:v1-preface',
      'rebuke:rebuke-letter-1',
      'study:purity-ch1',
      'timothy:timothy-letter-1',
      'timothy:timothy-preface',
      'two:v2-letter-1',
      'wtlb1:wtlb-entry-1',
      'wtlb2:wtlb-entry-2',
    ].sort());
    for (const entry of Object.values(out)) {
      expect(['A', 'B']).toContain(entry.format);
      expect(Array.isArray(entry.fragments)).toBe(true);
    }
    // The null preface, the null array slot and the empty collections
    // emit no key: filter(Boolean) is the whole falsy story.
    expect(out['three:null']).toBeUndefined();
    expect(out['one:null']).toBeUndefined();
  });

  it('pins Format-A fragments: sentences, poetry lines, heading skipped, closing kept', () => {
    const root = mirror();
    expect(runScript(root).status).toBe(0);
    const entry = readOutput(root)['one:v1-preface'];
    expect(entry.format).toBe('A');
    // bi 0 is the heading: no fragment names it. bi 1 is the para,
    // bi 2 the poetry (one fragment per line), bi 3 the closing.
    expect(entry.fragments).toEqual([
      { bi: 1, cs: 0, ce: 19, text: 'One short sentence.' },
      { bi: 1, cs: 20, ce: 45, text: 'Two short sentences here.' },
      { bi: 2, cs: 0, ce: 20, text: 'Line one of the poem' },
      { bi: 2, cs: 20, ce: 36, text: 'Line two follows' },
      { bi: 3, cs: 0, ce: 14, text: 'Says The Lord.' },
    ]);
  });

  it('splits a long sentence at its semicolon, never below three tokens a side', () => {
    const root = mirror();
    expect(runScript(root).status).toBe(0);
    const entry = readOutput(root)['one:v1-letter-1'];
    expect(entry.format).toBe('A');
    expect(entry.fragments).toEqual([
      { bi: 0, cs: 0, ce: 39, text: 'The Lord speaks, and the people listen;' },
      { bi: 0, cs: 40, ce: 92, text: 'and the earth trembles at His voice, for He is holy.' },
    ]);
  });

  it('pins Format-B fragments: refs keep their words, markup blanks to spaces', () => {
    const root = mirror();
    expect(runScript(root).status).toBe(0);
    const out = readOutput(root);
    expect(out['wtlb1:wtlb-entry-1']).toEqual({
      format: 'B',
      fragments: [
        { pi: 0, cs: 0, ce: 21, text: 'First paragraph here.' },
        // The {{ref:}} marker is replaced by its words padded back out
        // to the marker's width, so the nine spaces between the cite
        // and 'speaks' are the blanked marker (eight) plus the original space.
        { pi: 0, cs: 22, ce: 52, text: 'John 1:1         speaks truth.' },
        { pi: 1, cs: 0, ce: 34, text: 'Second paragraph, plain and short.' },
      ],
    });
    expect(out['wtlb2:wtlb-entry-2']).toEqual({
      format: 'B',
      fragments: [
        // The ** markers print as spaces, never spoken.
        { pi: 0, cs: 0, ce: 24, text: 'A   bold   claim stands.' },
        { pi: 0, cs: 25, ce: 37, text: 'Plain after.' },
      ],
    });
    expect(out['blessed:blessed-entry-1']).toEqual({
      format: 'B',
      fragments: [
        { pi: 0, cs: 0, ce: 21, text: 'Blessed are the meek.' },
        { pi: 0, cs: 22, ce: 41, text: 'They shall inherit.' },
      ],
    });
  });

  it('keys holy-days ghosts by shape and study chapters study:<chapterId>', () => {
    const root = mirror();
    expect(runScript(root).status).toBe(0);
    const out = readOutput(root);
    expect(out['holydays:passover']).toEqual({
      format: 'A',
      fragments: [
        { bi: 0, cs: 0, ce: 15, text: 'Holy day words.' },
        { bi: 0, cs: 16, ce: 31, text: 'Short and true.' },
      ],
    });
    expect(out['holydays:tabernacles']).toEqual({
      format: 'B',
      fragments: [
        { pi: 0, cs: 0, ce: 19, text: 'A holy convocation.' },
        { pi: 0, cs: 20, ce: 39, text: 'Rejoice seven days.' },
      ],
    });
    expect(out['study:purity-ch1']).toEqual({
      format: 'A',
      fragments: [
        { bi: 0, cs: 0, ce: 15, text: 'Study the word.' },
        { bi: 0, cs: 16, ce: 30, text: 'Keep it close.' },
      ],
    });
  });

  it('is deterministic: a second run writes a byte-identical file', () => {
    const root = mirror();
    expect(runScript(root).status).toBe(0);
    const outFile = join(root, 'tools', '_align-work', 'fragments-all.json');
    const first = readFileSync(outFile, 'utf8');
    expect(runScript(root).status).toBe(0);
    expect(readFileSync(outFile, 'utf8')).toBe(first);
  });
});
