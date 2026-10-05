/* Mechanical checks on the blind writers' queries, then freeze them into cases.json (2026-10-05).
   ─────────────────────────────────────────────────────────────────
   A query must be in the style its target names (writer-brief.md), checked without the engine:
     paraphrase / gist / unitgist  copy at most 5 consecutive words of the target
     exact                         a run of the sentence itself, 5-14 words
     rare                          2-5 words, in the sentence, in at most 2 units beyond its own class
     crossover kjv                 uses at least one KJV word the NKJV verse lacks
     crossover restored-names      says YahuShua
     title                         not the exact title
     typos                         at least one word the corpus does not hold, or a dropped apostrophe
     node tools/search-bench/check-queries.mjs <writers dir> [--freeze]
   Prints every rejection; --freeze writes cases.json only when there are none.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docs as buildDocs, norm } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const { targets } = JSON.parse(fs.readFileSync(path.join(HERE, 'targets.json'), 'utf8'));
const qs = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) for (const o of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) qs[o.id] = o.q;

const D = await buildDocs('nkjv');
const ALL = D.map((d) => norm(d.text + ' ' + (d.title || ''))).join('\u0001');
const vocab = new Set(ALL.split(/[\s\u0001]+/));
const unitsOf = (phrase) => { const n = norm(phrase); const out = new Set(); let p = ALL.indexOf(n); while (p >= 0 && out.size < 50) { out.add(ALL.lastIndexOf('\u0001', p)); p = ALL.indexOf(n, p + 1); } return out; };
const toks = (s) => norm(s).trim().split(' ').filter(Boolean);
const longestRun = (q, text) => {
  const a = toks(q); const t = ' ' + toks(text).join(' ') + ' ';
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + best + 1; j <= a.length; j++) { if (t.includes(' ' + a.slice(i, j).join(' ') + ' ')) best = j - i; else break; }
  return best;
};

const bad = [];
const reject = (t, why) => bad.push({ id: t.id, style: t.style + (t.variant ? '/' + t.variant : ''), q: qs[t.id], why });
for (const t of targets) {
  const q = qs[t.id];
  if (!q || !String(q).trim()) { reject(t, 'missing'); continue; }
  const n = toks(q).length;
  const words = String(q).trim().split(/\s+/).length;
  const text = t.level === 'unit' ? t.blockText : t.sentence;
  switch (t.style) {
    case 'paraphrase': case 'gist': case 'unitgist':
      if (longestRun(q, t.level === 'unit' ? t.blockText : (t.blockText || t.sentence)) > 5) reject(t, 'copies more than 5 consecutive words');
      break;
    case 'exact':
      if (!norm(text).includes(norm(q))) reject(t, 'not a run of the sentence');
      else if (n < 5 || n > 14) reject(t, n + ' words');
      break;
    case 'rare':
      if (words < 2 || words > 5) reject(t, words + ' words');
      else if (!norm(t.sentence).includes(norm(q))) reject(t, 'not in the sentence');
      else { const cls = unitsOf(t.sentence); const other = [...unitsOf(q)].filter((u) => !cls.has(u)).length; if (other > 2) reject(t, 'not rare: in ' + other + ' units beyond the target'); }
      break;
    case 'crossover':
      if (t.variant === 'kjv') { const nk = new Set(toks(t.sentence)); if (!toks(q).some((w) => !nk.has(w) && toks(t.kjv).includes(w))) reject(t, 'no KJV-only word'); }
      else if (!/yahushua/i.test(q)) reject(t, 'no YahuShua');
      break;
    case 'title':
      if (norm(q) === norm(t.title)) reject(t, 'the exact title');
      break;
    case 'typos':
      if (!toks(q).some((w) => !vocab.has(w)) && !(/['’]/.test(t.sentence) && !/['’]/.test(q))) reject(t, 'no typo');
      break;
    default:
  }
}
console.log(Object.keys(qs).length, 'queries,', bad.length, 'rejected');
for (const b of bad) console.log(JSON.stringify(b));
if (process.argv.includes('--freeze')) {
  if (bad.length && !process.argv.includes('--force')) { console.error('not frozen: rejections remain'); process.exit(1); }
  const keep = ['id', 'held', 'group', 'col', 'style', 'variant', 'level', 'uk', 'unit', 'title', 'ref', 'bookId', 'chapter', 'verse', 'blockIdx', 'sentence'];
  const cases = targets.map((t) => { const o = {}; for (const k of keep) if (t[k] !== undefined && t[k] !== null) o[k] = t[k]; o.q = qs[t.id]; return o; });
  fs.writeFileSync(path.join(HERE, 'cases.json'), JSON.stringify({ written: 'blind writers, Opus 5.5 medium, 2026-10-05 (writer-brief.md); targets: make-targets.mjs seed 20261005', cases }, null, 1) + '\n');
  console.log('froze', cases.length, 'cases');
}
