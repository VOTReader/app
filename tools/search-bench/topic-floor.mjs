/* The topic card's floor (search200 ideas F, 2026-10-22): where src/ui/components/srch-topic.js's TOPIC_MEANING_FLOOR
   comes from.
   ─────────────────────────────────────────────────────────────────
   The card names an Answers topic for a question only when the pick is sure (a confident wrong topic is worse than
   none). Read on OPEN cases only: the 500's and the tri's cases with held false, and the hunt's (all open). The fresh
   files are never opened and a held case is dropped as it is read, never printed. Every question-shaped open case is
   searched as the screen searches it (All, unscoped), and the Answers topic among its results the model is surest
   of (srch-topic.js topicCandidate) is the candidate. It is RIGHT when it is the case's target (or its alt) or quotes the target (srch-topic.js
   topicQuotes: the target sentence, or for a unit target any of its text), else WRONG.

   A unit target that is not an Answers topic is right when the topic cites it by title ("From “Tithing”"); an Answers
   target is right only as itself. The floor is the lowest cosine with no wrong topic at or above it, plus a margin.

     node tools/search-bench/topic-floor.mjs [--tsv out.tsv]   the candidates, then right and wrong shown per floor
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs as buildDocs, engine, unitKey, ASSETS } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const T = await import(pathToFileURL(path.join(ASSETS, 'src/ui/components/srch-topic.js')).href);

const open = (file, set) => JSON.parse(fs.readFileSync(path.join(HERE, file), 'utf8')).cases
  .filter((c) => c.held !== true).map((c) => ({ ...c, set }));
const cases = [...open('cases.json', '500'), ...open('tri/cases.json', 'tri'), ...open('hunt/cases.json', 'hunt')]
  .filter((c) => T.questionShaped(c.q));

const { E } = await engine();
const D = await buildDocs('nkjv');
const textOf = new Map();
const titleOf = new Map();
for (const d of D) { const k = unitKey(d); textOf.set(k, (textOf.get(k) || '') + ' ' + (d.text || '')); if (d.title && !titleOf.has(k)) titleOf.set(k, d.title); }
const plain = (s) => ' ' + String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[‘’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';

const rows = [];
const seenQ = new Set();
for (const c of cases) {
  if (seenQ.has(c.q + '|' + c.uk)) continue;
  seenQ.add(c.q + '|' + c.uk);
  const r = await E.search(c.q, { corpus: 'all', limit: 6000, perVolume: 400 });
  const cand = T.topicCandidate(r.results || []);
  if (!cand) { rows.push({ c, cand: null }); continue; }
  const tuk = unitKey(cand.entry.doc);
  const alts = [].concat(c.alt || []);
  let right = tuk === c.uk || alts.includes(tuk);
  if (!right && !String(c.uk).startsWith('answers/')) {
    // the reader's remembered sentence is in the topic, or the topic cites the target unit by its title
    const tp = plain(cand.entry.doc.text);
    if (c.sentence) right = T.topicQuotes(tp, c.sentence);
    else if (titleOf.get(c.uk)) right = tp.includes(' from ' + plain(titleOf.get(c.uk)).trim() + ' ');
  }
  const best = Math.max(0, ...(r.results || []).slice(0, 30).map((e) => e.meaning || 0));
  rows.push({ c, cand, tuk, right, gap: best - cand.meaning });
}

const withCand = rows.filter((x) => x.cand);
console.log(`question-shaped open cases: ${rows.length} (500 ${rows.filter((x) => x.c.set === '500').length}, tri ${rows.filter((x) => x.c.set === 'tri').length}, hunt ${rows.filter((x) => x.c.set === 'hunt').length}); with a topic the model ranked: ${withCand.length}`);
const lines = ['set\tfamily\tq\ttarget\ttopic\trank\tmeaning\tgap\tright'];
for (const x of withCand.sort((a, b) => b.cand.meaning - a.cand.meaning)) {
  lines.push([x.c.set, x.c.family || x.c.style || '', x.c.q, x.c.uk, x.tuk, x.cand.rank, x.cand.meaning.toFixed(4), x.gap.toFixed(4), x.right ? 'RIGHT' : 'wrong'].join('\t'));
}
if (val('--tsv')) fs.writeFileSync(val('--tsv'), lines.join('\n') + '\n');
else console.log(lines.join('\n'));

// Shown, right and wrong at each floor.
console.log('\nfloor\tshown\tright\twrong');
for (let f = 0.70; f <= 0.85001; f += 0.005) {
  const shown = withCand.filter((x) => x.cand.meaning >= f - 1e-9);
  console.log([f.toFixed(3), shown.length, shown.filter((x) => x.right).length, shown.filter((x) => !x.right).length].join('\t'));
}
const now = withCand.filter((x) => T.pickTopic(x.c.q, [x.cand.entry]));
console.log(`\nshipped floor ${T.TOPIC_MEANING_FLOOR}: shown ${now.length}, right ${now.filter((x) => x.right).length}, wrong ${now.filter((x) => !x.right).length}`);
for (const x of now.filter((y) => !y.right)) console.log('  wrong shown:', x.c.set, '|', x.c.q, '|', x.tuk);
process.exit(0);
