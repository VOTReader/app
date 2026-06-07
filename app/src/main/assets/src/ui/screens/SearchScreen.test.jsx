/* SRCH4 — snippet synonym-highlight term expansion.
   ────────────────────────────────────────────────
   expandSnippetTerms decides which words SrchSnippet marks. When synonym search
   is on, a verse surfaced by a synonym (search "shepherd" → a "pastor" verse)
   must highlight the matched synonym, not show it plain. Pure function → tested
   directly (no need to render the screen). */
import { describe, it, expect } from 'vitest';
import { expandSnippetTerms } from './SearchScreen.jsx';

const MAP = {
  shepherd: ['shepherd', 'pastor'],
  pastor: ['shepherd', 'pastor'],
};

describe('expandSnippetTerms (SRCH4)', () => {
  it('returns [] for a non-text parsed result (command / null)', () => {
    expect(expandSnippetTerms({ kind: 'command' }, ['x'], MAP, true)).toEqual([]);
    expect(expandSnippetTerms(null, ['x'], MAP, true)).toEqual([]);
  });

  it('returns just the literal terms when synonym search is off', () => {
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], MAP, false))
      .toEqual(['shepherd']);
  });

  it('returns just the literal terms when no synonym map is available', () => {
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], null, true))
      .toEqual(['shepherd']);
  });

  it('expands each literal term through its synonym group when on (matched word highlights)', () => {
    const out = expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], MAP, true);
    expect(out).toContain('shepherd');
    expect(out).toContain('pastor');
    expect(new Set(out).size).toBe(out.length); // de-duped
  });

  it('never synonym-expands the phrase (the engine exempts phrases)', () => {
    // 'shepherd' is the PHRASE, parsedTerms is empty → no synonym pulled in.
    expect(expandSnippetTerms({ kind: 'text', phrase: 'shepherd' }, [], MAP, true))
      .toEqual(['shepherd']);
  });
});
