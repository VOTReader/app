// @ts-nocheck — DOM fixtures, jsdom text nodes
/* Item 9 (queue/votreader-tests): first tests of anchor-view.js — the
   container's text in hlDisplayText's form (chrome left out, a line break
   wherever the selection crosses a DIV / P block), the binary search over
   its offset map, and the re-find of a stored range through the real
   resolveAnchor. */
import { describe, it, expect, afterEach } from 'vitest';
import { ANNOTATION_CHROME, chromeAwareView, viewIndexOf, refindRange } from './anchor-view.js';

const block = (html) => {
  document.body.innerHTML = '<div id="c">' + html + '</div>';
  return document.getElementById('c');
};

afterEach(() => { document.body.innerHTML = ''; });

describe('ANNOTATION_CHROME', () => {
  it('names the five chrome classes', () => {
    expect(ANNOTATION_CHROME).toBe('.fn-ref, .hl-note-icon, .verse-link-icon, .inline-bookmark-icon, .inline-link-icon');
  });
});

describe('chromeAwareView', () => {
  it('reads plain text with identity offsets', () => {
    const v = chromeAwareView(block('<p>Be strong.</p>'));
    expect(v.text).toBe('Be strong.');
    expect(v.at).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('inserts a line break when the text crosses into another P, taking the next character offset', () => {
    // textContent is 'Bestrong' (8 chars); the view is 'Be\nstrong' (9 chars).
    const v = chromeAwareView(block('<p>Be</p><p>strong</p>'));
    expect(v.text).toBe('Be\nstrong');
    expect(v.at).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 7]);
  });

  it('breaks on a DIV boundary the same way', () => {
    const v = chromeAwareView(block('<div>Be</div><div>strong</div>'));
    expect(v.text).toBe('Be\nstrong');
    expect(v.at).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 7]);
  });

  it('does not break inside one block, even across inline emphasis', () => {
    const v = chromeAwareView(block('<p>Be <em>strong</em> and</p>'));
    expect(v.text).toBe('Be strong and');
    expect(v.at).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('leaves a footnote digit out of the view but keeps its textContent offset', () => {
    // textContent 'Be1 strong' — the '1' at offset 2 is chrome; the space
    // after it sits at offset 3, and the view maps it there.
    const v = chromeAwareView(block('<p>Be<span class="fn-ref">1</span> strong</p>'));
    expect(v.text).toBe('Be strong');
    expect(v.at).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('leaves every chrome class out, including a glyph nested inside a chrome span', () => {
    const v = chromeAwareView(block('<p>Be<span class="hl-note-icon"><span>\u266A</span></span> strong<span class="verse-link-icon">\u2197</span>.</p>'));
    expect(v.text).toBe('Be strong.');
    expect(v.at[0]).toBe(0);
    expect(v.at[v.at.length - 1]).toBe(11);
  });

  it('still breaks at a block boundary when the next block starts with chrome', () => {
    const v = chromeAwareView(block('<p>Be</p><p><span class="fn-ref">2</span>strong</p>'));
    expect(v.text).toBe('Be\nstrong');
    expect(v.at).toEqual([0, 1, 3, 3, 4, 5, 6, 7, 8]);
  });

  it('returns an empty view for an empty container', () => {
    expect(chromeAwareView(block(''))).toEqual({ text: '', at: [] });
  });
});

describe('viewIndexOf', () => {
  const at = [0, 1, 3, 4, 5, 6, 7, 8, 9];

  it('finds the first view index at or past the offset', () => {
    expect(viewIndexOf(at, 0)).toBe(0);
    expect(viewIndexOf(at, 1)).toBe(1);
    expect(viewIndexOf(at, 2)).toBe(2); // 2 is chrome-only; first at >= 2 is 3
    expect(viewIndexOf(at, 3)).toBe(2);
    expect(viewIndexOf(at, 9)).toBe(8);
  });

  it('returns at.length when nothing is at or past the offset', () => {
    expect(viewIndexOf(at, 10)).toBe(9);
    expect(viewIndexOf(at, 99)).toBe(9);
  });

  it('returns 0 for an empty map', () => {
    expect(viewIndexOf([], 0)).toBe(0);
    expect(viewIndexOf([], 5)).toBe(0);
  });
});

describe('refindRange', () => {
  it('returns the stored offsets when the words still sit there (verify tier)', () => {
    const c = block('<p>should not perish</p>');
    expect(refindRange(chromeAwareView(c), 0, 17, 'should not perish')).toEqual({ start: 0, end: 17 });
  });

  it('finds the words where they moved to (exact tier)', () => {
    const c = block('<p>xxx the world</p>');
    expect(refindRange(chromeAwareView(c), 0, 9, 'the world')).toEqual({ start: 4, end: 13 });
  });

  it('maps back through chrome: stored textContent offsets become view offsets and back', () => {
    const c = block('<p>Be<span class="fn-ref">1</span> strong and of good courage.</p>');
    // 'strong' is textContent 4..10 (the '1' at 2 is chrome, the space at 3).
    expect(refindRange(chromeAwareView(c), 4, 10, 'strong')).toEqual({ start: 4, end: 10 });
  });

  it('absorbs a punctuation difference (loose tier)', () => {
    const c = block('<p>Be strong and of good courage</p>');
    expect(refindRange(chromeAwareView(c), 0, 9, 'Be strong,')).toEqual({ start: 0, end: 9 });
  });

  it('returns null when the words are nowhere', () => {
    const c = block('<p>Be strong and of good courage</p>');
    expect(refindRange(chromeAwareView(c), 0, 9, 'should not perish')).toBeNull();
  });

  it('returns null for an empty or non-string text', () => {
    const c = block('<p>Be strong.</p>');
    const v = chromeAwareView(c);
    expect(refindRange(v, 0, 9, '')).toBeNull();
    expect(refindRange(v, 0, 9, 42)).toBeNull();
    expect(refindRange(v, 0, 9, null)).toBeNull();
  });

  it('returns null when the resolved range is empty', () => {
    const c = block('<p>Be strong.</p>');
    // No stored text: resolveAnchor keeps clamped offsets only when start < end.
    expect(refindRange(chromeAwareView(c), 5, 5, 'x')).toBeNull();
  });
});
