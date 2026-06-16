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

  it('always reports kind text + a cleanQuery', () => {
    const r = parseTextQuery('Love One Another');
    expect(r.kind).toBe('text');
    expect(r.cleanQuery).toBe('love one another');
  });
});
