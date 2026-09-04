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

  /* F28: `phrase` is a single slot, so a second quoted phrase overwrote the
     first and the reader's first phrase vanished with no signal — the search
     ran as if they had never typed it. The extra phrases' words join `must`,
     which engine.js already concatenates onto the term list (:165) and
     requires against the combined document text (:288), so every phrase still
     constrains the result set. Adjacency is only guaranteed for the first
     phrase; that is the shape the engine supports today. */
  it('keeps the first phrase and requires the words of every later one (F28)', () => {
    const r = parseTextQuery('"living water" "new jerusalem"');
    expect(r.phrase).toBe('living water');
    expect(r.must).toEqual(['new', 'jerusalem']);
    expect(r.terms).toEqual([]);
  });

  it('a later phrase joins the +required words already there (F28)', () => {
    const r = parseTextQuery('"still small voice" +elijah "horeb mount"');
    expect(r.phrase).toBe('still small voice');
    expect(r.must).toEqual(['elijah', 'horeb', 'mount']);
  });

  it('always reports kind text + a cleanQuery', () => {
    const r = parseTextQuery('Love One Another');
    expect(r.kind).toBe('text');
    expect(r.cleanQuery).toBe('love one another');
  });
});
