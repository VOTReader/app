/* highlight — excerpt-highlight helpers (TEST1).
   ─────────────────────────────────────────────────────────────────────
   normalizeForHighlight + splitWithHighlight were load-bearing but 0%
   covered: they decide what the user sees highlighted in search results
   and cross-volume excerpt tap-throughs. Diacritic/smart-quote folding is
   exactly the string logic that breaks silently. highlightExcerptInDom is
   the imperative post-render path (anchor + drift-tolerant walk). */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { normalizeForHighlight, splitWithHighlight, highlightExcerptInDom } from './highlight.jsx';

afterEach(cleanup);

describe('normalizeForHighlight', () => {
  it('folds smart quotes + en/em dashes to ASCII and lowercases', () => {
    expect(normalizeForHighlight('“Grace” — Thy')).toBe('"grace" - thy');
    expect(normalizeForHighlight('It’s a – test')).toBe("it's a - test");
  });
  it('stringifies non-strings + tolerates null/undefined', () => {
    expect(normalizeForHighlight(null)).toBe('');
    expect(normalizeForHighlight(undefined)).toBe('');
    expect(normalizeForHighlight(42)).toBe('42');
  });
});

describe('splitWithHighlight', () => {
  it('wraps the first case-insensitive match in <mark class="letter-highlight">, preserving casing + surrounding text', () => {
    const { container } = render(/** @type {any} */ (<div>{splitWithHighlight('Amazing Grace abounds', 'grace', 'k')}</div>));
    const mark = container.querySelector('mark.letter-highlight');
    expect(mark).toBeTruthy();
    expect(mark.textContent).toBe('Grace');                          // original casing preserved
    expect(container.textContent).toBe('Amazing Grace abounds');     // before + match + after intact
  });
  it('matches across smart-quote normalization', () => {
    const { container } = render(/** @type {any} */ (<div>{splitWithHighlight('the Lord’s word', "lord's", 'k')}</div>));
    expect(container.querySelector('mark.letter-highlight').textContent).toBe('Lord’s');
  });
  it('returns null on no match / empty inputs / needle longer than text', () => {
    expect(splitWithHighlight('hello', 'zzz', 'k')).toBeNull();
    expect(splitWithHighlight('', 'x', 'k')).toBeNull();
    expect(splitWithHighlight('hi', null, 'k')).toBeNull();
    expect(splitWithHighlight('hi', 'a longer needle', 'k')).toBeNull();
  });
});

describe('highlightExcerptInDom', () => {
  it('returns [] on empty inputs', () => {
    expect(highlightExcerptInDom(null, 'x')).toEqual([]);
    expect(highlightExcerptInDom(document.createElement('div'), '')).toEqual([]);
  });

  it('wraps the matched paragraph in <mark>, returns the hit, then auto-clears after the timeout', () => {
    // jsdom doesn't implement scrollIntoView (called once a hit is found).
    Element.prototype.scrollIntoView = function () {};
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      root.innerHTML = '<p>An unrelated opening line sits here first.</p>' +
        '<p>Behold I stand at the door and knock today.</p>';
      const hits = highlightExcerptInDom(root, 'Behold I stand at the door and knock');
      expect(hits.length).toBe(1);                                            // only the matching paragraph
      expect(root.querySelectorAll('mark.letter-highlight').length).toBeGreaterThan(0);
      expect(root.textContent).toContain('Behold I stand at the door and knock today.'); // content intact under the marks
      vi.runAllTimers();                                                      // the 8.4s auto-clear
      expect(root.querySelectorAll('mark.letter-highlight').length).toBe(0);  // unwrapped
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns [] when the anchor is not found', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Nothing in here matches the needle text at all friend.</p>';
    expect(highlightExcerptInDom(root, 'completely different words absent entirely from source')).toEqual([]);
  });
});
