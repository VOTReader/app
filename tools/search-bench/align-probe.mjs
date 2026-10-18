/* align-probe: evidence for search/align.js before it touches the engine (search200 B4, 2026-10-18).
   ─────────────────────────────────────────────────────────────────
   Over the OPEN tri cases only (tri/cases.json, held false, styles exact and misremembered; the held cases
   are dropped on read and never printed, and tri/fresh-cases.json is never opened), it runs the shipped engine
   the way tools/search-bench.mjs does and asks, for each case:
     - cov of the query against the target text (the case's unit; a merged pair, the better of its two verses);
     - cov against the engine's first hit when that hit is outside the target's class (the competitor), and
       against the best outside-class hit in the top 10 (the hazard: what alignment could wrongly lift);
     - whether the target would even be a candidate (PLAN B4: it carries 50% of the typed idf mass);
     - whether the aligned span covers the remembered sentence (start/end -> the landing);
     - an align-first reorder of the engine's top 30 plus the target (tier A an exact run, tier B cov >= 0.85 or ALIGN_TIER_B,
       within a tier cov, then the original's tier, then the engine's order; the rest keep their order):
       a rough upper bound of what B4 can do, not the engine's integration.
   Then times alignScore over 300 real candidates (the engine's own top 300) per query.

     node tools/search-bench/align-probe.mjs [--json out.json] [--time 40] [--base base-tri.json]
   Corpus-wide: run it through D:/Swarm/tools/heavy.sh. SEARCH_MEANING=off measures the words engine alone.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, engine, kjvVerses, unitKey, ASSETS } from './corpus.mjs';
import { makeClasses } from './classes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const mod = (p) => import(pathToFileURL(path.join(ASSETS, 'src/search', p)).href);
const { kjvEncode } = await mod('tokenize.js');
const { joinApostropheS } = await mod('ranking.js');
const { expandContractions } = await mod('engine.js');
const { alignScore, alignClasses, alignWeights, ALIGN } = await mod('align.js');

// the open cases, and nothing else is kept
const cases = JSON.parse(fs.readFileSync(path.join(HERE, 'tri/cases.json'), 'utf8')).cases
  .filter((c) => c.held === false && (c.style === 'exact' || c.style === 'misremembered'));

// a variant: ALIGN_CREDITS='{"SLOT":0}' overrides align.js's credits, ALIGN_CAP=7 holds every typed word's idf to 7
// ALIGN_TIER_B=0.8 moves the reorder's tier B line
const CREDITS = process.env.ALIGN_CREDITS ? JSON.parse(process.env.ALIGN_CREDITS) : {};
const CAP = +(process.env.ALIGN_CAP || 0) || undefined;
const TIER_B = +(process.env.ALIGN_TIER_B || 0) || 0.85; // the reorder's tier B: cov at or above it
const t0 = Date.now();
const { E, meaning } = await engine();
const D = await buildDocs('nkjv');
const B = await buildBlocks();
const K = makeClasses({ D, B, KJV: kjvVerses() });
const g = /** @type {any} */ (globalThis);
const STOP = g.VotSearchData.STOP_WORDS_TRIMMED;

// the engine's docTokens: text then title, an apostrophe's s joined to its word
const toks = (s) => joinApostropheS(kjvEncode(s));
const TOK = new Map();
const docToks = (d) => { const k = unitKey(d) + '|' + (d.kind || ''); let t = TOK.get(k); if (!t) { t = toks((d.text || '') + ' ' + (d.title || '')); TOK.set(k, t); } return t; };
// document frequency over the same tokens (the index's own counts are not exported)
const DF = new Map();
for (const d of D) for (const w of new Set(docToks(d))) DF.set(w, (DF.get(w) || 0) + 1);
const N = D.length;
const df = (w) => DF.get(w) || 0;
console.log(`align-probe: ${cases.length} open cases, ${N} texts, meaning ${meaning.status}, credits ${JSON.stringify(CREDITS)}, cap ${CAP || '-'}, tier B ${TIER_B}, setup ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/** Index of the first run of `run` in `t`, or -1. */
function runAt(t, run) {
  if (!run.length) return -1;
  for (let i = 0; i + run.length <= t.length; i++) { let j = 0; while (j < run.length && t[i + j] === run[j]) j++; if (j === run.length) return i; }
  return -1;
}
/** The share of the typed idf mass a text holds anywhere (literal, form, register or synonym): PLAN B4's candidate gate. */
function mass(t, w, cls) {
  const has = new Uint8Array(w.length);
  for (const x of new Set(t)) { const e = cls.entry(x); for (let k = 0; k < e.c.length; k += 2) if (e.c[k + 1] >= ALIGN.SYNONYM) has[e.c[k] - 1] = 1; }
  let a = 0; let s = 0;
  for (let i = 0; i < w.length; i++) { s += w[i]; if (has[i]) a += w[i]; }
  return s ? a / s : 0;
}

const rows = [];
for (const c of cases) {
  const words = toks(expandContractions(c.q));
  const w = alignWeights(words, df, N, CAP);
  const cls = alignClasses(words, { stop: STOP, credits: CREDITS });
  const al = (d) => alignScore(docToks(d), words, w, cls);
  const r = await E.search(c.q, { limit: 6000, perVolume: 400 });
  const res = r.results || [];
  const klass = K.classOf(c);
  const inClass = (d) => klass.members.has(unitKey(d));
  const keys = [c.uk, c.uk2].filter(Boolean);
  const targets = keys.map((k) => K.unitDoc[k]).filter(Boolean);
  if (!targets.length) { rows.push({ id: c.id, style: c.style, tier: c.tier, form: c.form, missing: true }); continue; }
  const tA = targets.map((d) => ({ d, a: al(d) })).sort((x, y) => y.a.cov - x.a.cov)[0];
  const target = tA.d;
  const tRank = res.findIndex((h) => keys.includes(unitKey(h.doc))) + 1 || null;
  const first = res[0] ? res[0].doc : null;
  const k1 = first ? unitKey(first) : '';
  const firstOk = !!first && inClass(first) && K.TIER(k1) <= klass.best;
  const comp = first && !inClass(first) ? al(first) : null;
  let hazard = 0; let hazardRef = '';
  for (const h of res.slice(0, 10)) if (!inClass(h.doc)) { const a = al(h.doc); if (a.cov > hazard) { hazard = a.cov; hazardRef = h.doc.ref || unitKey(h.doc); } }
  // the landing: does the aligned span reach the remembered sentence?
  let lands = null;
  if (c.level === 'sentence' && c.sentence && tA.a.start >= 0) {
    const t = docToks(target);
    const st = toks(c.sentence);
    const at = runAt(t, st);
    if (at >= 0) lands = tA.a.start < at + st.length && tA.a.end > at;
  }
  // align-first reorder of the top 30 plus the target
  const pool = res.slice(0, 30).map((h, i) => ({ d: h.doc, i }));
  if (!pool.some((p) => keys.includes(unitKey(p.d)))) pool.push({ d: target, i: (tRank || 9999) - 1 });
  for (const p of pool) {
    const t = docToks(p.d);
    p.cov = keys.includes(unitKey(p.d)) && p.d === target ? tA.a.cov : al(p.d).cov;
    p.tier = runAt(t, words) >= 0 ? 0 : p.cov >= TIER_B ? 1 : 2;
    p.orig = K.TIER(unitKey(p.d));
  }
  pool.sort((x, y) => x.tier - y.tier || (x.tier < 2 ? (Math.abs(y.cov - x.cov) >= 0.02 ? y.cov - x.cov : x.orig - y.orig) : 0) || x.i - y.i);
  // the engine's originalsFirst already splices a class's original above its reprint near the top
  if (inClass(pool[0].d) && pool[0].orig > klass.best) { const o = pool.slice(0, 10).findIndex((p) => inClass(p.d) && p.orig <= klass.best); if (o > 0) pool.unshift(pool.splice(o, 1)[0]); }
  const s1 = pool[0].d;
  const simOk = inClass(s1) && K.TIER(unitKey(s1)) <= klass.best;
  rows.push({
    id: c.id, style: c.style, tier: c.tier, form: c.form, q: c.q, words: words.length,
    target: c.uk, tRank, tCov: +tA.a.cov.toFixed(3), tMass: +mass(docToks(target), w, cls).toFixed(3), tTokens: docToks(target).length,
    first: first ? first.ref || k1 : null, firstOk, firstInClass: !!first && inClass(first),
    cCov: comp ? +comp.cov.toFixed(3) : null, hazard: +hazard.toFixed(3), hazardRef, lands,
    sim: s1.ref || unitKey(s1), simOk,
  });
}

// ── report ──
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const TIERS = ['easy', 'medium', 'hard'];
console.log('style/tier        n  contested  target>comp  tie  target>hazard  sim first ok (now)  cov median  p10');
for (const st of ['exact', 'misremembered']) for (const t of [...TIERS, 'all']) {
  const R = rows.filter((o) => !o.missing && o.style === st && (t === 'all' || o.tier === t));
  const C = R.filter((o) => o.cCov != null);
  const beat = C.filter((o) => o.tCov > o.cCov).length;
  const tie = C.filter((o) => o.tCov === o.cCov).length;
  const hz = R.filter((o) => o.tCov > o.hazard).length;
  const covs = R.map((o) => o.tCov);
  console.log(`${(st + '/' + t).padEnd(18)}${String(R.length).padStart(3)}${String(C.length).padStart(10)}${String(beat).padStart(13)}${String(tie).padStart(5)}${String(hz).padStart(15)}${(R.filter((o) => o.simOk).length + ' (' + R.filter((o) => o.firstOk).length + ')').padStart(20)}${String(pct(covs, 0.5)).padStart(12)}${String(pct(covs, 0.1)).padStart(6)}`);
}
// tier B's threshold: targets at or above it, against cases whose best outside-class top-10 hit is at or above it
console.log('threshold  target>=t (exact, misremembered)  hazard>=t (exact, misremembered)');
for (const t of [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) { const f = (st, k) => rows.filter((o) => !o.missing && o.style === st && o[k] >= t).length; console.log(`  ${t.toFixed(2)}     ${String(f('exact', 'tCov')).padStart(4)} ${String(f('misremembered', 'tCov')).padStart(4)}                      ${String(f('exact', 'hazard')).padStart(4)} ${String(f('misremembered', 'hazard')).padStart(4)}`); }
const buckets = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 0.95], [0.95, 1.01]];
for (const st of ['exact', 'misremembered']) {
  const covs = rows.filter((o) => !o.missing && o.style === st).map((o) => o.tCov);
  console.log(`target cov ${st}: ` + buckets.map(([a, b]) => `[${a},${b > 1 ? 1 : b}) ${covs.filter((x) => x >= a && x < b).length}`).join('  '));
}
const ok = rows.filter((o) => !o.missing);
console.log(`landing: the aligned span covers the sentence in ${ok.filter((o) => o.lands === true).length}/${ok.filter((o) => o.lands != null).length} sentence cases`);
console.log(`candidates: target holds >= 50% of the typed idf mass in ${ok.filter((o) => o.tMass >= 0.5).length}/${ok.length}`);
console.log(`align-first reorder: fixes ${ok.filter((o) => !o.firstOk && o.simOk).length}, breaks ${ok.filter((o) => o.firstOk && !o.simOk).length} (first hit = class original, landing not checked)`);
const base = val('--base') && fs.existsSync(val('--base')) ? new Map(JSON.parse(fs.readFileSync(val('--base'), 'utf8')).filter((o) => !o.held && o.set !== 'fresh').map((o) => [o.id, o])) : null;
const fails = base ? ok.filter((o) => base.has(o.id) && !base.get(o.id).pass) : ok.filter((o) => !o.firstOk);
console.log(`open failures (${base ? 'bench' : 'first hit'}): ${fails.length}`);
for (const o of fails) console.log(`  ${o.id} ${o.style}/${o.tier}/${o.form} tCov ${o.tCov} mass ${o.tMass} rank ${o.tRank} | first ${o.first}${o.cCov != null ? ' cov ' + o.cCov : ' (in class)'} | hazard ${o.hazard} | lands ${o.lands} | sim ${o.simOk ? 'OK' : 'no: ' + o.sim}${base ? ' | why ' + base.get(o.id).why : ''}`);
const broken = ok.filter((o) => o.firstOk && !o.simOk);
if (broken.length) { console.log('align-first would break:'); for (const o of broken) console.log(`  ${o.id} ${o.style}/${o.tier}/${o.form} tCov ${o.tCov} -> ${o.sim} (hazard ${o.hazard} ${o.hazardRef})`); }
if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify(rows, null, 1));

// ── timing: alignScore over the engine's own top 300 per query (tokens cached, as TOKEN_CACHE / the token store hold them) ──
const nTime = +(val('--time') || 40);
const tq = cases.filter((c) => c.style === 'misremembered').slice(0, nTime).concat(cases.filter((c) => c.style === 'exact').slice(0, nTime >> 1));
const ms = []; let toksSeen = 0;
for (const c of tq) {
  const r = await E.search(c.q, { limit: 300, perVolume: 400 });
  const cand = (r.results || []).slice(0, 300).map((h) => docToks(h.doc));
  const words = toks(expandContractions(c.q));
  const w = alignWeights(words, df, N, CAP);
  for (let rep = 0; rep < 2; rep++) {
    const ts = process.hrtime.bigint();
    const cls = alignClasses(words, { stop: STOP, credits: CREDITS });
    for (const t of cand) alignScore(t, words, w, cls);
    if (rep) { ms.push(Number(process.hrtime.bigint() - ts) / 1e6); toksSeen += cand.reduce((a, t) => a + t.length, 0); }
  }
}
console.log(`timing: ${ms.length} queries x up to 300 candidates (${Math.round(toksSeen / ms.length)} tokens per query on average): median ${pct(ms, 0.5).toFixed(1)} ms, p95 ${pct(ms, 0.95).toFixed(1)} ms, max ${Math.max(...ms).toFixed(1)} ms`);
// the worst case: the 300 longest texts in the corpus for one long query
const longest = [...new Map(D.map((d) => [unitKey(d), d])).values()].sort((a, b) => (b.text || '').length - (a.text || '').length).slice(0, 300).map(docToks);
const lq = tq.slice().sort((a, b) => b.q.length - a.q.length)[0];
const lw = toks(expandContractions(lq.q));
const lwt = alignWeights(lw, df, N, CAP);
const lt = [];
for (let rep = 0; rep < 3; rep++) { const ts = process.hrtime.bigint(); const cls = alignClasses(lw, { stop: STOP, credits: CREDITS }); for (const t of longest) alignScore(t, lw, lwt, cls); lt.push(Number(process.hrtime.bigint() - ts) / 1e6); }
console.log(`timing, worst case: the 300 longest texts (${longest.reduce((a, t) => a + t.length, 0)} tokens), a ${lw.length}-word query: ${Math.min(...lt).toFixed(1)} ms`);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(0);
