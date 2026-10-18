/* check-tri.mjs: Gates A and B over the tri bench's writer outputs (search200, 2026-10-18; PLAN 1.5).
   ─────────────────────────────────────────────────────────────────
     node tools/search-bench/tri/check-tri.mjs <folder> [--targets <targets.json>] [--sealed] [--strict] [--no-b]

   <folder> is write.py's output: writers/<split>/ or writers/pilot/. Every *.json under it is one packet's reply,
   [{id, q[, from]}] (gates.json, calls.jsonl and *.tmp are skipped), and each id is looked up in tri/targets.json.
   Replies under rewrites/ (write.py --rewrite) replace an id's query, latest last (replies.mjs): an id is gated on
   its latest version, and gates.json names that version (v, src) so freeze-tri.mjs can tell a stale gate.

   GATE A, CONFORMITY (gate-a.mjs, from q and `from` alone): the form's rules (words, content words, position, slips,
   retention, subsets; the codes are gate-a.mjs's), plus these, which need more than one query:
     dup-500    q equals a query of the 500 bench or of its fresh set after norm(). Those are read in-process and never
                printed, and a q that trips this is never printed either: it may be a sealed query's twin.
     dup-tri    q equals an earlier id's q in this folder.
     longrun-start-excess  more than half of a split's long-run queries start at the sentence's first word (PLAN 1.3);
                the excess, by id order, is flagged.
     unknown-id, dup-id; and a packet's target with no reply is counted as missing.
   GATE B, COLLISIONS (PLAN 1.5; "outside" is outside classes.mjs classOf, the bench's own class):
     exact          B-held: an outside text holds the typed run word for word, or 80% of its word 3-grams in one place
                    (the search-bench.mjs --audit rule): prose units, and NKJV and KJV verses, a run across two verses
                    included. typed-forms is checked as the run it folds to; pasted-quoted without its marks.
     misremembered  B-window: an outside text's best window (1.5 x |q| words) holds as many of q's content words, stemmed
                    and in order, as the target's own best window. B-from: an outside text holds `from` verbatim.
     title          B-title: another title (every unit's title forms, the Answers section headings, the Bible's section
                    headings) scores at least 0.9 of the target's own, by Dice over titleFold tokens (numbers,
                    possessives and plurals folded; one-letter edits on 5+ letters match; a function word counts a
                    quarter, so "the" and "of" alone make no twin). B-named / B-heading: q is a named passage's key or
                    a Bible heading. B-verse: q (3+ words) is a verse's own words.
   Gate B only flags. Gate C (Opus 5.5 high) judges every flag from the target, q and the top 3 competitors.

   OUT: <folder>/gates.json {made, folder, targets, targetsHash, sealed, counts, missing, ids: {id: {style, tier, form,
   split, packet, v, src, A, why, B, competitors, score}}}; never q. SEALED (--sealed, or forced when any id is held or fresh, or the folder is a held,
   fresh or sealed one): the console gets counts, ids and codes only, and a competitor is its key, kind and score (no
   label or snippet, which can repeat q). An open run
   prints q next to its codes. --strict exits 1 when any id fails Gate A. --no-b skips the corpus (Gate A only).
   ─────────────────────────────────────────────────────────────────── */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gateA, typedRun } from './gate-a.mjs';
import { norm, toks, isContent, stem, titleFold, titleTokEq } from './lex.mjs';
import { readReplies } from './replies.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const folder = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--targets');
if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error('usage: check-tri.mjs <folder> [--targets <targets.json>] [--sealed] [--strict] [--no-b]');
  process.exit(2);
}
const TARGETS = val('--targets') || path.join(HERE, 'targets.json');
const TRAW = fs.readFileSync(TARGETS);
const TJ = JSON.parse(TRAW.toString('utf8'));
const TARGETS_HASH = crypto.createHash('sha256').update(TRAW).digest('hex').slice(0, 16); // freeze-tri checks the gates' targets
const byId = new Map(TJ.targets.map((t) => [t.id, t]));
const t0 = Date.now();

// ── the replies (replies.mjs: the packets' replies, then rewrites/ applied; one row per id, its latest version) ──
let R;
try { R = readReplies(folder); } catch (e) { console.error(String(e.message || e)); process.exit(2); }
const files = R.files;
if (!files.length) { console.error('no writer replies under ' + folder); process.exit(2); }
const rows = [];
for (const x of R.rows) {
  const t = byId.get(x.id) || null;
  const r = { ...x, t, why: [], B: [], competitors: [], score: null };
  if (!t) r.why.push('unknown-id');
  if (x.dupId) r.why.push('dup-id');
  rows.push(r);
}
const missing = [];
for (const [packet, got] of R.packets) {
  const splits = new Set([...got].map((id) => byId.get(id)).filter(Boolean).map((t) => t.split));
  for (const t of byId.values()) if (t.packet === packet && splits.has(t.split) && !got.has(t.id)) missing.push(t.id);
}
const SEALED = flag('--sealed') || rows.some((r) => !r.t || r.t.split !== 'open') || /[\\/](held|fresh|sealed)([\\/]|$)/.test(path.resolve(folder));

// ── Gate A ──
const OLD = new Set();
for (const f of ['../cases.json', '../fresh-cases.json']) {
  const p = path.join(HERE, f);
  if (fs.existsSync(p)) for (const c of JSON.parse(fs.readFileSync(p, 'utf8')).cases) if (c.q) OLD.add(norm(c.q));
}
const firstQ = new Map();
for (const r of rows) {
  if (!r.t) continue;
  const a = gateA(r.t, { q: r.q, from: r.from });
  r.why.push(...a.why);
  r.meta = a.meta;
  const n = norm(r.q);
  if (OLD.has(n)) { r.why.push('dup-500'); r.withhold = true; }
  if (n.trim() && firstQ.has(n)) r.why.push('dup-tri'); else firstQ.set(n, r.id);
}
OLD.clear();
// at most half of a split's long-runs start at the sentence's first word (PLAN 1.3); the excess is flagged
for (const split of new Set(rows.filter((r) => r.t).map((r) => r.t.split))) {
  const lr = rows.filter((r) => r.t && r.t.split === split && r.t.style === 'exact' && r.t.form === 'long-run').sort((a, b) => a.id.localeCompare(b.id));
  for (const r of lr.filter((x) => x.meta && x.meta.atStart).slice(Math.floor(lr.length / 2))) r.why.push('longrun-start-excess');
}

// ── Gate B ──
if (!flag('--no-b')) await gateB();

// ── out ──
const pass = (r) => !r.why.length;
const counts = { queries: rows.length, files: files.length, missing: missing.length, unknown: rows.filter((r) => !r.t).length,
  A: { pass: rows.filter(pass).length, fail: rows.filter((r) => !pass(r)).length }, B: { flagged: rows.filter((r) => r.B.length).length, ran: !flag('--no-b') },
  strata: {}, codesA: {}, codesB: {} };
for (const r of rows) {
  const k = r.t ? `${r.t.split}/${r.t.style}/${r.t.tier}` : 'unknown';
  const s = counts.strata[k] || (counts.strata[k] = { n: 0, A: 0, B: 0 });
  s.n++; if (pass(r)) s.A++; if (r.B.length) s.B++;
  for (const w of r.why) { const c = w.replace(/:.*/, ''); counts.codesA[c] = (counts.codesA[c] || 0) + 1; }
  for (const c of r.B) counts.codesB[c] = (counts.codesB[c] || 0) + 1;
}
const ids = {};
for (const r of rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
  ids[r.id] = { style: r.t && r.t.style, tier: r.t && r.t.tier, form: r.t && r.t.form, split: r.t && r.t.split, reserve: !!(r.t && r.t.reserve), packet: r.packet,
    v: r.v, src: r.src, A: pass(r) ? 'pass' : 'fail', why: r.why, B: r.B, competitors: SEALED ? r.competitors.map(({ key, how, score }) => ({ key, how, score })) : r.competitors, score: r.score };
}
const OUT = path.join(folder, 'gates.json');
fs.writeFileSync(OUT, JSON.stringify({ made: new Date().toISOString(), folder: path.resolve(folder), targets: path.resolve(TARGETS), targetsHash: TARGETS_HASH,
  sealed: SEALED, counts, missing: missing.sort(), ids }, null, 1) + '\n');

console.log(`check-tri ${path.resolve(folder)}: ${rows.length} queries in ${files.length} replies${SEALED ? ' (SEALED: ids and codes only)' : ''}; ${missing.length} targets with no reply; ${counts.unknown} unknown ids`);
console.log('  stratum                     n  A-pass  B-flag');
for (const [k, s] of Object.entries(counts.strata).sort()) console.log('  ' + k.padEnd(26) + String(s.n).padStart(4) + String(s.A).padStart(8) + String(s.B).padStart(8));
console.log('  Gate A codes: ' + (Object.entries(counts.codesA).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ') || '-'));
console.log('  Gate B codes: ' + (counts.B.ran ? Object.entries(counts.codesB).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ') || '-' : 'not run (--no-b)'));
for (const r of rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
  if (pass(r) && !r.B.length) continue;
  const codes = `A:${pass(r) ? 'pass' : 'fail[' + r.why.join(',') + ']'} B:${r.B.length ? '[' + r.B.join(',') + ']' : '-'}`;
  if (SEALED) { console.log(`  ${r.id} ${codes}`); continue; }
  const c = r.competitors[0];
  console.log(`  ${r.id} ${r.t ? r.t.style + '/' + r.t.tier + '/' + r.t.form : '?'} ${codes} ${r.withhold ? '(q withheld: dup-500)' : JSON.stringify(r.q)}`
    + (r.from && !r.withhold ? ' from ' + JSON.stringify(r.from) : '') + (c ? ` | vs ${c.key}${c.label ? ' "' + c.label + '"' : ''}${c.score != null ? ' ' + c.score : ''}` : ''));
}
console.log(`CHECK-DONE A ${counts.A.pass}/${rows.length} pass, B ${counts.B.ran ? counts.B.flagged + ' flagged' : 'not run'}; ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${OUT}`);
process.exit(flag('--strict') && counts.A.fail ? 1 : 0);

// ───────────────────────────── Gate B ─────────────────────────────
async function gateB() {
  const C = await import(pathToFileURL(path.join(HERE, '../corpus.mjs')).href);
  const { makeClasses } = await import(pathToFileURL(path.join(HERE, '../classes.mjs')).href);
  const D = await C.docs('nkjv');
  const B = await C.blocks();
  const KJV = C.kjvVerses();
  const K = makeClasses({ D, B, KJV });
  const g = /** @type {any} */ (globalThis);

  // the texts: prose units, then every chapter of verses (NKJV search docs, plain Matthew and the Matthew study, and
  // the KJV), so a window or a run may cross from one verse into the next
  const DOCS = K.proseKeys.map((k, i) => ({ kind: 'prose', key: k, words: K.proseWords[i], text: K.proseNorm[i] }));
  const chap = new Map();
  const addVerse = (src, key, text) => {
    const pre = key.slice(0, key.lastIndexOf(':'));
    let c = chap.get(src + '|' + pre);
    if (!c) chap.set(src + '|' + pre, (c = { kind: 'ch', src, pre, keys: [], vStart: [], words: [] }));
    c.keys.push(key); c.vStart.push(c.words.length);
    for (const w of C.norm(text).trim().split(' ')) if (w) c.words.push(w);
  };
  for (const d of D) if (d.kind === 'verse') addVerse('nkjv', C.unitKey(d), d.text);
  for (const [book, chs] of Object.entries(KJV)) for (const [ch, vs] of Object.entries(chs)) for (const v of vs) addVerse('kjv', 'bible/' + book + ':' + ch + ':' + v.n, v.text);
  for (const c of chap.values()) {
    c.text = ' ' + c.words.join(' ') + ' ';
    c.wStart = new Int32Array(c.words.length); // each word's offset in text
    let at = 1; c.words.forEach((w, i) => { c.wStart[i] = at; at += w.length + 1; });
    DOCS.push(c);
  }
  const proseIdx = new Map(K.proseKeys.map((k, i) => [k, i]));
  const chOf = new Map();
  DOCS.forEach((d, i) => { if (d.kind === 'ch') { const a = chOf.get(d.pre) || []; a.push(i); chOf.set(d.pre, a); } });
  const verseText = (d, v) => ' ' + d.words.slice(d.vStart[v], v + 1 < d.vStart.length ? d.vStart[v + 1] : d.words.length).join(' ') + ' ';
  const VERSES = [];
  DOCS.forEach((d, di) => { if (d.kind === 'ch') for (let v = 0; v < d.keys.length; v++) VERSES.push({ di, v, key: d.keys[v], text: verseText(d, v) }); });
  const bsearch = (arr, x) => { let lo = 0; let hi = arr.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= x) lo = m; else hi = m - 1; } return lo; };
  const verseAt = (d, p) => bsearch(d.vStart, p);
  // content-word postings: stem -> [doc, position, doc, position, ...]
  const POST = new Map();
  DOCS.forEach((d, di) => d.words.forEach((w, p) => { if (!isContent(w)) return; const s = stem(w); let a = POST.get(s); if (!a) POST.set(s, (a = [])); a.push(di, p); }));
  const unitTitle = (k) => ((K.unitBlocks[k] || [])[0] || {}).title || '';
  const snip = (text, at, len) => text.slice(Math.max(0, at - 60), at + len + 60).trim();

  /** The target's class: inCls(key), its prose docs, and per chapter doc the verses in it. */
  const views = new Map();
  function classView(t) {
    if (views.has(t.id)) return views.get(t.id);
    const c = K.classOf(t);
    const inCls = (k) => c.members.has(k) || K.matthewTwin(k).some((x) => c.members.has(x));
    const prose = new Set(); const ch = new Map();
    for (const k of c.members) {
      if (proseIdx.has(k)) prose.add(proseIdx.get(k));
      else if (K.isVerseKey(k)) for (const tw of K.matthewTwin(k)) for (const di of chOf.get(tw.slice(0, tw.lastIndexOf(':'))) || []) if (!ch.has(di)) ch.set(di, Uint8Array.from(DOCS[di].keys, (x) => (inCls(x) ? 1 : 0)));
    }
    const v = { inCls, prose, ch };
    views.set(t.id, v);
    return v;
  }
  /** Every place a chapter doc holds the normalized run n outside the class: [{key, at}]. */
  function chapterRuns(n, V) {
    const out = [];
    const nw = n.trim().split(' ').length;
    DOCS.forEach((d, di) => {
      if (d.kind !== 'ch') return;
      for (let at = d.text.indexOf(n); at >= 0; at = d.text.indexOf(n, at + 1)) {
        const w0 = bsearch(d.wStart, at + 1);
        const v0 = verseAt(d, w0); const v1 = verseAt(d, w0 + nw - 1);
        const mask = V.ch.get(di);
        let inside = false;
        for (let v = v0; v <= v1; v++) if (mask ? mask[v] : V.inCls(d.keys[v])) inside = true;
        if (!inside) out.push({ key: d.keys[v0], src: d.src, at, text: d.text });
      }
    });
    return out;
  }

  // ── exact ──
  function exact(r) {
    const t = r.t; const V = classView(t);
    let n = C.norm(r.q);
    if (t.form === 'typed-forms') { const rt = toks(t.remembered); const w = typedRun(r.q, rt); if (w) n = ' ' + rt.slice(w[0], w[1]).join(' ') + ' '; }
    const w = n.trim().split(' ');
    if (w.length < 2) return;
    const grams = []; for (let i = 0; i + 3 <= w.length; i++) grams.push(' ' + w.slice(i, i + 3).join(' ') + ' ');
    const out = []; const seen = new Set();
    const add = (o) => { if (!seen.has(o.key)) { seen.add(o.key); out.push(o); } };
    for (const k of K.holders(n.trim())) if (!V.inCls(k)) { const tx = K.proseNorm[proseIdx.get(k)]; const at = tx.indexOf(n); add({ key: k, label: unitTitle(k), how: at >= 0 ? 'verbatim' : 'near', snippet: at >= 0 ? snip(tx, at, n.length) : undefined }); }
    for (const o of chapterRuns(n, V)) add({ key: o.key, label: o.src.toUpperCase(), how: 'verbatim', snippet: snip(o.text, o.at, n.length) });
    if (grams.length >= 4) for (const x of VERSES) {
      if (seen.has(x.key) || V.inCls(x.key)) continue;
      if (grams.filter((gr) => x.text.includes(gr)).length >= 0.8 * grams.length) add({ key: x.key, label: DOCS[x.di].src.toUpperCase(), how: 'near', snippet: x.text.trim() });
    }
    if (out.length) { r.B.push('B-held'); r.competitors = out.slice(0, 3); r.score = { outside: out.length }; }
  }

  // ── misremembered ──
  const lcsLen = (a, b) => {
    let prev = new Int16Array(b.length + 1); let cur = new Int16Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) { for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; }
    return prev[b.length];
  };
  /** The best window of L words over hits ([pos, stem], sorted): {best, at}; windows that cannot reach thr are skipped. */
  function bestWindow(qc, L, hits, thr) {
    let best = 0; let at = -1;
    for (let s = 0, e = 0; s < hits.length; s++) {
      while (e < hits.length && hits[e][0] < hits[s][0] + L) e++;
      if (Math.min(e - s, qc.length) < Math.max(thr, best + 1)) continue;
      const v = lcsLen(qc, hits.slice(s, e).map((h) => h[1]));
      if (v > best) { best = v; at = hits[s][0]; }
      if (best === qc.length) break;
    }
    return { best, at };
  }
  const ub = new Int32Array(DOCS.length);
  function misremembered(r) {
    const t = r.t; const V = classView(t);
    const qw = toks(r.q); const qc = qw.filter(isContent).map(stem);
    if (qc.length >= 2) {
      const L = Math.ceil(1.5 * qw.length);
      const qn = new Map(); for (const s of qc) qn.set(s, (qn.get(s) || 0) + 1);
      // an upper bound per doc: q's content words whose stem the doc holds
      const touched = [];
      for (const [s, k] of qn) {
        const a = POST.get(s); if (!a) continue;
        let last = -1;
        for (let i = 0; i < a.length; i += 2) if (a[i] !== last) { last = a[i]; if (!ub[last]) touched.push(last); ub[last] += k; }
      }
      const want = new Set(touched.filter((di) => ub[di] >= 2 || V.prose.has(di) || V.ch.has(di)));
      const hits = new Map();
      for (const s of qn.keys()) {
        const a = POST.get(s); if (!a) continue;
        for (let i = 0; i < a.length; i += 2) if (want.has(a[i])) { let h = hits.get(a[i]); if (!h) hits.set(a[i], (h = [])); h.push([a[i + 1], s]); }
      }
      for (const h of hits.values()) h.sort((x, y) => x[0] - y[0]);
      // the target's own best window: its class's prose units and verses
      let sT = 0;
      const split = (di) => { // a chapter doc's hits in and out of the class
        const h = hits.get(di) || []; const mask = V.ch.get(di); const d = DOCS[di];
        if (!mask) return { inside: [], outside: h };
        const inside = []; const outside = [];
        for (const x of h) (mask[verseAt(d, x[0])] ? inside : outside).push(x);
        return { inside, outside };
      };
      for (const di of V.prose) sT = Math.max(sT, bestWindow(qc, L, hits.get(di) || [], 1).best);
      for (const di of V.ch.keys()) sT = Math.max(sT, bestWindow(qc, L, split(di).inside, 1).best);
      const thr = Math.max(sT, 2);
      const comp = [];
      for (const di of want) {
        if (ub[di] < thr || V.prose.has(di)) continue;
        const d = DOCS[di];
        const h = d.kind === 'ch' ? split(di).outside : hits.get(di) || [];
        const w = bestWindow(qc, L, h, thr);
        if (w.best >= thr) {
          const key = d.kind === 'ch' ? d.keys[verseAt(d, w.at)] : d.key;
          comp.push({ key, label: d.kind === 'ch' ? d.src.toUpperCase() : unitTitle(d.key), how: 'window', score: w.best, of: qc.length, snippet: d.words.slice(w.at, w.at + L).join(' ') });
        }
      }
      for (const di of touched) ub[di] = 0;
      comp.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
      const one = comp.filter((c, i) => comp.findIndex((x) => x.key === c.key) === i); // a verse in the NKJV and the KJV: once
      r.score = { target: sT, outside: one.length ? one[0].score : 0, of: qc.length };
      if (one.length) { r.B.push('B-window'); r.competitors = one.slice(0, 3); }
    }
    // `from` held verbatim by an outside text
    if (r.from) {
      const nf = C.norm(r.from);
      if (nf.trim().split(' ').length >= 3) {
        const out = [];
        K.proseKeys.forEach((k, i) => { const at = K.proseNorm[i].indexOf(nf); if (at >= 0 && !V.inCls(k)) out.push({ key: k, label: unitTitle(k), how: 'from', snippet: snip(K.proseNorm[i], at, nf.length) }); });
        for (const o of chapterRuns(nf, V)) out.push({ key: o.key, label: o.src.toUpperCase(), how: 'from', snippet: snip(o.text, o.at, nf.length) });
        if (out.length) { r.B.push('B-from'); r.competitors = r.competitors.concat(out); }
      }
    }
  }

  // ── titles ──
  const UNI = [];
  for (const [tn, keys] of Object.entries(K.titleNorm)) UNI.push({ kind: 'title', keys, label: C.norm(unitTitle(keys[0])) === tn ? unitTitle(keys[0]) : tn.trim(), f: titleFold(tn) });
  for (const k of K.proseKeys) {
    if (!k.startsWith('answers/')) continue;
    const bl = K.unitBlocks[k];
    bl.forEach((b, i) => {
      const x = b.text.trim();
      if ((i > 0 && bl[i - 1].text.trim() !== '✦') || !x || x === '✦' || x.length > 120 || K.CITE_LINE.test(x)) return;
      const wc = toks(x).length;
      if (wc >= 2 && wc <= 16) UNI.push({ kind: 'heading', keys: [k], hkey: k + '#' + b.idx, label: x, f: titleFold(x), own: K.titleNorm[C.norm(x.replace(/\s*\([^()]*\)$/, ''))] || [] });
    });
  }
  const BH = new Map();
  for (const d of D) if (d.kind === 'verse' && d.heading) { const h = String(d.heading).trim(); const f = titleFold(h); const nk = f.join(' '); if (nk && !BH.has(nk)) BH.set(nk, { kind: 'bible-heading', keys: [C.unitKey(d)], label: h, f }); }
  UNI.push(...BH.values());
  const NAMED = new Set((g.VotSearchData.NAMED_PASSAGES || []).flatMap((np) => np.keys || []).map((k) => titleFold(k).join(' ')));
  const VERSE_ALL = VERSES.map((x) => x.text).join('|');
  const wt = (w) => (isContent(w) ? 1 : 0.25);
  const dice = (a, b) => {
    const pool = b.slice(); let m = 0;
    for (const w of a) { const i = pool.findIndex((x) => x != null && titleTokEq(w, x)); if (i >= 0) { m += Math.min(wt(w), wt(pool[i])); pool[i] = null; } }
    const den = a.reduce((s, w) => s + wt(w), 0) + b.reduce((s, w) => s + wt(w), 0);
    return den ? (2 * m) / den : 0;
  };
  function title(r) {
    const t = r.t; const V = classView(t);
    const qf = titleFold(r.q);
    if (!qf.length) return;
    const own = t.level === 'sentence' ? t.uk + '#' + t.blockIdx : null;
    const inside = (u) => (u.kind === 'heading' ? u.hkey === own || u.own.some(V.inCls) : u.keys.some(V.inCls));
    let sT = Math.max(dice(qf, titleFold(t.title || '')), t.fullTitle ? dice(qf, titleFold(t.fullTitle)) : 0);
    const out = [];
    for (const u of UNI) { const s = dice(qf, u.f); if (inside(u)) sT = Math.max(sT, s); else if (s > 0) out.push([s, u]); }
    const comp = out.filter(([s]) => s >= 0.9 * sT).sort((a, b) => b[0] - a[0]).map(([s, u]) => ({ key: u.hkey || u.keys[0], label: u.label, how: u.kind, score: Math.round(s * 100) / 100 }));
    r.score = { target: Math.round(sT * 100) / 100, outside: comp.length ? comp[0].score : 0 };
    if (comp.length) { r.B.push('B-title'); r.competitors = comp.slice(0, 3); }
    const k = qf.join(' ');
    if (NAMED.has(k)) r.B.push('B-named');
    if (BH.has(k) && !V.inCls(BH.get(k).keys[0])) r.B.push('B-heading');
    const n = C.norm(r.q);
    if (n.trim().split(' ').length >= 3 && VERSE_ALL.includes(n)) r.B.push('B-verse');
  }

  for (const r of rows) {
    if (!r.t || !r.q.trim()) continue;
    if (r.t.style === 'exact') exact(r);
    else if (r.t.style === 'misremembered') misremembered(r);
    else title(r);
    r.competitors = r.competitors.filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i).slice(0, 3);
  }
}
