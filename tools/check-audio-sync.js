/**
 * check-audio-sync — the read-along offsets address the right characters.
 *
 * Read-along paints a clause by CHARACTER OFFSET into a block's DOM
 * textContent (ReadAlongHighlight's rangeIn walks text nodes). The offsets are
 * computed offline, months before the paint, so the two domains can silently
 * drift apart. They did: Segments injects a collision-guard space between
 * adjacent segments and the extractor once joined them with '', so every
 * segment boundary shifted the DOM one character further from the timing data
 * — up to 13 characters by the end of a block. The wash slid into the previous
 * clause and resnapped at each new block (owner report 2026-08-12).
 *
 * Nothing caught it. smoke.js checks only that the row's BLOCK exists;
 * validate-schemas has no AUDIO_SYNC coverage at all; the unit suite drives a
 * hand-written 3-row fixture. This gate is the missing assertion.
 *
 * WHAT IT ASSERTS, and why it is not "regenerate the fragments and compare".
 * Exact membership in a freshly extracted fragment set sounds stricter and is
 * useless as a gate: Volume Two's offsets are CORRECT but coarser (they predate
 * the clause split), so membership fails them at 66% and demands a GPU re-align
 * of data that is already right. A gate that asks for that gets bypassed.
 *
 * Instead: WORD-BOUNDARY WELL-FORMEDNESS in the current domain. A span must
 * start and end where a word does. That is exactly the property that makes
 * rangeIn paint a whole word run, and it is independent of extractor version —
 * clause-split, digit-merge and sentence-regex changes cannot move it, while a
 * one-character domain shift breaks it almost everywhere. Measured on the tree
 * that shipped the bug it separates perfectly: volumes one and two and all 20
 * alternate timelines score 100%, the six stale volumes fail on 349 blocks.
 *
 * Poetry needs lineBounds. Consecutive poetry lines are separate <div>s whose
 * textContent concatenates with NO separator ("their dross" + "And take away"
 * reads "drossAnd"), so a legal boundary there sits between two word
 * characters. audio-fragments-lib owns that knowledge; without it this gate
 * would false-positive on every poetry line in the corpus.
 *
 * Usage:
 *   node tools/check-audio-sync.js               check; non-zero exit on fail
 *   node tools/check-audio-sync.js --json        machine-readable report
 *   node tools/check-audio-sync.js --emit-probe-text
 *       writes _align-work/sync-probe-text.json — every shipped row with the
 *       exact characters the app will wash, so the ASR verifier probes the
 *       file that SHIPS rather than a belt intermediate. One text domain,
 *       three consumers.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { runInNewContext } from 'vm';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CORPUS_FILES, buildCollections, blockDomainText, formatBSpoken } from './audio-fragments-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = resolve(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data');
const WORK = resolve(HERE, '_align-work');

/**
 * Keys whose timings are known stale and are QUEUED for re-alignment. A debt
 * register, not an exemption: it may only shrink, the gate FAILS if it lists a
 * key that now passes, and when it empties the file is deleted and the gate
 * becomes unconditional. A quiet report-only mode would have made this debt
 * invisible, which is how it accumulated unnoticed in the first place.
 */
const ALLOW_PATH = resolve(HERE, 'audio-sync-stale.allow');
const ALLOWED = new Set(
  existsSync(ALLOW_PATH)
    ? readFileSync(ALLOW_PATH, 'utf8').split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [],
);

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const emitProbeText = argv.includes('--emit-probe-text');

// ------------------------------------------------------------------ inputs --
/** Pull one `var NAME = {...};` object literal out of a generated data file. */
function readGlobal(file, name) {
  const src = readFileSync(resolve(DATA, file), 'utf8');
  const ctx = {};
  runInNewContext(src, ctx, { filename: file });
  return ctx[name] || null;
}

const AUDIO_SYNC = readGlobal('audio-sync.js', 'AUDIO_SYNC') || {};
const AUDIO_SYNC_ALT = readGlobal('audio-sync.js', 'AUDIO_SYNC_ALT') || {};
const manifestCtx = {};
runInNewContext(readFileSync(resolve(DATA, 'audio-manifest.js'), 'utf8'), manifestCtx, { filename: 'audio-manifest.js' });
const AUDIO_MANIFEST = manifestCtx.AUDIO_MANIFEST || {};
const AUDIO_ALTERNATES = manifestCtx.AUDIO_ALTERNATES || {};

const corpusCtx = {};
for (const f of CORPUS_FILES) {
  runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), corpusCtx, { filename: f });
}
const { A: A_COLS, B: B_COLS, holyDays } = buildCollections(corpusCtx);

/** volKey:itemId -> the corpus item, across every collection shape. */
const ITEMS = new Map();
for (const [vk, arr] of Object.entries(A_COLS)) for (const it of arr.filter(Boolean)) ITEMS.set(vk + ':' + it.id, it);
for (const [vk, arr] of Object.entries(B_COLS)) for (const it of arr.filter(Boolean)) ITEMS.set(vk + ':' + it.id, it);
for (const e of holyDays) ITEMS.set('holydays:' + e.id, e);

/**
 * assetId -> the letter key whose alternate rendition it is.
 * AUDIO_ALTERNATES[key] = [[readerCode, [[assetId, ...], ...]], ...] — one
 * entry per second reading, each carrying that reading's parts.
 */
const ALT_OWNER = new Map();
for (const [key, rends] of Object.entries(AUDIO_ALTERNATES)) {
  for (const [, parts] of rends || []) {
    for (const p of parts || []) {
      const id = Array.isArray(p) ? p[0] : p;
      if (typeof id === 'string') ALT_OWNER.set(id, key);
    }
  }
}

// ------------------------------------------------------------- the domains --
const RENDERS_NOTHING = 'stanza-break';

/**
 * The LEGACY domain: segments joined with '' instead of through the collision
 * guard. Used ONLY to classify a failure — a span that is clean here and dirty
 * in the real domain is stale timing data, not corrupt prose, and the fix is a
 * re-align rather than a corpus edit. Never a source of truth.
 */
function legacySegText(segs) {
  if (!segs) return '';
  let out = '';
  for (const s of segs) {
    if (!s || s.t === RENDERS_NOTHING) continue;
    if (s.t === 'fn') { out += String(s.v == null ? '' : s.v); continue; }
    if (s.t === 'letter-link') { out += String(s.label == null ? '' : s.label); continue; }
    out += String(s.v == null ? '' : s.v).replace(/\{\{ref:([^}]+)\}\}/g, (_m, r) => r.trim());
  }
  return out;
}

function legacyBlockText(b) {
  if (!b) return null;
  if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') return legacySegText(b.segments);
  if (b.type === 'poetry') {
    if (b.lines) return b.lines.map((l) => legacySegText(l)).join('');
    return (b.segments || []).map((s) => legacySegText([{ ...s, v: String(s.v || '').replace(/^\n/, '') }])).join('');
  }
  if (b.type === 'closing') return String(b.text || '');
  return null;
}

// ------------------------------------------------------------- the checks --
/**
 * THE span invariant, verified exhaustively against the extractor: all 18,079
 * Format-A fragments in the corpus start at the block start, immediately after
 * whitespace, or at a poetry line join — and end symmetrically — and none
 * carries edge whitespace. A coarser span (a pre-clause-split sentence, which
 * is the union of adjacent clauses) satisfies it just as exactly, which is why
 * this can gate correct-but-old data that exact fragment membership would
 * wrongly condemn.
 *
 * A one-character domain shift breaks it almost everywhere; nothing else does.
 */
function spanClean(text, cs, ce, lineBounds) {
  if (!(cs >= 0 && ce > cs && ce <= text.length)) return false;
  if (!(cs === 0 || lineBounds.has(cs) || /\s/.test(text[cs - 1]))) return false;
  if (!(ce === text.length || lineBounds.has(ce) || /\s/.test(text[ce]))) return false;
  if (/^\s|\s$/.test(text.slice(cs, ce))) return false;
  return /[A-Za-z]/.test(text.slice(cs, ce));
}

const EMPTY_BOUNDS = new Set();
const failures = [];
const probeRows = {};
const perKey = new Map();

function note(list, key, kind, detail) {
  list.push({ key, kind, ...detail });
  const k = perKey.get(key) || { key, fail: 0, kinds: new Set() };
  k.fail++;
  k.kinds.add(kind);
  perKey.set(key, k);
}

let rowsChecked = 0, timedChars = 0, touchedChars = 0;

/**
 * @param {string} key      the AUDIO_SYNC key, or `alt:<assetId>` for a per-asset timeline
 * @param {string} itemKey  the corpus item the rows address
 * @param {any[]} rows      the shipped 5-tuples
 */
function checkTimeline(key, itemKey, rows) {
  const item = ITEMS.get(itemKey);
  if (!item) { note(failures, key, 'NO-SUCH-ITEM', { detail: itemKey + ' is not in the corpus' }); return; }

  // Monotonicity is per (part), not per array: the app filters frags by
  // partIndex BEFORE binary-searching, so a part boundary is a legal reset. A
  // naive whole-array scan reports two false positives on today's data.
  const lastT = new Map();
  const spansByBlock = new Map();
  const blockCache = new Map();
  const paraCache = new Map();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 4) { note(failures, key, 'MALFORMED-ROW', { row }); continue; }
    const [t, bi, cs, ce] = row;
    const part = row[4] || 0;
    rowsChecked++;

    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) { note(failures, key, 'BAD-TIME', { row }); continue; }
    const prev = lastT.get(part);
    if (prev != null && t < prev) note(failures, key, 'NON-MONOTONIC', { row, prev });
    lastT.set(part, t);

    const parts = AUDIO_MANIFEST[itemKey];
    if (Array.isArray(parts) && part >= parts.length) {
      // A part index with no track makes the frags memo return null and the
      // whole letter silently never paints.
      note(failures, key, 'PART-OUT-OF-RANGE', { row, parts: parts.length });
    }

    // Format B. `bi` is a paragraph index, and the offsets live in the CORPUS
    // domain rather than the rendered one, so they are checked against the
    // SPOKEN text -- same length as the corpus text, with everything the
    // reader does not say blanked to spaces. Checking against the raw text
    // would reject a legal boundary sitting beside a stripped marker, which is
    // punctuation there and whitespace in the domain that was measured.
    if (item.paragraphs && !item.blocks) {
      const paras = item.paragraphs.length;
      if (!(bi >= 0 && bi < paras)) { note(failures, key, 'PARA-OUT-OF-RANGE', { row, paras }); continue; }
      if (cs === -1 || ce === -1) {
        // The legacy whole-paragraph sentinel. Still honoured by the runtime.
        if (!(cs === -1 && ce === -1)) note(failures, key, 'HALF-SENTINEL', { row });
        continue;
      }
      if (!paraCache.has(bi)) paraCache.set(bi, formatBSpoken(item.paragraphs[bi].text));
      const spoken = paraCache.get(bi);
      if (!(cs >= 0 && ce > cs && ce <= spoken.length)) {
        note(failures, key, 'OUT-OF-BOUNDS', { row, len: spoken.length });
        continue;
      }
      timedChars += ce - cs;
      if (emitProbeText) (probeRows[key] = probeRows[key] || []).push([t, bi, cs, ce, part, spoken.slice(cs, ce)]);
      if (!spanClean(spoken, cs, ce, EMPTY_BOUNDS)) {
        note(failures, key, 'DRIFTED-OTHER', {
          row,
          painted: spoken.slice(Math.max(0, cs - 14), cs) + '┃' + spoken.slice(cs, Math.min(spoken.length, cs + 40)),
        });
      }
      const bkey = part + ':p' + bi;
      const list = spansByBlock.get(bkey) || [];
      list.push([cs, ce, t]);
      spansByBlock.set(bkey, list);
      continue;
    }
    if (cs === -1 || ce === -1) {
      note(failures, key, 'SENTINEL-ON-FORMAT-A', { row });
      continue;
    }

    if (!blockCache.has(bi)) blockCache.set(bi, blockDomainText((item.blocks || [])[bi]));
    const dom = blockCache.get(bi);
    if (!dom) { note(failures, key, 'NO-SUCH-BLOCK', { row, blocks: (item.blocks || []).length }); continue; }

    const { text, lineBounds } = dom;
    const inBounds = cs >= 0 && ce > cs && ce <= text.length;
    // Coverage measures how much of the page has a timing at all, so it counts
    // any in-bounds span. Whether that span is well-formed is a separate
    // question with its own verdict — conflating them would let a re-align
    // that fixes every offset look like a coverage regression.
    if (inBounds) {
      timedChars += ce - cs;
      // The probe text is what the app WILL wash, drift included: an ASR pass
      // over a stale row should hear the wrong words, and that is the signal.
      if (emitProbeText) (probeRows[key] = probeRows[key] || []).push([t, bi, cs, ce, part, text.slice(cs, ce)]);
    }
    if (spanClean(text, cs, ce, lineBounds)) {
      // well-formed
    } else if (!inBounds) {
      note(failures, key, 'OUT-OF-BOUNDS', { row, len: text.length });
    } else {
      const legacy = legacyBlockText((item.blocks || [])[bi]);
      const stale = legacy != null && legacy !== text
        && spanClean(legacy, cs, ce, new Set(lineBounds));
      note(failures, key, stale ? 'STALE-DOMAIN' : 'DRIFTED-OTHER', {
        row,
        painted: text.slice(Math.max(0, cs - 14), cs) + '┃' + text.slice(cs, Math.min(text.length, cs + 40)),
      });
    }

    const list = spansByBlock.get(part + ':' + bi) || [];
    list.push([cs, ce, t]);
    spansByBlock.set(part + ':' + bi, list);
  }

  // Overlap within one block of one part: two clauses claiming the same
  // characters means one of them can never be the active fragment.
  for (const [pb, list] of spansByBlock) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 1; i < list.length; i++) {
      if (list[i][0] < list[i - 1][1]) note(failures, key, 'OVERLAP', { at: pb, a: list[i - 1], b: list[i] });
    }
  }

  // Coverage is advisory — a clause the aligner could not prove simply does
  // not paint, which is a data-completeness question, not a correctness one.
  for (const bi of blockCache.keys()) {
    const dom = blockCache.get(bi);
    if (dom) touchedChars += dom.text.length;
  }
  // Format B's denominator, counted once per paragraph rather than once per
  // row -- adding it per row would grow the numerator and not the denominator,
  // and the reported coverage would climb past 100% as soon as WTLB shipped.
  for (const spoken of paraCache.values()) touchedChars += spoken.length;
}

// ------------------------------------------------------------------- run --
for (const [key, rows] of Object.entries(AUDIO_SYNC)) {
  if (!AUDIO_MANIFEST[key]) note(failures, key, 'NO-MANIFEST-ROW', { detail: 'AUDIO_SYNC key has no recording; _syncFor returns null and it silently never paints' });
  checkTimeline(key, key, rows);
}
for (const [assetId, rows] of Object.entries(AUDIO_SYNC_ALT)) {
  const owner = ALT_OWNER.get(assetId);
  if (!owner) {
    note(failures, 'alt:' + assetId, 'NO-ALTERNATE-OWNER', { detail: 'asset is not in AUDIO_ALTERNATES; nothing can ever select this timeline' });
    continue;
  }
  checkTimeline('alt:' + assetId, owner, rows);
}

// -------------------------------------------------- the coverage floor --
/**
 * Read-along coverage only goes UP.
 *
 * batch-align.py rebuilds this file volume by volume from its run report: it
 * drops every key of the volumes in the run and re-adds the ones the report
 * carries. A letter that RAISED (the twelve-section rendition's CTC failure) or
 * that tools/align-supervisor.py skipped for exceeding the RSS ceiling never
 * reaches that report, so it was DELETED -- one crash or one memory spike
 * silently became a coverage regression. Nothing here saw it: every check above
 * validates the rows that ARE present, so a shorter audio-sync.js is green.
 *
 * The shipper carries such a key forward now (test_batch_align_ship.py), but
 * that protects one writer. This protects every future one -- a hand edit, a
 * bad merge, a second generator -- because it reads the shipped file rather
 * than trusting whoever wrote it.
 *
 * A timeline may only leave together with the reason it existed: its
 * audio-manifest entry. A letter pulled from the corpus drops freely; a letter
 * still on offer that lost its timings is the regression, and fails here.
 */
function lostTimings() {
  let head;
  try {
    head = execFileSync('git', ['show', 'HEAD:app/src/main/assets/src/data/audio-sync.js'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch {
    return null;            // no git, or the file is new in this commit
  }
  const ctx = {};
  runInNewContext(head, ctx, { filename: 'audio-sync.js@HEAD' });
  const lost = [];
  for (const k of Object.keys(ctx.AUDIO_SYNC || {})) {
    if (!(k in AUDIO_SYNC) && k in AUDIO_MANIFEST) lost.push(k);
  }
  for (const a of Object.keys(ctx.AUDIO_SYNC_ALT || {})) {
    if (!(a in AUDIO_SYNC_ALT) && ALT_OWNER.has(a)) lost.push('alt:' + a);
  }
  return lost.sort();
}
const lost = lostTimings();

// ---------------------------------------------------------------- report --
const byKind = new Map();
for (const f of failures) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1);

const staleKeys = [...perKey.values()].filter((k) => k.kinds.has('STALE-DOMAIN')).map((k) => k.key).sort();
const otherKeys = [...perKey.values()].filter((k) => k.fail > 0 && !k.kinds.has('STALE-DOMAIN')).map((k) => k.key).sort();

if (emitProbeText) {
  mkdirSync(WORK, { recursive: true });
  writeFileSync(resolve(WORK, 'sync-probe-text.json'), JSON.stringify(probeRows));
  console.log(`[audio-sync] wrote _align-work/sync-probe-text.json (${Object.keys(probeRows).length} keys)`);
}

if (asJson) {
  console.log(JSON.stringify({
    rowsChecked,
    timelines: Object.keys(AUDIO_SYNC).length + Object.keys(AUDIO_SYNC_ALT).length,
    failures: failures.length,
    byKind: Object.fromEntries(byKind),
    staleKeys,
    otherKeys,
    coverage: touchedChars ? +(timedChars / touchedChars).toFixed(4) : null,
    lost,
    detail: failures.slice(0, 200),
  }, null, 2));
  process.exit(failures.length || (lost && lost.length) ? 1 : 0);
}

const nTimelines = Object.keys(AUDIO_SYNC).length + Object.keys(AUDIO_SYNC_ALT).length;
console.log(`[audio-sync] ${rowsChecked} rows across ${nTimelines} timelines; ` +
  `${touchedChars ? Math.round((timedChars / touchedChars) * 1000) / 10 : 0}% of touched characters timed`);

if (lost === null) {
  console.error('[audio-sync] NOTE — the coverage floor did not run: no git HEAD for audio-sync.js.');
} else if (lost.length) {
  console.error('');
  console.error(`[audio-sync] FAIL — ${lost.length} timeline(s) shipped at HEAD are gone while their`);
  console.error('  audio-manifest entry remains. Read-along coverage only goes up:');
  for (const k of lost.slice(0, 20)) console.error('    ' + k);
  if (lost.length > 20) console.error(`    ... and ${lost.length - 20} more`);
  console.error('');
  console.error('  A letter that really left the corpus loses its manifest entry too, and then');
  console.error('  this check passes on its own. A letter still on offer must keep its timings —');
  console.error('  batch-align.py carries forward any unit its run produced no result for.');
  process.exit(1);
}

const notAllowed = (k) => !ALLOWED.has(k);
// The register waives STALENESS only: a key queued for re-alignment can still
// grow a new overlap or malformed row, and those block like anywhere else.
const waivable = (f) => f.kind === 'STALE-DOMAIN' && ALLOWED.has(f.key);
const blocking = failures.filter((f) => !waivable(f));
const waived = failures.length - blocking.length;
const stillListed = [...ALLOWED].filter((k) => !perKey.has(k)).sort();

if (!blocking.length) {
  // The register has to shrink as the debt does, or it becomes a place bad
  // data can hide behind a name nobody rechecks.
  if (stillListed.length) {
    console.error(`\n[audio-sync] FAIL — tools/audio-sync-stale.allow lists ${stillListed.length} key(s) that now PASS.`);
    console.error('  Their timings were re-aligned; the register must lose them too. Remove:');
    for (const k of stillListed.slice(0, 20)) console.error('    ' + k);
    if (stillListed.length > 20) console.error(`    ... and ${stillListed.length - 20} more`);
    process.exit(1);
  }
  console.log('[audio-sync] OK — every shipped span starts and ends on a word boundary'
    + (waived ? `, except ${waived} row(s) across ${ALLOWED.size} key(s) queued for re-alignment (tools/audio-sync-stale.allow).` : '.'));
  process.exit(0);
}

console.error('\n[audio-sync] FAIL — ' + blocking.length + ' bad row(s):');
const blockingKinds = new Map();
for (const f of blocking) blockingKinds.set(f.kind, (blockingKinds.get(f.kind) || 0) + 1);
for (const [kind, n] of [...blockingKinds].sort((a, b) => b[1] - a[1])) console.error(`    ${kind.padEnd(20)} ${n}`);

const sample = blocking.filter((f) => f.painted).slice(0, 6);
if (sample.length) {
  console.error('\n  Sample (┃ marks where the wash would begin):');
  for (const f of sample) console.error(`    ${f.key} bi=${f.row[1]} [${f.row[2]},${f.row[3]})\n      ${f.painted}`);
}

if (staleKeys.filter(notAllowed).length) {
  console.error(`\n  ${staleKeys.filter(notAllowed).length} item(s) carry offsets measured against the PRE-2026-08-12 text domain.`);
  console.error('  These are stale timings, not corrupt prose — the corpus is fine, the alignment is old.');
  const vols = new Map();
  for (const k of staleKeys.filter(notAllowed)) { const v = k.split(':')[0]; vols.set(v, (vols.get(v) || 0) + 1); }
  console.error('    ' + [...vols].map(([v, n]) => `${v}:${n}`).join('  '));
  console.error('\n  Fix by re-aligning (NOT by editing audio-sync.js by hand):');
  console.error(`    py -3.13 tools/batch-align.py --volkeys ${[...vols.keys()].filter((v) => v !== 'alt').join(',')}`);
}
if (otherKeys.filter(notAllowed).length) {
  console.error(`\n  ${otherKeys.filter(notAllowed).length} item(s) fail in BOTH domains — the prose changed after alignment,`);
  console.error('  or the rows predate a corpus edit. Re-align these too:');
  const rest = otherKeys.filter(notAllowed);
  console.error('    ' + rest.slice(0, 12).join('\n    ') + (rest.length > 12 ? `\n    ... and ${rest.length - 12} more` : ''));
}
process.exit(1);
