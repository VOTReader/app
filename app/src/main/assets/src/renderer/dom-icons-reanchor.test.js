// @ts-nocheck — tests construct partial link / bookmark records + DOM fixtures
/* W48 — link and bookmark icons follow their words, as highlights do.
   ─────────────────────────────────────────────────────────────────────
   applyDOMHighlights re-finds a mark's recorded words in the text on screen
   (v05-02, dom-reanchor.test.js), so text typed in front of a mark in a journal
   entry, or a corpus correction, leaves it on its words. applyDOMLinks and
   applyDOMBookmarks placed their icons at the raw stored end offset, so the
   same edit put the chain or flag icon on other words while the highlight
   beside it stayed put. Both now re-find the recorded words the same way
   (anchor-view.js chromeAwareView + anchor-resolve.js resolveAnchor) and keep
   the stored offset when there are no words or the words are gone. A bookmark
   records its words (`text`) from now on; an older bookmark has only its
   offsets and keeps them. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyDOMLinks } from './dom-links.js';
import { applyDOMBookmarks } from './dom-bookmarks.js';

let links;
let bookmarks;
beforeEach(() => {
  links = [];
  bookmarks = [];
  window.LinkStore = { getForKeyPrefix: () => links };
  window.BookmarkStore = { getForKeyPrefix: () => bookmarks };
});
afterEach(() => {
  document.body.innerHTML = '';
  delete window.LinkStore;
  delete window.BookmarkStore;
});

const setup = (html) => {
  document.body.innerHTML = '<div id="c" data-hl-key="k" data-hl-dom>' + html + '</div>';
  return document.getElementById('c');
};
/** The reading text in front of an icon, footnote digits left out. */
function textBefore(c, selector) {
  const icon = c.querySelector(selector);
  const range = document.createRange();
  range.setStart(c, 0);
  range.setEndBefore(icon);
  const frag = range.cloneContents();
  frag.querySelectorAll('.fn-ref').forEach((el) => el.remove());
  return frag.textContent;
}
const LINK = '.inline-link-icon';
const FLAG = '.inline-bookmark-icon';

describe('link icons follow their words (W48)', () => {
  it("a link's source end stays on its words after text is typed in front of it", () => {
    // Linked when the block read "Be strong and of good courage." (0-9 = "Be strong").
    links = [{ source: { key: 'k', start: 0, end: 9, text: 'Be strong' }, target: { key: 'x:1' } }];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMLinks();
    expect(textBefore(c, LINK)).toBe('Today I read Joshua. Be strong');
    expect(c.textContent).toBe('Today I read Joshua. Be strong and of good courage.');
  });

  it("a link's ranged target end (key :start-end) follows its words too", () => {
    links = [{ source: { key: 'x:1' }, target: { key: 'k:0-9', start: 0, end: 9, text: 'Be strong' } }];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMLinks();
    expect(textBefore(c, LINK)).toBe('Today I read Joshua. Be strong');
  });

  it('an end across a footnote moves with its words', () => {
    // Made in "The Lord1 is my shepherd": "Lord1 is my" = 4-15, recorded without the digit.
    links = [{ source: { key: 'k', start: 4, end: 15, text: 'Lord is my' }, target: { key: 'x:1' } }];
    const c = setup('<p>Now the Lord<sup class="fn-ref">1</sup> is my shepherd</p>');
    applyDOMLinks();
    expect(textBefore(c, LINK)).toBe('Now the Lord is my');
  });

  it('an end that kept only its end offset still follows its words', () => {
    links = [{ source: { key: 'k', end: 9, text: 'Be strong' }, target: { key: 'x:1' } }];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMLinks();
    expect(textBefore(c, LINK)).toBe('Today I read Joshua. Be strong');
  });

  it('two ends with words in one block each follow their own words', () => {
    // Made in "Be strong and of good courage." : "Be strong" 0-9, "good courage" 17-29.
    links = [
      { source: { key: 'k', start: 0, end: 9, text: 'Be strong' }, target: { key: 'x:1' } },
      { source: { key: 'x:2' }, target: { key: 'k:17-29', text: 'good courage' } },
    ];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMLinks();
    const before = [...c.querySelectorAll(LINK)].map((icon) => {
      const range = document.createRange();
      range.setStart(c, 0);
      range.setEndBefore(icon);
      return range.toString();
    });
    expect(before).toEqual(['Today I read Joshua. Be strong', 'Today I read Joshua. Be strong and of good courage.']);
  });

  it('an end with no recorded words, or words that are gone, keeps its offsets', () => {
    links = [
      { source: { key: 'k', start: 0, end: 5 }, target: { key: 'x:1' } },
      { source: { key: 'k', start: 6, end: 11, text: 'Vanished words' }, target: { key: 'x:2' } },
    ];
    const c = setup('<p>Hello world again</p>');
    applyDOMLinks();
    const before = [...c.querySelectorAll(LINK)].map((icon) => {
      const range = document.createRange();
      range.setStart(c, 0);
      range.setEndBefore(icon);
      return range.toString();
    });
    expect(before).toEqual(['Hello', 'Hello world']);
  });
});

describe('bookmark icons follow their words (W48)', () => {
  it('a bookmark with recorded words stays on them after text is typed in front', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k:0-9', text: 'Be strong', created: 1 }];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMBookmarks();
    expect(textBefore(c, FLAG)).toBe('Today I read Joshua. Be strong');
  });

  it('a bookmark across a footnote moves with its words', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k:4-15', text: 'Lord is my', created: 1 }];
    const c = setup('<p>Now the Lord<sup class="fn-ref">1</sup> is my shepherd</p>');
    applyDOMBookmarks();
    expect(textBefore(c, FLAG)).toBe('Now the Lord is my');
  });

  it('a link icon already in the block does not throw a bookmark off its words', () => {
    links = [{ source: { key: 'k', start: 21, end: 30, text: 'Be strong' }, target: { key: 'x:1' } }];
    bookmarks = [{ id: 'b1', hlKey: 'k:21-30', text: 'Be strong', created: 1 }];
    const c = setup('<p>Today I read Joshua. Be strong and of good courage.</p>');
    applyDOMLinks();
    applyDOMBookmarks();
    expect(textBefore(c, FLAG)).toBe('Today I read Joshua. Be strong');
    expect(textBefore(c, LINK)).toBe('Today I read Joshua. Be strong');
  });

  it('an older bookmark with offsets only keeps them (its label is never searched for)', () => {
    // A label can be the reader's own words; finding it would move an icon that was right.
    bookmarks = [{ id: 'b1', hlKey: 'k:0-3', label: 'world', created: 1 }];
    const c = setup('<p>Say Hello world</p>');
    applyDOMBookmarks();
    expect(textBefore(c, FLAG)).toBe('Say');
  });
});
