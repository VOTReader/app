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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { engine, unitKey } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The p-quantile of a sorted array (the value at index p*length, clamped to the last). */
export const quantile = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];

/** Right/guess counts kept at each floor from 0.60 to 0.80. */
export function floorTable(hits, guesses) {
  const rows = [];
  for (let f = 0.6; f <= 0.8001; f += 0.01) rows.push({ floor: +f.toFixed(2), rightKept: hits.filter((x) => x >= f).length, rightTotal: hits.length, guessesKept: guesses.filter((g) => g.top >= f).length, guessTotal: guesses.length });
  return rows;
}

async function main() {
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
  console.log('cosine of a right nearest: min', hits[0]?.toFixed(3), 'p10', quantile(hits, 0.1)?.toFixed(3), 'p25', quantile(hits, 0.25)?.toFixed(3), 'median', quantile(hits, 0.5)?.toFixed(3));
  for (const g of guess.sort((a, b) => b.top - a.top)) console.log('guess', g.top.toFixed(3), g.q, '->', g.what);
  console.log('\nfloor\tright kept\tguesses kept');
  for (const r of floorTable(hits, guess)) console.log(r.floor.toFixed(2) + '\t' + r.rightKept + '/' + r.rightTotal + '\t' + r.guessesKept + '/' + r.guessTotal);
  process.exit(0);
}

// The analysis runs only as a script: importing the module for its pure
// helpers must not start the engine (votreader-tests-2 item 12).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
