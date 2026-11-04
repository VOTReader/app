/* The Answers search, two ways, on the Answers question set (search200 h8, 2026-11-04).
   ─────────────────────────────────────────────────────────────────
   Every case in cases.json (build.mjs) and the hunt bench's sw-answers rows, through
     box     the landing's own matcher, its fallback while the engine's index builds: answersSearch
             (utils/answers-search.js) with the site's order and the sidecar sections, the group's first hit its landing
     engine  what the landing shows once the index is ready: answersRankedSearch (utils/answers-ranked.js), the main
             engine (src/search/engine.js as tools/search-bench/corpus.mjs runs it: lexicon, KJV twin, meaning model
             unless SEARCH_MEANING=off) kept to the Answers collection, each topic landing where its excerpt lands
   (2026-11-04, before the switch, the box was the whole screen: floor.json's note holds both columns.)
   Grade: a title case passes top-k when its topic is among the first k topics shown; a heading case when one of
   its topics is among the first k AND that topic's landing paragraph lies in the heading's section. A sw-answers
   row passes when its target (or an Answers alt) is among the first k: the Answers screen shows only Answers.

   node tools/answers-questions/score.mjs [--json out.json] [--only box|engine] [--floor]
     --floor  exit 1 when the box falls under tools/answers-questions/floor.json (per kind/form, top-1 and top-3)
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { engine as startEngine, loadCorpus, ASSETS } from '../search-bench/corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = val('--only');
const imp = (p) => import(pathToFileURL(path.join(ASSETS, p)).href);

loadCorpus();
const g = /** @type {any} */ (globalThis);
if (!g.ANSWERS_META) (await import('node:vm')).runInThisContext(fs.readFileSync(path.join(ASSETS, 'src/data/answers-meta.js'), 'utf8'));
const AS = await imp('src/utils/answers-search.js');
const { answersSiteOrder } = await imp('src/utils/answers-site.js');
const ANSWERS = g.ANSWERS;
const META = g.ANSWERS_META;

const set = JSON.parse(fs.readFileSync(path.join(HERE, 'cases.json'), 'utf8')).cases;
const hunt = JSON.parse(fs.readFileSync(path.join(HERE, '../search-bench/hunt/cases.json'), 'utf8')).cases
  .filter((c) => c.family === 'sw-answers' && !c.held)
  .map((c) => ({ id: c.id, kind: 'hunt', form: 'sw-answers', q: c.q,
    targets: [c.uk, ...(c.alt || [])].filter((k) => k.startsWith('answers/')).map((k) => ({ id: k.slice(8) })) }));
const cases = set.concat(hunt);

// ── the box, as AnswersHome runs it ──
const order = answersSiteOrder(ANSWERS);
const posMap = new Map(order.map((e, i) => [e.id, i]));
const opts = { pos: (id) => (posMap.has(id) ? posMap.get(id) : 1e6), sections: (id) => (META[id] && META[id].sections) || null };
const index = AS.answersIndexOf(ANSWERS);
/** @returns {{ id: string, at: number }[]} the topics shown, in order, each with the paragraph a tap opens on */
function box(q) {
  const r = q.trim().length >= 2 ? AS.answersSearch(index, q, opts) : null;
  return r ? r.groups.map((x) => ({ id: x.entry.id, at: x.first ? x.first.index : 0 })) : [];
}

// ── the engine, kept to Answers: the screen's own call (utils/answers-ranked.js) ──
const { answersRankedSearch } = await imp('src/utils/answers-ranked.js');
let E = null, meaningStatus = 'off';
if (ONLY !== 'box') { const st = await startEngine(); E = st.E; meaningStatus = st.meaning && st.meaning.status; }
async function engine(q) {
  const r = await answersRankedSearch(E, index, q, opts);
  return r ? r.groups.map((x) => ({ id: x.entry.id, at: x.first ? x.first.index : 0 })) : [];
}

// ── grade ──
function rankOf(c, shown) {
  for (let i = 0; i < shown.length; i++) {
    const s = shown[i];
    if (c.targets.some((t) => t.id === s.id && (c.kind !== 'section' || (s.at >= t.from && s.at < t.to)))) return i + 1;
  }
  return null;
}
const rows = [];
const ms = { box: [], engine: [] };
for (const c of cases) {
  const row = { id: c.id, kind: c.kind, form: c.form, q: c.q };
  for (const name of ['box', 'engine']) {
    if (ONLY && ONLY !== name) continue;
    const t0 = performance.now();
    const shown = name === 'box' ? box(c.q) : await engine(c.q);
    ms[name].push(performance.now() - t0);
    row[name] = rankOf(c, shown);
    row[name + 'Top'] = shown[0] ? shown[0].id + '@' + shown[0].at : null;
  }
  rows.push(row);
}

// ── report ──
const shapes = [...new Set(rows.map((r) => r.kind + '/' + r.form))];
const tally = (rs, name, k) => rs.filter((r) => r[name] != null && r[name] <= k).length;
const p50 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const summary = {};
console.log(`answers-questions: ${set.length} set cases + ${hunt.length} sw-answers rows; engine meaning ${meaningStatus}`);
console.log('shape'.padEnd(20) + 'n'.padStart(5) + (ONLY !== 'engine' ? '  box top1  box top3' : '') + (ONLY !== 'box' ? '  eng top1  eng top3' : ''));
for (const s of shapes.concat(['ALL set'])) {
  const rs = s === 'ALL set' ? rows.filter((r) => r.kind !== 'hunt') : rows.filter((r) => r.kind + '/' + r.form === s);
  const o = { n: rs.length };
  let line = s.padEnd(20) + String(rs.length).padStart(5);
  for (const name of ['box', 'engine']) {
    if (ONLY && ONLY !== name) continue;
    o[name] = { top1: tally(rs, name, 1), top3: tally(rs, name, 3) };
    line += String(o[name].top1).padStart(10) + String(o[name].top3).padStart(10);
  }
  summary[s] = o;
  console.log(line);
}
for (const name of ['box', 'engine']) if (ms[name].length) console.log(`${name} p50 ${p50(ms[name]).toFixed(2)} ms, max ${Math.max(...ms[name]).toFixed(1)} ms`);
if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify({ meaning: meaningStatus, summary, ms: { box: p50(ms.box), engine: p50(ms.engine) }, rows }, null, 1));

if (argv.includes('--floor')) {
  const floor = JSON.parse(fs.readFileSync(path.join(HERE, 'floor.json'), 'utf8'));
  const name = floor.engine || 'box';
  const lost = Object.entries(floor.shapes).filter(([s, f]) => !summary[s] || summary[s][name].top1 < f.top1 || summary[s][name].top3 < f.top3);
  if (lost.length) { console.error('answers-questions: under the floor: ' + lost.map(([s]) => s).join(', ')); process.exit(1); }
  console.log('answers-questions: at or over the floor');
}
