/* formsToMark — which of the engine's matched forms a search marks.
   Pure; no imports. Pins the search200 rule: a typed small word marks only
   itself — forms that merely extend it, or sit a letter off it, are left out
   unless typed or near a typed real word. stopTyped is assumed lowercase
   already (the source never lowercases it); that is pinned, not fixed. */
import { describe, it, expect } from 'vitest';
import { formsToMark } from './marked-forms.js';

describe('no reaching stop word', () => {
  it('returns all forms when stopTyped is empty', () => {
    expect(formsToMark(['whom', 'christ'], ['who'], [])).toEqual(['whom', 'christ']);
  });

  it('returns all forms when stopTyped is null', () => {
    expect(formsToMark(['whom', 'christ'], ['who'], null)).toEqual(['whom', 'christ']);
  });

  it('returns all forms when stopTyped is undefined', () => {
    expect(formsToMark(['whom', 'christ'], ['who'], undefined)).toEqual(['whom', 'christ']);
  });

  it('returns all forms when every stop word is under three letters', () => {
    // "is" never reaches: the engine's prefixable floor is three letters.
    expect(formsToMark(['israel', 'isreal', 'is'], ['isreal'], ['is'])).toEqual(['israel', 'isreal', 'is']);
  });

  it('returns all forms when terms is null and no stop word reaches', () => {
    expect(formsToMark(['whom'], null, ['is'])).toEqual(['whom']);
  });
});

describe('lone stop word drops its extensions', () => {
  it('a lone "who" drops "whom" and "whoever"', () => {
    expect(formsToMark(['whom', 'whoever', 'who'], ['who'], ['who'])).toEqual(['who']);
  });

  it('"christ who strengthens me" keeps christ/strengthens, drops whom', () => {
    const forms = ['christ', 'whom', 'strengthens', 'me'];
    expect(formsToMark(forms, ['christ', 'who', 'strengthens', 'me'], ['who', 'me'])).toEqual(['christ', 'strengthens', 'me']);
  });

  it('drops a form one letter off the stop word', () => {
    // "wha" is one substitution from "who"; nothing real is near it.
    expect(formsToMark(['wha', 'christ'], ['christ', 'who'], ['who'])).toEqual(['christ']);
  });

  it('drops a form a letter short of the stop word', () => {
    // "wh" is one trailing char short of "who" (oneEdit trailing rule).
    expect(formsToMark(['wh', 'christ'], ['christ', 'who'], ['who'])).toEqual(['christ']);
  });

  it('drops every form near a reaching stop word when terms is null', () => {
    expect(formsToMark(['whom', 'christ'], null, ['who'])).toEqual(['christ']);
  });
});

describe('typed and near-real forms are kept', () => {
  it('keeps a form that was itself typed, even near a stop word', () => {
    expect(formsToMark(['whom', 'whoever'], ['whom', 'who'], ['who'])).toEqual(['whom']);
  });

  it('keeps a form that is itself a stop word', () => {
    expect(formsToMark(['who', 'whom'], ['who'], ['who'])).toEqual(['who']);
  });

  it('keeps a form near a typed real word', () => {
    // "chris" is one deletion from typed real word "christ".
    expect(formsToMark(['chris', 'whom'], ['christ', 'who'], ['who'])).toEqual(['chris']);
  });

  it('keeps a form one insertion from a typed real word', () => {
    // "chriss" is one insertion from "christ".
    expect(formsToMark(['chriss'], ['christ', 'who'], ['who'])).toEqual(['chriss']);
  });

  it('keeps a form one substitution from a typed real word', () => {
    // "chrixt" is one substitution from "christ".
    expect(formsToMark(['chrixt'], ['christ', 'who'], ['who'])).toEqual(['chrixt']);
  });

  it('keeps a form that is two edits from everything', () => {
    // "wxy" is two substitutions from "who" and nowhere near "christ".
    expect(formsToMark(['wxy', 'whom'], ['christ', 'who'], ['who'])).toEqual(['wxy']);
  });

  it('keeps a form two deletions from the real word when it is not near the stop word', () => {
    // 'chri' is two letters short of 'christ', but nearness to a real word
    // only matters for forms near a reaching stop word — 'chri' is nowhere
    // near 'who', so it is kept. 'whom' is near 'who' and near nothing real.
    expect(formsToMark(['chri', 'whom'], ['christ', 'who'], ['who'])).toEqual(['chri']);
  });

  it('keeps a form two letters short of the stop word itself', () => {
    // 'w' is a prefix of 'who' but oneEdit's length-diff guard (> 1) says
    // it is not near, so it is kept; 'whom' is near 'who' and is dropped.
    expect(formsToMark(['w', 'whom'], ['christ', 'who'], ['who'])).toEqual(['w']);
  });

  it('matching is case-insensitive for forms and terms', () => {
    expect(formsToMark(['Whom', 'CHRIST'], ['christ', 'who'], ['who'])).toEqual(['CHRIST']);
  });
});

describe('stopTyped is assumed lowercase already', () => {
  it('an uppercase stop word does not reach its forms', () => {
    // "WHO" never matches lowercase "whom" (no lowercasing of stopTyped),
    // and "who" then counts as a real typed word, which keeps "whom" near it.
    expect(formsToMark(['whom'], ['who'], ['WHO'])).toEqual(['whom']);
  });
});
