/* freeze-tri.mjs: freeze the tri bench's cases from the writers' replies, their gates and the judges' verdicts
   (search200, 2026-10-18; PLAN 1.5-1.6).
   ─────────────────────────────────────────────────────────────────
     node tools/search-bench/tri/freeze-tri.mjs [--writers <dir>] [--open <dir>] [--held <dir>] [--fresh <dir>]
       [--judgment <judgment.md>] [--sealed-judgment <sealed-judgment.json>] [--targets <targets.json>]
       [--out <dir>] [--splits open,held,fresh] [--partial] [--dry]

   IN  the writers' folders (default <lane>/writers/{open,held,fresh}, lane = D:/Swarm/lanes/search200/out/tri), each
        read by replies.mjs (the packets' replies, rewrites applied: an id's latest version) with the gates.json that
        check-tri.mjs wrote there; the verdicts: <lane>/judgment.md for open, <lane>/sealed-judgment.json for held and
        fresh (both optional; no file is no verdicts).
   OUT  <out>/cases.json (open + held; held cases carry held: true) and <out>/fresh-cases.json (default out:
        tools/search-bench/tri/, what search-bench.mjs --set tri reads). A case is its target's own fields (tier,
        form, collection, col, group, level, uk, sentence, title... what the bench and classes.mjs read; the writer-only
        passage, opening, remembered, meta and packet left out) plus q, from (misremembered), retired: [{q, from?, why}]
        for each query a rewrite replaced, and replaces: <id> on a reserve standing in for a dropped case.

   VERDICTS: keep | drop | rewrite, per id and version (v: 1 is the packet's reply, each rewrite adds 1).
     judgment.md   one verdict per line, anywhere in the file, a list item or a table row:
                     - e012 keep: the other holder is the same letter reprinted
                     | m101@2 | drop | still a paraphrase |
                   an id with no @v is its version 1
     sealed-judgment.json   [{"id", "verdict", "v"?, "code"?}] or {"<id>": "<verdict>" | {"verdict", "v"?}}; ids and
                   codes only, never a query
   A case stands when its latest version passes Gate A and has no Gate B flag, or has a keep. drop takes it out and
   the first usable reserve of its split x style x tier (its own form first, then id order) stands in for it; a
   reserve is usable on the same terms as a case. rewrite on the latest version means a rewrite is owed.

   REFUSES (exit 1, writes nothing) while any case: has no reply; is gated on another version or another targets
   file than it has now (rerun check-tri); fails Gate A with no drop; has a Gate B flag with no verdict; owes a
   rewrite; was dropped with no usable reserve left; or repeats another case's query. Also when a split's gates ran
   without Gate B (--no-b), a split folder is missing, or a verdict names an unknown id, a version that does not
   exist, or two verdicts disagree. The refusal lists ids and codes, never a query, so sealed splits stay sealed.
   --partial (tests and pilots only; never the bench): splits with no folder, cases with no reply and strata left
   short are counted and skipped, every other rule still holds. --splits: read only these splits' folders (a pilot:
   --splits open). --dry: check and report, write nothing.
   ─────────────────────────────────────────────────────────────────── */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readReplies } from './replies.mjs';
import { norm } from './lex.mjs';

export const SPLITS = ['open', 'held', 'fresh'];
const VERDICTS = new Set(['keep', 'drop', 'rewrite']);
// writer-only fields: the packet gave them to the writer; the bench reads none of them
const OMIT = new Set(['split', 'reserve', 'packet', 'meta', 'passage', 'opening', 'remembered']);

/** Verdict lines of a judgment.md: [{id, v, verdict}]. */
export function parseJudgmentMd(text) {
  const out = [];
  const re = /^\s*(?:[-*+]\s+|\|\s*)?([emn]\d{3,4})(?:@(\d+))?\s*(?:[|:,]\s*|[-–—]\s+|\s+)(keep|drop|rewrite)\b/i;
  for (const line of String(text).split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) out.push({ id: m[1], v: m[2] ? Number(m[2]) : 1, verdict: m[3].toLowerCase() });
  }
  return out;
}
/** Verdicts of a sealed-judgment.json: [{id, v, verdict}]. */
export function parseSealedJudgment(json) {
  const out = [];
  const one = (id, x) => {
    const o = typeof x === 'string' ? { verdict: x } : x || {};
    out.push({ id, v: o.v != null ? Number(o.v) : 1, verdict: String(o.verdict || '').toLowerCase() });
  };
  if (Array.isArray(json)) for (const o of json) one(o && o.id, o);
  else if (json && typeof json === 'object') for (const [id, x] of Object.entries(json)) one(id, x);
  return out;
}

/** The freeze itself, pure: targets ([target]); splits ({open|held|fresh: {rows (replies.mjs rows), gates (a
    gates.json), stale?: [codes]}}); verdicts ([{id, v, verdict, from}]); partial. -> {problems: [{id, code}], cases,
    fresh, tally}. Never reads a query except to copy it into a case and to compare two cases' queries. */
export function freeze({ targets, splits, verdicts = [], partial = false, targetsHash = null }) {
  const problems = []; const tally = {};
  const P = (id, code) => problems.push({ id, code });
  const byId = new Map(targets.map((t) => [t.id, t]));
  // the verdicts, by id@v
  const V = new Map();
  for (const x of verdicts) {
    if (!byId.has(x.id)) { P(x.id || '?', 'verdict-unknown-id'); continue; }
    if (!VERDICTS.has(x.verdict)) { P(x.id, `verdict-unknown:${x.verdict || '-'}`); continue; }
    const k = x.id + '@' + x.v;
    if (V.has(k) && V.get(k) !== x.verdict) P(x.id, `verdict-conflict@${x.v}`); else V.set(k, x.verdict);
  }
  const cases = []; const fresh = []; const seenQ = new Map();
  for (const split of SPLITS) {
    const S = splits[split];
    const planned = targets.filter((t) => t.split === split);
    if (!planned.length) continue;
    if (!S) { if (partial) { tally[split] = { skipped: 'no folder' }; continue; } P(split, 'split-missing'); continue; }
    const g = S.gates;
    if (!g) { P(split, 'not-gated'); continue; }
    if (!(g.counts && g.counts.B && g.counts.B.ran)) P(split, 'B-not-run');
    if (targetsHash && g.targetsHash && g.targetsHash !== targetsHash) P(split, 'gates-other-targets');
    for (const c of S.stale || []) P(split, c);
    const rows = new Map();
    for (const r of S.rows) if (!r.dupId && !rows.has(r.id)) rows.set(r.id, r);
    for (const [k] of V) { const [id, v] = k.split('@'); const t = byId.get(id); const r = rows.get(id); if (t.split === split && r && Number(v) > r.v) P(id, `verdict-version@${v}`); }
    /** Where one target stands: {state, codes?, row?}. */
    const decide = (t) => {
      const row = rows.get(t.id);
      if (!row) return { state: 'no-reply' };
      const gi = g.ids && g.ids[t.id];
      if (!gi) return { state: 'not-gated' };
      if (gi.src !== row.src || gi.v !== row.v) return { state: 'gate-stale' };
      const vd = V.get(t.id + '@' + row.v);
      if (vd === 'drop') return { state: 'drop', row };
      if (gi.A !== 'pass') return { state: 'A-fail', codes: gi.why, row };
      if (vd === 'rewrite') return { state: 'rewrite-owed', row };
      if ((gi.B || []).length && vd !== 'keep') return { state: 'B-unjudged', codes: gi.B, row };
      return { state: 'keep', row };
    };
    const strata = new Map();
    for (const t of planned.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const k = t.style + '/' + t.tier;
      if (!strata.has(k)) strata.set(k, { cases: [], reserves: [] });
      strata.get(k)[t.reserve ? 'reserves' : 'cases'].push(t);
    }
    const T = (tally[split] = {});
    const order = (k) => { const [st, ti] = k.split('/'); return ['exact', 'misremembered', 'title'].indexOf(st) * 3 + ['easy', 'medium', 'hard'].indexOf(ti); };
    for (const [k, s] of [...strata].sort((a, b) => order(a[0]) - order(b[0]))) {
      const st = (T[k] = { planned: s.cases.length, kept: 0, replaced: 0, retired: 0, short: 0, unwritten: 0 });
      const used = new Set();
      const take = (t, d, replaces) => {
        const c = {};
        for (const [f, x] of Object.entries(t)) if (!OMIT.has(f)) c[f] = x;
        c.q = d.row.q;
        if (t.style === 'misremembered') c.from = d.row.from;
        if (split !== 'fresh') c.held = split === 'held';
        if (d.row.retired && d.row.retired.length) { c.retired = d.row.retired; st.retired += d.row.retired.length; }
        if (replaces) c.replaces = replaces;
        const n = norm(c.q).trim();
        if (seenQ.has(n)) P(t.id, 'dup-q'); else seenQ.set(n, t.id);
        (split === 'fresh' ? fresh : cases).push(c);
      };
      for (const t of s.cases) {
        const d = decide(t);
        if (d.state === 'keep') { take(t, d); st.kept++; continue; }
        if (d.state === 'no-reply' && partial) { st.unwritten++; continue; }
        if (d.state !== 'drop') { P(t.id, d.state + (d.codes && d.codes.length ? ':' + d.codes.join(',') : '')); continue; }
        // dropped: the first usable reserve, its own form first
        const pool = s.reserves.filter((r) => !used.has(r.id));
        const ok = (r) => decide(r).state === 'keep';
        const r = pool.find((x) => x.form === t.form && ok(x)) || pool.find(ok);
        if (!r) { if (partial) st.short++; else P(t.id, 'dropped-no-reserve'); continue; }
        used.add(r.id);
        take(r, decide(r), t.id);
        st.replaced++;
      }
    }
  }
  return { problems, cases, fresh, tally };
}

// ───────────────────────────── the command ─────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const LANE = 'D:/Swarm/lanes/search200/out/tri';
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const WRITERS = val('--writers') || path.join(LANE, 'writers');
  const TARGETS = val('--targets') || path.join(HERE, 'targets.json');
  const OUTDIR = val('--out') || HERE;
  const PARTIAL = flag('--partial');
  const traw = fs.readFileSync(TARGETS);
  const targets = JSON.parse(traw.toString('utf8')).targets;
  const targetsHash = crypto.createHash('sha256').update(traw).digest('hex').slice(0, 16);

  const splits = {};
  const ONLY = val('--splits') ? val('--splits').split(',').map((s) => s.trim()) : SPLITS;
  for (const split of SPLITS) {
    if (!ONLY.includes(split)) continue;
    const dir = val('--' + split) || path.join(WRITERS, split);
    if (!fs.existsSync(dir)) continue;
    const { rows, files } = readReplies(dir);
    const gp = path.join(dir, 'gates.json');
    const gates = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : null;
    const stale = [];
    if (gates) {
      const madeMs = Date.parse(gates.made);
      if (files.some((f) => fs.statSync(f).mtimeMs > madeMs)) stale.push('gates-older-than-replies');
      if (gates.folder && path.resolve(gates.folder) !== path.resolve(dir)) stale.push('gates-from-another-folder');
    }
    splits[split] = { rows, gates, stale, dir };
  }
  const verdicts = [];
  const jm = val('--judgment') || path.join(LANE, 'judgment.md');
  if (fs.existsSync(jm)) for (const x of parseJudgmentMd(fs.readFileSync(jm, 'utf8'))) verdicts.push({ ...x, from: 'judgment.md' });
  const js = val('--sealed-judgment') || path.join(LANE, 'sealed-judgment.json');
  if (fs.existsSync(js)) for (const x of parseSealedJudgment(JSON.parse(fs.readFileSync(js, 'utf8')))) verdicts.push({ ...x, from: 'sealed-judgment.json' });

  const { problems, cases, fresh, tally } = freeze({ targets, splits, verdicts, partial: PARTIAL, targetsHash });
  console.log(`freeze-tri: targets ${TARGETS}; ${verdicts.length} verdicts; splits ${Object.keys(splits).join(', ') || 'none'}${PARTIAL ? ' (PARTIAL: not a bench)' : ''}`);
  console.log('  stratum                     planned  kept  replaced  retired  short  unwritten');
  for (const [split, T] of Object.entries(tally)) {
    if (T.skipped) { console.log(`  ${split}: skipped (${T.skipped})`); continue; }
    for (const [k, s] of Object.entries(T)) console.log('  ' + (split + '/' + k).padEnd(26) + [s.planned, s.kept, s.replaced, s.retired, s.short, s.unwritten].map((n, i) => String(n).padStart([9, 6, 10, 9, 7, 11][i])).join(''));
  }
  if (problems.length) {
    const byCode = {};
    for (const p of problems) { const c = p.code.replace(/:.*/, ''); (byCode[c] || (byCode[c] = [])).push(p.id); }
    console.error(`FREEZE-REFUSED: ${problems.length} problems`);
    for (const [c, ids] of Object.entries(byCode)) console.error(`  ${c} ${ids.length}: ${ids.slice(0, 40).join(' ')}${ids.length > 40 ? ' ...' : ''}`);
    for (const p of problems.filter((x) => x.code.includes(':')).slice(0, 60)) console.error(`  ${p.id} ${p.code}`);
    process.exit(1);
  }
  const made = new Date().toISOString();
  const count = (arr) => { const o = {}; for (const c of arr) { const k = (c.held ? 'held' : c.held === false ? 'open' : 'fresh') + '/' + c.style + '/' + c.tier; o[k] = (o[k] || 0) + 1; } return o; };
  const head = { made, by: 'freeze-tri.mjs (search200)', targetsHash, partial: PARTIAL || undefined };
  if (flag('--dry')) { console.log(`FREEZE-OK (dry): ${cases.length} cases (open + held), ${fresh.length} fresh; nothing written`); process.exit(0); }
  fs.mkdirSync(OUTDIR, { recursive: true });
  const write = (name, arr) => { const p = path.join(OUTDIR, name); fs.writeFileSync(p + '.tmp', JSON.stringify({ ...head, counts: count(arr), cases: arr }, null, 1) + '\n'); fs.renameSync(p + '.tmp', p); return p; };
  const pc = write('cases.json', cases);
  const pf = fresh.length || splits.fresh ? write('fresh-cases.json', fresh) : null;
  console.log(`FREEZE-OK: ${cases.length} cases (open ${cases.filter((c) => !c.held).length}, held ${cases.filter((c) => c.held).length}) -> ${pc}` + (pf ? `; ${fresh.length} fresh -> ${pf}` : ''));
}
