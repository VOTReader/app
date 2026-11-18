// @ts-nocheck — DOM fixtures, jsdom text nodes
/* Item 9 (queue/votreader-tests): first tests of icon-placement.js — where
   an inline link or bookmark icon goes (s06.2): the slide forward through
   the rest of the word and its closing punctuation, never splitting a word,
   crossing inline emphasis but not a block, jumping over skip elements as a
   unit, and falling back to the container's end. */
import { describe, it, expect, afterEach } from 'vitest';
import { ICON_SKIP_RX, BOOKMARK_SKIP_RX, insertIconAt } from './icon-placement.js';

const block = (html) => {
  document.body.innerHTML = '<div id="c">' + html + '</div>';
  return document.getElementById('c');
};
const icon = () => {
  const s = document.createElement('span');
  s.className = 'inline-link-icon';
  s.textContent = 'L';
  return s;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('skip lists', () => {
  it('ICON_SKIP_RX covers footnote bubbles, references, verse-link and note icons', () => {
    for (const cls of ['fn-ref', 'tap-ref', 'letter-link-ref', 'verse-link-icon', 'hl-note-icon']) {
      expect(ICON_SKIP_RX.test(cls)).toBe(true);
    }
  });

  it('ICON_SKIP_RX does not cover the link and bookmark icons themselves', () => {
    expect(ICON_SKIP_RX.test('inline-link-icon')).toBe(false);
    expect(ICON_SKIP_RX.test('inline-bookmark-icon')).toBe(false);
  });

  it('BOOKMARK_SKIP_RX covers those two as well', () => {
    for (const cls of ['fn-ref', 'tap-ref', 'letter-link-ref', 'verse-link-icon', 'hl-note-icon', 'inline-link-icon', 'inline-bookmark-icon']) {
      expect(BOOKMARK_SKIP_RX.test(cls)).toBe(true);
    }
  });
});

describe('insertIconAt', () => {
  it('slides forward through the rest of the word to the whitespace', () => {
    const c = block('<p>Be strong and of good courage.</p>');
    const ic = icon();
    insertIconAt(c, 3, ICON_SKIP_RX, ic); // inside 'strong'
    expect(ic.parentElement.tagName).toBe('P');
    expect(ic.previousSibling.textContent).toBe('Be strong');
    expect(ic.nextSibling.textContent).toBe(' and of good courage.');
  });

  it('slides through closing punctuation, so the icon brackets the phrase', () => {
    const c = block('<p>Be strong.</p>');
    const ic = icon();
    insertIconAt(c, 5, ICON_SKIP_RX, ic); // inside 'strong', before the '.'
    expect(ic.parentElement).toBe(c); // past the '.', past the block: container end
    expect(ic.previousSibling.tagName).toBe('P');
    expect(c.querySelector('p').textContent).toBe('Be strong.');
  });

  it('slides through a curly apostrophe inside the word', () => {
    const c = block('<p>don\u2019t stop.</p>');
    const ic = icon();
    insertIconAt(c, 2, ICON_SKIP_RX, ic); // inside 'don\u2019t'
    expect(ic.previousSibling.textContent).toBe('don\u2019t');
    expect(ic.nextSibling.textContent).toBe(' stop.');
  });

  it('endPos 0 matches no node (the search needs endPos > charPos), so it falls back to the container end', () => {
    const c = block('<p>Be strong.</p>');
    const ic = icon();
    insertIconAt(c, 0, ICON_SKIP_RX, ic);
    expect(ic.parentElement).toBe(c);
    expect(c.lastChild).toBe(ic);
    expect(c.querySelector('p').textContent).toBe('Be strong.');
  });

  it('falls back to the container end when endPos is past the text', () => {
    const c = block('<p>Be strong.</p>');
    const ic = icon();
    insertIconAt(c, 999, ICON_SKIP_RX, ic);
    expect(ic.parentElement).toBe(c);
    expect(c.lastChild).toBe(ic);
    expect(c.querySelector('p').textContent).toBe('Be strong.');
  });

  it('slides past a footnote bubble as a unit when endPos is inside it', () => {
    const c = block('<p>Be<span class="fn-ref">12</span> strong.</p>');
    const ic = icon();
    insertIconAt(c, 3, ICON_SKIP_RX, ic); // inside the '12'
    expect(ic.previousSibling.className).toBe('fn-ref');
    expect(ic.nextSibling.textContent).toBe(' strong.');
  });

  it('never lands directly before a skip element: it jumps over it', () => {
    const c = block('<p>Be strong<span class="fn-ref">1</span> and more.</p>');
    const ic = icon();
    insertIconAt(c, 9, ICON_SKIP_RX, ic); // end of 'Be strong', before the bubble
    expect(ic.previousSibling.className).toBe('fn-ref');
    expect(ic.nextSibling.textContent).toBe(' and more.');
  });

  it('a bookmark icon also jumps over a link icon already placed', () => {
    const c = block('<p>Be strong<span class="inline-link-icon">L</span> and more.</p>');
    const ic = icon();
    insertIconAt(c, 9, BOOKMARK_SKIP_RX, ic); // end of 'Be strong', before the link icon
    expect(ic.previousSibling.className).toBe('inline-link-icon');
    expect(ic.nextSibling.textContent).toBe(' and more.');
  });

  it('crosses inline emphasis to finish the word', () => {
    const c = block('<p>Be <em>strong</em> and more.</p>');
    const ic = icon();
    insertIconAt(c, 3, ICON_SKIP_RX, ic); // inside the <em>'s 'strong'
    expect(ic.parentElement.tagName).toBe('P');
    expect(ic.previousSibling.tagName).toBe('EM');
    expect(ic.nextSibling.textContent).toBe(' and more.');
  });

  it('stops at a block boundary instead of crossing into the next block', () => {
    const c = block('<p>Be strong</p><p>and more.</p>');
    const ic = icon();
    insertIconAt(c, 5, ICON_SKIP_RX, ic); // inside 'strong' in the first P
    const ps = c.querySelectorAll('p');
    expect(ic.parentElement).toBe(c);
    expect(ic.previousSibling).toBe(ps[0]);
    expect(ic.nextSibling).toBe(ps[1]);
    expect(ps[0].textContent).toBe('Be strong');
  });
});
