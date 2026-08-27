/**
 * extract-audio-fragments — corpus text fragments for the read-along aligner.
 *
 * A thin CLI over tools/audio-fragments-lib.mjs, which owns the text domain.
 * Emits tools/_align-work/fragments-all.json:
 *   { "volKey:letterId": { format: 'A'|'B', fragments: [...] } }
 *
 * Format A (LetterView collections + Holy-Days 'letter' entries): CLAUSE
 * fragments {bi, cs, ce, text} — offsets in the block's DOM textContent
 * domain (exactly what ReadAlongHighlight paints through the CSS Custom
 * Highlight API). Poetry fragments are per rendered line. heading /
 * prophecy-group / image blocks are skipped — letters that lean on them
 * surface as low coverage in the aligner's QA and land on the review list.
 *
 * Format B (WTLB 1/2, The Blessed, Holy-Days 'wtlb' entries): PARAGRAPH
 * fragments {pi, text} — painted whole-paragraph (cs/ce sentinel -1) because
 * the rendered char domain shifts with the footnotesMode setting; the match
 * text strips the inline markup ({{ref:X}} keeps X's words — the readers
 * speak the cites, which anchors the matcher).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CORPUS_FILES, buildCollections, formatAFragments, formatBFragments, fragmentsFor } from './audio-fragments-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const OUTDIR = resolve(HERE, '_align-work');

const ctx = {};
for (const f of CORPUS_FILES) {
  runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', f), 'utf8'), ctx, { filename: f });
}
const { A: A_COLS, B: B_COLS, holyDays } = buildCollections(ctx);

mkdirSync(OUTDIR, { recursive: true });
const result = {};
let a = 0, b = 0;
for (const [vk, arr] of Object.entries(A_COLS)) {
  for (const letter of arr.filter(Boolean)) {
    result[vk + ':' + letter.id] = { format: 'A', fragments: formatAFragments(letter) };
    a++;
  }
}
for (const [vk, arr] of Object.entries(B_COLS)) {
  for (const entry of arr.filter(Boolean)) {
    result[vk + ':' + entry.id] = { format: 'B', fragments: formatBFragments(entry) };
    b++;
  }
}
// Holy Days: ghost entries carry either shape.
for (const e of holyDays) {
  result['holydays:' + e.id] = fragmentsFor(e);
  if (e.blocks) a++; else b++;
}
writeFileSync(resolve(OUTDIR, 'fragments-all.json'), JSON.stringify(result));
console.log(`fragments-all.json: ${Object.keys(result).length} letters (A:${a} B:${b})`);
