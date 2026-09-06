/**
 * check-drive-edition-routing — a LANDING GATE, not a unit test.
 *
 * A Bible edition with a `driveFolder` ships opaque Drive ids and declares its
 * release tag, because nothing in the id says which release it lives on
 * (Architect section 11). `bibleAudioAssetUrl` must therefore route by that
 * DECLARED tag. Until it does, it falls through its hard-coded asset-name
 * prefix table (wop1_/brm1_/web1_...) to AUDIO_BIBLE_RELEASE_PREFIX — the
 * append-only audio-bible-v1 tag — and every chapter of such an edition 404s
 * against a release that genuinely exists. That is the quietest kind of
 * failure: a real URL, a real tag, and no asset.
 *
 * This is a gate rather than a vitest case on purpose. The routing change is
 * the Web Builder's (audio-track.js), it lands on its own branch, and a
 * permanently-red unit test would block every unrelated commit here in the
 * meantime. This runs on the landing path instead and lifts itself the moment
 * the routing is correct — no marker to remove, no follow-up to remember.
 *
 *   node tools/check-drive-edition-routing.mjs
 *     exit 0  every drive edition routes to its declared tag (or there are none)
 *     exit 1  a drive edition exists whose assets would 404
 *     exit 2  the check could not run — say so, never pass by accident AND
 *             never ACCUSE by accident. Both directions matter: the first cut
 *             guarded only the passing one, so an unevaluable tree exited 1 and
 *             the CI step reported "a drive edition exists whose assets would
 *             404" about a tree this gate had not measured (drive-routing-crash-1).
 */
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BIBLE_AUDIO_EDITIONS, bibleAudioAssetUrl, isVotAudioUrl } from '../app/src/main/assets/src/utils/audio-track.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MANIFEST = resolve(ROOT, 'app/src/main/assets/src/data/bible-audio-manifest.js');

const drive = Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => e.driveFolder);
if (!drive.length) {
  console.log('[drive-routing] no drive-sourced editions — nothing to check.');
  process.exit(0);
}

let ctx;
try {
  ctx = {};
  runInNewContext(readFileSync(MANIFEST, 'utf8'), ctx, { filename: 'bible-audio-manifest.js' });
} catch (e) {
  console.error('[drive-routing] INSTRUMENT DEAD: could not evaluate the manifest — ' + e.message);
  process.exit(2);
}
const M = ctx.BIBLE_AUDIO_MANIFEST;
if (!M || !Object.keys(M).length) {
  console.error('[drive-routing] INSTRUMENT DEAD: the manifest evaluated to nothing.');
  process.exit(2);
}

// A declared tag outside RELEASE_PREFIXES is a SECOND, quieter way to get the
// same empty URL: bibleAudioAssetUrl refuses an unrecognised host rather than
// guessing one, which is the correct behaviour and an indistinguishable symptom
// (Web Builder, 2026-09-05). Separate it here so the routing failure below
// cannot be blamed for a bad declaration. isVotAudioUrl IS that boundary — do
// not re-list the prefixes, or this gate drifts the day one is added.
//
// The controls prove the probe measures membership and not something else: a
// tag known to be in the list must read true, and a plausible near-miss host
// must read false. A probe that answered the same either way would pass every
// declaration.
const probe = (tag) => isVotAudioUrl(String(tag) + 'probe123.mp3');
if (!probe('https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/') ||
    probe('https://github.com/VOTReader/votreader-assets/releases/download/audio-v9/')) {
  console.error('[drive-routing] INSTRUMENT DEAD: the release-prefix probe fails its own controls.');
  process.exit(2);
}
const badTag = drive.filter(([, e]) => !probe(e.releaseTag));
if (badTag.length) {
  console.error('');
  console.error('  ✖ a drive-sourced Bible edition declares a releaseTag that is not one of');
  console.error('    RELEASE_PREFIXES, so bibleAudioAssetUrl returns \'\' for every one of its');
  console.error('    assets. That is the RIGHT refusal and the WRONG declaration: fix the tag.');
  console.error('');
  for (const [id, e] of badTag) console.error(`    ${id}: releaseTag ${e.releaseTag}`);
  console.error('');
  process.exit(1);
}

// EVERY exit from this loop that is not a routing measurement is a 2, not a 1.
// The gate already refused to PASS on an unevaluable tree; it did not refuse to
// ACCUSE one, and that is the direction that costs someone a hunt
// (drive-routing-crash-1, Verifier arm A, 2026-09-06). Two shapes reach it:
//
//   `books` undefined -> `e.books[0]` THROWS, node exits 1, and the CI step for
//     exit 1 reads "a drive edition exists whose assets would 404" — a defect
//     this gate never measured, named against a tree it could not evaluate.
//   `books: 'all'`    -> does not even throw. The string indexes to 'a', the key
//     becomes `<volKey>:a`, no rows are found, and the gate accuses the MANIFEST
//     of being unregenerated. None ships today; the generator hard-errors on it.
//
// A missing `volKey` is the same family with no throw either: the key becomes
// the literal "undefined:<book>". So the declaration is checked by SHAPE before
// the key is built, and the whole body is wrapped so anything unforeseen still
// leaves through 2.
const problems = [];
let checked = 0;
for (const [id, e] of drive) {
  // ONE catch around the WHOLE body, and the comment above is now true of the
  // code. The first cut used two TARGETED try/catch blocks and claimed a
  // whole-body wrap; the Verifier measured the gap. It matters exactly where the
  // fix is supposed to work: an unforeseen throw ANYWHERE ELSE in this body still
  // exited 1 and still accused the tree — drive-routing-crash-1's own failure
  // mode surviving in the residue of its fix.
  //
  // One of those two was unreachable as well, which is the other half of why the
  // pair was the wrong shape: after the declaration guard below, `volKey + ':' +
  // books[0]` is string+string and `M[...]` is a property read on an object
  // already proved non-empty at the top of this file, so neither can throw.
  // Wrapping the body makes the reachable case and every unforeseen one leave by
  // the same door instead of guessing which expressions are dangerous.
  //
  // `process.exit()` does not throw, so the declaration guard still exits 2
  // directly from inside the try.
  try {
    if (typeof e.volKey !== 'string' || !e.volKey
        || !Array.isArray(e.books) || e.books.length !== 1 || typeof e.books[0] !== 'string') {
      console.error('[drive-routing] INSTRUMENT DEAD: a drive-sourced edition cannot be keyed.');
      console.error(`    ${id}: volKey ${JSON.stringify(e.volKey)}, books ${JSON.stringify(e.books)}`);
      console.error('    A driveFolder edition must declare a volKey and exactly one app book id');
      console.error('    as a one-element array — gen-bible-audio-manifest.mjs:145 throws on the');
      console.error('    same shape, in the loop AFTER the one that filters driveFolder editions');
      console.error('    out of EDITION_ROWS (a filtered read of that file hides the enforcement).');
      console.error('    Without both, no manifest key exists to look up — and a gate that cannot');
      console.error('    form its own question must not answer it with a routing failure.');
      process.exit(2);
    }
    const key = e.volKey + ':' + e.books[0];
    const rows = M[key];
    if (!Array.isArray(rows) || !rows.length) {
      problems.push(`${id}: the manifest has no rows at ${key} — regenerate with gen-bible-audio-manifest.mjs`);
      continue;
    }
    for (const row of rows) {
      checked++;
      const url = bibleAudioAssetUrl(row[0], e.releaseTag);  // the 2nd arg is the TAG STRING (Web Builder, w-reltag 5c291e39)
      if (typeof url !== 'string' || !url.startsWith(e.releaseTag)) {
        problems.push(`${id}: ${row[2] || row[0]} routes to\n      ${url || '(empty)'}\n    but its declared tag is\n      ${e.releaseTag}`);
        break;                                      // one example per edition is enough to act on
      }
    }
  } catch (err) {
    console.error(`[drive-routing] INSTRUMENT DEAD: edition ${id} could not be evaluated — ${err && err.message}`);
    process.exit(2);
  }
}

if (problems.length) {
  console.error('');
  console.error('  ✖ a drive-sourced Bible edition would 404: bibleAudioAssetUrl is not routing by the');
  console.error('    edition\'s DECLARED releaseTag, so its opaque Drive ids fall through the asset-name');
  console.error('    prefix table to AUDIO_BIBLE_RELEASE_PREFIX (the append-only audio-bible-v1 tag).');
  console.error('');
  for (const p of problems) console.error('    ' + p);
  console.error('');
  console.error('    THE MISSING CHANGE (Web Builder, w-reltag 5c291e39, audio-track.js):');
  console.error('    bibleAudioAssetUrl(id, tag) takes the TAG STRING as its second argument and');
  console.error('    returns tag + asset + \'.mp3\' when RELEASE_PREFIXES.includes(tag). The trust');
  console.error('    boundary does not move — AUDIO_RELEASE_PREFIX is already in RELEASE_PREFIXES');
  console.error('    and a Drive-id name already satisfies isVotAudioUrl.');
  console.error('');
  process.exit(1);
}
console.log(`[drive-routing] OK — ${checked} asset(s) across ${drive.length} drive edition(s) route to their declared tag.`);
