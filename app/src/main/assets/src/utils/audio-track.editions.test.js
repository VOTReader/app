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
    // THIS CASE AND THE CONTROL BELOW COVER DISJOINT FAILURES, AND NEITHER
    // SURVIVES ALONE. Measured, three bites (Verifier):
    //
    //   revert paint to the asset-name stamp   -> only the CONTROL reddens
    //   drop the manifest containment check    -> only the CONTROL reddens
    //   drop the volKey->edition translation   -> only THIS LOOP reddens, all 3,567
    //
    // This loop cannot catch either identity bite, because every one of today's
    // 3,567 shipped assets carries a registered stamp, so both routes agree on
    // all of them; it becomes discriminating the day an edition ships opaque
    // ids (c48's TSOT Matthew, whose 28 Drive ids carry no stamp and would
    // paint null under the old route). And the CONTROL cannot catch the
    // translation bite, because a resolver that paints null for EVERYTHING
    // satisfies "a lying key must paint null" perfectly.
    //
    // So each is the other's guard against passing vacuously. DO NOT DROP
    // EITHER: this loop is the only thing in this file that catches a broken
    // bibleSyncEditionFor, which is the single step where the two names
    // diverge (bible-web -> web-ebible).
    //
    // The floor below says "more than 1,000". It actually examines 3,567 — the
    // whole row count, 198 keys, derived independently from the manifest — and
    // a loop-based gate with a floor is one dead filter away from checking
    // twelve rows and printing a pass.
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

});

/* ── every edition declares its books, and ships exactly those ────────────
   BIBLE_AUDIO_EDITIONS[id].books is the single declaration: 'all' for a
   whole-Bible edition, or an explicit list of app book ids for a partial one
   (the TSOT Matthew reading is 28 chapters of ONE book; the Gospel of John
   film is 21 chapters of another). tools/gen-bible-audio-manifest.mjs drives
   its per-chapter expansion off this same object, so the two cannot restate
   each other — they used to be two hand-kept lists.

   Held BOTH WAYS on purpose. Declared-but-not-shipped is a book whose pill
   the reader can never reach; shipped-but-not-declared is audio nobody
   checked, and it is the direction a one-way assertion misses. Either alone
   passes on an edition that ships nothing at all. */
// SUPERSEDES the 66-books alarm ("every edition carries every book"), retired in
// c48 by the Architect's ruling. That alarm demanded per-book wiring; the wiring
// LANDED as 9bdd517c (resolve the Bible-audio offer PER BOOK at all four call
// sites), pinned by the behaviour red 6347eaa6, which stays. The alarm could not
// self-lift because it was a manifest-SHAPE assertion, not a behaviour one -- an
// expect(...).toEqual([]) whose message said "Check that is intended here" but
// which could only block, never announce. For books: 'all' the pair below is the
// same assertion plus the reverse direction; tsot-matthew is the first partial
// edition and the reason this became reachable.
describe('audio-track editions — an edition ships exactly the books it declares', () => {
  const MANIFEST_SRC = readFileSync(
    join(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data', 'bible-audio-manifest.js'), 'utf8');
  /** The generated file is a script, not a module — evaluate it for its globals. */
  const manifestCtx = {};
  new Function('ctx', `with (ctx) { ${MANIFEST_SRC}; ctx.M = BIBLE_AUDIO_MANIFEST; ctx.B = BIBLE_AUDIO_BOOKS; }`)(manifestCtx);
  const ALL_BOOK_IDS = manifestCtx.B.map(([id]) => id);

  it('evaluated the generated manifest (guards every assertion below)', () => {
    // Without this the `with` block could yield an empty object and every
    // set difference below would be vacuously equal.
    expect(ALL_BOOK_IDS.length).toBe(66);
    expect(Object.keys(manifestCtx.M).length).toBeGreaterThan(60);
  });

  it('declares books for every edition, as "all" or a non-empty list of real book ids', () => {
    for (const [id, e] of Object.entries(BIBLE_AUDIO_EDITIONS)) {
      const ok = e.books === 'all' || (Array.isArray(e.books) && e.books.length > 0);
      expect(ok, `edition ${id} must declare books`).toBe(true);
      if (Array.isArray(e.books)) {
        expect(e.books.filter((b) => !ALL_BOOK_IDS.includes(b)), `edition ${id}`).toEqual([]);
      }
      // EXACTLY ONE asset scheme. `assetPrefix` means the ids follow the
      // <prefix><testament>_<book>_<NNN> naming rule and the release tag is
      // read back out of the name; `driveFolder` means the ids are the
      // archive's opaque Drive ids and the tag is DECLARED. Both would be
      // ambiguous about routing, neither leaves the generator nothing to do.
      const schemes = [e.assetPrefix, e.driveFolder].filter((v) => typeof v === 'string' && v);
      expect(schemes.length, `edition ${id} needs exactly one of assetPrefix / driveFolder`).toBe(1);
      // A declared tag is REQUIRED for the drive scheme, because nothing in an
      // opaque id says which release it lives on — the failure is a 404 on a
      // tag that exists, which is the quietest kind.
      if (e.driveFolder) {
        expect(typeof e.releaseTag, `edition ${id} (driveFolder) needs a releaseTag`).toBe('string');
        expect(e.releaseTag, `edition ${id} releaseTag must be a release URL prefix`).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\/.+\/$/);
        expect(Array.isArray(e.books) && e.books.length, `edition ${id}: a drive edition is one book`).toBe(1);
      }
    }
  });

  it('ships exactly the declared books — no book missing, no book unannounced', () => {
    for (const [id, e] of Object.entries(BIBLE_AUDIO_EDITIONS)) {
      const want = e.books === 'all' ? ALL_BOOK_IDS : e.books;
      const got = Object.keys(manifestCtx.M)
        .filter((k) => k.startsWith(e.volKey + ':'))
        .map((k) => k.slice(e.volKey.length + 1));
      expect([...want].sort(), `${id}: declared but not shipped`).toEqual([...got].sort());
    }
  });

  it('the three shipped whole-Bible editions still declare every book', () => {
    // CLOSES A CIRCULARITY the old 66-books alarm closed by accident. The pair
    // above checks each edition against ITS OWN declaration, so flipping
    // brm-kjv to books: ['matthew'] would make the generator emit one book, the
    // manifest follow, and both assertions agree on a wrong world. A list over a
    // CLOSED set is honest; new editions stay unconstrained by design.
    for (const id of ['brm-kjv', 'wop-nkjv', 'web-ebible']) {
      expect(BIBLE_AUDIO_EDITIONS[id].books, `${id} ships the whole Bible`).toBe('all');
    }
  });

  it('timed defaults to true and is only ever a boolean', () => {
    // `timed: false` means "audio, no timings" — the loader must stop asking
    // for a sync file that does not exist. A missing field must READ as true,
    // never as undefined-and-therefore-falsy at some call site.
    for (const [id, e] of Object.entries(BIBLE_AUDIO_EDITIONS)) {
      expect(['boolean', 'undefined'], `edition ${id}`).toContain(typeof e.timed);
      expect(e.timed !== false, `edition ${id} timed default`).toBe(e.timed === undefined || e.timed === true);
    }
  });
});
