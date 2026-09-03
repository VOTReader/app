// @ts-nocheck — reads tools/batch-align-bible.py and tools/check-bundle-budget.js
// as text via node fs/path/url, same house pattern as utils/user-data-parity.test.js.

/* audio-track editions — the "two lists cannot drift again" gate.
   ─────────────────────────────────────────────────────────────────────
   BIBLE_AUDIO_EDITIONS (this module) and tools/batch-align-bible.py's own
   EDITIONS dict name the same recordings independently: the KEY is the
   aligner's spelling, and BIBLE_AUDIO_EDITIONS[id].volKey must equal
   EDITIONS[id]["family"] or the queue's name for a recording and the
   shipper's name for its timings file/global disagree — the read-along-2
   bug (a WEB file requested as bible-sync-web.js, a clean silent 404).

   Also gated: tools/check-bundle-budget.js must carry a size-ceiling row
   for every edition's bible-sync-<id>.js, or a shipped file has no budget
   watching it grow. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BIBLE_AUDIO_EDITIONS } from './audio-track.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..', '..');
const BATCH_SRC = readFileSync(join(ROOT, 'tools', 'batch-align-bible.py'), 'utf8');
const BUDGET_SRC = readFileSync(join(ROOT, 'tools', 'check-bundle-budget.js'), 'utf8');

/**
 * Slice between two unique markers, failing loudly (rather than returning
 * '') when the shape has moved — a silent miss would make every assertion
 * below vacuously true.
 * @param {string} src
 * @param {string} file
 * @param {string} start
 * @param {string} end
 * @returns {string}
 */
function sliceBetween(src, file, start, end) {
  const a = src.indexOf(start);
  if (a === -1) {
    throw new Error(`audio-track.editions: cannot find "${start}" in ${file}. Update this test's extractor.`);
  }
  const b = src.indexOf(end, a + start.length);
  if (b === -1) {
    throw new Error(`audio-track.editions: found "${start}" in ${file} but not its closing "${end}". Update this test's extractor.`);
  }
  return src.slice(a + start.length, b);
}

const EDITIONS_SRC = sliceBetween(BATCH_SRC, 'tools/batch-align-bible.py', 'EDITIONS = {', '\nMIN_PROVEN');

/** Each `"<id>": { ... }` entry's id and "family" value, in file order. */
const PARSED = [];
{
  const entryRe = /"([a-z0-9-]+)":\s*\{([^}]*)\}/g;
  let m;
  while ((m = entryRe.exec(EDITIONS_SRC))) {
    const famM = m[2].match(/"family":\s*"([^"]+)"/);
    PARSED.push({ id: m[1], family: famM ? famM[1] : null });
  }
}

const REGISTRY_IDS = Object.keys(BIBLE_AUDIO_EDITIONS).sort();

describe('audio-track editions — extraction sanity', () => {
  it('parses a plausible number of EDITIONS entries, each with a family', () => {
    expect(PARSED.length, 'batch-align-bible.py EDITIONS parsed too small — the extractor may have missed the shape').toBeGreaterThanOrEqual(3);
    expect(PARSED.every((e) => typeof e.family === 'string'), 'some parsed entry has no "family" — the extractor regex may be wrong').toBe(true);
  });
});

describe('audio-track editions — BIBLE_AUDIO_EDITIONS matches the shipper', () => {
  it('has exactly the edition ids batch-align-bible.py knows how to align', () => {
    expect(REGISTRY_IDS).toEqual(PARSED.map((e) => e.id).sort());
  });

  it('names the same volKey ("family") for every edition', () => {
    for (const { id, family } of PARSED) {
      expect(BIBLE_AUDIO_EDITIONS[id] && BIBLE_AUDIO_EDITIONS[id].volKey, `edition "${id}"`).toBe(family);
    }
  });

  it('gives every edition a bundle-budget row for its sync file', () => {
    for (const id of REGISTRY_IDS) {
      expect(BUDGET_SRC, `check-bundle-budget.js has no row for bible-sync-${id}.js`).toContain(`'src/data/bible-sync-${id}.js'`);
    }
  });
});
