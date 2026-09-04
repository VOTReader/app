/**
 * gen-audio-manifest — map the flock's Drive audio-letter tracks onto the
 * app's corpus and emit src/data/audio-manifest.js (rides bundle-a-vot).
 *
 * Pipeline:
 *   python tools/fetch-drive-audio.py     -> tools/_audio-drive-listing.json
 *   node tools/gen-audio-manifest.mjs     -> app/src/main/assets/src/data/audio-manifest.js
 *   (then: bump CORPUS_VERSION + npm run build)
 *
 * Matching rules (owner directive 2026-08-05):
 *   - Benjamin's readings SUPERSEDE any other rendition of the same letter,
 *     wherever they sit in the tree — no duplicates.
 *   - Among non-Benjamin renditions: Timothy > text-to-speech > AI-with-music.
 *   - "(Full Letter)" tracks beat their per-section splits; sections are used
 *     (in order) only when no full-letter track exists.
 *   - A file matches a letter by collection prefix + number, verified by
 *     normalized title; title matching rescues misnumbered files (staged:
 *     exact → section-tail strip → parenthetical strip → token subset).
 *   - "Addendum to X" files become an extra ordered part of letter X.
 *   - WTLB "Part N"/"Section N" range compilations land in AUDIO_SECTIONS
 *     (wtlb1/wtlb2 section playlists).
 *
 * Excluded content (different surfaces, not letter audio): "AI Songs of the
 * Letters", "The Gospel of John Movie Audio", "17. Bible-Letter Studies"
 * (tracks span multiple study chapters), "18. TSOT New Testament" (Bible
 * chapters). Bonus tracks with no corpus letter are reported, not shipped.
 */
import { readFileSync, writeFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// THE rendition rules — shared with tools/check-audio-manifest.js and its
// tests, so the manifest and the gate that checks it cannot drift apart.
import {
  READER_RANK, composeAlternates, countByReader, dedupeByAudioHash, formatReaderCounts,
  readerFromFilename, isLetterAudio, NON_LETTER_ROOT,
} from './audio-renditions-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ASSETS = resolve(REPO, 'app', 'src', 'main', 'assets');
const LISTING = resolve(HERE, '_audio-drive-listing.json');
const OUT = resolve(ASSETS, 'src', 'data', 'audio-manifest.js');
// The gate's ground truth: every candidate this run MAPPED to a corpus item.
// Committed (unlike the Drive listing) so check-audio-manifest.js runs in CI.
const COVERAGE = resolve(HERE, 'audio-manifest-coverage.json');
// { driveFileId: <sha1 of the mp3 frames> } from tools/audio-archive-hashes.py.
// OPTIONAL: the generator sees a Drive listing, never the bytes, and Drive's own
// md5Checksum covers the ID3 tags this hash strips — so the map has to be produced
// from D:\VOT-Archive. Absent, nothing is collapsed and the run is what it always was.
const HASHES = resolve(HERE, '_audio-drive-hashes.json');
// relpath<TAB>seconds<TAB>bytes for every letter-side mp3 in D:\VOT-Archive —
// copy of _source-manifests/letter-durations.tsv. OPTIONAL, and a REPORT only:
// it settles, in the run's own output, the question of whether a reader who has
// both a whole-letter track and section tracks recorded the letter twice. They
// did not; the sections are that same recording chunked, with a spoken
// section-title intro on each. See renditions-census.md.
const DURATIONS = resolve(HERE, '_letter-durations.tsv');

// ── corpus load (same vm technique as validate-schemas.js) ──────────────
const DATA_FILES = [
  'volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js',
  'volume-five.js', 'volume-six.js', 'volume-seven.js',
  'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
  'wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'holy-days.js',
];
const ctx = {};
for (const f of DATA_FILES) {
  runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', f), 'utf8'), ctx, { filename: f });
}

/** @type {Array<{volKey:string, letters:any[], preface:any|null, prefixes:string[]}>} */
const COLS = [
  { volKey: 'one',      letters: ctx.LETTERS_V1,      preface: ctx.LETTERS_V1_PREFACE || null,      prefixes: ['V1'] },
  { volKey: 'two',      letters: ctx.LETTERS,         preface: null,                                 prefixes: ['V2'] },
  { volKey: 'three',    letters: ctx.LETTERS_V3,      preface: ctx.LETTERS_V3_PREFACE || null,      prefixes: ['V3'] },
  { volKey: 'four',     letters: ctx.LETTERS_V4,      preface: ctx.LETTERS_V4_PREFACE || null,      prefixes: ['V4'] },
  { volKey: 'five',     letters: ctx.LETTERS_V5,      preface: ctx.LETTERS_V5_PREFACE || null,      prefixes: ['V5'] },
  { volKey: 'six',      letters: ctx.LETTERS_V6,      preface: ctx.LETTERS_V6_PREFACE || null,      prefixes: ['V6'] },
  { volKey: 'seven',    letters: ctx.LETTERS_V7,      preface: ctx.LETTERS_V7_PREFACE || null,      prefixes: ['V7'] },
  { volKey: 'timothy',  letters: ctx.LETTERS_TIMOTHY, preface: ctx.LETTERS_TIMOTHY_PREFACE || null, prefixes: ['LFT'] },
  { volKey: 'flock',    letters: ctx.LETTERS_FLOCK,   preface: ctx.LETTERS_FLOCK_PREFACE || null,   prefixes: ['OFV', 'TLLF'] },
  { volKey: 'rebuke',   letters: ctx.LETTERS_REBUKE,  preface: ctx.LETTERS_REBUKE_PREFACE || null,  prefixes: ['TLR'] },
  { volKey: 'wtlb1',    letters: ctx.WTLB_ONE,        preface: null,                                 prefixes: ['WTLB'] },
  { volKey: 'wtlb2',    letters: ctx.WTLB_TWO,        preface: null,                                 prefixes: ['WTLB2'] },
  { volKey: 'blessed',  letters: ctx.THE_BLESSED,     preface: null,                                 prefixes: ['TB2', 'TB'] },
  { volKey: 'holydays', letters: ctx.HOLY_DAYS,       preface: null,                                 prefixes: [] },
];
for (const c of COLS) {
  if (!Array.isArray(c.letters) || c.letters.length === 0) {
    console.error(`FATAL: corpus empty for ${c.volKey}`);
    process.exit(1);
  }
}
const COL_BY_PREFIX = new Map();
for (const c of COLS) for (const p of c.prefixes) COL_BY_PREFIX.set(p, c);

// ── normalization ────────────────────────────────────────────────────────
// Files mangle punctuation ("Whats" for "What's", `_Under God_` for the
// quoted phrase, `…` for `...`, U+200E marks) — compare on [a-z0-9] only.
const normkey = (s) => String(s)
  .replace(/[‎‏‘’“”]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');
const tokens = (s) => new Set(String(s).replace(/[‎‏‘’“”']/g, '').toLowerCase().match(/[a-z0-9]+/g) || []);
const stripParens = (s) => String(s).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
// "(Part 2)" is a different LETTER, not a parenthetical aside. Spelled either way.
const PART_WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const partOf = (s) => {
  const m = /\(\s*part\s+(\d+|one|two|three|four|five|six|seven)\s*[-)]/i.exec(String(s));
  if (!m) return null;
  const v = m[1].toLowerCase();
  return /^\d+$/.test(v) ? +v : PART_WORD[v];
};

/**
 * Staged title comparison. File titles truncate with "…", drop
 * parentheticals ("(Jesus)"), and occasionally drop mid-title words
 * ("To the Church Who [Dwells in the Midst Of and] Sits Upon Seven Hills").
 */
function titleMatches(fileTitle, letterTitle) {
  const a = normkey(fileTitle), b = normkey(letterTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  // A part marker names the letter; every stage below throws it away.
  // stripParens deletes it outright, and the token subset never sees it, so
  // "I Am Calling You Out! (Part 2)…" matched Part 1 just as well as Part 2 —
  // ambiguous, dropped, and Timothy's ten section recordings of Part 2 were
  // reported as unreachable. When both sides say which part they are and differ,
  // they are different letters whatever the rest of the title does.
  const pa = partOf(fileTitle), pb = partOf(letterTitle);
  if (pa != null && pb != null && pa !== pb) return false;
  const n = Math.min(a.length, b.length);
  if (n >= 20 && (a.startsWith(b.slice(0, n)) || b.startsWith(a.slice(0, n)))) return true;
  const ap = normkey(stripParens(fileTitle)), bp = normkey(stripParens(letterTitle));
  if (ap && bp && ap === bp) return true;
  // Token subset: every file-title word appears in the letter title (≥4 words).
  const at = tokens(fileTitle), bt = tokens(letterTitle);
  if (at.size >= 4 && [...at].every((t) => bt.has(t))) return true;
  return false;
}

const titleIndex = (col) => {
  const m = new Map();
  const add = (letter) => {
    const k = normkey(letter.title);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(letter);
  };
  if (col.preface) add(col.preface);
  col.letters.forEach(add);
  return m;
};
const TITLE_IDX = new Map(COLS.map((c) => [c.volKey, titleIndex(c)]));
const NUM_IDX = new Map(COLS.map((c) => {
  const m = new Map();
  c.letters.forEach((l) => { if (!m.has(l.num)) m.set(l.num, l); });
  return [c.volKey, m];
}));

// ── filename parsing ─────────────────────────────────────────────────────
// THE reader convention, shared with the gate so the two cannot disagree about
// who read a file. "(read by text-to-speech - Benjamin)" is Benjamin: he
// produced it, and his rank is what makes his readings supersede.
const parseReader = readerFromFilename;

/**
 * Parse one mp3 filename into
 *   { prefix, num, part, title, reader, isFull, section }
 * Handles: V1.013_Title (…).mp3 · V1.003.1_Title · V7.007.0_Title ·
 * WTLB_102_Title · WTLB2.005_Title · TB2_003.2_Title (Part Two) ·
 * TLR.000_Title · V1-7.000_Title (V1 preface) · "Title (Full Letter)" ·
 * "Title - Section N_SUBTITLE" · trailing " copy" / " 1" dedupe junk.
 */
function parseName(name) {
  let s = name.replace(/\.mp3$/i, '').replace(/\s+copy$/i, '').replace(/[‎‏]/g, '');
  const reader = parseReader(s);
  s = s.replace(/\s*\(read by [^)]*\)\s*/gi, ' ').replace(/\s+\d+$/, '').trim();
  let core = null;
  let m = /^V1-7[._]0*(\d+)_\s*(.+)$/.exec(s);
  if (m) core = { prefix: 'V1', num: 0, part: null, title: m[2] };
  if (!core) {
    m = /^(V[1-7]|TLR|OFV|LFT|WTLB2|WTLB|TB2|TB)[._ ]0*(\d+)(?:[._](\d+))?_\s*(.+)$/.exec(s);
    if (m) core = { prefix: m[1], num: +m[2], part: m[3] != null ? +m[3] : null, title: m[4] };
  }
  if (!core) {
    m = /^TLLF_Bonus Track_\s*(.+)$/i.exec(s);
    if (m) core = { prefix: 'TLLF', num: null, part: null, title: m[1], bonus: true };
  }
  if (!core) {
    m = /^(V[1-7])\.Bonus Track_\s*(.+)$/i.exec(s);
    if (m) core = { prefix: m[1], num: null, part: null, title: m[2], bonus: true };
  }
  if (!core) return null;
  let title = core.title.trim();
  const isFull = /\(full letter\)\s*$/i.test(title);
  if (isFull) title = title.replace(/\s*\(full letter\)\s*$/i, '').trim();
  let section = null;
  const secM = /^(.*?)\s*[-–]\s*Section\s+(\d+)_.*$/i.exec(title);
  if (secM) { title = secM[1].trim(); section = +secM[2]; }
  // "…Title (Part One)" split-halves (The Blessed) — part label, not title.
  const partWordM = /^(.*?)\s*\(Part (One|Two|Three|Four|1|2|3|4)\)$/i.exec(title);
  if (partWordM && core.part == null && !section) {
    const ord = { one: 1, two: 2, three: 3, four: 4 }[partWordM[2].toLowerCase()] || +partWordM[2];
    title = partWordM[1].trim();
    core.part = ord;
  }
  return { ...core, title, reader, isFull, section };
}

// WTLB range compilations: "WTLB_Part 3_040-059 (…)" / "WTLB2_Section 2_029-056 (…)"
function parseRangeCompilation(name) {
  let s = name.replace(/\.mp3$/i, '').replace(/[‎‏]/g, '');
  const reader = parseReader(s);
  s = s.replace(/\s*\(read by [^)]*\)\s*/gi, ' ').trim();
  const m = /^(WTLB2|WTLB)_(Part|Section)\s+(\d+)_(Intro|\d+)\s*-\s*(\d+)$/i.exec(s);
  if (!m) return null;
  const volKey = m[1] === 'WTLB2' ? 'wtlb2' : 'wtlb1';
  const lo = /^intro$/i.test(m[4]) ? 'Intro' : String(+m[4]);
  return { volKey, kind: m[2], n: +m[3], label: `${m[2]} ${+m[3]} · ${lo}–${+m[5]}`, reader };
}

// Holy Days folder: "10_V3.013_I AM RISEN (…)" — leading number is playlist
// order; some files skip it ("WTLB2.119_The Holy Days"). Match by title.
function parseHolyDayName(name) {
  let s = name.replace(/\.mp3$/i, '').replace(/\s+copy$/i, '').replace(/[‎‏]/g, '');
  const reader = parseReader(s);
  s = s.replace(/\s*\(read by [^)]*\)\s*/gi, ' ').trim();
  const m = /^(?:0*(\d+)_)?(?:(?:V[1-7]|TLR|OFV|LFT|WTLB2|WTLB|TB2|TB)[._][\d.]+_)?\s*(.+)$/.exec(s);
  if (!m) return null;
  return { order: m[1] != null ? +m[1] : null, title: m[2], reader };
}

// ── resolve one parsed file to a letter ─────────────────────────────────
function resolveLetter(parsed) {
  const col = COL_BY_PREFIX.get(parsed.prefix);
  if (!col) return { err: 'unknown prefix' };
  if (parsed.bonus) {
    const all = [col.preface, ...col.letters].filter(Boolean);
    const hit = all.filter((l) => titleMatches(parsed.title, l.title));
    if (hit.length === 1) return { col, letter: hit[0], note: 'bonus track matched' };
    return { err: 'bonus track not in corpus' };
  }
  if (parsed.num === 0) {
    if (col.preface) return { col, letter: col.preface, isPreface: true };
    return { err: 'num 0 but collection has no preface' };
  }
  const byNum = parsed.num != null ? NUM_IDX.get(col.volKey).get(parsed.num) : null;
  if (byNum && titleMatches(parsed.title, byNum.title)) return { col, letter: byNum };
  // "Addendum to X" — an extra part of letter X.
  const addM = /^Addendum to\s+_?(.+?)_?$/i.exec(parsed.title);
  if (addM) {
    const target = addM[1];
    if (byNum && titleMatches(target, byNum.title)) return { col, letter: byNum, addendum: true };
    const tc = (TITLE_IDX.get(col.volKey).get(normkey(target)) || []);
    if (tc.length === 1) return { col, letter: tc[0], addendum: true, note: 'addendum matched by title' };
  }
  // Misnumbered upstream — trust the title when it uniquely names a letter.
  const cands = TITLE_IDX.get(col.volKey).get(normkey(parsed.title)) || [];
  if (cands.length === 1) return { col, letter: cands[0], note: byNum ? null : 'matched by title' };
  if (cands.length > 1) {
    const byNumInCands = cands.find((l) => l.num === parsed.num);
    if (byNumInCands) return { col, letter: byNumInCands };
    return { err: `title matches ${cands.length} letters` };
  }
  // Staged fuzzy scan (truncated titles, dropped parentheticals/words).
  const all = [col.preface, ...col.letters].filter(Boolean);
  const loose = all.filter((l) => titleMatches(parsed.title, l.title));
  if (loose.length === 1) return { col, letter: loose[0], note: 'matched by fuzzy title' };
  return { err: loose.length > 1 ? `fuzzy title matches ${loose.length}` : 'no title match' };
}

// ── walk the listing ─────────────────────────────────────────────────────
const listing = JSON.parse(readFileSync(LISTING, 'utf8'));
let AUDIO_HASHES = {};
try { AUDIO_HASHES = JSON.parse(readFileSync(HASHES, 'utf8')); } catch { /* optional */ }
/** relpath -> seconds, for the report line at the bottom. */
const SECONDS = new Map();
try {
  for (const line of readFileSync(DURATIONS, 'utf8').split('\n').slice(1)) {
    const [relpath, secs] = line.split('\t');
    if (relpath && secs) SECONDS.set(relpath, +secs);
  }
} catch { /* optional */ }
const secondsById = new Map();
// Ids the manifest on disk already ships. Duplicate copies are byte-identical,
// so re-picking between them changes nothing a listener hears and costs a fresh
// mirror upload; the dedup keeps the incumbent when it can.
const INCUMBENT = new Set(String((() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })())
  .match(/"[A-Za-z0-9_-]{25,}"/g)?.map((q) => q.slice(1, -1)) || []);
const SKIP_RE = NON_LETTER_ROOT;   // shared with the gate (audio-renditions-lib.mjs)
const ALL_LETTERS_RE = /^0\. ALL LETTERS/;
const HOLY_RE = /^16\. Regarding The Holy Days/;

const files = [];
let skipped = 0;
const seenIds = new Set();
for (const f of listing) {
  const path = f.path;
  if (!/\.mp3$/i.test(path)) { skipped++; continue; }
  if (SKIP_RE.test(path)) { skipped++; continue; }
  if (seenIds.has(f.id)) continue; // multi-parent dupe
  seenIds.add(f.id);
  if (SECONDS.has(path)) secondsById.set(f.id, SECONDS.get(path));
  const name = path.split('/').pop();
  files.push({
    name, id: f.id,
    fill: ALL_LETTERS_RE.test(path),   // "0. ALL LETTERS" fills gaps only
    holy: HOLY_RE.test(path),
    // Optional: an audio-frame hash (ID3 stripped) supplied by the listing —
    // see vot_curate.py:audio_hash. Absent on a pre-hash listing, and then
    // nothing is collapsed and this run behaves exactly as it always did.
    hash: f.hash || f.audioHash || AUDIO_HASHES[f.id] || null,
    reader: parseReader(name),         // dedup tiebreak only; the real parse is below
  });
}
// Per-collection folders first; "0. ALL LETTERS" fills what's still missing.
// (Same-audio dedup happens PER LETTER, after resolution — see below. Doing it
// globally loses letters: Holy Days is a ghost album of entries pulled from the
// other volumes, so one recording legitimately serves two corpus items, and
// collapsing across the corpus stripped the audio off eleven of them.)
files.sort((a, b) => (a.fill === b.fill ? 0 : a.fill ? 1 : -1));

/**
 * letterKey -> {
 *   full:     best "(Full Letter)"/whole-letter track  {id, reader}
 *   sections: Map(section -> {id, reader})             (used if no full)
 *   parts:    Map(part -> {id, reader})                (multi-part letters)
 *   addenda:  [{id, reader}]                           (appended last)
 *   cand:     [{kind, n, id, reader}]                  (EVERY candidate, for alternates)
 * }
 * Reader rank decides collisions everywhere (B > T > V > M) — Benjamin's
 * rank-3 IS the "Benjamin supersedes" rule, wherever his file lives.
 * `cand` records every non-compilation candidate untouched by that battle,
 * so a second pass can compose per-reader ALTERNATE renditions (owner
 * directive 2026-08-09: the listener may choose which reader to hear).
 */
const acc = new Map();
const problems = [];
const notes = [];
const better = (a, b) => !a || READER_RANK[b.reader] > READER_RANK[a.reader];
let matched = 0;
// Per-reader accounting over the WHOLE letter-side listing. The gate re-derives
// `listing` from tools/_audio-drive-listing.json itself, so this is the one
// number in the sidecar that does not come from the generator's own opinion —
// it is what breaks the circularity a sidecar-only gate would have.
const tally = { listing: {}, unmapped: {} };
// The unmapped files by ID, NAME and REASON, not just by count. `unmapped` is
// the one free variable in the identity below — a hand-edit can inflate it to
// balance a theft — so each entry has to justify itself to the gate, and a bare
// id cannot: a stolen id is a real listing record that reaches no rendition too.
// The name and the reason are what make it checkable:
//   'bonus'      the filename says "Bonus Track", a thing the corpus has no
//                letter for. Provable from the name alone, in CI, with no
//                listing and no resolver — and unmintable for a stolen letter
//                file, whose name carries an ordinal instead.
//   'unresolved' the resolver could not place it. Not provable from the name,
//                so the gate pins the set: a recording no listener can reach is
//                exactly the event that should stop the line and get a human.
const unmappedFiles = [];
const bump = (bag, r) => { bag[r] = (bag[r] || 0) + 1; };
const dropped = (f, r, why) => { bump(tally.unmapped, r); unmappedFiles.push({ id: f.id, name: f.name, why }); };
for (const f of files) bump(tally.listing, parseReader(f.name));

for (const f of files) {
  let key, track, shape;
  if (f.holy) {
    const p = parseHolyDayName(f.name);
    const cands = p ? (TITLE_IDX.get('holydays').get(normkey(p.title)) || []) : [];
    const loose = (p && cands.length === 0)
      ? ctx.HOLY_DAYS.filter((l) => titleMatches(p.title, l.title)) : cands;
    if (!p || loose.length !== 1) {
      problems.push(`UNMATCHED  16. Holy Days/${f.name}${p ? ` (title "${p.title}" -> ${loose.length} candidates)` : ''}`);
      dropped(f, parseReader(f.name), 'unresolved');
      continue;
    }
    key = `holydays:${loose[0].id}`;
    track = { id: f.id, reader: p.reader };
    shape = { kind: 'full' };
  } else {
    const comp = parseRangeCompilation(f.name);
    if (comp) {
      key = `__sections:${comp.volKey}`;
      track = { id: f.id, reader: comp.reader, n: comp.n, label: comp.label };
      shape = { kind: 'compilation' };
    } else {
      const p = parseName(f.name);
      if (!p) { problems.push(`UNPARSEABLE  ${f.name}`); dropped(f, parseReader(f.name), 'unresolved'); continue; }
      const r = resolveLetter(p);
      if (!r || r.err) {
        (r && (r.err.includes('bonus') || r.err === 'no title match') && p.bonus
          ? notes : problems).push(`${p.bonus ? 'BONUS-SKIPPED' : 'UNMATCHED'}  ${f.name}${r ? ` — ${r.err}` : ''}`);
        dropped(f, p.reader, p.bonus ? 'bonus' : 'unresolved');
        continue;
      }
      if (r.note) notes.push(`${r.note}: ${f.name}`);
      key = `${r.col.volKey}:${r.letter.id}`;
      track = { id: f.id, reader: p.reader };
      shape = r.addendum ? { kind: 'addendum' }
        : p.section != null ? { kind: 'section', n: p.section }
        : p.isFull ? { kind: 'full' }
        : p.part != null ? { kind: 'part', n: p.part }
        : { kind: 'full' };
    }
  }

  // "0. ALL LETTERS" fills gaps only — a file from there never competes for a
  // PRIMARY slot once the per-collection folders have supplied one. It is still
  // a candidate though: that folder holds readings by Benjamin and by Timothy
  // for letters whose collection folder only has the TTS version, and skipping
  // the record outright made those readers unreachable in the app (fixed
  // 2026-09-04, FlockSync v2 §5.2).
  // "0. ALL LETTERS" fills gaps only — a file from there never competes for a
  // PRIMARY slot once the per-collection folders have supplied one. It is still
  // a candidate: that folder holds readings by Benjamin and by Timothy for
  // letters whose collection folder only has the TTS version, and dropping the
  // record outright made those readers unreachable (fixed 2026-09-04, §5.2).
  const fillSkip = f.fill && acc.has(key);

  let e = acc.get(key);
  if (!e) { e = { full: null, sections: new Map(), parts: new Map(), addenda: [], comps: new Map(), cand: [], raw: [] }; acc.set(key, e); }
  matched++;
  e.raw.push({ kind: shape.kind, n: shape.n ?? 0, id: track.id, reader: track.reader,
               hash: f.hash, fill: !!f.fill, fillSkip, label: track.label, compN: track.n });
}

// ── second pass: same-audio dedup PER LETTER, then the primary slots ─────
// The archive stores many recordings twice — the collection folder and the
// "0. ALL LETTERS" mirror, under different Drive ids — and without the audio
// hash the two look like two renditions of one letter. Collapsing them here,
// AFTER resolution, is the difference between removing a duplicate upload and
// removing a letter's only copy: dedupeByAudioHash sees one letter's candidates
// and can never take a recording that some other letter also needs.
const collapsedByHash = [];
for (const [, e] of acc) {
  const { records, collapsed } = dedupeByAudioHash(e.raw, INCUMBENT);
  for (const c of collapsed) collapsedByHash.push(c);
  for (const c of records) {
    if (c.kind !== 'compilation') e.cand.push({ kind: c.kind, n: c.n, id: c.id, reader: c.reader });
    if (c.fillSkip) continue;
    const track = { id: c.id, reader: c.reader, n: c.compN, label: c.label };
    if (c.kind === 'compilation') {
      if (better(e.comps.get(track.n), track)) e.comps.set(track.n, track);
    } else if (c.kind === 'full') {
      if (better(e.full, track)) e.full = track;
    } else if (c.kind === 'section') {
      if (better(e.sections.get(c.n), track)) e.sections.set(c.n, track);
    } else if (c.kind === 'part') {
      if (better(e.parts.get(c.n), track)) e.parts.set(c.n, track);
    } else if (c.kind === 'addendum') {
      if (e.addenda.length === 0 || better(e.addenda[0], track)) e.addenda = [track];
    }
  }
}

// ── flatten to manifest entries ──────────────────────────────────────────
const manifest = new Map();   // key -> [[id, reader, label?], ...]
const sections = {};          // volKey -> [[label, id, reader], ...]
const alternates = new Map(); // key -> [[reader, [[id, label?], ...]], ...] rank-ordered
for (const [key, e] of acc) {
  if (key.startsWith('__sections:')) {
    const volKey = key.split(':')[1];
    sections[volKey] = [...e.comps.entries()].sort((a, b) => a[0] - b[0])
      .map(([, t]) => [t.label, t.id, t.reader]);
    continue;
  }
  /** @type {Array<{id:string, reader:string, label:string|null}>} */
  let list = [];
  if (e.full) {
    list = [{ ...e.full, label: null }];
  } else if (e.sections.size > 0) {
    list = [...e.sections.entries()].sort((a, b) => a[0] - b[0])
      .map(([n, t]) => ({ ...t, label: `Section ${n}` }));
  } else if (e.parts.size > 0) {
    list = [...e.parts.entries()].sort((a, b) => a[0] - b[0])
      .map(([n, t], i, arr) => ({ ...t, label: arr.length > 1 ? `Part ${i + 1}` : null }));
  }
  for (const a of e.addenda) list.push({ ...a, label: 'Addendum' });
  if (list.length === 0) continue;
  if (list.length === 1) list[0].label = null;
  manifest.set(key, list.map((t) => t.label ? [t.id, t.reader, t.label] : [t.id, t.reader]));

  // Alternate renditions: EVERY other reader who recorded any part of this
  // letter, complete or not (FlockSync v2 §5.2-3, Corbin 2026-09-04). The only
  // rendition dropped is one whose asset-ID set is exactly the primary's. A
  // shorter rendition ships with a completeness note ("2 of 5 sections") — the
  // old rule discarded it, which is how Timothy's and Benjamin's partial
  // readings became invisible to the app.
  const pairs = composeAlternates(e.cand, list);
  if (pairs.length) alternates.set(key, pairs);
}

// ── emit ─────────────────────────────────────────────────────────────────
const keys = [...manifest.keys()].sort();
const lines = keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(manifest.get(k)));
const secKeys = Object.keys(sections).sort();
const secLines = secKeys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(sections[k]));
const altKeys = [...alternates.keys()].sort();
const altLines = altKeys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(alternates.get(k)));
const body = '/* AUDIO MANIFEST — auto-generated by tools/gen-audio-manifest.mjs. DO NOT EDIT.\n' +
  '   AUDIO_MANIFEST: "volKey:letterId" -> [[driveFileId, readerCode, partLabel?], ...]\n' +
  '   AUDIO_SECTIONS: volKey -> [[label, driveFileId, readerCode], ...] (range compilations)\n' +
  '   AUDIO_ALTERNATES: "volKey:letterId" -> [[readerCode, [[driveFileId, partLabel?], ...], note?], ...]\n' +
  '     — every OTHER reader who recorded any part of this letter, rank-ordered;\n' +
  '     lets the listener choose who reads it. A rendition SHORTER than what the\n' +
  '     archive proves the letter has carries a third element, the completeness\n' +
  '     note ("2 of 5 sections"); a complete one has no third element. Existing\n' +
  '     consumers read [0] and [1] only, so the note is additive. Assets live on\n' +
  '     audio-v1 too.\n' +
  '   Reader codes: B=Benjamin, T=Timothy, V=text-to-speech, M=AI with music.\n' +
  '   Streams from Google Drive (public, link-shared). Regenerate:\n' +
  '     python tools/fetch-drive-audio.py && node tools/gen-audio-manifest.mjs\n' +
  '   then bump CORPUS_VERSION (this file rides bundle-a-vot). */\n' +
  'var AUDIO_MANIFEST = {\n' + lines.join(',\n') + '\n};\n' +
  'var AUDIO_SECTIONS = {\n' + secLines.join(',\n') + '\n};\n' +
  'var AUDIO_ALTERNATES = {\n' + altLines.join(',\n') + '\n};\n';
writeFileSync(OUT, body);

// -- coverage sidecar ----------------------------------------------------
// The gate reads this, and it is written from the MAPPING stage (acc), not
// the composition stage (manifest/alternates) — so a candidate the composer
// drops is still listed here and check-audio-manifest.js can see the loss.
// Committed, unlike the Drive listing, so the gate runs in CI.
// The unit that matters is (letter, reader): "did everyone who read this
// letter get offered?" — NOT (letter, file). The archive mirrors most files
// into "0. ALL LETTERS" under a second Drive id, and renditionFor's first-seen
// slot rule drops those duplicates on purpose, so counting ids would drown the
// real signal in ~830 duplicate uploads.
const letters = {};
const compilations = {};
for (const [key, e] of acc) {
  if (key.startsWith('__sections:')) {
    for (const c of e.raw) bump(compilations, c.reader);   // WTLB range compilations
    continue;
  }
  // RAW counts, before the same-audio dedup, so the gate's identity holds:
  // every letter-side file in the listing either reached a letter, is one of
  // the range compilations, or is accounted for as unmapped.
  const byReader = {};
  for (const c of e.raw) byReader[c.reader] = (byReader[c.reader] || 0) + 1;
  // How many distinct main slots this letter HAS, across every reader — the
  // gate needs it to tell a whole-letter reading from a fragment, and the
  // manifest alone cannot say (a dropped row takes the evidence with it).
  const slots = (kind) => new Set(e.cand.filter((c) => c.kind === kind).map((c) => c.n)).size;
  letters[key] = { readers: byReader, slots: Math.max(slots('section'), slots('part'), 1) };
}
// One line per letter, so a regression shows as a readable diff rather than a
// single 30 KB line or a 4,000-line reflow.
const covLines = Object.keys(letters).sort()
  .map((k) => ' ' + JSON.stringify(k) + ': ' + JSON.stringify(letters[k]));
writeFileSync(COVERAGE,
  '{' + '\n' +
  ' "note": ' + JSON.stringify('Auto-generated by tools/gen-audio-manifest.mjs. DO NOT EDIT. Ground truth for tools/check-audio-manifest.js: for every letter, how many candidate recordings each reader supplied. A reader listed here MUST be offered a rendition of that letter.') + ',\n' +
  ' "listingRecords": ' + listing.length + ',\n' +
  ' "totals": ' + JSON.stringify({ listing: tally.listing, unmapped: tally.unmapped, compilations }) + ',\n' +
  ' "unmappedFiles": [\n' + unmappedFiles.sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((u) => '  ' + JSON.stringify(u)).join(',\n') + '\n ],\n' +
  ' "collapsedByHash": ' + JSON.stringify(collapsedByHash) + ',\n' +
  ' "letters": {\n' + covLines.join(',\n') + '\n }\n}\n');

// ── report ───────────────────────────────────────────────────────────────
const perCol = new Map(COLS.map((c) => [c.volKey, { have: 0, total: (c.preface ? 1 : 0) + c.letters.length }]));
for (const key of keys) perCol.get(key.split(':')[0]).have++;
console.log(`audio-manifest: ${keys.length} letters with audio (${matched} files used, ${skipped} non-letter files excluded)`);
{
  // Reader counts, primary and alternate, kept separate (FlockSync v2 §5.5) —
  // the one number that says whether Timothy's and Benjamin's readings actually
  // reached the app, and the number that regressed silently before this run.
  const primRows = [...manifest.values()].flat();
  const primIds = new Set(primRows.map((r) => r[0]));
  const primCounts = countByReader(primRows, (r) => r[1]);
  console.log(`  primary:  ${primRows.length} tracks (${formatReaderCounts(primCounts)})`);

  const altIds = new Set();
  const altCounts = {};
  let partialRends = 0;
  for (const pairs of alternates.values()) {
    for (const [reader, rows, note] of pairs) {
      altCounts[reader] = (altCounts[reader] || 0) + rows.length;
      if (note) partialRends++;
      for (const row of rows) altIds.add(row[0]);
    }
  }
  const altRends = [...alternates.values()].reduce((n, p) => n + p.length, 0);
  console.log(`  alternates: ${altKeys.length} letters offer a reader choice — ${altRends} renditions, ${altIds.size} extra assets (${formatReaderCounts(altCounts)})`);
  console.log(`  of those, ${partialRends} are PARTIAL and ship a completeness note`);
  if (collapsedByHash.length) {
    console.log(`  same-audio duplicates collapsed: ${collapsedByHash.length}`);
  } else if (!Object.keys(AUDIO_HASHES).length && !listing.some((f) => f.hash || f.audioHash)) {
    console.log('  same-audio dedup: SKIPPED — no audio hashes (run tools/audio-archive-hashes.py)');
  }
  const overlap = [...altIds].filter((id) => primIds.has(id));
  if (overlap.length) console.log(`  WARNING: ${overlap.length} alternate ids also appear as primaries — mirror/emit logic needs review: ${overlap.slice(0, 5).join(', ')}`);
  console.log(`  coverage sidecar: ${COVERAGE}`);

  // Whole-letter track AND section tracks, same reader, same letter: a second
  // reading, or the same reading chunked? Settled 2026-09-04 by envelope
  // cross-correlation across every such case in D:\VOT-Archive — all chunkings,
  // each section carrying a spoken section-title intro of +13 to +37 s. The
  // number is printed here so the next person to notice the overlap reads the
  // answer instead of re-deriving it. A REPORT, not a rule: nothing branches on
  // it, and a sum that stopped overshooting would be the interesting case.
  //
  // Grouped by the generator's own `kind`, which comes from " - Section N_" in
  // the filename. NOT by the numeric suffix: the first section is written
  // "TLR.026_" in some volumes and "V3.009.1_" in others, and grouping on that
  // flips the sign of the delta.
  const overshoots = [];
  for (const e of acc.values()) {
    const byReader = new Map();
    for (const c of e.cand) {
      if (!byReader.has(c.reader)) byReader.set(c.reader, { full: null, sections: [] });
      const g = byReader.get(c.reader);
      if (c.kind === 'full') g.full = c;
      else if (c.kind === 'section') g.sections.push(c);
    }
    for (const g of byReader.values()) {
      if (!g.full || g.sections.length < 2) continue;
      const whole = secondsById.get(g.full.id);
      const parts = g.sections.map((c) => secondsById.get(c.id));
      if (!whole || parts.some((s) => !s)) continue;
      const total = parts.reduce((n, s) => n + s, 0);
      overshoots.push((total - whole) / parts.length);
    }
  }
  if (overshoots.length) {
    overshoots.sort((a, b) => a - b);
    const med = overshoots[overshoots.length >> 1];
    console.log(`  full-plus-sections: ${overshoots.length} (letter, reader) case(s); the sections overshoot the whole-letter ` +
                `track by a median ${med.toFixed(0)} s per section — a chunking with a spoken section title, not a second reading`);
  } else if (!SECONDS.size) {
    console.log('  full-plus-sections: SKIPPED — no durations (copy D:\\VOT-Archive\\_source-manifests\\letter-durations.tsv to tools/_letter-durations.tsv)');
  }
}
for (const [k, v] of perCol) {
  const missing = v.total - v.have;
  console.log(`  ${k.padEnd(9)} ${String(v.have).padStart(3)}/${v.total}${missing ? '   MISSING ' + missing : ''}`);
}
for (const k of secKeys) console.log(`  sections: ${k} ×${sections[k].length}`);
if (notes.length) {
  console.log('\nResolved with notes / skipped bonus tracks:');
  notes.forEach((n) => console.log('  ' + n));
}
if (problems.length) {
  console.log('\nProblems:');
  problems.forEach((p) => console.log('  ' + p));
}
// Letters WITHOUT audio, per collection (the actual gaps a listener hits).
console.log('\nLetters without audio:');
for (const c of COLS) {
  const misses = [c.preface, ...c.letters].filter(Boolean)
    .filter((l) => !manifest.has(`${c.volKey}:${l.id}`))
    .map((l) => `${l.num}:${l.title}`);
  if (misses.length) console.log(`  ${c.volKey}: ${misses.join(' | ')}`);
}
