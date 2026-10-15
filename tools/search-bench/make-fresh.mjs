/* The FRESH 100: a second sealed set, written blind by another model family (path to ~475, step 0, 2026-10-15).
   ─────────────────────────────────────────────────────────────────
   The 400 open cases have been read while tuning; the 100 held out have been scored often. A fresh set,
   written by a model that never saw the engine, the bench or writer-brief.md, keeps every later gain honest:
   a change ships only when it raises both unseen sets (held + fresh).

   Targets: another seed's 500 (make-targets.mjs --seed 20261015 --out <file>), sampled one in five per
   group, style and variant (largest remainder), skipping any target the 500 already has (the same verse,
   the same sentence anywhere, the same whole unit). Writes fresh-targets.json (all held) and the writer's
   packet: what the reader remembers and the passage around it, nothing else.

     node tools/search-bench/make-targets.mjs --seed 20261015 --out <tmp500.json>
     node tools/search-bench/make-fresh.mjs <tmp500.json> <packet.json>
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [src, packetOut] = process.argv.slice(2);
if (!src || !packetOut) { console.error('usage: make-fresh.mjs <another seed\'s targets.json> <packet.json>'); process.exit(2); }
const pool = JSON.parse(fs.readFileSync(src, 'utf8'));
const have = JSON.parse(fs.readFileSync(path.join(HERE, 'targets.json'), 'utf8')).targets;

let seed = pool.seed | 0;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// What the 500 already asks for.
const taken = new Set();
for (const t of have) {
  taken.add('uk:' + t.uk + (t.level === 'unit' ? '' : '#' + norm(t.sentence)));
  if (t.level === 'verse') taken.add('verse:' + t.uk);
  if (t.level === 'unit') taken.add('unit:' + t.uk);
  if (t.sentence) taken.add('s:' + norm(t.sentence));
}
const isTaken = (t) => taken.has('uk:' + t.uk + (t.level === 'unit' ? '' : '#' + norm(t.sentence)))
  || (t.level === 'verse' && taken.has('verse:' + t.uk)) || (t.level === 'unit' && taken.has('unit:' + t.uk))
  || (t.sentence && taken.has('s:' + norm(t.sentence)));

// One in five per group, then per stratum (style + variant) within the group by largest remainder.
const out = [];
const groups = [...new Set(pool.targets.map((t) => t.group))];
for (const g of groups) {
  const inG = pool.targets.filter((t) => t.group === g);
  const want = Math.round(inG.length / 5);
  const strata = {};
  for (const t of inG) (strata[t.style + '/' + (t.variant || '')] || (strata[t.style + '/' + (t.variant || '')] = [])).push(t);
  const keys = Object.keys(strata).sort();
  const quota = Object.fromEntries(keys.map((k) => [k, Math.floor(strata[k].length / 5)]));
  let left = want - Object.values(quota).reduce((a, b) => a + b, 0);
  for (const k of keys.slice().sort((a, b) => (strata[b].length % 5) - (strata[a].length % 5) || (a < b ? -1 : 1))) { if (left <= 0) break; quota[k]++; left--; }
  for (const k of keys) {
    const picked = shuffle(strata[k]).filter((t) => !isTaken(t)).slice(0, quota[k]);
    if (picked.length < quota[k]) throw new Error('stratum ' + g + ' ' + k + ': only ' + picked.length + ' fresh targets');
    out.push(...picked);
  }
}
const fresh = out.map((t, i) => ({ ...t, id: 'f' + String(i + 1).padStart(3, '0'), from: t.id, held: true, set: 'fresh' }));
fs.writeFileSync(path.join(HERE, 'fresh-targets.json'), JSON.stringify({ seed: pool.seed, sampled: 'one in five per group/style/variant, none the 500 has', targets: fresh }, null, 1) + '\n');

// The writer's packet: the remembered text and its passage, no ids of the corpus, no references, no engine.
const packet = fresh.map((t) => {
  const p = { id: t.id, style: t.style };
  if (t.variant === 'kjv' || t.variant === 'restored-names') p.variant = t.variant;
  p.collection = t.collection;
  if (t.level === 'unit') { p.title = t.title; p.text = t.blockText; } else {
    p.remembered = t.sentence;
    if (t.blockText && t.blockText !== t.sentence) p.passage = t.blockText;
    if (t.kjv) p.kjv = t.kjv;
  }
  return p;
});
fs.writeFileSync(packetOut, JSON.stringify(packet, null, 1) + '\n');
const tally = (k) => fresh.reduce((o, t) => ((o[t[k]] = (o[t[k]] || 0) + 1), o), {});
console.log(fresh.length, 'fresh targets'); console.log(tally('group')); console.log(tally('style')); console.log(tally('level'));
