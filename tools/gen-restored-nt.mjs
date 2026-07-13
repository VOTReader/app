/**
 * gen-restored-nt.mjs — generate the Restored-Name New Testament overlays.
 *
 * Emits two SPARSE translation verse maps (only verses whose text changed):
 *   src/data/bible-rnkjv.js  (var BIBLE_RNKJV) — NKJV base (books.js + matthew-plain.js)
 *   src/data/bible-rkjv.js   (var BIBLE_RKJV)  — KJV base (bible-kjv.js), registry base:'kjv'
 *
 * Doctrine (The Volumes of Truth — "Death and Deliverance", "Proclaim The Name
 * of The Lord"; answersonlygodcangive.com "The Name of The Lord", "Regarding
 * Sacred Names"): His name is YahuShua HaMashiach — YahuShua = "YAH Is
 * Salvation"; Ha = the definite article, Mashiach = Messiah ("Anointed").
 * Full ruleset, per-category evidence (English + Textus Receptus Greek), and
 * every owner-visible judgment call: RESTORED-NAMES-PLAN.txt.
 *
 * Scope: NEW TESTAMENT ONLY. Only the Lord's name is restored — other bearers
 * of the name (Bar-Jesus, "Jesus who is called Justus") keep their traditional
 * rendering, matching the Matthew Study Bible's own precedent ("the names of
 * other people were not corrected. Only The Messiah's name was restored").
 *
 * Deterministic: rerun after any ruleset change; never hand-edit the outputs.
 *   node tools/gen-restored-nt.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '..', 'app', 'src', 'main', 'assets', 'src', 'data');

// "Christ Jesus" (Pauline order, 69 NKJV / 58 KJV) is rendered in the COMMANDED
// order of the Name — "call upon His name as it is" (Death and Deliverance);
// the VOT corpus writes "YahuShua HaMashiach" 121x and the reversed order 0x.
// The KJV itself already normalized 11 of the TR's "Christ Jesus" pairs to
// "Jesus Christ", so pair order was never treated as inspired word order.
// Set to 'preserve' to emit "Mashiach YahuShua" (order-true, article-less
// per the anarthrous Greek) instead.
const PAIR_ORDER = 'commanded';

const NT = ['matthew-plain','mark','luke','john','acts','romans','1corinthians','2corinthians','galatians','ephesians','philippians','colossians','1thessalonians','2thessalonians','1timothy','2timothy','titus','philemon','hebrews','james','1peter','2peter','1john','2john','3john','jude','revelation'];

function loadVar(file, varName) {
  const sb = {}; sb.window = sb;
  runInNewContext(readFileSync(resolve(dataDir, file), 'utf8'), sb, { filename: file });
  return sb[varName];
}

/* ── Per-verse exceptions (applied before the rules; each pair must hit
      exactly once or the generator throws). tr: 'both' | 'nkjv' | 'kjv'. ── */
const EXCEPTIONS = [
  // Paul's coworker named Yeshua — not the Lord. Unchanged (Study Bible rule:
  // other people's names are not corrected).
  { ref: 'colossians 4:11', tr: 'both', skip: true },
  // KJV renders Joshua son of Nun as "Jesus" (Greek Iesous covers both names).
  // NKJV already says "Joshua"; KJV-R follows — the referent is Joshua, and a
  // leftover "Jesus" would read as the Lord's retired name.
  { ref: 'acts 7:45', tr: 'kjv', pairs: [['with Jesus into', 'with Joshua into']] },
  { ref: 'hebrews 4:8', tr: 'kjv', pairs: [['if Jesus had', 'if Joshua had']] },
  // John's interpretive glosses translate Aramaic "Messias" into Greek
  // "Christos" for his readers. With the title restored to Mashiach, the gloss
  // is rendered by its MEANING ("the Anointed") — "which is translated, the
  // Mashiach" would be circular.
  { ref: 'john 1:41', tr: 'nkjv', pairs: [['the Messiah', 'the Mashiach'], ['the Christ', 'the Anointed']] },
  { ref: 'john 1:41', tr: 'kjv', pairs: [['the Messias', 'the Mashiach'], ['the Christ', 'the Anointed']] },
  { ref: 'john 4:25', tr: 'nkjv', pairs: [['that Messiah is coming', 'that Mashiach is coming'], ['who is called Christ', 'who is called the Anointed']] },
  { ref: 'john 4:25', tr: 'kjv', pairs: [['Messias cometh', 'Mashiach cometh'], ['which is called Christ', 'which is called the Anointed']] },
  // Anarthrous Greek predicate ("God has made Him... Lord and Christ") — the
  // Hebrew predicate is bare (Delitzsch: le'adon veli-mshiach), so Mashiach
  // without the article. The verse's "this/that same Jesus" restores normally.
  { ref: 'acts 2:36', tr: 'both', pairs: [['both Lord and Christ', 'both Lord and Mashiach']] },
];

/* ── Protected tokens (never restored) ── */
const MASKS = [
  /Bar[-–][Jj]esus\b/g,   // Acts 13:6 — the sorcerer's patronymic (KJV prints "Bar–jesus")
  /[Aa]ntichrists?\b/g,   // 1 John / 2 John — VOT corpus itself uses "antichrist" (16x)
  /Christians?\b/g,       // Acts 11:26, 26:28, 1 Pet 4:16 — historical label; VOT uses it (53x)
];

/* ── Ordered rules ── */
const PAIR = PAIR_ORDER === 'commanded' ? 'YahuShua HaMashiach' : 'Mashiach YahuShua';
const RULES = [
  // The naming verses + cross inscriptions print the Name in capitals
  // (Matt 1:21/1:25, Luke 1:31/2:21; Matt 27:37, John 19:19).
  { re: /\bJESUS\b/g, to: 'YAHUSHUA', cat: 'JESUS (caps)' },
  { re: /Jesus Christ(['’])s/g, to: 'YahuShua HaMashiach$1s', cat: "Jesus Christ's" },
  { re: /Jesus Christ\b/g, to: 'YahuShua HaMashiach', cat: 'Jesus Christ' },
  { re: /Christ Jesus\b/g, to: PAIR, cat: 'Christ Jesus' },
  // pseudochristoi — a generic plural; "messiahs" is the honest English here
  // (the one place "Messiah" beats a transliteration).
  { re: /false Christs\b/g, to: 'false Messiahs', cat: 'false christs' },
  { re: /false christs\b/g, to: 'false messiahs', cat: 'false christs' },
  // Hebrew grammar: a noun with a possessive suffix (meshicho, "His Anointed",
  // Ps 2:2 quoted at Acts 4:26; Rev 11:15, 12:10) or in construct with a
  // possessor (mashiach-YHWH, Luke 2:26) NEVER takes the article — bare Mashiach.
  { re: /\b([Hh]is|[Mm]y|[Tt]hy|[Yy]our) Christ\b/g, to: '$1 Mashiach', cat: 'His Christ' },
  { re: /\b(Lord|LORD)(['’])s Christ\b/g, to: '$1$2s Mashiach', cat: "Lord's Christ" },
  // "who/which is called Christ" (Matt 1:16, 27:17, 27:22) — after niqra
  // ("is called") the title stands bare in Hebrew (Delitzsch: haniqra Mashiach).
  { re: /\b(is|was|be) called Christ\b/g, to: '$1 called Mashiach', cat: 'called Christ' },
  // Standalone title: Ha IS the article — English "the" is absorbed.
  { re: /[Tt]he Christ\b/g, to: 'HaMashiach', cat: 'the Christ' },
  { re: /Christ(['’])s/g, to: 'HaMashiach$1s', cat: "Christ's" },
  { re: /\bChrist\b/g, to: 'HaMashiach', cat: 'Christ (standalone)' },
  { re: /\bJesus(['’])(?![A-Za-z])/g, to: 'YahuShua$1s', cat: "Jesus' (possessive)" },
  { re: /\bJesus\b/g, to: 'YahuShua', cat: 'Jesus' },
  { re: /\bMessias\b/g, to: 'Mashiach', cat: 'Messias' },
  { re: /\bMessiah\b/g, to: 'Mashiach', cat: 'Messiah' },
];

const stats = { nkjv: {}, kjv: {} };
function bump(tr, cat, n) { stats[tr][cat] = (stats[tr][cat] || 0) + n; }

function restoreVerse(text, ref, tr) {
  const ex = EXCEPTIONS.filter((e) => e.ref === ref && (e.tr === 'both' || e.tr === tr));
  for (const e of ex) {
    if (e.skip) return text;
    for (const [find, to] of e.pairs) {
      const parts = text.split(find);
      if (parts.length !== 2) throw new Error(`exception [${tr} ${ref}]: "${find}" occurs ${parts.length - 1}x (want exactly 1)`);
      text = parts.join(to);
      bump(tr, 'exception', 1);
    }
  }
  // mask protected tokens
  const masked = [];
  for (const re of MASKS) {
    text = text.replace(re, (m) => { masked.push(m); return `\x00${masked.length - 1}\x00`; });
  }
  for (const r of RULES) {
    text = text.replace(r.re, (...args) => {
      bump(tr, r.cat, 1);
      const m = args[0];
      return m.replace(r.re, r.to); // single-match re-run for $n expansion
    });
  }
  // unmask
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => masked[+i]);
  return text;
}

/* Leftover sweep: after restoration no un-protected Jesus/Christ/Messias token
   may remain anywhere in the NT. */
function assertClean(text, ref, tr) {
  const stripped = text
    .replace(/Bar[-–][Jj]esus\b/g, '')
    .replace(/[Aa]ntichrists?\b/g, '')
    .replace(/Christians?\b/g, '')
    .replace(/false [Mm]essiahs\b/g, '');
  if (/Jesus|JESUS|Christ|\bchrists?\b|Messias|Messiah/.test(stripped)) {
    // Col 4:11 (skip exception) is the one place "Jesus" legitimately remains.
    if (ref === 'colossians 4:11') return;
    throw new Error(`leftover token [${tr} ${ref}]: ${text}`);
  }
}

/* ── Walk sources, build sparse overlays ── */
const BOOKS = loadVar('books.js', 'BOOKS');
const MATTHEW_PLAIN = loadVar('matthew-plain.js', 'MATTHEW_PLAIN');
const KJV = loadVar('bible-kjv.js', 'BIBLE_KJV');

function* nkjvVerses(bookId) {
  const b = bookId === 'matthew-plain' ? MATTHEW_PLAIN : BOOKS[bookId];
  if (!b) return;
  for (const ch of b.chapters || []) for (const sec of ch.sections || []) for (const v of sec.verses || [])
    yield { ch: String(ch.num), n: v.n, text: v.text };
}
function* kjvVerses(bookId) {
  const chs = KJV[bookId]; if (!chs) return;
  for (const chNum of Object.keys(chs)) for (const v of chs[chNum])
    yield { ch: chNum, n: v.n, text: v.text };
}

function buildOverlay(tr, versesOf) {
  const map = {};
  let changed = 0;
  for (const bookId of NT) {
    for (const v of versesOf(bookId)) {
      const ref = `${bookId} ${v.ch}:${v.n}`;
      const out = restoreVerse(v.text, ref, tr);
      assertClean(out, ref, tr);
      if (out !== v.text) {
        (map[bookId] = map[bookId] || {});
        (map[bookId][v.ch] = map[bookId][v.ch] || []).push({ n: v.n, text: out });
        changed++;
      }
    }
  }
  return { map, changed };
}

const rnkjv = buildOverlay('nkjv', nkjvVerses);
const rkjv = buildOverlay('kjv', kjvVerses);

// Exceptions must all have fired (skip entries excluded — they assert by absence).
const firedWanted = EXCEPTIONS.filter((e) => !e.skip).reduce((n, e) => n + e.pairs.length * (e.tr === 'both' ? 2 : 1), 0);
const fired = (stats.nkjv.exception || 0) + (stats.kjv.exception || 0);
if (fired !== firedWanted) throw new Error(`exceptions fired ${fired}, wanted ${firedWanted}`);

/* ── Emit ── */
function emit(file, varName, overlay, baseLabel) {
  const bookLines = NT.filter((id) => overlay.map[id])
    .map((id) => JSON.stringify(id) + ':' + JSON.stringify(overlay.map[id]))
    .join(',\n');
  const header =
`/* ════════════════════════════════════════════════════════════════
   ${varName} — Restored-Name New Testament overlay over the ${baseLabel}.
   GENERATED by tools/gen-restored-nt.mjs — do not edit by hand; adjust the
   ruleset/exceptions there and rerun. Sparse: only changed verses are present
   (${overlay.changed} verses); the reader falls back to the ${baseLabel} for the rest.
   Doctrine + full ruleset + evidence: RESTORED-NAMES-PLAN.txt.
   His name is YahuShua HaMashiach. For personal use.
════════════════════════════════════════════════════════════════ */
var ${varName} = {
${bookLines}
};
`;
  writeFileSync(resolve(dataDir, file), header);
  console.log(`${file}: ${overlay.changed} verses across ${Object.keys(overlay.map).length} books`);
}

emit('bible-rnkjv.js', 'BIBLE_RNKJV', rnkjv, 'NKJV');
emit('bible-rkjv.js', 'BIBLE_RKJV', rkjv, 'KJV');

console.log('\nReplacement stats:');
for (const tr of ['nkjv', 'kjv']) {
  console.log(`  [${tr}]`);
  for (const [cat, n] of Object.entries(stats[tr]).sort((a, b) => b[1] - a[1])) console.log(`    ${cat}: ${n}`);
}

/* Samples for eyeball review */
const SAMPLE = [
  ['matthew-plain', '1', 1], ['matthew-plain', '1', 21], ['matthew-plain', '16', 16], ['matthew-plain', '16', 20],
  ['matthew-plain', '26', 68], ['matthew-plain', '27', 17], ['john', '1', 41], ['john', '4', 25],
  ['acts', '2', 36], ['acts', '4', 26], ['luke', '2', 26], ['revelation', '12', 10],
  ['romans', '8', 39], ['hebrews', '4', 8], ['acts', '7', 45], ['1john', '2', 22],
];
console.log('\nSamples:');
for (const [b, c, n] of SAMPLE) {
  for (const [label, ov] of [['rnkjv', rnkjv.map], ['rkjv', rkjv.map]]) {
    const v = ov[b] && ov[b][c] && ov[b][c].find((x) => x.n === n);
    if (v) console.log(`  [${label} ${b} ${c}:${n}] ${v.text}`);
  }
}
