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
import {
  BIBLE_AUDIO_EDITIONS, bibleSyncEditionFor, resolveBibleAudio,
} from './audio-track.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..', '..');
const BATCH_SRC = readFileSync(join(ROOT, 'tools', 'batch-align-bible.py'), 'utf8');

/* The manifest is a classic script (var + IIFE), not a module. Run the REAL
   generator rather than restating its output: the two gates at the foot of this
   file are about what actually ships, and a hand-written copy of the data would
   agree with itself and with nothing else. `var` inside a Function body is
   function-scoped, so the trailing line is what publishes it. */
{
  const MANIFEST_SRC = readFileSync(
    join(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data', 'bible-audio-manifest.js'), 'utf8');
  new Function('g', MANIFEST_SRC + ';g.BIBLE_AUDIO_MANIFEST = BIBLE_AUDIO_MANIFEST;')(globalThis);
}
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

/* Two properties of the SHIPPED manifest that the read-along selector now
   depends on, derived from the data rather than listed by hand. */
describe('BIBLE_AUDIO_MANIFEST — what the sync selector relies on', () => {
  const manifest = () => {
    // The manifest is a classic script that assigns a global.
    if (typeof globalThis.BIBLE_AUDIO_MANIFEST === 'undefined') {
      throw new Error('BIBLE_AUDIO_MANIFEST is not loaded — this gate would be vacuous');
    }
    return globalThis.BIBLE_AUDIO_MANIFEST;
  };

  it('every shipped asset paints as the edition its own manifest key names', () => {
    // REPOINTED, and the old title is the reason. It read "every asset NAME
    // resolves to..." and asserted through bibleEditionOfAsset, whose comment
    // stated the premise: "Read-along picks the timings table from the ASSET
    // NAME." After the Architect's section 12 it picks from the KEY, proved
    // against the manifest row that key names — so the old form pinned a
    // function nothing calls, and it would have gone red the moment an edition
    // shipped opaque archive ids (TSOT Matthew's 28 Drive ids carry no stamp)
    // while the app painted them perfectly well.
    //
    // The property it protected is unchanged and still worth a gate: every
    // shipped asset must paint as SOME edition, and as the one its own key
    // names. It is now asserted through the path the app actually takes.
    //
    // IT CANNOT CURRENTLY FAIL, AND IT SAYS SO RATHER THAN COUNTING AS A PASS.
    // Measured: reverting paint to the asset-name stamp leaves this case GREEN,
    // because every one of today's 3,567 shipped assets carries a registered
    // stamp, so both routes agree on all of them. It becomes discriminating the
    // day an edition ships opaque ids — c48's TSOT Matthew, whose 28 Drive ids
    // carry no stamp and would paint null under the old route. Until then the
    // CONTROL below is what has teeth: it is the only case in this file that
    // reddens when either half of the key proof is removed.
    const m = manifest();
    const keys = Object.keys(m);
    expect(keys.length, 'manifest is empty').toBeGreaterThan(100);
    let checked = 0;
    for (const key of keys) {
      const volKey = key.slice(0, key.lastIndexOf(':'));
      const editionId = bibleSyncEditionFor(volKey);
      expect(editionId, 'no edition claims volKey ' + volKey).toBeTruthy();
      for (const part of m[key]) {
        const track = { key, url: 'https://example.test/' + part[0] + '.mp3' };
        const paint = resolveBibleAudio({ settings: { bibleAudio: 'off' }, track }).paint;
        expect(paint && paint.volKey, key + ' → ' + part[0]).toBe(volKey);
        checked++;
      }
    }
    // A loop that ran zero times passes every assertion inside it.
    expect(checked, 'no assets examined').toBeGreaterThan(1000);
  });

  it('CONTROL for the gate above: a key that does not own its asset paints null', () => {
    // Without this, "every asset paints as its key's edition" is satisfied by a
    // resolver that says yes to everything. The manifest cannot contain a key
    // that disagrees with its own asset, so the disagreement is built by hand.
    const m = manifest();
    const brm = Object.keys(m).find((k) => k.indexOf('bible-brm-kjv:') === 0);
    const web = Object.keys(m).find((k) => k.indexOf('bible-web:') === 0);
    expect(brm && web, 'fixture needs one key from each of two editions').toBeTruthy();
    const stolen = m[brm][0][0];
    expect(m[web].some((p) => p[0] === stolen), 'the two editions share an asset').toBe(false);
    const paint = resolveBibleAudio({
      settings: { bibleAudio: 'off' },
      track: { key: web, url: 'https://example.test/' + stolen + '.mp3' },
    }).paint;
    expect(paint, web + ' must not paint ' + brm + ' asset ' + stolen).toBeNull();
  });

  it('every edition carries every book — fires on the first partial edition', () => {
    // PASSES TODAY AND IS MEANT TO. resolveBibleAudio's `offer` falls back to
    // the default edition for a book the selected one lacks, and that arm is
    // unreachable while this holds — so it is written and unit-tested but NOT
    // wired per book at the four playBibleBook sites. This is the alarm: the
    // branch that registers Matthew or John as an edition turns it red, and
    // that is the branch that has to do the wiring.
    const m = manifest();
    const books = new Set(Object.keys(m).map((k) => k.slice(k.lastIndexOf(':') + 1)));
    expect(books.size, 'book set looks wrong').toBe(66);
    for (const id of Object.keys(BIBLE_AUDIO_EDITIONS)) {
      const volKey = BIBLE_AUDIO_EDITIONS[id].volKey;
      const missing = [...books].filter((b) => !m[volKey + ':' + b]);
      expect(
        missing,
        id + ' does not carry ' + missing.length + ' book(s): ' + missing.slice(0, 5).join(', ')
        + '\n  → this edition is PARTIAL, so resolveBibleAudio({settings, bookId}).offer'
        + '\n    must now be wired per book at the four playBibleBook call sites'
        + '\n    (screen-routes.jsx:270 builds one bibleAudioProp for every screen).',
      ).toEqual([]);
    }
  });
});
