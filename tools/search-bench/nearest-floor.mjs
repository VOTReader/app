/* The empty screen's meaning floor (search200 ideas G, 2026-10-22): where src/ui/components/srch-empty.js's
   NEAREST_MEANING_FLOOR comes from.
   ─────────────────────────────────────────────────────────────────
   A search that found nothing lists the texts the model ranks nearest what was typed (engine.js nearest), only above a
   floor: under it the model is guessing. Read on OPEN cases only (the 500's and the tri's with held false, and the
   hunt's; the fresh files are never opened, a held case is dropped as it is read): the cases a reader wrote by what a
   text means (gist, paraphrase, topical), each searched by meaning alone, give the cosine of a right nearest text (the
   target among the first three); queries that mean nothing here (nonsense, and words no text is about) give the
   cosine of a guess.

     node tools/search-bench/nearest-floor.mjs    each side's cosines, then how many of each a floor keeps
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine, unitKey } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEANT = new Set(['gist', 'paraphrase', 'topical']);
const open = (file) => JSON.parse(fs.readFileSync(path.join(HERE, file), 'utf8')).cases
  .filter((c) => c.held !== true && (MEANT.has(c.style) || MEANT.has(c.family)));
const cases = [...open('cases.json'), ...open('tri/cases.json'), ...open('hunt/cases.json')];
// Nothing in the corpus is about these: what the model gives a query it cannot place.
const GUESSES = ['zxqvw', 'asdfgh', 'qwerty uiop', 'lorem ipsum dolor', 'photosynthesis', 'smartphone', 'quantum xylophone telescope',
  'bitcoin price', 'carburetor repair', 'wifi password', 'pizza delivery', 'football score', 'xkcd', 'jjjjjj', 'blorptastic',
  'semiconductor lithography', 'tax return deadline', 'netflix', 'mitochondria', 'algebra homework'];

const { E } = await engine();
const right = [];
for (const c of cases) {
  const n = await E.nearest(c.q, { limit: 3 });
  if (!n.length) continue;
  const hit = n.some((e) => unitKey(e.doc) === c.uk || unitKey(e.doc).replace('matthew-study/', 'bible/') === String(c.uk).replace('matthew-study/', 'bible/'));
  right.push({ top: n[0].meaning, hit });
}
const guess = [];
for (const q of GUESSES) {
  const n = await E.nearest(q, { limit: 3 });
  if (n.length) guess.push({ q, top: n[0].meaning, what: n.map((e) => e.doc.ref || e.doc.title).join(' | ') });
}
const hits = right.filter((x) => x.hit).map((x) => x.top).sort((a, b) => a - b);
console.log(`meant cases: ${right.length}, target in the nearest three: ${hits.length}`);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log('cosine of a right nearest: min', hits[0]?.toFixed(3), 'p10', q(hits, 0.1)?.toFixed(3), 'p25', q(hits, 0.25)?.toFixed(3), 'median', q(hits, 0.5)?.toFixed(3));
for (const g of guess.sort((a, b) => b.top - a.top)) console.log('guess', g.top.toFixed(3), g.q, '->', g.what);
console.log('\nfloor\tright kept\tguesses kept');
for (let f = 0.6; f <= 0.8001; f += 0.01) console.log(f.toFixed(2) + '\t' + hits.filter((x) => x >= f).length + '/' + hits.length + '\t' + guess.filter((g) => g.top >= f).length + '/' + guess.length);
process.exit(0);
