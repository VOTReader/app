/* The Answers question set (search200 h8, 2026-11-04): every Answers Only God Can Give topic title and every
   section heading, typed the ways a reader asks for it, each with the landing the corpus already knows.
   ─────────────────────────────────────────────────────────────────
   Deterministic: built from src/data/answers.js (titles) and src/data/answers-meta.js (section headings) alone,
   no engine, no hand edits. Per title or heading, up to three phrasings (identical ones dropped):
     words     the title or heading as written, lower case, punctuation out ("regarding the two witnesses")
     question  "what does god say about <subject>" / "what does the bible say about <subject>" (alternating), or
               the heading itself when it is already a question
     short     its first 2-3 subject words ("two witnesses")
   A title's target is its topic; a heading's is its topic AND its section (the paragraphs from the heading to the
   next heading), and a heading the corpus repeats targets every topic that carries it. Skipped: the Main Page,
   the site's synthetic "Section One" headings, link and study headings ("Also See", "Bible Study"), the Trumpet
   Call sections, and a heading that is only a verse reference.

   node tools/answers-questions/build.mjs            write tools/answers-questions/cases.json
   node tools/answers-questions/build.mjs --check    exit 1 when cases.json is not what the corpus builds
   ─────────────────────────────────────────────────────────────────── */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../../app/src/main/assets');
const OUT = path.join(HERE, 'cases.json');

const g = /** @type {any} */ (globalThis);
g.window = g;
for (const f of ['answers.js', 'answers-meta.js']) vm.runInThisContext(fs.readFileSync(path.join(ASSETS, 'src/data', f), 'utf8'), { filename: f });
const { answersShortTitle, ANSWERS_MAIN_PAGE_ID } = await import(pathToFileURL(path.join(ASSETS, 'src/utils/answers-shelves.js')).href);

/** Words a reader drops when typing a subject short. */
const FILLER = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'by', 'with', 'from', 'is', 'are', 'be', 'his', 'her', 'their',
  'those', 'who', 'which', 'that', 'this', 'these', 'as', 'at', 'it', 'its', 'not', 'no', 'do', 'does', 'i', 'my', 'me', 'you', 'your', 'we', 'our', 'all']);
const SKIP_HEAD = /^(?:also see|see:?|bible\/letter study|bible study|letter study|audio|video|charts?|be a part of the trumpet call)\b/i;
const VERSE_ONLY = /^[1-3]?\s*[a-z]+\.?\s+\d+:\d+(?:[-–]\d+)?$/i;

/** Lower case, curly quotes straight, punctuation to spaces (an apostrophe inside a word kept). */
function typed(s) {
  return String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”"]/g, ' ')
    .replace(/[^a-z0-9',]+/g, ' ').replace(/,(?!\d)/g, ' ').replace(/(^|\s)'+|'+(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();
}

function shortForm(subject) {
  const ws = typed(subject).split(' ').filter((w) => w && !FILLER.has(w));
  return ws.slice(0, ws.length > 3 ? 2 : 3).join(' ');
}

function phrasings(text, subject, i) {
  const words = typed(text);
  const isQuestion = /\?\s*["”']?\s*$/.test(String(text));
  const question = isQuestion ? words : (i % 2 ? 'what does the bible say about ' : 'what does god say about ') + typed(subject);
  const out = [['words', words], ['question', question], ['short', shortForm(subject)]];
  const seen = new Set();
  return out.filter(([, q]) => q && q.replace(/[^a-z0-9]/g, '').length >= 2 && !seen.has(q) && seen.add(q));
}

const cases = [];
let ti = 0;
for (const en of g.ANSWERS) {
  if (!en || en.id === ANSWERS_MAIN_PAGE_ID) continue;
  const subject = answersShortTitle(en.title);
  for (const [form, q] of phrasings(en.title, subject, ti)) cases.push({ id: `t-${en.id}-${form}`, kind: 'title', form, q, targets: [{ id: en.id }] });
  ti++;
}

// Headings: one item per distinct heading text; every topic that carries it is a right landing.
const heads = new Map();
for (const en of g.ANSWERS) {
  if (!en || en.id === ANSWERS_MAIN_PAGE_ID) continue;
  const secs = ((g.ANSWERS_META[en.id] || {}).sections) || [];
  secs.forEach((s, k) => {
    const title = String(s.title || '').replace(/^\s*-\s*/, '').trim();
    if (s.synthetic || !title || SKIP_HEAD.test(title) || VERSE_ONLY.test(title)) return;
    const end = k + 1 < secs.length ? secs[k + 1].at : (en.paragraphs || []).length;
    const key = typed(title);
    if (!heads.has(key)) heads.set(key, { title, targets: [] });
    heads.get(key).targets.push({ id: en.id, from: s.at, to: end });
  });
}
let hi = 0;
for (const [key, h] of heads) {
  const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  for (const [form, q] of phrasings(h.title, h.title, hi)) cases.push({ id: `s-${slug}-${form}`, kind: 'section', form, q, heading: h.title, targets: h.targets });
  hi++;
}

const ids = new Set();
for (const c of cases) { let id = c.id; for (let n = 2; ids.has(id); n++) id = c.id + '-' + n; c.id = id; ids.add(id); }

const json = JSON.stringify({
  made: 'tools/answers-questions/build.mjs from src/data/answers.js + answers-meta.js (do not hand-edit)',
  titles: ti, headings: hi, cases,
}, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== json) { console.error('answers-questions: cases.json is stale; run node tools/answers-questions/build.mjs'); process.exit(1); }
  console.log(`answers-questions: cases.json current (${cases.length} cases)`);
} else {
  fs.writeFileSync(OUT, json);
  console.log(`answers-questions: ${ti} titles, ${hi} headings, ${cases.length} cases -> ${path.relative(process.cwd(), OUT)}`);
}
