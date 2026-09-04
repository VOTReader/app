/**
 * check-audio-manifest — the gate FlockSync v2 §5.5 asks for: nothing the
 * generator mapped may quietly fail to reach the app.
 *
 * WHY THIS EXISTS (2026-09-04). `gen-audio-manifest.mjs` used to discard a
 * reader's rendition when it had fewer tracks than the primary. Nothing failed;
 * the report simply printed a smaller number, and a recording the flock made
 * was invisible in the app forever. Corbin's request is that EVERY rendition
 * reach the reader, so the loss has to be a red gate rather than a number
 * nobody diffs.
 *
 * Reads two committed files and no network:
 *   - app/src/main/assets/src/data/audio-manifest.js (AUDIO_MANIFEST /
 *     AUDIO_ALTERNATES / AUDIO_SECTIONS)
 *   - tools/audio-manifest-coverage.json — written by the generator's MAPPING
 *     stage: for every letter, how many candidates each reader supplied and how
 *     many main slots the letter has. The slot count has to come from here: a
 *     rendition that lost a row took the evidence of its own length with it,
 *     so the manifest cannot tell a whole-letter reading from a fragment.
 * The Drive listing is NOT needed, which is what lets this run in CI.
 *
 * The unit is (letter, reader), not (letter, file). The archive mirrors most
 * recordings into "0. ALL LETTERS" under a second Drive file id, and the
 * generator drops those duplicate uploads on purpose — counting files would
 * bury the real question under ~830 harmless duplicates. The real question is
 * the one Corbin asked: did everyone who read this letter get offered?
 *
 * Checks
 *   1. NOTHING LOST     every reader who recorded a letter is offered a
 *                       rendition of it — as the primary or as an alternate.
 *   2. NOT STALE        the manifest offers no reader the coverage file has
 *                       never heard of, and knows every letter it lists.
 *   2b. BOOKS BALANCE    for each reader, the per-letter rows plus the range
 *                       compilations plus the unmapped files add up to the
 *                       letter-side file count. Without this the gate is
 *                       CIRCULAR — delete a reader from the manifest AND from
 *                       the coverage file and both agree on a lie (the Verifier
 *                       proved exactly that, 2026-09-04). The totals are
 *                       re-derived from tools/_audio-drive-listing.json when it
 *                       is present, which is the generator's INPUT and the only
 *                       thing here it does not write itself.
 *   2c. UNMAPPED IS     the unmapped count is the one free variable 2b leaves,
 *       JUSTIFIED       and naming the ids does not pin it: a stolen id is a
 *                       real record that reaches no rendition too, which is the
 *                       Verifier's second and complete forgery. So every
 *                       unmapped file states WHY, and the gate holds the reason
 *                       to evidence a forger cannot mint — "Bonus Track" in the
 *                       filename, or a pinned id. Runs with or without the
 *                       listing, since the listing is gitignored and CI would
 *                       otherwise only get the half of the gate that can lie.
 *   3. WELL FORMED      ids look like Drive file ids; no id repeats inside one
 *                       rendition; one rendition per reader per letter; every
 *                       reader code is one of B/T/V/M.
 *   4. NOTES ARE HONEST a completeness note sits on a rendition if and only if
 *                       it is shorter than the letter's longest.
 *   5. REPORT           primary and alternate track counts, B/T/V/M separately.
 *
 * Usage:
 *   node tools/check-audio-manifest.js            offline (pre-commit + CI)
 *   node tools/check-audio-manifest.js --release  also ask GitHub whether every
 *                                                 emitted id is on audio-v1
 *                                                 (needs gh; not a CI gate)
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { READER_CODES, countByReader, formatReaderCounts, readerFromFilename, isLetterAudio } from './audio-renditions-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MANIFEST = resolve(ROOT, 'app/src/main/assets/src/data/audio-manifest.js');
const COVERAGE = resolve(HERE, 'audio-manifest-coverage.json');
const LISTING = resolve(HERE, '_audio-drive-listing.json');   // present on the generating machine, not in CI
const REPO = 'VOTReader/votreader-assets';
const TAG = 'audio-v1';
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;

const errors = [];
const fail = (msg) => errors.push(msg);

if (!existsSync(COVERAGE)) {
  console.error('');
  console.error('  ✖ tools/audio-manifest-coverage.json is missing — run `node tools/gen-audio-manifest.mjs`.');
  console.error('');
  process.exit(1);
}

const coverage = JSON.parse(readFileSync(COVERAGE, 'utf8'));
const ctx = {};
runInNewContext(readFileSync(MANIFEST, 'utf8'), ctx, { filename: 'audio-manifest.js' });
const AUDIO_MANIFEST = ctx.AUDIO_MANIFEST || {};
const AUDIO_ALTERNATES = ctx.AUDIO_ALTERNATES || {};
const AUDIO_SECTIONS = ctx.AUDIO_SECTIONS || {};
// ── what the manifest ships ──────────────────────────────────────────────
const primaryRows = Object.values(AUDIO_MANIFEST).flat();          // [id, reader, label?]
const emitted = new Set();
for (const row of primaryRows) emitted.add(row[0]);

/** letterKey -> [[reader, rows, note?], ...] */
let altRenditions = 0;
let altTracks = 0;
const altCountRows = [];
for (const [key, pairs] of Object.entries(AUDIO_ALTERNATES)) {
  if (!Array.isArray(pairs)) { fail(`${key}: AUDIO_ALTERNATES value is not an array`); continue; }
  const seenReaders = new Set();
  const longest = (coverage.letters && coverage.letters[key] && coverage.letters[key].slots) || 1;
  for (const pair of pairs) {
    const [reader, rows, note] = pair;
    altRenditions++;
    if (!READER_CODES.includes(reader)) fail(`${key}: unknown reader code ${JSON.stringify(reader)}`);
    if (seenReaders.has(reader)) fail(`${key}: reader ${reader} has more than one rendition`);
    seenReaders.add(reader);
    if (!Array.isArray(rows) || !rows.length) { fail(`${key}: reader ${reader} has an empty rendition`); continue; }
    const inThis = new Set();
    for (const row of rows) {
      const id = Array.isArray(row) ? row[0] : row;
      if (inThis.has(id)) fail(`${key}: reader ${reader} repeats asset ${id} inside one rendition`);
      inThis.add(id);
      emitted.add(id);
      altTracks++;
      altCountRows.push(reader);
    }
    const mine = rows.filter((r) => r[1] !== 'Addendum').length;
    // A single UNLABELLED row is a whole-letter reading — complete whatever the
    // primary is split into. Anything carrying Part/Section ordinals is a
    // composition, and a short one must say so.
    const composed = rows.some((r) => r[1] && r[1] !== 'Addendum');
    if (note && mine >= longest) {
      fail(`${key}: reader ${reader} is marked "${note}" but carries ${mine} of the letter's ${longest} main tracks — the note is wrong`);
    }
    if (!note && composed && mine < longest) {
      fail(`${key}: reader ${reader} carries ${mine} of ${longest} main tracks but ships NO completeness note`);
    }
  }
}
for (const rows of Object.values(AUDIO_SECTIONS)) for (const r of rows) emitted.add(r[1]);

for (const id of emitted) {
  if (!DRIVE_ID.test(id)) fail(`emitted asset id is not a Drive file id: ${JSON.stringify(id)}`);
}

// ── 1. nothing lost, 2. not stale ───────────────────────────────────────
// offered[letterKey] = the set of readers a listener can actually pick.
const offered = new Map();
const offer = (key, reader) => {
  if (!offered.has(key)) offered.set(key, new Set());
  offered.get(key).add(reader);
};
for (const [key, rows] of Object.entries(AUDIO_MANIFEST)) for (const r of rows) offer(key, r[1]);
for (const [key, pairs] of Object.entries(AUDIO_ALTERNATES)) for (const p of pairs) offer(key, p[0]);

const letters = coverage.letters || {};
const readersOf = (key) => (letters[key] && letters[key].readers) || {};
const lost = [];
for (const key of Object.keys(letters)) {
  const have = offered.get(key) || new Set();
  for (const [reader, n] of Object.entries(readersOf(key))) {
    if (!have.has(reader)) lost.push({ key, reader, n });
  }
}
if (lost.length) {
  const counts = {};
  for (const l of lost) counts[l.reader] = (counts[l.reader] || 0) + 1;
  fail(`${lost.length} (letter, reader) pair(s) recorded but never offered (${formatReaderCounts(counts)}) — ` +
       `a listener cannot reach those readings. First: ` +
       lost.slice(0, 5).map((l) => `${l.key} [${l.reader}]`).join(', '));
}

for (const [key, readers] of offered) {
  if (!letters[key]) { fail(`${key}: the manifest offers audio the coverage file has never heard of — one of the two is stale`); continue; }
  const known = readersOf(key);
  for (const reader of readers) {
    if (!(reader in known)) fail(`${key}: reader ${reader} is offered but supplied no candidate — manifest and coverage disagree`);
  }
}
for (const key of Object.keys(letters)) {
  if (!offered.has(key)) fail(`${key}: every reader's rendition vanished — the letter has candidates but ships no audio at all`);
}

// ── 2b. the books balance ───────────────────────────────────────────────
// Every letter-side file in the Drive listing either reached a letter, is one
// of the WTLB range compilations, or is recorded as unmapped. Summing the
// per-letter rows makes a hand-edit of ANY of them show up here, which is what
// stops this gate from being a conversation the generator has with itself.
const totals = coverage.totals || null;
if (!totals) {
  fail('tools/audio-manifest-coverage.json has no `totals` — regenerate it; the gate cannot balance the books without it.');
} else {
  const summed = {};
  for (const v of Object.values(letters)) {
    for (const [r, n] of Object.entries(v.readers || {})) summed[r] = (summed[r] || 0) + n;
  }
  for (const r of READER_CODES) {
    const lhs = (summed[r] || 0) + ((totals.unmapped || {})[r] || 0) + ((totals.compilations || {})[r] || 0);
    const rhs = (totals.listing || {})[r] || 0;
    if (lhs !== rhs) {
      fail(`reader ${r}: ${summed[r] || 0} in letters + ${(totals.unmapped || {})[r] || 0} unmapped + ` +
           `${(totals.compilations || {})[r] || 0} compilations = ${lhs}, but the listing holds ${rhs} ` +
           `letter-side file(s). Something was edited by hand or the coverage file is stale.`);
    }
  }
  // ── 2c. every unmapped file JUSTIFIES itself ──────────────────────────
  // `unmapped` is the only free variable in the identity above, so a hand-edit
  // can inflate it to balance a theft. Naming the stolen ids does not expose
  // that: a stolen id IS a real listing record, and once it has been deleted
  // from the manifest it reaches no rendition either — the Verifier forged
  // exactly that and the gate said OK. What a stolen id cannot do is JUSTIFY
  // itself, so each entry now carries the reason it was dropped and the gate
  // holds that reason to its own evidence. This runs with or without the Drive
  // listing, because the listing is gitignored and CI would otherwise get the
  // weak half of the gate.
  //
  // The residue: recordings the resolver could not place at all. There are two,
  // and both are recordings of a title the corpus does not carry. They are
  // PINNED rather than pattern-checked, because a recording no listener can
  // reach is precisely the event that should stop the line and get a human —
  // either the resolver is wrong (ten of Timothy's section recordings sat in
  // this list until 2026-09-04) or the archive holds something the corpus does
  // not. Adding to this list is a decision, not a formality.
  const UNRESOLVED_KNOWN = {
    '1GcaqLJmzHhk2JwcTAPRFqyBa-x-OQyXI': 'V7.045_My Anger Runs Deep — no letter of that title in Volume Seven',
    '1pAj5SoKcOT0nOEeUGn6naI_PGnqocXE6': 'WTLB2.125_A Return to the Garden — no letter of that title in WTLB2',
  };
  const BONUS_NAME = /[._]Bonus Track[._]/i;

  const unmappedFiles = coverage.unmappedFiles;
  if (!Array.isArray(unmappedFiles)) {
    fail('tools/audio-manifest-coverage.json has no `unmappedFiles` — regenerate it; the gate cannot justify the unmapped count without the name and reason of each file.');
  } else {
    const claimed = Object.values(totals.unmapped || {}).reduce((n, x) => n + x, 0);
    if (unmappedFiles.length !== claimed) {
      fail(`the coverage file claims ${claimed} unmapped file(s) but names ${unmappedFiles.length}`);
    }
    const byReader = {};
    const seenUnmapped = new Set();
    for (const u of unmappedFiles) {
      if (!u || !DRIVE_ID.test(u.id || '') || typeof u.name !== 'string') {
        fail(`malformed unmappedFiles entry: ${JSON.stringify(u)}`);
        continue;
      }
      if (seenUnmapped.has(u.id)) { fail(`unmapped id ${u.id} is listed twice`); continue; }
      seenUnmapped.add(u.id);
      if (emitted.has(u.id)) { fail(`id ${u.id} is counted as unmapped but the manifest ships it`); continue; }
      if (u.why === 'bonus') {
        // Provable from the name alone: the corpus has no letter for a bonus
        // track. A stolen letter recording carries an ordinal here instead,
        // so this reason cannot be borrowed to hide one.
        if (!BONUS_NAME.test(u.name)) {
          fail(`${u.name} is dropped as a "bonus" track but its name is not a bonus track — a mapped recording cannot be excused this way`);
          continue;
        }
      } else if (u.why === 'unresolved') {
        if (!(u.id in UNRESOLVED_KNOWN)) {
          fail(`${u.name} reaches no listener and is not a known unresolved recording. Either the resolver in ` +
               `tools/gen-audio-manifest.mjs should place it, or it belongs in UNRESOLVED_KNOWN in this file with a reason.`);
          continue;
        }
      } else {
        fail(`unmapped file ${u.name} carries an unknown reason ${JSON.stringify(u.why)}`);
        continue;
      }
      byReader[readerFromFilename(u.name)] = (byReader[readerFromFilename(u.name)] || 0) + 1;
    }
    for (const r of READER_CODES) {
      const a = (totals.unmapped || {})[r] || 0;
      if (a !== (byReader[r] || 0)) {
        fail(`reader ${r}: ${a} unmapped claimed, but the justified files hold ${byReader[r] || 0}`);
      }
    }
    // No "this pin is now stale" check on purpose: if the resolver starts
    // placing a pinned id, the manifest ships it and the `emitted` test above
    // catches any later attempt to call it unmapped. A dead entry costs a line.
    //
    // WHAT THIS STILL DOES NOT CATCH, stated plainly: in CI the `name` is the
    // forger's own word. Steal a rendition and file its id under a name ending
    // "Bonus Track_… (read by Timothy).mp3" and this check is satisfied, because
    // CI holds nothing to compare the name against. Two things close it, and
    // neither is this loop: the listing leg below rejects the invented name the
    // next time the gate runs on the generating machine, and the coverage file
    // is COMMITTED, so the deleted reader is a line in the diff a reviewer
    // reads. What changed on 2026-09-04 is the cost: the forgery used to need
    // no lie at all, only an id moved from one bucket to another.
  }

  // The independent leg: re-derive the listing counts from the listing itself.
  if (existsSync(LISTING)) {
    const seen = new Set();
    const fromListing = {};
    for (const rec of JSON.parse(readFileSync(LISTING, 'utf8'))) {
      if (!isLetterAudio(rec.path) || seen.has(rec.id)) continue;
      seen.add(rec.id);
      const r = readerFromFilename(rec.path.split('/').pop());
      fromListing[r] = (fromListing[r] || 0) + 1;
    }
    for (const r of READER_CODES) {
      const a = (totals.listing || {})[r] || 0;
      const b = fromListing[r] || 0;
      if (a !== b) {
        fail(`reader ${r}: the coverage file claims ${a} letter-side listing file(s), the listing itself has ${b} — ` +
             'the coverage file was not written from this listing.');
      }
    }
    // Each unmapped file must really BE the listing record it claims to be —
    // the id present, letter-side, and carrying the filename the sidecar
    // recorded. This is what stops an invented name from justifying itself.
    const listingById = new Map();
    for (const rec of JSON.parse(readFileSync(LISTING, 'utf8'))) {
      if (isLetterAudio(rec.path)) listingById.set(rec.id, rec.path);
    }
    for (const u of (Array.isArray(unmappedFiles) ? unmappedFiles : [])) {
      const path = listingById.get(u.id);
      if (!path) { fail(`unmapped id ${u.id} is not a letter-side record in the listing`); continue; }
      const real = path.split('/').pop();
      if (real !== u.name) {
        fail(`unmapped id ${u.id} is recorded as ${JSON.stringify(u.name)} but the listing calls it ${JSON.stringify(real)}`);
      }
    }
    console.log(`[audio-manifest] books balance against ${Object.values(fromListing).reduce((n, x) => n + x, 0)} letter-side listing files (independent leg ran)`);
  } else {
    console.log('[audio-manifest] books balance — sidecar totals only; _audio-drive-listing.json not present (CI)');
  }
}

// ── 3. spares, reported not failed ──────────────────────────────────────
// A reader who supplied more candidates than their rendition uses is normal:
// the duplicate upload in "0. ALL LETTERS", or a spare part-file for a letter
// that reader also read whole. It is worth SEEING, never worth failing on.
let candidateTotal = 0;
for (const v of Object.values(letters)) for (const n of Object.values(v.readers || {})) candidateTotal += n;

// ── 5. report ────────────────────────────────────────────────────────────
const primCounts = countByReader(primaryRows, (r) => r[1]);
const altCounts = countByReader(altCountRows, (r) => r);
console.log(`[audio-manifest] ${Object.keys(AUDIO_MANIFEST).length} letters, ${primaryRows.length} primary tracks (${formatReaderCounts(primCounts)})`);
console.log(`[audio-manifest] ${Object.keys(AUDIO_ALTERNATES).length} letters with a reader choice, ${altRenditions} renditions / ${altTracks} tracks (${formatReaderCounts(altCounts)})`);
console.log(`[audio-manifest] ${Object.keys(letters).length} letters mapped, ${candidateTotal} candidate recordings, ${emitted.size} distinct assets emitted, ${(coverage.collapsedByHash || []).length} same-audio duplicates collapsed`);

// ── optional: is every emitted id actually on the release? ───────────────
if (process.argv.includes('--release')) {
  try {
    const rid = execFileSync(GH, ['api', `repos/${REPO}/releases/tags/${TAG}`, '-q', '.id'],
      { encoding: 'utf8' }).trim();
    const out = execFileSync(GH, ['api', '--paginate', `repos/${REPO}/releases/${rid}/assets?per_page=100`, '-q', '.[].name'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const onRelease = new Set(out.split('\n').map((n) => n.trim()).filter(Boolean));
    const missing = [...emitted].filter((id) => !onRelease.has(id + '.mp3'));
    console.log(`[audio-manifest] release ${TAG}: ${onRelease.size} assets, ${missing.length} emitted id(s) not yet mirrored`);
    if (missing.length) {
      fail(`${missing.length} emitted id(s) are not on the ${TAG} release — run ` +
           `\`python tools/mirror-audio-release.py --until-done\`. First: ${missing.slice(0, 5).join(', ')}`);
    }
  } catch (e) {
    fail('--release could not read the GitHub release: ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}

if (errors.length) {
  console.error('');
  for (const e of errors) console.error('  ✖ ' + e);
  console.error('');
  console.error(`  ${errors.length} problem(s). Regenerate with \`node tools/gen-audio-manifest.mjs\` if the manifest is simply stale.`);
  console.error('');
  process.exit(1);
}
console.log('[audio-manifest] OK — every reader the coverage file records is offered, and the books balance.');
