/* text-plain (Corbin 2026-11-26 20:02: "Get rid of stylistic flourishe like the line in the text. App stuff is okay
   but nothing in the text besides footnotes and references and normal stuff like that"). Each block pins one
   decoration the app drew inside reading text as gone. The census of what was found and why the rest stayed:
   D:/Swarm/lanes/fix-ui-a/out/text-plain/CENSUS.md. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Split at top-level (outside parentheses) characters matching `at`. */
function splitTop(s, at) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && at.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every rule (inside @media too) one of whose selectors styles an element carrying `cls` (its subject, the last
    compound; :has()/:not() arguments do not count). `pseudo` narrows to that pseudo-element (e.g. '::before'). */
function rulesFor(cls, pseudo = '') {
  const out = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  const has = new RegExp('\\.' + cls + '(?![\\w-])');
  while ((m = re.exec(CSS))) {
    const prelude = m[1].trim();
    if (prelude.startsWith('@')) continue;
    for (const sel of splitTop(prelude, /,/)) {
      const subject = splitTop(sel.replace(/\s*([>+~])\s*/g, ' $1 '), /[\s>+~]/).pop() || '';
      const own = subject.replace(/:(has|not)\((?:[^()]|\([^()]*\))*\)/g, '');
      if (!has.test(own)) continue;
      if (pseudo ? !own.includes(pseudo) : /::(before|after)/.test(own)) continue;
      out.push({ sel, block: m[2] }); break;
    }
  }
  return out;
}

/** The value of `prop` a block declares that draws a line (not 0 / none), else null. */
function drawnLine(block, side) {
  const props = side ? ['border', 'border-' + side, 'border-' + side + '-width', 'border-' + side + '-style'] : ['border'];
  for (const decl of block.split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    const p = decl.slice(0, i).trim(); const v = decl.slice(i + 1).trim();
    if (props.includes(p) && !/^(0|0px|none|hidden)(\s|$)/.test(v)) return p + ': ' + v;
  }
  return null;
}

const lines = (cls, side, pseudo) => rulesFor(cls, pseudo).map((r) => [r.sel, drawnLine(r.block, side)]).filter((x) => x[1]);

describe('D02: a letter\'s preamble has no hairline above it', () => {
  it('.meta-preamble draws no top border', () => {
    expect(rulesFor('meta-preamble').length).toBeGreaterThan(0);
    expect(lines('meta-preamble', 'top')).toEqual([]);
  });
});

describe('D03: a section intro has no gold bar down its left side', () => {
  it('.section-intro-quote draws no left border and keeps no indent that only made room for one', () => {
    const rules = rulesFor('section-intro-quote');
    expect(rules.length).toBeGreaterThan(0);
    expect(lines('section-intro-quote', 'left')).toEqual([]);
    for (const r of rules) expect(r.block).not.toMatch(/padding(-left)?:[^;]*var\(--sp-4\)/);
  });
});

describe('D06: a Bible section heading is not underlined', () => {
  it('.section-heading draws no bottom border', () => {
    expect(rulesFor('section-heading').length).toBeGreaterThan(0);
    expect(lines('section-heading', 'bottom')).toEqual([]);
  });
});

describe('D10: an Answers section heading has no hairline above it', () => {
  it('.ans-sh draws no top border', () => {
    expect(rulesFor('ans-sh').length).toBeGreaterThan(0);
    expect(lines('ans-sh', 'top')).toEqual([]);
  });
  it('the row just above a heading keeps its own bottom line (it was dropped only because the heading drew one)', () => {
    const dropped = [];
    const re = /([^{}]+)\{([^{}]*)\}/g; let m;
    while ((m = re.exec(CSS))) if (/\+\s*(\.ans-reading\s*>\s*)?\.ans-sh/.test(m[1]) && /border-bottom:\s*0/.test(m[2])) dropped.push(m[1].trim());
    expect(dropped).toEqual([]);
  });
});
