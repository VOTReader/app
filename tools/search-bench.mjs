/* The search benchmark: 500 things real readers remember, through the real engine (2026-10-05).
   ─────────────────────────────────────────────────────────────────
   Corbin (2026-10-05): search should surface "500/500 of real, searchable quotes, sentences,
   blocks, unique phrases, ways that actual humans search by remembering something specific".
   tools/search-bench/cases.json holds 500 targets (seeded, stratified by collection, make-targets.mjs)
   and the one query a blind writer wrote for each, in one of ten styles (writer-brief.md): the
   writers never saw the engine. Node only: the shipped corpus and src/search/engine.js, no browser.

   A case PASSES when what the screen shows first is right and the reader lands where they meant:
     1. First on screen: a reference card when the query parses as one (SearchScreen directEntries),
        else the engine's first hit (the Best Matches row and the lone-group list both open on it).
     2. It belongs to the target's EQUIVALENCE CLASS: every unit whose text holds the remembered
        sentence, or a near copy of it with 80% of its word 3-grams (75-100% of letter sentences are
        reprinted elsewhere), the verse a sentence quotes, Matthew Study and plain Matthew c:v as
        one, a unit-level target's own unit and its same-titled reprints.
     3. It is the class's ORIGINAL: no member of a better tier exists (letters > Words To Live By and
        The Blessed > Holy Days > studies > Answers; the verse itself for a verse).
     4. Sentence targets: the landing the screen makes (use-search.js excerptAnchor: matchExcerpt over
        the card's terms, then excerpt-landing.js excerptLanding over the unit's blocks) is the block
        holding the sentence, and the excerpt overlaps the sentence. A verse lands on itself.
   STRICT: a pass whose first hit is the target's own unit. Also reported: the class's best rank,
   top 5, found. 100 cases are HELD OUT: counted, never printed (tuning must not read them).

     node tools/search-bench.mjs              run, print the score, failures of the open cases
     node tools/search-bench.mjs --json out   also write every case's outcome
     node tools/search-bench.mjs --record     write the score as the new floor (search-bench/baseline.json)
   Exit 1 when the pass count falls below the recorded floor, or any style or collection loses ground.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, engine, kjvVerses, unitKey, norm, ASSETS } from './search-bench/corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const BASELINE = path.join(HERE, 'search-bench/baseline.json');
const t0 = Date.now();

const { cases } = JSON.parse(fs.readFileSync(path.join(HERE, 'search-bench/cases.json'), 'utf8'));
const { E, initMs, meaning } = await engine();
const { kjvEncode } = await import(pathToFileURL(path.join(ASSETS, 'src/search/tokenize.js')).href);
const { excerptLanding } = await import(pathToFileURL(path.join(ASSETS, 'src/utils/excerpt-landing.js')).href);
const D = await buildDocs('nkjv');
const B = await buildBlocks();
const g = /** @type {any} */ (globalThis);

// ── unit tables ──
const unitBlocks = {};
for (const b of B) (unitBlocks[b.uk] || (unitBlocks[b.uk] = [])).push(b);
const unitDoc = {};
for (const d of D) { const k = unitKey(d); if (!unitDoc[k]) unitDoc[k] = d; }
const TIER = (uk) => {
  const col = uk.slice(0, uk.indexOf('/'));
  if (col === 'bible' || col === 'matthew-study') return 0;
  if (/^(v[1-7]|timothy|flock|rebuke)$/.test(col)) return 0;
  if (col === 'wtlb1' || col === 'wtlb2' || col === 'blessed') return 1;
  if (col === 'holydays') return 2;
  if (col === 'bible-studies') return 3;
  return 4; // answers
};
const proseKeys = Object.keys(unitBlocks);
const proseNorm = proseKeys.map((k) => norm(unitBlocks[k].map((b) => b.text).join(' ')));
/** Units holding the sentence: word for word, or a near copy holding 80% of its word 3-grams (search-plan.md §3). */
const holders = (sentence) => {
  const n = norm(sentence); const w = n.trim().split(' ');
  const grams = []; for (let i = 0; i + 3 <= w.length; i++) grams.push(' ' + w.slice(i, i + 3).join(' ') + ' ');
  const probes = w.length >= 5 ? [0, (w.length - 5) >> 1, w.length - 5].map((i) => ' ' + w.slice(i, i + 5).join(' ') + ' ') : [n];
  const out = [];
  proseNorm.forEach((t, i) => {
    if (t.includes(n)) { out.push(proseKeys[i]); return; }
    if (grams.length < 4) return;
    // ...in one place: the 3-grams around a probe's hit, not anywhere in a long letter ("and follow me" is in most).
    for (const p of probes) for (let at = t.indexOf(p); at >= 0; at = t.indexOf(p, at + 1)) {
      const win = t.slice(Math.max(0, at - n.length), at + p.length + n.length);
      if (grams.filter((g) => win.includes(g)).length >= 0.8 * grams.length) { out.push(proseKeys[i]); return; }
    }
  });
  return out;
};
// A prose sentence that quotes Scripture has the verse as its original (a study or Answers line
// that is Luke 23:15 word for word): verses whose text holds the sentence, or that it holds whole.
const verseNorm = D.filter((d) => d.kind === 'verse').map((d) => [unitKey(d), norm(d.text)]);
// ...in the KJV wording too (a study quotes 1 John 5:3 as "His commandments are not grievous").
const KJV = kjvVerses();
for (const [book, chs] of Object.entries(KJV)) for (const [ch, vs] of Object.entries(chs)) for (const v of vs) verseNorm.push(['bible/' + book + ':' + ch + ':' + v.n, norm(v.text)]);
for (let i = verseNorm.length - 1; i >= 0; i--) if (verseNorm[i][1].split(' ').length < 8) verseNorm.splice(i, 1);
const versesQuoted = (sentence) => { const n = norm(sentence); return verseNorm.filter(([, t]) => t.includes(n) || n.includes(t)).map(([k]) => k); };
const titleNorm = {};
for (const k of proseKeys) { const t = norm(unitBlocks[k][0].title); (titleNorm[t] || (titleNorm[t] = [])).push(k); }
const matthewTwin = (uk) => {
  const m = /^(?:bible\/matthew(?:-plain)?|matthew-study\/matthew):(\d+):(\d+)$/.exec(uk);
  return m ? ['bible/matthew-plain:' + m[1] + ':' + m[2], 'matthew-study/matthew:' + m[1] + ':' + m[2]] : [uk];
};

/** The target's equivalence class and the tier its original sits in. */
function classOf(c) {
  const members = new Set();
  if (c.level === 'verse') {
    for (const k of matthewTwin(c.uk)) members.add(k);
    return { members, best: 0 };
  }
  if (c.level === 'unit') {
    members.add(c.uk);
    for (const k of titleNorm[norm(c.title)] || []) members.add(k);
  } else {
    for (const k of holders(c.sentence)) members.add(k);
    if (c.level === 'sentence') for (const k of versesQuoted(c.sentence)) for (const t of matthewTwin(k)) members.add(t);
    // An Answers heading that cites a letter ("Excerpt from: Let All in the Earth Be Brought into...") has that letter as its original.
    const cited = /^excerpt from:\s*(.+)$/i.exec(c.sentence.trim());
    if (cited) for (const k of titleNorm[norm(cited[1])] || []) members.add(k);
    members.add(c.uk);
  }
  return { members, best: Math.min(...[...members].map(TIER)) };
}

/** What the screen shows first: a reference card, or the engine's first hit. */
function firstOnScreen(r) {
  const p = r.parsed;
  if (p && (p.kind === 'ref-bible' || p.kind === 'named-passage')) return { card: 'bible', p };
  if (p && p.kind === 'ref-book') return { card: 'book', p };
  if (p && p.kind === 'ref-letter') return { card: 'letter', p };
  return r.results && r.results[0] ? { hit: r.results[0] } : null;
}

const cardPasses = (f, c) => {
  if (f.card === 'bible' && c.level === 'verse') {
    const p = f.p;
    const book = p.bookId === 'matthew-plain' ? 'matthew' : p.bookId;
    if (book !== c.bookId || c.chapter < p.chapter || c.chapter > (p.chapterEnd || p.chapter)) return false;
    return !p.verseStart || (c.verse >= p.verseStart && c.verse <= (p.verseEnd || p.verseStart));
  }
  if (f.card === 'letter' && c.level === 'unit') {
    const L = (g[(g.VotSearchData.VOLUME_COLLECTIONS.find((v) => v.id === c.col) || {}).dataVar] || []).find((l) => l.id === c.unit);
    return !!L && (f.p.anyVolume || f.p.volumeId === c.col) && L.num === f.p.letterNum;
  }
  return false;
};

/** SearchScreen expandSnippetTerms: the terms a card marks and a landing cuts its excerpt by. */
function cardTerms(r) {
  const parsed = r.textQuery || r.parsed;
  if (!parsed || parsed.kind !== 'text') return [];
  const stop = g.VotSearchData.STOP_WORDS_TRIMMED;
  const isStop = (t) => { const toks = kjvEncode(t); return !!stop && toks.length > 0 && toks.every((w) => stop.has(w)); };
  const pt = r.parsedTerms || [];
  const typed = pt.some((t) => !isStop(t)) ? pt.filter((t) => !isStop(t)) : pt;
  const out = new Set([parsed.phrase, parsed.run].filter(Boolean).concat(typed));
  for (const t of pt) { const grp = g.VotSearchData.SYNONYM_MAP[String(t).toLowerCase()]; if (Array.isArray(grp)) grp.forEach((x) => out.add(x)); }
  return [...out];
}

/** use-search.js excerptAnchor + excerptLanding: does the reader land on the remembered sentence? */
function lands(hit, terms, c) {
  const doc = hit.doc;
  if (doc.kind === 'verse') return true;
  const own = terms;
  const extra = (hit.terms || []).filter((t) => own.indexOf(t) < 0);
  // A hit the meaning found names the passage it matched (use-search.js excerptAnchor: entry.placeStart).
  const placed = typeof hit.placeStart === 'number' && hit.placeStart >= 0 && hit.placeStart < doc.text.length;
  const ex = placed ? doc.text.slice(hit.placeStart, hit.placeStart + 48)
    : (own.length ? E.matchExcerpt(doc.text, own) : '') || (extra.length ? E.matchExcerpt(doc.text, own.concat(extra)) : '');
  const bl = unitBlocks[unitKey(doc)] || [];
  if (!ex || !bl.length) return false;
  const { index, off } = excerptLanding(ex, bl.map((b) => b.text), own.concat(extra));
  if (index < 0) return false;
  const text = bl[index].text;
  const at = text.indexOf(c.sentence);
  if (at >= 0) return off <= at + c.sentence.length && off + ex.length >= at;
  // A reprint or near copy worded a little differently: the excerpt shares 4 running words with the sentence.
  const w = norm(ex).trim().split(' ');
  for (let i = 0; i + 4 <= w.length; i++) if (norm(c.sentence).includes(' ' + w.slice(i, i + 4).join(' ') + ' ')) return true;
  return false;
}

// ── run ──
const out = [];
const times = [];
for (const c of cases) {
  const ts = Date.now();
  const r = await E.search(c.q, { limit: 6000, perVolume: 400 });
  times.push(Date.now() - ts);
  const cls = classOf(c);
  const res = r.results || [];
  const ranks = [];
  res.forEach((h, i) => { if (ranks.length < 1 && cls.members.has(unitKey(h.doc))) ranks.push(i + 1); });
  const rank = ranks[0] || null;
  const f = firstOnScreen(r);
  let pass = false; let strict = false; let why = '';
  if (!f) why = 'no results';
  else if (f.card) { pass = cardPasses(f, c); strict = pass; if (!pass) why = 'a ' + f.card + ' card leads'; }
  else {
    const k = unitKey(f.hit.doc);
    if (!cls.members.has(k)) why = 'first hit is not the target (' + (f.hit.doc.ref || k) + ')';
    else if (TIER(k) > cls.best) why = 'a reprint leads the original (' + (f.hit.doc.ref || k) + ')';
    else if (c.level === 'sentence' && !lands(f.hit, cardTerms(r), c)) why = 'lands off the sentence';
    else { pass = true; strict = matthewTwin(c.uk).includes(k) || k === c.uk; }
  }
  out.push({ id: c.id, held: !!c.held, group: c.group, col: c.col, style: c.style, q: c.q, pass, strict, rank, top5: !!rank && rank <= 5, found: !!rank, why, ms: times[times.length - 1] });
}

// ── report ──
const sum = (rows) => ({ n: rows.length, pass: rows.filter((o) => o.pass).length, strict: rows.filter((o) => o.strict).length, top5: rows.filter((o) => o.top5).length, found: rows.filter((o) => o.found).length });
const by = (rows, k) => Object.fromEntries([...new Set(rows.map((o) => o[k]))].sort().map((v) => [v, sum(rows.filter((o) => o[k] === v))]));
const all = sum(out);
const sorted = times.slice().sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const fmt = (s) => `${s.pass}/${s.n} pass  (strict ${s.strict}, top5 ${s.top5}, found ${s.found})`;
console.log(`search-bench: ${fmt(all)}`);
console.log(`  open ${fmt(sum(out.filter((o) => !o.held)))}`);
console.log(`  held ${fmt(sum(out.filter((o) => o.held)))}`);
console.log(`  meaning model: ${meaning.status}${meaning.failure ? ' (' + meaning.failure + ')' : ''}`);
console.log(`  init ${initMs} ms, query median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${sorted[sorted.length - 1]} ms, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const table = (title, o) => { console.log(title); for (const [k, s] of Object.entries(o)) console.log('  ' + k.padEnd(16) + String(s.pass).padStart(4) + ' /' + String(s.n).padStart(4) + '   top5 ' + String(s.top5).padStart(3) + '  found ' + String(s.found).padStart(3)); };
table('by style', by(out, 'style'));
table('by collection', by(out, 'group'));
if (!flag('--quiet')) {
  console.log('failures (open cases only):');
  for (const o of out.filter((x) => !x.pass && !x.held)) console.log(`  ${o.id} [${o.style}/${o.col}] ${JSON.stringify(o.q)} -> ${o.why}${o.rank ? ' (target at #' + o.rank + ')' : ' (not found)'}`);
}
if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify(out, null, 1));

const score = { pass: all.pass, strict: all.strict, top5: all.top5, found: all.found, style: Object.fromEntries(Object.entries(by(out, 'style')).map(([k, s]) => [k, s.pass])), group: Object.fromEntries(Object.entries(by(out, 'group')).map(([k, s]) => [k, s.pass])) };
if (flag('--record')) { fs.writeFileSync(BASELINE, JSON.stringify(score, null, 1) + '\n'); console.log('recorded the floor:', BASELINE); process.exit(0); }
if (!out.length) { console.error('NOTHING-CHECKED'); process.exit(1); }
if (fs.existsSync(BASELINE)) {
  const floor = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const drops = [];
  if (score.pass < floor.pass) drops.push(`pass ${score.pass} < floor ${floor.pass}`);
  for (const sec of ['style', 'group']) for (const [k, n] of Object.entries(floor[sec] || {})) if ((score[sec][k] || 0) < n) drops.push(`${sec} ${k} ${score[sec][k] || 0} < ${n}`);
  if (drops.length) { console.error('search-bench FAILED: ' + drops.join('; ')); process.exit(1); }
  console.log(`floor held (pass ${floor.pass})${score.pass > floor.pass ? `; raised by ${score.pass - floor.pass}: run with --record to keep it` : ''}`);
}
