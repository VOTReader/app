import { describe, it, expect } from 'vitest';
import { splitFormatBInline } from './format-b-inline.js';

describe('splitFormatBInline', () => {
  it('captures an _italic_ span that closes AFTER a soft line break (the bug)', () => {
    // This is the shape that rendered literal underscores on screen: the closing
    // marker sits after \n\n, so the old per-line `.*?` parse never paired it.
    expect(splitFormatBInline('_a\n\nb_')).toEqual(['', '_a\n\nb_', '']);
  });

  it('reproduces the real corpus span as ONE italic segment', () => {
    const src = '_Blessed are those given and received in marriage,\n\nWho keep My Commandments..._';
    const parts = splitFormatBInline(src).filter(Boolean);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(src);
    // The inner content (what renderLine italicizes) keeps the break for <br/>.
    expect(parts[0].slice(1, -1)).toContain('\n\n');
  });

  it('still pairs per-line spans correctly (lazy match)', () => {
    expect(splitFormatBInline('_a_\n\n_b_')).toEqual(['', '_a_', '\n\n', '_b_', '']);
  });

  it('captures **bold** across a newline', () => {
    expect(splitFormatBInline('**a\nb**')).toEqual(['', '**a\nb**', '']);
  });

  it('captures {{ref:…}} and {{nav:…}} markers', () => {
    expect(splitFormatBInline('see {{ref:John 3:16}} now')).toEqual(['see ', '{{ref:John 3:16}}', ' now']);
    expect(splitFormatBInline('{{nav:esther:7}}')).toEqual(['', '{{nav:esther:7}}', '']);
  });

  it('captures a [From "…" ~ Volume N] attribution', () => {
    expect(splitFormatBInline('~ [From "Grafted In" ~ Volume 3]'))
      .toEqual(['~ ', '[From "Grafted In" ~ Volume 3]', '']);
  });

  it('leaves plain text (no markers) as a single segment', () => {
    expect(splitFormatBInline('hello world')).toEqual(['hello world']);
  });

  it('handles empty and non-string input without throwing', () => {
    expect(splitFormatBInline('')).toEqual(['']);
    expect(splitFormatBInline(/** @type {any} */ (null))).toEqual([]);
    expect(splitFormatBInline(/** @type {any} */ (undefined))).toEqual([]);
  });
});
