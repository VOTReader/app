/* highlight — excerpt-highlight helpers (TEST1).
   ─────────────────────────────────────────────────────────────────────
   normalizeForHighlight + splitWithHighlight were load-bearing but 0%
   covered: they decide what the user sees highlighted in search results
   and cross-volume excerpt tap-throughs. Diacritic/smart-quote folding is
   exactly the string logic that breaks silently. highlightExcerptInDom is
   the imperative post-render path (anchor + drift-tolerant walk). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('highlightExcerptInDom — the anchor, the drift walk and the guards', () => {
  let scrolled;
  beforeEach(() => {
    scrolled = [];
    Element.prototype.scrollIntoView = function (opts) { scrolled.push([this, opts]); };
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  /** A letter body: an opening, the given paragraphs, a closing. Enough
      unrelated paragraphs that a real hit stays under the 85% guard. */
  function letter(...paras) {
    const root = document.createElement('div');
    root.innerHTML = '<p>Dear children, hear this opening word now.</p>' +
      paras.join('') +
      '<p>Another unrelated paragraph sits here.</p>' +
      '<div class="letter-closing">Sincerely, your servant always.</div>';
    return root;
  }
  const marked = (root) => Array.from(root.querySelectorAll('mark.letter-highlight')).map((m) => m.textContent).join('|');

  it('an excerpt with no word characters highlights nothing', () => {
    expect(highlightExcerptInDom(letter('<p>Some text here</p>'), '— … —')).toEqual([]);
  });

  it('a body with no text paragraphs highlights nothing', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>   </p><span>not a paragraph</span>';
    expect(highlightExcerptInDom(root, 'not a paragraph')).toEqual([]);
  });

  it('falls back to a 6- then 4-token anchor when the full 8-token prefix is not in the text', () => {
    // The excerpt's 7th word differs from the letter: the 8-token anchor fails,
    // the 6-token one lands.
    const root = letter('<p>Behold I stand at the door and knock loudly.</p>');
    const hits = highlightExcerptInDom(root, 'Behold I stand at the door AND WAIT for you');
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toContain('Behold');
    const root4 = letter('<p>Behold I stand here and knock.</p>');
    expect(highlightExcerptInDom(root4, 'Behold I stand here ALWAYS WITHOUT FAIL')).toHaveLength(1);
  });

  it('a short excerpt (under 4 tokens) still anchors on what it has', () => {
    const root = letter('<p>Be still and know.</p>');
    expect(highlightExcerptInDom(root, 'Be still')).toHaveLength(1);
  });

  it('walks past small insertions in the text (lookahead) into the next paragraph', () => {
    const root = letter(
      '<p>The Lord is my shepherd, I shall not want.</p>',
      '<p>He makes me lie down in green pastures.</p>',
    );
    // The 8-token anchor is intact; past it the excerpt omits "me" (the text's
    // extra word is stepped over by the lookahead) and adds "truly" (a drift
    // the walk absorbs), and still reaches paragraph two.
    const hits = highlightExcerptInDom(root,
      'The Lord is my shepherd I shall not want He makes lie down in green truly pastures');
    expect(hits.map((h) => h.textContent)).toEqual([
      'The Lord is my shepherd, I shall not want.',
      'He makes me lie down in green pastures.',
    ]);
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0][0]).toBe(hits[0]);
    expect(scrolled[0][1]).toEqual({ block: 'center' });
  });

  it('stops walking once the excerpt drifts too far from the text', () => {
    const root = letter(
      '<p>Blessed are the poor in spirit for theirs is the kingdom.</p>',
      '<p>' + 'zz '.repeat(4) + 'Blessed are they that mourn.</p>',
    );
    const noise = Array.from({ length: 12 }, (_, i) => 'nomatch' + i).join(' ');
    const hits = highlightExcerptInDom(root,
      'Blessed are the poor in spirit for theirs ' + noise + ' blessed are they that mourn');
    expect(hits).toHaveLength(1); // never reached the second paragraph
  });

  it('refuses a match so broad it would light up the whole letter (85% guard)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>alpha beta gamma delta</p><p>epsilon zeta eta theta</p>';
    expect(highlightExcerptInDom(root, 'alpha beta gamma delta epsilon zeta eta theta')).toEqual([]);
    expect(root.querySelector('mark')).toBeNull();
  });

  it('never marks inside footnote refs, inline scripture refs or an existing highlight', () => {
    const root = letter(
      '<p>For God so loved<sup class="fn-ref">12</sup> the world ' +
      '<a class="inline-scrip-ref">John 3:16</a> that He gave ' +
      '<mark class="letter-highlight">His only</mark> Son.</p>',
    );
    const hits = highlightExcerptInDom(root, 'For God so loved the world that He gave');
    expect(hits).toHaveLength(1);
    const marks = marked(root);
    expect(marks).toContain('For God so loved');
    expect(marks).not.toContain('12');
    expect(marks).not.toContain('John 3:16');
    // the footnote number did not break the anchor: it is replaced by a space
    expect(root.querySelector('sup.fn-ref').parentElement.tagName).toBe('P');
  });

  it('matches through poetry and closing blocks, not only <p>', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Opening words go here.</p><div class="letter-poetry">Sing to the Lord a new song</div>' +
      '<p>Something else.</p><p>More text.</p><div class="letter-closing-fn">End</div>';
    const hits = highlightExcerptInDom(root, 'Sing to the Lord a new song');
    expect(hits).toHaveLength(1);
    expect(hits[0].className).toBe('letter-poetry');
  });

  it('the auto-clear restores the original text nodes, even if a mark was removed meanwhile', () => {
    const root = letter('<p>Grace and <b>peace</b> be multiplied to you.</p>');
    const before = root.innerHTML;
    highlightExcerptInDom(root, 'Grace and peace be multiplied');
    const marks = root.querySelectorAll('mark.letter-highlight');
    // one mark per text node: "Grace and ", "peace", " be multiplied to you."
    expect(Array.from(marks, (m) => m.textContent)).toEqual(['Grace and ', 'peace', ' be multiplied to you.']);
    marks[0].remove();            // e.g. React re-rendered that node away
    expect(() => vi.advanceTimersByTime(8400)).not.toThrow();
    expect(root.querySelector('mark')).toBeNull();
    expect(root.innerHTML).toBe(before.replace('Grace and ', ''));
  });

  it('a hit paragraph whose text is all inside skipped refs wraps nothing and returns []', () => {
    const root = letter('<p><a class="inline-scrip-ref">Romans eight twenty eight</a></p>');
    expect(highlightExcerptInDom(root, 'Romans eight twenty eight')).toEqual([]);
    expect(scrolled).toHaveLength(0);
  });
});
