/**
 * tools/mark-footnote-verses.test.js — tests for tools/mark-footnote-verses.js.
 *
 * The script runs at import, exports nothing, takes no arguments, and
 * rewrites the real data files, so it cannot be imported into vitest.
 * Each case mirrors the real script into a throwaway repo tree with
 * fixture books.js / matthew-plain.js / volume-two.js /
 * wtlb-scriptures.js, then runs the script as a child process, exactly
 * as the one-time normalization is run. The script resolves its data
 * dir from its own location, so the mirror's layout is the whole trick:
 * nothing is read from or written to the real tree. Fully offline,
 * deterministic. Precedent: tools/gen-restored-nt.test.js
 * (votreader-tests-3 item 5a).
 *
 * Fixture verses are the real NKJV wording from the corpus (books.js /
 * matthew-plain.js, probed 2026-11-21); fixture footnote values are the
 * real corpus values with their markers stripped. Two corpus quirks are
 * pinned, not fixed — tests only:
 *
 * - volume-two.js stores curly punctuation as literal `\uXXXX` escape
 *   TEXT in the source (six characters: backslash-u-2-0-1-9), while
 *   books.js evaluated gives the real ’ character. mark() joins the
 *   first six verse tokens with `[^A-Za-z0-9]+`, which cannot cross the
 *   alphanumeric `u` in `\u2019`, so 1 Corinthians 3:13-15 SKIPs on
 *   the real tree. Fixtures spell the escapes literally to reproduce
 *   this; real ’ characters in the fixture values would wrongly make
 *   it mark.
 * - The corpus values are already marked, but WORKLIST still lists
 *   them, so a --write run today would DOUBLE-mark five values: the
 *   safety check strips just one marker per number, so a double-mark
 *   passes it. WORKLIST is stale; the script must not be run --write
 *   against the real tree as-is.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'mark-footnote-verses.js');

// Real NKJV verse texts from the corpus (probed 2026-11-21). Real
// Unicode characters here: books.js evaluated gives the real ’ “ ”.
const VERSES = {
  matthew: {
    10: {
      37: 'He who loves father or mother more than Me is not worthy of Me. And he who loves son or daughter more than Me is not worthy of Me.',
      38: 'And he who does not take his cross and follow after Me is not worthy of Me.',
    },
    11: {
      28: 'Come to Me, all you who labor and are heavy laden, and I will give you rest.',
      29: 'Take My yoke upon you and learn from Me, for I am gentle and lowly in heart, and you will find rest for your souls.',
      30: 'For My yoke is easy and My burden is light.”',
    },
    16: {
      24: 'Then Jesus said to His disciples, “If anyone desires to come after Me, let him deny himself, and take up his cross, and follow Me.',
      25: 'For whoever desires to save his life will lose it, but whoever loses his life for My sake will find it.',
      26: 'For what profit is it to a man if he gains the whole world, and loses his own soul? Or what will a man give in exchange for his soul?',
    },
    18: {
      3: 'and said, “Assuredly, I say to you, unless you are converted and become as little children, you will by no means enter the kingdom of heaven.',
      4: 'Therefore whoever humbles himself as this little child is the greatest in the kingdom of heaven.',
    },
    24: {
      32: '“Now learn this parable from the fig tree: When its branch has already become tender and puts forth leaves, you know that summer is near.',
      33: 'So you also, when you see all these things, know that it is near—at the doors!',
      34: 'Assuredly, I say to you, this generation will by no means pass away till all these things take place.',
    },
  },
  corinthians: {
    3: {
      13: 'each one’s work will become clear; for the Day will declare it, because it will be revealed by fire; and the fire will test each one’s work, of what sort it is.',
      14: 'If anyone’s work which he has built on it endures, he will receive a reward.',
      15: 'If anyone’s work is burned, he will suffer loss; but he himself will be saved, yet so as through fire.',
    },
  },
};

function bookObj(id, title, chapters) {
  return {
    id, title, subtitle: '',
    chapters: Object.entries(chapters).map(([num, verses]) => ({
      num: +num, title: '',
      sections: [{
        verses: Object.entries(verses).map(([n, text]) => ({ n: +n, text })),
      }],
    })),
  };
}

const BOOKS_OBJ = {
  '1corinthians': bookObj('1corinthians', '1 Corinthians', VERSES.corinthians),
};
const MATTHEW_PLAIN_OBJ = bookObj('matthew-plain', 'Matthew', VERSES.matthew);

// Marker-less footnote values: the real corpus values with their `N. `
// markers stripped. Curly punctuation is literal `\uXXXX` escape TEXT
// in volume-two.js (like the real file), and literal `\"` in
// wtlb-scriptures.js (like the real file) — NOT real Unicode characters.
// (In this source those are written `\\u2019` / `\\"` so the fixture
// files carry the literal escape text.)
const VOLUME_TWO = {
  '1 Corinthians 3:13-15': 'each one\\u2019s work will become clear; for the Day will declare it, because it will be revealed by fire; and the fire will test each one\\u2019s work, of what sort it is. If anyone\\u2019s work which he has built on it endures, he will receive a reward. If anyone\\u2019s work is burned, he will suffer loss; but he himself will be saved, yet so as through fire.',
  'Matthew 16:24-26': 'Then Jesus said to His disciples, \\u201cIf anyone desires to come after Me, let him deny himself, and take up his cross, and follow Me. For whoever desires to save his life will lose it, but whoever loses his life for My sake will find it. For what profit is it to a man if he gains the whole world, and loses his own soul? Or what will a man give in exchange for his soul?\\u201d',
  'Matthew 10:37-38': '\\u201cHe who loves father or mother more than Me is not worthy of Me. And he who loves son or daughter more than Me is not worthy of Me. And he who does not take his cross and follow after Me is not worthy of Me.\\u201d',
};
const WTLB = {
  'Matthew 18:3-4': 'and said, \\"Assuredly, I say to you, unless you are converted and become as little children, you will by no means enter the Kingdom of Heaven. Therefore whoever humbles himself as this little child is the greatest in the Kingdom of Heaven.',
  'Matthew 24:32-34': '\\"Now learn this parable from the fig tree: When its branch has already become tender and puts forth leaves, you know that summer is near. So you also, when you see all these things, know that it is near, at the doors! Assuredly, I say to you, this generation will by no means pass away till all these things take place.',
  'Matthew 11:28-30': '\\"Come to Me, all you who labor and are heavy-laden, and I will give you rest. Take My yoke upon you and learn from Me, for I am gentle and lowly in heart, and in Me you will find rest for your souls. For My yoke is easy and My burden is light.\\"',
};

// The same values with the `N. ` markers inserted — the exact marked
// text the script produces (and the real corpus values today).
const VOLUME_TWO_MARKED = {
  'Matthew 16:24-26': '24. Then Jesus said to His disciples, \\u201cIf anyone desires to come after Me, let him deny himself, and take up his cross, and follow Me. 25. For whoever desires to save his life will lose it, but whoever loses his life for My sake will find it. 26. For what profit is it to a man if he gains the whole world, and loses his own soul? Or what will a man give in exchange for his soul?\\u201d',
  'Matthew 10:37-38': '37. \\u201cHe who loves father or mother more than Me is not worthy of Me. And he who loves son or daughter more than Me is not worthy of Me. 38. And he who does not take his cross and follow after Me is not worthy of Me.\\u201d',
};
const WTLB_MARKED = {
  'Matthew 18:3-4': '3. and said, \\"Assuredly, I say to you, unless you are converted and become as little children, you will by no means enter the Kingdom of Heaven. 4. Therefore whoever humbles himself as this little child is the greatest in the Kingdom of Heaven.',
  'Matthew 24:32-34': '32. \\"Now learn this parable from the fig tree: When its branch has already become tender and puts forth leaves, you know that summer is near. 33. So you also, when you see all these things, know that it is near, at the doors! 34. Assuredly, I say to you, this generation will by no means pass away till all these things take place.',
  'Matthew 11:28-30': '28. \\"Come to Me, all you who labor and are heavy-laden, and I will give you rest. 29. Take My yoke upon you and learn from Me, for I am gentle and lowly in heart, and in Me you will find rest for your souls. 30. For My yoke is easy and My burden is light.\\"',
};

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo mirror with the real script + fixture data files. */
function mirror({ volumeTwo = VOLUME_TWO, wtlb = WTLB } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-mark-footnote-'));
  mirrors.push(root);
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'mark-footnote-verses.js'));
  // The script is .js ESM; without this node reads it as CJS.
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'books.js'), `var BOOKS = ${JSON.stringify(BOOKS_OBJ)};\n`);
  writeFileSync(join(dataDir, 'matthew-plain.js'), `var MATTHEW_PLAIN = ${JSON.stringify(MATTHEW_PLAIN_OBJ)};\n`);
  const v2entries = Object.entries(volumeTwo).map(([ref, v]) => `  "${ref}": "${v}",`).join('\n');
  writeFileSync(join(dataDir, 'volume-two.js'), `/* fixture: Format A letters */\nvar VOLUME_TWO = {\n${v2entries}\n};\n`);
  const wentries = Object.entries(wtlb).map(([ref, v]) => `  "${ref}":"${v}",`).join('\n');
  writeFileSync(join(dataDir, 'wtlb-scriptures.js'), `/* fixture: Words To Live By */\nvar WTLB_SCRIPTURES = {\n${wentries}\n};\n`);
  return { root, dataDir };
}

function runScript(root, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'mark-footnote-verses.js'), ...args], {
    encoding: 'utf8', cwd: root,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Read one footnote value back out of a fixture data file, the way the script finds it. */
function readValue(file, ref) {
  const text = readFileSync(file, 'utf8');
  let anchor = `"${ref}": "`;
  let i = text.indexOf(anchor);
  if (i < 0) { anchor = `"${ref}":"`; i = text.indexOf(anchor); }
  expect(i).toBeGreaterThanOrEqual(0);
  const vStart = i + anchor.length;
  let vEnd = vStart;
  while (vEnd < text.length && !(text[vEnd] === '"' && text[vEnd - 1] !== '\\')) vEnd++;
  return text.slice(vStart, vEnd);
}

/** Strip the `N. ` markers for one ref, the way the script's safety check does. */
function stripMarkers(ref, marked) {
  const m = ref.match(/^(.+?)\s+(\d+):(\d+)-(\d+)$/);
  let out = marked;
  for (let n = +m[3]; n <= +m[4]; n++) out = out.replace(`${n}. `, '');
  return out;
}

describe('mark-footnote-verses', () => {
  it('dry run marks the five Matthew refs and skips 1 Corinthians, writing nothing', () => {
    const { root, dataDir } = mirror();
    const beforeV2 = readFileSync(join(dataDir, 'volume-two.js'), 'utf8');
    const beforeWtlb = readFileSync(join(dataDir, 'wtlb-scriptures.js'), 'utf8');
    const r = runScript(root);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('SKIP (no NKJV alignment): [volume-two.js] 1 Corinthians 3:13-15');
    for (const ref of ['Matthew 16:24-26', 'Matthew 10:37-38']) {
      expect(r.stdout).toContain(`MARK: [volume-two.js] ${ref}`);
    }
    for (const ref of ['Matthew 18:3-4', 'Matthew 24:32-34', 'Matthew 11:28-30']) {
      expect(r.stdout).toContain(`MARK: [wtlb-scriptures.js] ${ref}`);
    }
    expect(r.stdout).toContain('DRY RUN — marked 5, skipped 1');
    // The MARK previews carry the inserted markers.
    expect(r.stdout).toContain('37. \\u201cHe who loves');
    expect(r.stdout).toContain('28. \\"Come to Me, all you who labor');
    // A dry run writes nothing.
    expect(readFileSync(join(dataDir, 'volume-two.js'), 'utf8')).toBe(beforeV2);
    expect(readFileSync(join(dataDir, 'wtlb-scriptures.js'), 'utf8')).toBe(beforeWtlb);
  });

  it('--write rewrites the five Matthew values with exact markers and leaves 1 Corinthians byte-identical', () => {
    const { root, dataDir } = mirror();
    const r = runScript(root, ['--write']);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('WROTE — marked 5, skipped 1');
    const v2 = join(dataDir, 'volume-two.js');
    const wtlb = join(dataDir, 'wtlb-scriptures.js');
    // 1 Corinthians is untouched — the literal-\u2019 escape cause.
    expect(readValue(v2, '1 Corinthians 3:13-15')).toBe(VOLUME_TWO['1 Corinthians 3:13-15']);
    for (const [ref, marked] of Object.entries(VOLUME_TWO_MARKED)) {
      expect(readValue(v2, ref)).toBe(marked);
    }
    for (const [ref, marked] of Object.entries(WTLB_MARKED)) {
      expect(readValue(wtlb, ref)).toBe(marked);
    }
    // Stripping the inserted markers reproduces the marker-less originals.
    for (const ref of Object.keys(VOLUME_TWO_MARKED)) {
      expect(stripMarkers(ref, readValue(v2, ref))).toBe(VOLUME_TWO[ref]);
    }
    for (const ref of Object.keys(WTLB_MARKED)) {
      expect(stripMarkers(ref, readValue(wtlb, ref))).toBe(WTLB[ref]);
    }
  });

  it('dry run double-marks a value that is already marked (stale WORKLIST hazard)', () => {
    const preMarked = {
      ...VOLUME_TWO,
      'Matthew 10:37-38': VOLUME_TWO_MARKED['Matthew 10:37-38'],
    };
    const { root, dataDir } = mirror({ volumeTwo: preMarked });
    const r = runScript(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('MARK: [volume-two.js] Matthew 10:37-38');
    // The safety check strips one marker per number, so the double-mark passes it.
    expect(r.stdout).toContain('37. 37. \\u201cHe who loves');
    expect(r.stdout).toContain('DRY RUN — marked 5, skipped 1');
    const w = runScript(root, ['--write']);
    expect(w.status).toBe(0);
    expect(w.stdout).toContain('WROTE — marked 5, skipped 1');
    expect(readValue(join(dataDir, 'volume-two.js'), 'Matthew 10:37-38'))
      .toBe(VOLUME_TWO_MARKED['Matthew 10:37-38'].replace('37. ', '37. 37. ').replace('38. ', '38. 38. '));
  });

  it('skips a WORKLIST ref missing from its file and still marks the rest', () => {
    const { 'Matthew 11:28-30': _omitted, ...wtlbWithout11 } = WTLB;
    const { root } = mirror({ wtlb: wtlbWithout11 });
    const r = runScript(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('SKIP (key not found): [wtlb-scriptures.js] Matthew 11:28-30');
    expect(r.stdout).toContain('SKIP (no NKJV alignment): [volume-two.js] 1 Corinthians 3:13-15');
    expect(r.stdout).toContain('DRY RUN — marked 4, skipped 2');
  });
});
