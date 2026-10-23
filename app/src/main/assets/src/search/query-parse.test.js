import { describe, it, expect } from 'vitest';
import { parseTextQuery } from './query-parse.js';

describe('parseTextQuery', () => {
  it('parses a fully-quoted phrase', () => {
    const r = parseTextQuery('"the lord is my shepherd"');
    expect(r.phrase).toBe('the lord is my shepherd');
    expect(r.terms).toEqual([]);
  });

  it('parses bare terms (lowercased)', () => {
    const r = parseTextQuery('Mercy Grace');
    expect(r.phrase).toBeNull();
    expect(r.terms).toEqual(['mercy', 'grace']);
  });

  it('parses +required and -excluded operators', () => {
    const r = parseTextQuery('grace +mercy -wrath');
    expect(r.terms).toEqual(['grace']);
    expect(r.must).toEqual(['mercy']);
    expect(r.mustNot).toEqual(['wrath']);
  });

  it('eats boolean glue words (AND/OR/NOT)', () => {
    const r = parseTextQuery('mercy AND grace OR peace');
    expect(r.terms).toEqual(['mercy', 'grace', 'peace']);
  });

  it('extracts an embedded phrase alongside terms', () => {
    const r = parseTextQuery('"still small voice" elijah');
    expect(r.phrase).toBe('still small voice');
    expect(r.terms).toEqual(['elijah']);
  });

  /* A second quoted phrase replaced the first (sweep low, REPORT.md:646): '"still small voice" "mount horeb"'
     searched only "mount horeb". The first stays the phrase; each later one is a run the text must hold. */
  it('keeps every quoted phrase: the first is the phrase, a later one is required', () => {
    const r = parseTextQuery('"still small voice" "mount horeb" elijah');
    expect(r.phrase).toBe('still small voice');
    expect(r.must).toEqual(['mount horeb']);
    expect(r.terms).toEqual(['elijah']);
  });

  it('always reports kind text + a cleanQuery', () => {
    const r = parseTextQuery('Love One Another');
    expect(r.kind).toBe('text');
    expect(r.cleanQuery).toBe('love one another');
  });
});

/* search200 bugcheck #3: "fear not", "judge not", "love not the world" lost their "not" (the parse ate any case of
   NOT/OR/AND as boolean glue). Only the operators typed in capitals are glue; a query typed all in capitals keeps them. */
describe('parseTextQuery: lower-case not/or/and are words', () => {
  it('keeps "not", "or" and "and" typed in lower case', () => {
    expect(parseTextQuery('fear not').terms).toEqual(['fear', 'not']);
    expect(parseTextQuery('love not the world').terms).toEqual(['love', 'not', 'the', 'world']);
    expect(parseTextQuery('judge Not').terms).toEqual(['judge', 'not']);
  });
  it('still eats NOT, OR and AND typed in capitals beside other words', () => {
    expect(parseTextQuery('mercy AND grace').terms).toEqual(['mercy', 'grace']);
    expect(parseTextQuery('faith OR works').terms).toEqual(['faith', 'works']);
  });
  it('a query typed all in capitals keeps them as words', () => {
    expect(parseTextQuery('FEAR NOT').terms).toEqual(['fear', 'not']);
  });
});
