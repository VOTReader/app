// @ts-nocheck
/**
 * v2 does not load app.css, so the main screens it hosts whole (the Scripture Web, Answers) bring main's rules along in
 * copies: src/v2/scripture-web.css and src/v2/answers.css. A merge of main never touched those copies, so every CSS fix
 * main made there silently skipped v2 (myweb mw15, 2026-10-22: sweb's compact-sheet chips, aae6217de's chrome vars).
 *
 * This writes the copied part of each file (between its @generated begin/end comments) from app.css; the parts around it
 * (the kit's tokens, v2's own rules) stay hand-written. Blocks are found by the text of main's own section comments,
 * never by line numbers, and come over line for line with comments dropped. src/v2/main-css-copies.test.js fails while a
 * copy differs from what this would write.
 *
 *   node tools/gen-v2-css.mjs          rewrite the copies
 *   node tools/gen-v2-css.mjs --check  exit 1 when a copy is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets');
const BEGIN = '/* @generated begin: tools/gen-v2-css.mjs copies this from app.css. Edit app.css (or the generator), never here. */';
const END = '/* @generated end */';

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** A file as LF text (a Windows checkout may hold CRLF). */
export const read = (rel) => readFileSync(resolve(ASSETS, rel), 'utf8').replace(/\r\n/g, '\n');
const squash = (s) => s.split(/\s+/).filter(Boolean).join(' ');

/** app.css from the start of the comment holding `from` up to the comment holding `to`, comments dropped, one trimmed
 *  line per source line. */
function block(app, from, to) {
  const a = app.indexOf(from);
  const b = app.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`gen-v2-css: app.css has no "${a < 0 ? from : to}" any more; update the generator's markers`);
  const text = app.slice(app.lastIndexOf('/*', a), app.lastIndexOf('/*', b));
  return stripComments(text).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

/** Rules as a tree: { prelude, body } for a rule, { prelude, children } for a grouping at-rule. */
function parse(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const semi = css.indexOf(';', i);
    if (semi >= 0 && semi < open && !css.slice(i, semi).includes('}')) { i = semi + 1; continue; } // @import-like
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    const prelude = squash(css.slice(i, open).replace(/^[\s}]+/, ''));
    const body = css.slice(open + 1, j - 1);
    out.push(/^@(media|supports|container|layer)\b/.test(prelude) ? { prelude, children: parse(body) } : { prelude, body });
    i = j;
  }
  return out;
}

/** Every rule (at any depth, inside its @media) whose selector matches `re`, one line each. */
function pick(tree, re, wrap = []) {
  const out = [];
  for (const n of tree) {
    if (n.children) out.push(...pick(n.children, re, [...wrap, n.prelude]));
    else if (re.test(n.prelude)) out.push(wrap.reduceRight((rule, w) => `${w} { ${rule} }`, `${n.prelude} { ${squash(n.body)} }`));
  }
  return out;
}

const cinzelToKit = (css) => css.replace(/font-family:\s*'Cinzel',\s*serif;/g, 'font-family:var(--font);');

export const COPIES = {
  // main's whole Scripture Web block (bundle-f), up to the tour that follows it
  'src/v2/scripture-web.css': (app) => block(app, 'THE SCRIPTURE WEB (bundle-f)', '"Show me around"'),
  'src/v2/answers.css': (app) => {
    const ans = block(app, 'ANSWERS ONLY GOD CAN GIVE', 'A search landing in a Format B entry')
      .replace(/body\.light /g, '[data-page="paper"] ')
      .split('\n').filter((l) => !l.startsWith('body.no-bookmark-nav')).join('\n'); // a body class v2 never sets
    // the main rules Answers leans on: the kit sheet and its handle, the switch, the screen-reader-only words
    const tree = parse(stripComments(app));
    const lean = [
      /^\.select-sheet(-backdrop)?(\.open)?$|^\.select-sheet::/, /^@keyframes selectSheet/,
      /^\.sheet-handle/, /^\.settings-toggle/, /^\.sr-only$/,
    ].flatMap((re) => pick(tree, re));
    return cinzelToKit(ans + '\n' + lean.join('\n'));
  },
};

/** The file `rel` as it should read: its hand-written parts kept, the generated part written fresh from app.css. */
export function expected(rel, app = read('app.css')) {
  const cur = read(rel);
  const a = cur.indexOf(BEGIN);
  const b = cur.indexOf(END);
  if (a < 0 || b < a) throw new Error(`gen-v2-css: ${rel} lost its @generated begin/end comments`);
  const css = COPIES[rel](app.replace(/\r\n/g, '\n'));
  if (/Cinzel/.test(css) && rel.includes('answers')) throw new Error('gen-v2-css: Cinzel left in the Answers copy');
  return cur.slice(0, a + BEGIN.length) + '\n' + css + '\n' + cur.slice(b);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const rel of Object.keys(COPIES)) {
    const want = expected(rel);
    const path = resolve(ASSETS, rel);
    if (read(rel) === want) continue;
    stale++;
    if (check) console.log(`stale: ${rel}`);
    else { writeFileSync(path, want); console.log(`wrote ${rel}`); }
  }
  if (check && stale) process.exit(1);
}
