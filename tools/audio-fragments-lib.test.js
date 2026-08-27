/* audio-fragments-lib — the corpus-side text domain read-along paints through.
   ─────────────────────────────────────────────────────────────────────────
   Two jobs here, and the second is the one that matters.

   The unit tests pin the sentence scanner against the three real shapes that
   used to break it. All three are the SAME failure: a terminator that never
   reaches whitespace, so the regex backtracked to the previous space and left
   the remainder to open the next fragment mid-token. In the corpus that meant
   `El!` was never highlighted at all and `U.S.A.` was split across a gap.

   The corpus test pins the INVARIANT, and it is the load-bearing one: every
   fragment starts at the block start, immediately after whitespace, or at a
   poetry line join, and ends symmetrically, carrying no edge whitespace. That
   is exactly what tools/check-audio-sync.js gates the SHIPPED timings on. If
   the extractor ever emits a fragment the gate would reject, the aligner and
   the gate have drifted apart and every subsequent alignment ships data that
   cannot pass — so this test is what keeps those two honest about each other. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  CORPUS_FILES, buildCollections, blockDomainText, sentenceSpans,
  clauseSplit, formatAFragments, CLAUSE_SPLIT_TOKENS,
} from './audio-fragments-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'src', 'data');

const spansOf = (t) => sentenceSpans(t).map(([s, e]) => t.slice(s, e));

describe('sentenceSpans — a terminator only ends a sentence when whitespace follows', () => {
  it('splits ordinary prose at every terminator', () => {
    expect(spansOf('One thing. Two things! Three?')).toEqual(['One thing.', 'Two things!', 'Three?']);
  });

  it('does not split inside an abbreviation (the U.S.A. case)', () => {
    // Was: "Is the" | "A." — "U.S." belonged to no fragment and never painted.
    // The trailing period of "U.S.A." IS followed by a space, so only the
    // capitalization rule can tell it from a real sentence end.
    expect(spansOf('Is the U.S.A. still a nation? Yes.'))
      .toEqual(['Is the U.S.A. still a nation?', 'Yes.']);
  });

  it('keeps a quoted outburst with the sentence it sits inside', () => {
    // Was split after the exclamation, washing "Yet you cry, “False!”" alone
    // and leaving "because you find..." to open the next fragment mid-thought.
    expect(spansOf('Yet you cry, “False!” because you find them hard. So be it.'))
      .toEqual(['Yet you cry, “False!” because you find them hard.', 'So be it.']);
  });

  it('does not split inside a domain name (the GodOnline.com case)', () => {
    expect(spansOf('Visit GodOnline.com today. Then go.'))
      .toEqual(['Visit GodOnline.com today.', 'Then go.']);
  });

  it('keeps a closing quote with its sentence when punctuation follows it', () => {
    // Was: "who cry, “Immanu" | "”, then break..." — `El!` painted by nobody,
    // and the next clause opened on an orphaned quote mark.
    expect(spansOf('Woe to those who cry, “Immanu El!”, then break My Commandments. So it is.'))
      .toEqual(['Woe to those who cry, “Immanu El!”, then break My Commandments.', 'So it is.']);
  });

  it('lets a footnote digit ride its sentence tail', () => {
    expect(spansOf('as it is written.1 I AM THE LORD.'))
      .toEqual(['as it is written.1', 'I AM THE LORD.']);
  });

  it('emits the trailing remainder of an unterminated block', () => {
    expect(spansOf('A finished thought. And one still running'))
      .toEqual(['A finished thought.', 'And one still running']);
  });

  it('never carries leading or trailing whitespace', () => {
    for (const s of spansOf('  One.   Two.   Three.  ')) expect(s).toBe(s.trim());
  });
});

describe('blockDomainText — poetry lines concatenate with no separator', () => {
  const block = {
    type: 'poetry',
    lines: [
      [{ t: 'text', v: 'And thoroughly purge away their dross' }],
      [{ t: 'text', v: 'And take away all their alloy' }],
    ],
  };

  it('joins lines with nothing between them', () => {
    const { text } = blockDomainText(block);
    expect(text).toBe('And thoroughly purge away their drossAnd take away all their alloy');
  });

  it('reports the join as a line bound, so a boundary there is legal', () => {
    const { lineBounds } = blockDomainText(block);
    expect([...lineBounds]).toEqual([37]);
  });

  it('does not count the block end as an interior join', () => {
    const { text, lineBounds } = blockDomainText(block);
    expect(lineBounds.has(text.length)).toBe(false);
  });

  it('returns null for a block that renders no highlightable container', () => {
    expect(blockDomainText({ type: 'heading', text: 'A Heading' })).toBeNull();
    expect(blockDomainText(null)).toBeNull();
  });
});

describe('clauseSplit — one thought at a time, never below three tokens a side', () => {
  it('leaves a short sentence whole', () => {
    const t = 'Jesus wept.';
    expect(clauseSplit(t, 0)).toEqual([{ cs: 0, ce: t.length, text: t }]);
  });

  it('splits a long cascade at its semicolon', () => {
    const t = 'I shall gather them from the four winds of heaven; and they shall know that I am God.';
    const pieces = clauseSplit(t, 0);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0].text.endsWith(';')).toBe(true);
    expect(pieces.map((p) => t.slice(p.cs, p.ce)).join(' ')).toBe(t);
  });

  it('offsets are absolute, carrying the base through', () => {
    const t = 'I shall gather them from the four winds of heaven; and they shall know that I am God.';
    expect(clauseSplit(t, 100)[0].cs).toBe(100);
  });

  it('never cuts a piece below three tokens', () => {
    const t = 'Yes; and so it shall be done, for I have spoken it, and it shall surely come to pass.';
    for (const p of clauseSplit(t, 0)) {
      expect(p.text.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(3);
    }
    expect(CLAUSE_SPLIT_TOKENS).toBe(12);
  });
});

describe('THE INVARIANT — every corpus fragment is one check-audio-sync would accept', () => {
  const ctx = {};
  for (const f of CORPUS_FILES) {
    runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), ctx, { filename: f });
  }
  const { A, holyDays } = buildCollections(ctx);
  const items = [];
  for (const arr of Object.values(A)) for (const it of arr.filter(Boolean)) items.push(it);
  for (const e of holyDays) if (e.blocks) items.push(e);

  /** The exact predicate tools/check-audio-sync.js gates shipped rows on. */
  const clean = (text, cs, ce, lineBounds) => (
    cs >= 0 && ce > cs && ce <= text.length
    && (cs === 0 || lineBounds.has(cs) || /\s/.test(text[cs - 1]))
    && (ce === text.length || lineBounds.has(ce) || /\s/.test(text[ce]))
    && !/^\s|\s$/.test(text.slice(cs, ce))
    && /[A-Za-z]/.test(text.slice(cs, ce))
  );

  it('holds for every Format-A fragment in the whole corpus', () => {
    const bad = [];
    let n = 0;
    for (const item of items) {
      const cache = new Map();
      for (const f of formatAFragments(item)) {
        if (!cache.has(f.bi)) cache.set(f.bi, blockDomainText((item.blocks || [])[f.bi]));
        const dom = cache.get(f.bi);
        if (!dom) { bad.push(`${item.id} bi=${f.bi} names an unrenderable block`); continue; }
        n++;
        if (!clean(dom.text, f.cs, f.ce, dom.lineBounds)) {
          bad.push(`${item.id} bi=${f.bi} [${f.cs},${f.ce}) ${JSON.stringify(f.text.slice(0, 40))}`);
        }
      }
    }
    expect(n).toBeGreaterThan(15000);            // the corpus is actually loaded
    expect(bad).toEqual([]);
  });

  it('a fragment text always equals the characters its offsets select', () => {
    const bad = [];
    for (const item of items) {
      const cache = new Map();
      for (const f of formatAFragments(item)) {
        if (!cache.has(f.bi)) cache.set(f.bi, blockDomainText((item.blocks || [])[f.bi]));
        const dom = cache.get(f.bi);
        if (dom && dom.text.slice(f.cs, f.ce) !== f.text) bad.push(`${item.id} bi=${f.bi}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
