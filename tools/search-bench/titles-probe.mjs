/* The fuzzy-title probe (search200 B5, 2026-10-18): src/search/titles.js alone, on the tri bench's OPEN cases.
   ─────────────────────────────────────────────────────────────────
   For every open title case: the rank of the target under scoreTitles alone (its equivalence class, classes.mjs, the
   bench's own), and whether admitTitles would admit it (first, and the class's original first). Then every open exact
   and misremembered query through scoreTitles: none of those names a title, so each admission is counted (and an
   admission outside the target's class is a false one). Held cases are dropped before anything reads them, and
   tri/fresh-cases.json is never opened: both stay sealed.

     node tools/search-bench/titles-probe.mjs [--base <search-bench --json out>] [--json <out>] [--quiet]
   --base names the engine's current open title failures and, for each, whether the title module fixes it and why not.
   Run it through D:/Swarm/tools/heavy.sh (corpus-wide).
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, kjvVerses, ASSETS } from './corpus.mjs';
import { makeClasses } from './classes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const QUIET = argv.includes('--quiet');

const T = await import(pathToFileURL(path.join(ASSETS, 'src/search/titles.js')).href);
const D = await buildDocs('nkjv');
const g = /** @type {any} */ (globalThis);
const tb = performance.now();
const ix = T.buildTitles(D, { answers: g.ANSWERS });
const buildMs = performance.now() - tb;
const K = makeClasses({ D, B: await buildBlocks(), KJV: kjvVerses() });

// OPEN only: the held rows are dropped here, before any field of theirs is read
const open = JSON.parse(fs.readFileSync(path.join(HERE, 'tri/cases.json'), 'utf8')).cases.filter((c) => !c.held);
const titleCases = open.filter((c) => c.style === 'title');
const quoteCases = open.filter((c) => c.style === 'exact' || c.style === 'misremembered');

const times = [];
const run = (q) => { const t = performance.now(); const hits = T.scoreTitles(q, { index: ix, limit: 30 }); times.push(performance.now() - t); return hits; };
const short = (h) => h ? `${h.title.length > 60 ? h.title.slice(0, 57) + '...' : h.title} [${h.collection} ${h.score.toFixed(2)} L${h.level} ${h.via}]` : '-';

// ── title cases ──
const rows = [];
for (const c of titleCases) {
  const cls = K.classOf(c);
  const hits = run(c.q);
  const rank = hits.findIndex((h) => cls.members.has(h.uk)) + 1 || null;
  const adm = T.admitTitles(hits);
  const admFirst = !!adm.length && cls.members.has(adm[0].uk);
  const original = admFirst && (cls.recurring || K.TIER(adm[0].uk) <= cls.best); // as the bench: a recurring line has no one original
  const wrong = !!adm.length && !cls.members.has(adm[0].uk);
  const target = hits.find((h) => cls.members.has(h.uk));
  let why = '';
  if (!original) {
    if (!hits.length) why = 'no title scored';
    else if (!target) why = 'target not scored (gates or veto); first ' + short(hits[0]);
    else if (admFirst) why = 'a reprint is admitted first: ' + short(adm[0]);
    else if (wrong) why = 'admits another title: ' + short(adm[0]);
    else if (target.score < T.TITLE_ADMIT) why = 'target under ' + T.TITLE_ADMIT + ': ' + short(target) + (rank > 1 ? '; first ' + short(hits[0]) : '');
    else if (rank > 1) why = 'target #' + rank + ' ' + short(target) + '; first ' + short(hits[0]);
    else why = 'no margin: ' + short(hits[0]) + ' vs ' + short(hits.find((h, i) => i > 0 && h.uk !== hits[0].uk));
  }
  rows.push({ id: c.id, tier: c.tier, form: c.form, q: c.q, title: c.fullTitle || c.title, rank, top1: rank === 1, admitted: original, admFirst, wrong, why, first: short(hits[0]) });
}

// ── false admissions: the open exact and misremembered queries ──
const falseRows = [];
let anyAdmit = 0;
for (const c of quoteCases) {
  const adm = T.admitTitles(run(c.q));
  if (!adm.length) continue;
  anyAdmit++;
  const cls = K.classOf(c);
  if (!cls.members.has(adm[0].uk)) falseRows.push({ id: c.id, style: c.style, tier: c.tier, q: c.q, admitted: short(adm[0]) });
}

// ── report ──
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`titles: ${ix.entries.length} title forms from ${D.filter((d) => d.kind !== 'verse').length} units + Answers headings; built in ${buildMs.toFixed(0)} ms`);
console.log(`scoreTitles: ${times.length} queries, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms, p50 ${pct(times, 0.5).toFixed(2)}, p95 ${pct(times, 0.95).toFixed(2)}, max ${Math.max(...times).toFixed(2)} ms`);
const sum = (rs) => `${rs.filter((r) => r.top1).length}/${rs.length}`.padStart(7) + `${rs.filter((r) => r.admitted).length}/${rs.length}`.padStart(9) + String(rs.filter((r) => r.wrong).length).padStart(7);
console.log('\nopen title cases'.padEnd(29) + '#1'.padStart(7) + 'admit'.padStart(9) + 'wrong'.padStart(7));
const tiers = ['easy', 'medium', 'hard'];
for (const t of tiers) {
  const rt = rows.filter((r) => r.tier === t);
  console.log(('  ' + t).padEnd(28) + sum(rt));
  for (const f of [...new Set(rt.map((r) => r.form))].sort()) console.log(('    ' + f).padEnd(28) + sum(rt.filter((r) => r.form === f)));
}
console.log('  all'.padEnd(28) + sum(rows));
console.log(`\nfalse admissions: ${falseRows.length} of ${quoteCases.length} open exact + misremembered queries admit a title outside their target's class (${anyAdmit} admit any title)`);
for (const r of falseRows) console.log(`  ${r.id} [${r.style}/${r.tier}] ${JSON.stringify(r.q)} -> ${r.admitted}`);
if (!QUIET) {
  console.log('\ntitle cases the module does not admit (target first, original first):');
  for (const r of rows.filter((x) => !x.admitted)) console.log(`  ${r.id} [${r.tier}/${r.form}] ${JSON.stringify(r.q)} -> ${r.why}`);
}

// ── against the engine's current failures ──
const base = val('--base');
if (base) {
  const b = JSON.parse(fs.readFileSync(base, 'utf8'));
  const outRows = (Array.isArray(b) ? b : b.cases || b.out || []).filter((o) => !o.held && o.style === 'title');
  const failing = new Set(outRows.filter((o) => !o.pass).map((o) => o.id));
  const fix = rows.filter((r) => failing.has(r.id) && r.admitted);
  const not = rows.filter((r) => failing.has(r.id) && !r.admitted);
  console.log(`\nengine's open title failures (${failing.size}): the module admits the target first in ${fix.length}`);
  for (const r of fix) console.log(`  FIXES ${r.id} [${r.tier}/${r.form}] ${JSON.stringify(r.q)} -> ${r.first}`);
  for (const r of not) console.log(`  NOT   ${r.id} [${r.tier}/${r.form}] ${JSON.stringify(r.q)} -> ${r.why}`);
  const broke = rows.filter((r) => !failing.has(r.id) && r.wrong);
  console.log(`engine's open title passes the module would admit another title for: ${broke.length}`);
  for (const r of broke) console.log(`  RISK  ${r.id} [${r.tier}/${r.form}] ${JSON.stringify(r.q)} -> ${r.why}`);
}
if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify({ buildMs, times: { n: times.length, p50: pct(times, 0.5), p95: pct(times, 0.95) }, rows, falseRows }, null, 1));
