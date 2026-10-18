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
        reprinted elsewhere), the verse a sentence quotes (word for word or such a near copy),
        Matthew Study and plain Matthew c:v as
        one, a unit-level target's own unit and its same-titled reprints.
     3. It is the class's ORIGINAL: no member of a better tier exists (letters > Words To Live By and
        The Blessed > Holy Days > studies > Answers; the verse itself for a verse). A query naming the target's
        collection asks for that text itself: the target's own unit may lead (rules.mjs NAMED COLLECTION).
     4. Sentence targets: the landing the screen makes (use-search.js excerptAnchor: matchExcerpt over
        the card's terms, then excerpt-landing.js excerptLanding over the unit's blocks) is the block
        holding the sentence, and the excerpt overlaps the sentence. A verse lands on itself.
   STRICT: a pass whose first hit is the target's own unit. Also reported: the class's best rank,
   top 5, found. 100 cases are HELD OUT: counted, never printed (tuning must not read them).
   FRESH: 100 more (search-bench/fresh-cases.json, make-fresh.mjs), written by another model family that
   never saw the engine or this bench, sealed the same way and scored on their own line (path to ~475,
   2026-10-15): a change ships only when the unseen sets, held + fresh, rise with it.

     node tools/search-bench.mjs              run, print the score, failures of the open cases
     node tools/search-bench.mjs --json out   also write every case's outcome
     node tools/search-bench.mjs --record     write the score as the new floor (search-bench/baseline.json)
   Exit 1 when the pass count falls below the recorded floor, or any style or collection loses ground.

   TRI (search200, 2026-10-18; PLAN 1.6): 200 exact, 200 misremembered and 200 title cases, each tiered easy, medium,
   hard from its query alone (tri/check-tri.mjs), plus held (counted, never printed) and fresh (tri/fresh-cases.json).
     node tools/search-bench.mjs --set tri [--json out] [--record]   tri/cases.json (+ tri/fresh-cases.json); floor tri/baseline.json
   The pass rule above is unchanged. Exact and misremembered score at sentence or verse level; a boundary or merged
   case's sentence is the two-sentence span; a merged Bible misquote names two adjacent verses (uk, uk2) and either
   passes (rules.mjs pairHolds). Titles score at unit level (a study chapter by its chapter title alone, rules.mjs
   titleForms); an Answers section heading at sentence level. SEARCH_BENCH_CASES replaces tri/cases.json and skips fresh.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, engine, kjvVerses, unitKey, norm, ASSETS } from './search-bench/corpus.mjs';
import { reprintShown, pairHolds, namesCollection } from './search-bench/rules.mjs';
import { makeClasses } from './search-bench/classes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const TRI = val('--set') === 'tri';
if (val('--set') && !TRI) { console.error('unknown --set ' + val('--set') + ' (only: tri)'); process.exit(2); }
const BASELINE = path.join(HERE, TRI ? 'search-bench/tri/baseline.json' : 'search-bench/baseline.json');
const t0 = Date.now();

// SEARCH_BENCH_CASES: another cases file (the fairness audit tries candidate queries on a copy)
const CASES = process.env.SEARCH_BENCH_CASES || path.join(HERE, TRI ? 'search-bench/tri/cases.json' : 'search-bench/cases.json');
if (TRI && !fs.existsSync(CASES)) { console.error('no tri cases yet: ' + CASES + ' (frozen after the writers and Gates A-D)'); process.exit(2); }
const { cases } = JSON.parse(fs.readFileSync(CASES, 'utf8'));
const FRESH = path.join(HERE, TRI ? 'search-bench/tri/fresh-cases.json' : 'search-bench/fresh-cases.json');
if (!process.env.SEARCH_BENCH_CASES && fs.existsSync(FRESH)) for (const c of JSON.parse(fs.readFileSync(FRESH, 'utf8')).cases) cases.push({ ...c, held: true, set: 'fresh' });
const { E, initMs, meaning } = await engine();
const { kjvEncode } = await import(pathToFileURL(path.join(ASSETS, 'src/search/tokenize.js')).href);
const { excerptLanding } = await import(pathToFileURL(path.join(ASSETS, 'src/utils/excerpt-landing.js')).href);
const D = await buildDocs('nkjv');
const B = await buildBlocks();
const g = /** @type {any} */ (globalThis);

// ── the equivalence classes (search-bench/classes.mjs: the rules of §2-3 above, shared with the tri bench's gates) ──
const KJV = kjvVerses();
const K = makeClasses({ D, B, KJV });
const { unitBlocks, TIER, proseKeys, proseNorm, holders, matthewTwin, classOf } = K;

/* FAIR TO ASK? (path to 500, step 3, 2026-10-05). `--audit <out.json>`: for every case, the texts outside its
   equivalence class that hold the typed words word for word (prose units, and every verse in the NKJV and the KJV).
   A query several unrelated texts hold verbatim has no one right answer: it needs a better query, not a lower bar.
   Held-out rows carry only their id and counts (their queries are never printed). The engine is not run. */
if (val('--audit')) {
  const allVerses = D.filter((d) => d.kind === 'verse').map((d) => [unitKey(d), norm(d.text)]);
  for (const [book, chs] of Object.entries(KJV)) for (const [ch, vs] of Object.entries(chs)) for (const v of vs) allVerses.push(['bible/' + book + ':' + ch + ':' + v.n, norm(v.text)]);
  const rows = [];
  // a typed slip read as the target's own word (within 2 edits), so 'grat faith' is checked as 'great faith'
  const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
  const unslip = (q, sentence) => { const sw = norm(sentence).trim().split(' '); return ' ' + norm(q).trim().split(' ').map((w) => sw.includes(w) ? w : (sw.map((x) => [x, lev(w, x)]).filter(([x, d]) => d <= 2 && d < x.length).sort((p, q) => p[1] - q[1] || q[0].length - p[0].length)[0] || [w])[0]).join(' ') + ' '; };
  for (const c of cases) {
    const n = c.style === 'typos' && c.sentence ? unslip(c.q, c.sentence) : norm(c.q);
    if (n.trim().split(' ').length < 2) continue;
    const cls = classOf(c);
    const inCls = (k) => cls.members.has(k) || matthewTwin(k).some((t) => cls.members.has(t));
    const out = new Set();
    // word for word, or nearly: 80% of the query's word 3-grams in one place (the harness's own near-copy rule)
    const w = n.trim().split(' ');
    const grams = []; for (let i = 0; i + 3 <= w.length; i++) grams.push(' ' + w.slice(i, i + 3).join(' ') + ' ');
    const near = (t) => t.includes(n) || (grams.length >= 4 && grams.filter((g) => t.includes(g)).length >= 0.8 * grams.length);
    for (const k of holders(c.q)) if (!inCls(k)) out.add(k);
    for (const [k, t] of allVerses) if (near(t) && !inCls(k)) out.add(k.replace('matthew-study/matthew', 'bible/matthew').replace('bible/matthew-plain', 'bible/matthew'));
    const self = proseNorm.some((t, i) => inCls(proseKeys[i]) && t.includes(n)) || allVerses.some(([k, t]) => inCls(k) && t.includes(n));
    if (!out.size) continue;
    rows.push(c.held ? { id: c.id, held: true, style: c.style, outside: out.size, targetHolds: self }
      : { id: c.id, held: false, style: c.style, q: c.q, target: c.ref || c.uk, outside: out.size, targetHolds: self, others: [...out].slice(0, 8) });
  }
  fs.writeFileSync(val('--audit'), JSON.stringify(rows, null, 1));
  console.log(`audit: ${rows.length} cases whose typed words other texts hold word for word (${rows.filter((r) => r.held).length} held out) -> ${val('--audit')}`);
  process.exit(0);
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
    // the card's range holds the verse (or either verse of a merged pair, tri)
    return book === c.bookId && pairHolds(p, c);
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
function lands(hit, terms, c, section = '') {
  const doc = hit.doc;
  if (doc.kind === 'verse') return true;
  const own = terms;
  const extra = (hit.terms || []).filter((t) => own.indexOf(t) < 0);
  // A hit the meaning found names the passage it matched (use-search.js excerptAnchor: entry.placeStart).
  const placed = typeof hit.placeStart === 'number' && hit.placeStart >= 0 && hit.placeStart < doc.text.length;
  const ex = placed ? doc.text.slice(hit.placeStart, hit.placeStart + 48)
    : (own.length ? E.matchExcerpt(doc.text, own, undefined, extra) : '') || (extra.length ? E.matchExcerpt(doc.text, own.concat(extra)) : '');
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
  // The text a heading's section reprints: the reader lands on a passage the section holds.
  if (section) for (let i = 0; i + 4 <= w.length; i++) if (section.includes(' ' + w.slice(i, i + 4).join(' ') + ' ')) return true;
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
    const card = (d) => (d.title || d.ref || '') + '|' + String(d.text || '').slice(0, 80);
    const twin = (a, b) => matthewTwin(a).includes(b);
    // NAMED COLLECTION (rules.mjs, errata 2026-10-18): the target's own unit leads a query naming its collection
    const own = matthewTwin(c.uk).includes(k) || k === c.uk;
    const named = own && namesCollection(norm(c.q), norm([((unitBlocks[c.uk] || [])[0] || {}).title, c.title, c.sentence].filter(Boolean).join(' ')), c.uk.slice(0, c.uk.indexOf('/')));
    if (!cls.members.has(k)) why = 'first hit is not the target (' + (f.hit.doc.ref || k) + ')';
    else if (!cls.recurring && !named && TIER(k) > cls.best) why = 'a reprint leads the original (' + (f.hit.doc.ref || k) + ')';
    // A heading's own text has no heading line: the heading is its title, on the card and atop the page (sr11, t405).
    else if (c.level === 'sentence' && !cls.titled.has(k) && !lands(f.hit, cardTerms(r), c, cls.sectioned.get(k))) why = 'lands off the sentence';
    else if (!cls.recurring && !named && !reprintShown(res.map((h) => ({ key: unitKey(h.doc), card: card(h.doc) })), cls.sectioned.has(k) || cls.near.has(k) ? cls.members : new Set([...cls.members].filter((x) => !cls.sectioned.has(x) && !cls.near.has(x))), k, twin)) why = 'its reprint is not in the Best Matches';
    else { pass = true; strict = matthewTwin(c.uk).includes(k) || k === c.uk || (!!c.uk2 && (matthewTwin(c.uk2).includes(k) || k === c.uk2)); }
  }
  // the rank of the class's next text after the first hit (its reprint, when the original leads)
  const next = f && f.hit ? (res.findIndex((h, i) => i > 0 && cls.members.has(unitKey(h.doc)) && !matthewTwin(unitKey(h.doc)).includes(unitKey(f.hit.doc))) + 1) || null : null;
  out.push({ id: c.id, held: !!c.held, set: c.set || 'bench', next, members: cls.members.size, recurring: cls.recurring, group: c.group, col: c.col, style: c.style, tier: c.tier, form: c.form, q: c.set === 'fresh' || (TRI && c.held) ? undefined : c.q, pass, strict, rank, top5: !!rank && rank <= 5, found: !!rank, why, ms: times[times.length - 1] });
}

// ── report ──
const sum = (rows) => ({ n: rows.length, pass: rows.filter((o) => o.pass).length, strict: rows.filter((o) => o.strict).length, top5: rows.filter((o) => o.top5).length, found: rows.filter((o) => o.found).length });
const by = (rows, k) => Object.fromEntries([...new Set(rows.map((o) => o[k]))].sort().map((v) => [v, sum(rows.filter((o) => o[k] === v))]));
const bench = out.filter((o) => o.set !== 'fresh');
const fresh = out.filter((o) => o.set === 'fresh');
const all = sum(bench);
const sorted = times.slice().sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const fmt = (s) => `${s.pass}/${s.n} pass  (strict ${s.strict}, top5 ${s.top5}, found ${s.found})`;
if (TRI) triReport();
console.log(`search-bench: ${fmt(all)}`);
console.log(`  open ${fmt(sum(bench.filter((o) => !o.held)))}`);
console.log(`  held ${fmt(sum(bench.filter((o) => o.held)))}`);
if (fresh.length) console.log(`  fresh ${fmt(sum(fresh))}  (sealed, another writer)`);
console.log(`  meaning model: ${meaning.status}${meaning.failure ? ' (' + meaning.failure + ')' : ''}`);
console.log(`  init ${initMs} ms, query median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${sorted[sorted.length - 1]} ms, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const table = (title, o) => { console.log(title); for (const [k, s] of Object.entries(o)) console.log('  ' + k.padEnd(16) + String(s.pass).padStart(4) + ' /' + String(s.n).padStart(4) + '   top5 ' + String(s.top5).padStart(3) + '  found ' + String(s.found).padStart(3)); };
table('by style', by(bench, 'style'));
table('by collection', by(bench, 'group'));
if (!flag('--quiet')) {
  console.log('failures (open cases only):');
  for (const o of out.filter((x) => !x.pass && !x.held)) console.log(`  ${o.id} [${o.style}/${o.col}] ${JSON.stringify(o.q)} -> ${o.why}${o.rank ? ' (target at #' + o.rank + ')' : ' (not found)'}`);
}
if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify(out, null, 1));

const score = { pass: all.pass, strict: all.strict, top5: all.top5, found: all.found, style: Object.fromEntries(Object.entries(by(bench, 'style')).map(([k, s]) => [k, s.pass])), group: Object.fromEntries(Object.entries(by(bench, 'group')).map(([k, s]) => [k, s.pass])), ...(fresh.length ? { fresh: sum(fresh).pass } : {}) };
if (flag('--record')) { fs.writeFileSync(BASELINE, JSON.stringify(score, null, 1) + '\n'); console.log('recorded the floor:', BASELINE); process.exit(0); }
if (!out.length) { console.error('NOTHING-CHECKED'); process.exit(1); }
if (fs.existsSync(BASELINE)) {
  const floor = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const drops = [];
  if (score.pass < floor.pass) drops.push(`pass ${score.pass} < floor ${floor.pass}`);
  if (floor.fresh != null && fresh.length && score.fresh < floor.fresh) drops.push(`fresh ${score.fresh} < floor ${floor.fresh}`);
  for (const sec of ['style', 'group']) for (const [k, n] of Object.entries(floor[sec] || {})) if ((score[sec][k] || 0) < n) drops.push(`${sec} ${k} ${score[sec][k] || 0} < ${n}`);
  if (drops.length) { console.error('search-bench FAILED: ' + drops.join('; ')); process.exit(1); }
  console.log(`floor held (pass ${floor.pass})${score.pass > floor.pass ? `; raised by ${score.pass - floor.pass}: run with --record to keep it` : ''}`);
}

/** The tri report (PLAN 1.6): open, held and fresh on one line, then style x tier, style x collection group, the
    open failures by id and form, and the sealed failures by id only. Floors in tri/baseline.json. */
function triReport() {
  const TIERS = ['easy', 'medium', 'hard'];
  const open = out.filter((o) => !o.held);
  const held = out.filter((o) => o.held && o.set !== 'fresh');
  const sealedFresh = out.filter((o) => o.set === 'fresh');
  const so = sum(open); const sh = sum(held); const sf = sum(sealedFresh);
  console.log(`tri open ${so.pass}/${so.n} (strict ${so.strict}, top5 ${so.top5}, found ${so.found}) · held ${sh.pass}/${sh.n} · fresh ${sealedFresh.length ? sf.pass + '/' + sf.n : '-'} · median ${pct(0.5)}/p95 ${pct(0.95)} ms`);
  console.log(`  meaning model: ${meaning.status}${meaning.failure ? ' (' + meaning.failure + ')' : ''}; init ${initMs} ms, max ${sorted[sorted.length - 1]} ms, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const styles = [...new Set(out.map((o) => o.style))].sort();
  const cell = (rows) => { const s = sum(rows); return s.n ? `${s.pass}/${s.n}` : '-'; };
  const row = (label, o, h, f) => { const s = sum(o); console.log('  ' + label.padEnd(22) + `${s.pass}/${s.n}`.padStart(8) + String(s.strict).padStart(8) + String(s.top5).padStart(6) + String(s.found).padStart(7) + cell(h).padStart(9) + cell(f).padStart(8)); };
  const head = (t) => console.log(t.padEnd(24) + 'open'.padStart(8) + 'strict'.padStart(8) + 'top5'.padStart(6) + 'found'.padStart(7) + 'held'.padStart(9) + 'fresh'.padStart(8));
  head('by style x tier');
  for (const st of styles) for (const t of TIERS) { const f = (o) => o.style === st && o.tier === t; row(st + '/' + t, open.filter(f), held.filter(f), sealedFresh.filter(f)); }
  head('by style x group');
  for (const st of styles) for (const gr of [...new Set(out.filter((o) => o.style === st).map((o) => o.group))].sort()) { const f = (o) => o.style === st && o.group === gr; row(st + '/' + gr, open.filter(f), held.filter(f), sealedFresh.filter(f)); }
  // sanity (PLAN 1.7 step 6): does the pass rate fall from easy to hard? Printed, never used to re-tier.
  const rate = (st, t) => { const s = sum(open.filter((o) => o.style === st && o.tier === t)); return s.n ? Math.round((100 * s.pass) / s.n) : null; };
  console.log('sanity (open pass %, easy/medium/hard): ' + styles.map((st) => { const r = TIERS.map((t) => rate(st, t)); return `${st} ${r.map((x) => (x == null ? '-' : x)).join('/')}${r[0] >= r[1] && r[1] >= r[2] ? '' : ' (not falling)'}`; }).join('; '));
  if (!flag('--quiet')) {
    console.log('failures (open cases only):');
    for (const o of open.filter((x) => !x.pass)) console.log(`  ${o.id} [${o.style}/${o.tier}/${o.form}/${o.col}] ${JSON.stringify(o.q)} -> ${o.why}${o.rank ? ' (target at #' + o.rank + ')' : ' (not found)'}`);
    const ids = (rows) => rows.filter((x) => !x.pass).map((x) => x.id).sort().join(' ') || '-';
    console.log('sealed failures (ids only): held ' + ids(held) + '; fresh ' + ids(sealedFresh));
  }
  if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify(out, null, 1));
  const styleTier = {};
  for (const st of styles) for (const t of TIERS) { const s = sum(open.filter((o) => o.style === st && o.tier === t)); if (s.n) styleTier[st + '/' + t] = s.pass; }
  const score = { open: so.pass, strict: so.strict, top5: so.top5, found: so.found, held: sh.pass, ...(sealedFresh.length ? { fresh: sf.pass } : {}), styleTier };
  if (flag('--record')) { fs.writeFileSync(BASELINE, JSON.stringify(score, null, 1) + '\n'); console.log('recorded the tri floor:', BASELINE); process.exit(0); }
  if (!out.length) { console.error('NOTHING-CHECKED'); process.exit(1); }
  if (fs.existsSync(BASELINE)) {
    const floor = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const drops = [];
    for (const k of ['open', 'held']) if (floor[k] != null && score[k] < floor[k]) drops.push(`${k} ${score[k]} < floor ${floor[k]}`);
    if (floor.fresh != null && sealedFresh.length && score.fresh < floor.fresh) drops.push(`fresh ${score.fresh} < floor ${floor.fresh}`);
    for (const [k, n] of Object.entries(floor.styleTier || {})) if ((score.styleTier[k] || 0) < n) drops.push(`${k} ${score.styleTier[k] || 0} < ${n}`);
    if (drops.length) { console.error('search-bench tri FAILED: ' + drops.join('; ')); process.exit(1); }
    console.log(`tri floor held (open ${floor.open}, held ${floor.held}${floor.fresh != null ? ', fresh ' + floor.fresh : ''})${score.open > floor.open ? `; open raised by ${score.open - floor.open}: run with --record to keep it` : ''}`);
  }
  process.exit(0);
}
