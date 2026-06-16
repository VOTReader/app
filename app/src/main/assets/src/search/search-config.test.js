import { describe, it, expect } from 'vitest';
import { buildMiniSearchOptions, MS_FIELDS, MS_STORE_FIELDS } from './search-config.js';

describe('search-config', () => {
  const opts = buildMiniSearchOptions();

  it('indexes only text + title', () => {
    expect(MS_FIELDS).toEqual(['text', 'title']);
    expect(opts.fields).toEqual(['text', 'title']);
  });

  it('stores every routing/display field the engine contract needs', () => {
    for (const f of ['kind', 'bookId', 'chapterNum', 'verseNum', 'letterId', 'volumeId', 'translation', 'ref', 'heading', 'text', 'corpus']) {
      expect(MS_STORE_FIELDS).toContain(f);
    }
    expect(opts.storeFields).toEqual(MS_STORE_FIELDS);
  });

  it('uses id as the id field', () => {
    expect(opts.idField).toBe('id');
  });

  it('processTerm folds diacritics + archaic pronouns, drops empties', () => {
    expect(opts.processTerm('Thee')).toBe('you');
    expect(opts.processTerm('Righteousness')).toBe('righteousness');
    expect(opts.processTerm('résurrección')).toBe('resurreccion');
    expect(opts.processTerm('!!!')).toBeNull();
  });

  it('tokenize splits + folds a field value', () => {
    expect(opts.tokenize('Be still, and know')).toEqual(['be', 'still', 'and', 'know']);
  });

  it('weights title above text', () => {
    expect(opts.searchOptions.boost.title).toBeGreaterThan(opts.searchOptions.boost.text);
  });
});
