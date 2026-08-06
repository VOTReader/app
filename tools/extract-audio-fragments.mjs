/**
 * extract-audio-fragments — corpus text fragments for the read-along aligner.
 *
 * Emits tools/_align-work/fragments-all.json:
 *   { "volKey:letterId": { format: 'A'|'B', fragments: [...] } }
 *
 * Format A (LetterView collections + Holy-Days 'letter' entries): SENTENCE
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

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const OUTDIR = resolve(HERE, '_align-work');

const ctx = {};
for (const f of [
  'volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js',
  'volume-five.js', 'volume-six.js', 'volume-seven.js',
  'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
  'wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'holy-days.js',
]) runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', f), 'utf8'), ctx, { filename: f });

const A_COLS = {
  one: [ctx.LETTERS_V1_PREFACE, ...ctx.LETTERS_V1], two: ctx.LETTERS,
  three: [ctx.LETTERS_V3_PREFACE, ...ctx.LETTERS_V3], four: [ctx.LETTERS_V4_PREFACE, ...ctx.LETTERS_V4],
  five: [ctx.LETTERS_V5_PREFACE, ...ctx.LETTERS_V5], six: [ctx.LETTERS_V6_PREFACE, ...ctx.LETTERS_V6],
  seven: [ctx.LETTERS_V7_PREFACE, ...ctx.LETTERS_V7],
  timothy: [ctx.LETTERS_TIMOTHY_PREFACE, ...ctx.LETTERS_TIMOTHY],
  flock: [ctx.LETTERS_FLOCK_PREFACE, ...ctx.LETTERS_FLOCK],
  rebuke: [ctx.LETTERS_REBUKE_PREFACE, ...ctx.LETTERS_REBUKE],
};
const B_COLS = { wtlb1: ctx.WTLB_ONE, wtlb2: ctx.WTLB_TWO, blessed: ctx.THE_BLESSED };

const segText = (s) => (!s || s.t === 'stanza-break') ? '' : String(s.v == null ? '' : s.v);

function formatAFragments(letter) {
  const out = [];
  (letter.blocks || []).forEach((b, bi) => {
    if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') {
      const text = (b.segments || []).map(segText).join('');
      const re = /[^.!?…]+[.!?…]*(?:["”’)\]]+)?(?:\s+|$)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const trimmed = m[0].replace(/\s+$/, '');
        if (trimmed.trim().length >= 2) out.push({ bi, cs: m.index, ce: m.index + trimmed.length, text: trimmed });
      }
    } else if (b.type === 'poetry') {
      let pos = 0;
      const push = (lt) => {
        if (lt.trim().length >= 2) out.push({ bi, cs: pos, ce: pos + lt.length, text: lt });
        pos += lt.length;
      };
      if (b.lines) for (const line of b.lines) push((line || []).map(segText).join(''));
      else for (const seg of (b.segments || [])) push(segText(seg).replace(/^\n/, ''));
    } else if (b.type === 'closing') {
      const t = String(b.text || '');
      if (t.trim().length >= 2) out.push({ bi, cs: 0, ce: t.length, text: t });
    }
  });
  return out;
}

function formatBFragments(entry) {
  const out = [];
  (entry.paragraphs || []).forEach((p, pi) => {
    let t = String(p.text || '');
    t = t.replace(/\{\{ref:([^}]+)\}\}/g, ' $1 ')
         .replace(/\{\{nav:[^}]+\}\}/g, ' ')
         .replace(/\*\*|__|[_*]/g, ' ')
         .replace(/[\[\]~†]/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();
    if (t.length >= 2) out.push({ pi, text: t });
  });
  return out;
}

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
for (const e of ctx.HOLY_DAYS.filter(Boolean)) {
  const key = 'holydays:' + e.id;
  result[key] = e.blocks
    ? { format: 'A', fragments: formatAFragments(e) }
    : { format: 'B', fragments: formatBFragments(e) };
  if (e.blocks) a++; else b++;
}
writeFileSync(resolve(OUTDIR, 'fragments-all.json'), JSON.stringify(result));
console.log(`fragments-all.json: ${Object.keys(result).length} letters (A:${a} B:${b})`);
