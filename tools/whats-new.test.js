/* up1: the "What's new" list is built from a release's commits, in plain words (tools/whats-new.mjs). */
import { describe, it, expect } from 'vitest';
import { linesOf, stripIds, buildItems, MAX_ITEMS } from './whats-new.mjs';

describe('linesOf: feat and fix only, internal scopes and review rounds left out', () => {
  it('keeps what a reader would notice', () => {
    expect(linesOf('feat(plans): build your own reading plan')).toEqual(['Build your own reading plan.']);
    expect(linesOf('fix(player): a step that cannot load keeps what was playing\n\nbody')).toEqual(['A step that cannot load keeps what was playing.']);
    expect(linesOf('fix: the share card names the letter')).toEqual(['The share card names the letter.']);
  });
  it('leaves out the rest', () => {
    for (const m of [
      'chore(build): rebuild generated files', 'ci(deploy): publish twice a day', 'test(sw): pin the wait',
      'docs: CONTRIBUTING', 'refactor(store): one lookup', 'style(plans): the month marks the days ahead',
      'fix(ci): the runner cache', 'feat(tools): a new walk', 'fix(e2e,gate): the walk waits',
      'fix(journal): ds5 B3/B4 refuter r1 - a newer edit voids the older', 'Merge branch main', '',
    ]) expect(linesOf(m), m).toEqual([]);
  });
  it('a scope that is partly the reader\'s is kept', () => {
    expect(linesOf('fix(ci,player): the bar keeps its place')).toEqual(['The bar keeps its place.']);
  });
  it('a commit may say it itself, or say none', () => {
    expect(linesOf("fix(store): ds5 B4 - LinkStore.getTouching\n\nWhat's new: Links show on every verse they touch.\nWhat's new: Notes keep their order."))
      .toEqual(['Links show on every verse they touch.', 'Notes keep their order.']);
    expect(linesOf("feat(picker): imports navItemPreview\n\nWhat's new: none")).toEqual([]);
    expect(linesOf("chore: a tidy-up\n\nWhat's new: the About screen names the reading plans")).toEqual(['The About screen names the reading plans.']);
  });
});

describe('stripIds', () => {
  it('drops the work id at the head and a bracketed id at the end', () => {
    expect(stripIds('up1 - a new build waits for the reader')).toBe('a new build waits for the reader');
    expect(stripIds('ds5 B3 - journal data gaps')).toBe('journal data gaps');
    expect(stripIds('mw18 C8/C9/C11 - a way in')).toBe('a way in');
    expect(stripIds('rp-s1 - the daily reminder (call 4A)')).toBe('the daily reminder');
    expect(stripIds('Wave 3 batch B3 - verse words in the link picker')).toBe('verse words in the link picker');
    expect(stripIds('the month marks the days ahead (mw18 C9)')).toBe('the month marks the days ahead');
  });
  it('keeps a dash or a bracket that is part of the sentence', () => {
    expect(stripIds("a copied passage is cited with its number - 'Volume One, Letter 1'")).toBe("a copied passage is cited with its number - 'Volume One, Letter 1'");
    expect(stripIds('the mini player steps aside (while typing)')).toBe('the mini player steps aside (while typing)');
    expect(stripIds('verses 1-3 - now one card')).toBe('now one card');   // a digit in a short head reads as an id: say it with What's new: instead
  });
});

describe('buildItems', () => {
  const range = [
    { t: 3000, message: 'feat(plans): mw18 C8 - a way in' },
    { t: 2000, message: 'chore(build): rebuild generated files' },
    { t: 1000, message: 'fix(player): up1 - the bar keeps its place' },
    { t: 4000, message: "fix(store): internal\n\nWhat's new: none" },
  ];
  it('newest first, the commit time on each', () => {
    expect(buildItems(range)).toEqual([{ t: 3000, text: 'A way in.' }, { t: 1000, text: 'The bar keeps its place.' }]);
  });
  it('adds to what is already published, the same words once (the newest copy kept)', () => {
    const prev = [{ t: 500, text: 'Build your own reading plan.' }, { t: 900, text: 'A way in.' }];
    expect(buildItems(range, prev)).toEqual([
      { t: 3000, text: 'A way in.' }, { t: 1000, text: 'The bar keeps its place.' }, { t: 500, text: 'Build your own reading plan.' },
    ]);
  });
  it('a release with nothing a reader would notice has no items', () => {
    expect(buildItems([{ t: 1, message: 'chore(build): x' }, { t: 2, message: 'test(sw): y' }])).toEqual([]);
  });
  it('keeps at most MAX_ITEMS and ignores broken previous items', () => {
    const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ t: i, message: `feat(x): change number ${i} here` }));
    expect(buildItems(many).length).toBe(MAX_ITEMS);
    expect(buildItems([], /** @type {any} */ ([null, { t: 'x', text: 'a' }, { t: 1 }, { t: 2, text: 'Kept.' }]))).toEqual([{ t: 2, text: 'Kept.' }]);
  });
});
