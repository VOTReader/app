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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ASSETS = resolve(REPO, 'app', 'src', 'main', 'assets');
const LISTING = resolve(HERE, '_audio-drive-listing.json');
const OUT = resolve(ASSETS, 'src', 'data', 'audio-manifest.js');

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

/**
 * Staged title comparison. File titles truncate with "…", drop
 * parentheticals ("(Jesus)"), and occasionally drop mid-title words
 * ("To the Church Who [Dwells in the Midst Of and] Sits Upon Seven Hills").
 */
function titleMatches(fileTitle, letterTitle) {
  const a = normkey(fileTitle), b = normkey(letterTitle);
  if (!a || !b) return false;
  if (a === b) return true;
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
const READER_RANK = { B: 3, T: 2, V: 1, M: 0 };
function parseReader(tail) {
  // "(read by text-to-speech - Benjamin)" -> Benjamin wins (he produced it).
  const m = /\(read by ([^)]+)\)/i.exec(tail);
  if (!m) return 'V';
  const t = m[1].toLowerCase();
  if (t.includes('benjamin') || t.includes('bejamin')) return 'B';
  if (t.includes('timothy')) return 'T';
  if (t.includes('ai')) return 'M';
  return 'V';
}

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
const SKIP_RE = /^(AI Songs of the Letters|The Gospel of John Movie Audio|17\. Bible-Letter Studies|18\. TSOT New Testament)/;
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
  files.push({
    name: path.split('/').pop(), id: f.id,
    fill: ALL_LETTERS_RE.test(path),   // "0. ALL LETTERS" fills gaps only
    holy: HOLY_RE.test(path),
  });
}
// Per-collection folders first; "0. ALL LETTERS" fills what's still missing.
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

for (const f of files) {
  let key, track, shape;
  if (f.holy) {
    const p = parseHolyDayName(f.name);
    const cands = p ? (TITLE_IDX.get('holydays').get(normkey(p.title)) || []) : [];
    const loose = (p && cands.length === 0)
      ? ctx.HOLY_DAYS.filter((l) => titleMatches(p.title, l.title)) : cands;
    if (!p || loose.length !== 1) {
      problems.push(`UNMATCHED  16. Holy Days/${f.name}${p ? ` (title "${p.title}" -> ${loose.length} candidates)` : ''}`);
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
      if (!p) { problems.push(`UNPARSEABLE  ${f.name}`); continue; }
      const r = resolveLetter(p);
      if (!r || r.err) {
        (r && (r.err.includes('bonus') || r.err === 'no title match') && p.bonus
          ? notes : problems).push(`${p.bonus ? 'BONUS-SKIPPED' : 'UNMATCHED'}  ${f.name}${r ? ` — ${r.err}` : ''}`);
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

  // "0. ALL LETTERS" fills gaps only — skip if the key already has anything.
  if (f.fill && acc.has(key)) continue;

  let e = acc.get(key);
  if (!e) { e = { full: null, sections: new Map(), parts: new Map(), addenda: [], comps: new Map(), cand: [] }; acc.set(key, e); }
  matched++;
  if (shape.kind !== 'compilation') e.cand.push({ kind: shape.kind, n: shape.n ?? 0, id: track.id, reader: track.reader });
  if (shape.kind === 'compilation') {
    const cur = e.comps.get(track.n);
    if (better(cur, track)) e.comps.set(track.n, track);
  } else if (shape.kind === 'full') {
    if (better(e.full, track)) e.full = track;
  } else if (shape.kind === 'section') {
    const cur = e.sections.get(shape.n);
    if (better(cur, track)) e.sections.set(shape.n, track);
  } else if (shape.kind === 'part') {
    const cur = e.parts.get(shape.n);
    if (better(cur, track)) e.parts.set(shape.n, track);
  } else if (shape.kind === 'addendum') {
    if (e.addenda.length === 0 || better(e.addenda[0], track)) e.addenda = [track];
  }
}

/**
 * Compose reader R's own standalone rendition of a letter from its candidate
 * pool: same precedence as the primary flatten (full > sections > parts, one
 * addendum last), restricted to R's files, first-seen per slot (which is what
 * silently drops same-reader duplicate uploads). Returns
 * { kind: 'full'|'sections'|'parts', rows: [{id, label}] } — empty rows when
 * R recorded nothing usable.
 */
function renditionFor(cands, reader) {
  const seen = new Set();
  const firsts = [];
  for (const c of cands) {
    if (c.reader !== reader) continue;
    const slot = c.kind + ':' + c.n;
    if (seen.has(slot)) continue;
    seen.add(slot);
    firsts.push(c);
  }
  const full = firsts.find((c) => c.kind === 'full');
  let kind = 'full';
  let list = [];
  if (full) {
    list = [{ id: full.id, label: null }];
  } else {
    const secs = firsts.filter((c) => c.kind === 'section').sort((a, b) => a.n - b.n);
    if (secs.length) {
      kind = 'sections';
      list = secs.map((c) => ({ id: c.id, label: `Section ${c.n}` }));
    } else {
      kind = 'parts';
      const parts = firsts.filter((c) => c.kind === 'part').sort((a, b) => a.n - b.n);
      list = parts.map((c, i, arr) => ({ id: c.id, label: arr.length > 1 ? `Part ${i + 1}` : null }));
    }
  }
  if (!list.length) return { kind, rows: [] };   // an addendum alone is not a rendition
  const add = firsts.find((c) => c.kind === 'addendum');
  if (add) list.push({ id: add.id, label: 'Addendum' });
  if (list.length === 1) list[0].label = null;
  return { kind, rows: list };
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

  // Alternate renditions: any OTHER reader whose own composition of this
  // letter brings at least one recording the primary list doesn't carry.
  // A sections/parts rendition with fewer main tracks than the primary's is
  // an incomplete fragment, not an alternative — skipped. (A single full-
  // letter recording is always a complete alternative, whatever the primary
  // is split into.)
  const primaryIds = new Set(list.map((t) => t.id));
  const primaryMain = list.filter((t) => t.label !== 'Addendum').length;
  const readers = [...new Set(e.cand.map((c) => c.reader))]
    .sort((a, b) => READER_RANK[b] - READER_RANK[a]);
  const pairs = [];
  for (const reader of readers) {
    const r = renditionFor(e.cand, reader);
    if (!r.rows.length) continue;
    if (r.rows.every((row) => primaryIds.has(row.id))) continue;   // already the primary (or a subset of it)
    const mainRows = r.rows.filter((row) => row.label !== 'Addendum').length;
    if (r.kind !== 'full' && primaryMain > 1 && mainRows < primaryMain) continue;
    pairs.push([reader, r.rows.map((row) => row.label ? [row.id, row.label] : [row.id])]);
  }
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
  '   AUDIO_ALTERNATES: "volKey:letterId" -> [[readerCode, [[driveFileId, partLabel?], ...]], ...]\n' +
  '     — complete standalone renditions by OTHER readers, rank-ordered; lets\n' +
  '     the listener choose who reads a letter. Assets live on audio-v1 too.\n' +
  '   Reader codes: B=Benjamin, T=Timothy, V=text-to-speech, M=AI with music.\n' +
  '   Streams from Google Drive (public, link-shared). Regenerate:\n' +
  '     python tools/fetch-drive-audio.py && node tools/gen-audio-manifest.mjs\n' +
  '   then bump CORPUS_VERSION (this file rides bundle-a-vot). */\n' +
  'var AUDIO_MANIFEST = {\n' + lines.join(',\n') + '\n};\n' +
  'var AUDIO_SECTIONS = {\n' + secLines.join(',\n') + '\n};\n' +
  'var AUDIO_ALTERNATES = {\n' + altLines.join(',\n') + '\n};\n';
writeFileSync(OUT, body);

// ── report ───────────────────────────────────────────────────────────────
const perCol = new Map(COLS.map((c) => [c.volKey, { have: 0, total: (c.preface ? 1 : 0) + c.letters.length }]));
for (const key of keys) perCol.get(key.split(':')[0]).have++;
console.log(`audio-manifest: ${keys.length} letters with audio (${matched} files used, ${skipped} non-letter files excluded)`);
{
  // Alternates summary + the id set a mirror run must cover.
  const altIds = new Set();
  const byReader = {};
  for (const pairs of alternates.values()) {
    for (const [reader, rows] of pairs) {
      byReader[reader] = (byReader[reader] || 0) + rows.length;
      for (const row of rows) altIds.add(row[0]);
    }
  }
  const primIds = new Set([...manifest.values()].flat().map((r) => r[0]));
  const overlap = [...altIds].filter((id) => primIds.has(id));
  console.log(`  alternates: ${altKeys.length} letters offer a reader choice (${altIds.size} extra assets: ${Object.entries(byReader).map(([r, n]) => `${r}×${n}`).join(', ') || 'none'})`);
  if (overlap.length) console.log(`  WARNING: ${overlap.length} alternate ids also appear as primaries — mirror/emit logic needs review: ${overlap.slice(0, 5).join(', ')}`);
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
