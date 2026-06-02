// @ts-nocheck — tests construct partial bookmark records + DOM fixtures
/* dom-bookmarks — inline flag-icon injection over [data-hl-dom] containers.
   ──────────────────────────────────────────────────────────────────────
   applyDOMBookmarks() reads BookmarkStore and inserts a tappable flag icon
   at each bookmarked range end, merging bookmarks at the same offset (with a
   multi class + count), pulsing freshly-created ones, and falling back to an
   end-of-block icon for position-less bookmarks. Single tap opens the edit
   sheet; multi opens the disambiguation popover. ZERO tests before U15. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyDOMBookmarks } from './dom-bookmarks.js';

let bookmarks;
beforeEach(() => {
  bookmarks = [];
  window.BookmarkStore = { getForKeyPrefix: () => bookmarks };
  window.__bookmarkEdit = () => {};
  window.__openBookmarkPopover = () => {};
});
afterEach(() => {
  document.body.innerHTML = '';
  delete window.BookmarkStore;
  delete window.__bookmarkEdit;
  delete window.__openBookmarkPopover;
});

const setup = (text, key = 'k', dom = true) => {
  document.body.innerHTML = '<div id="c" data-hl-key="' + key + '"' + (dom ? ' data-hl-dom' : '') + '>' + text + '</div>';
  return document.getElementById('c');
};
const icons = (c) => c.querySelectorAll('.inline-bookmark-icon');

describe('applyDOMBookmarks', () => {
  it('inserts no icon when there are no bookmarks', () => {
    const c = setup('Hello world');
    applyDOMBookmarks();
    expect(icons(c).length).toBe(0);
  });

  it('ignores containers without data-hl-dom', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k:0-5', created: 1 }];
    const c = setup('Hello world', 'k', false);
    applyDOMBookmarks();
    expect(icons(c).length).toBe(0);
  });

  it('places a single icon at the range end with its id + title, text preserved', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k:0-5', created: 1 }];
    const c = setup('Hello world');
    applyDOMBookmarks();
    const icon = c.querySelector('.inline-bookmark-icon');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('data-bkm-ids')).toBe('b1');
    expect(icon.title).toBe('Bookmark');
    expect(icon.classList.contains('inline-bookmark-icon-multi')).toBe(false);
    expect(c.textContent).toBe('Hello world');
  });

  it('appends an end-of-block icon for a position-less bookmark', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k', created: 1 }];
    const c = setup('Hello world');
    applyDOMBookmarks();
    expect(icons(c).length).toBe(1);
    expect(c.lastChild.classList.contains('inline-bookmark-icon')).toBe(true);
  });

  it('merges multiple bookmarks at the same offset into one multi icon', () => {
    bookmarks = [
      { id: 'b1', hlKey: 'k:0-5', created: 1 },
      { id: 'b2', hlKey: 'k:0-5', created: 1 },
    ];
    const c = setup('Hello world');
    applyDOMBookmarks();
    expect(icons(c).length).toBe(1);
    const icon = c.querySelector('.inline-bookmark-icon');
    expect(icon.classList.contains('inline-bookmark-icon-multi')).toBe(true);
    expect(icon.getAttribute('data-bkm-ids')).toBe('b1,b2');
    expect(icon.title).toBe('2 bookmarks');
  });

  it('pulses a freshly-created bookmark, not an old one', () => {
    bookmarks = [{ id: 'fresh', hlKey: 'k:0-5', created: Date.now() }];
    let c = setup('Hello world');
    applyDOMBookmarks();
    expect(c.querySelector('.inline-bookmark-icon').classList.contains('just-created')).toBe(true);

    bookmarks = [{ id: 'old', hlKey: 'k:0-5', created: Date.now() - 999999 }];
    c = setup('Hello world');
    applyDOMBookmarks();
    expect(c.querySelector('.inline-bookmark-icon').classList.contains('just-created')).toBe(false);
  });

  it('removes stale icons before re-applying', () => {
    const c = setup('Hello world');
    const stale = document.createElement('span');
    stale.className = 'inline-bookmark-icon';
    c.appendChild(stale);
    bookmarks = [];
    applyDOMBookmarks();
    expect(icons(c).length).toBe(0);
  });

  it('opens the edit sheet (atSource) for a single bookmark on tap', () => {
    let edited = null;
    window.__bookmarkEdit = (id, opts) => { edited = { id, opts }; };
    bookmarks = [{ id: 'b1', hlKey: 'k:0-5', created: 1 }];
    const c = setup('Hello world');
    applyDOMBookmarks();
    c.querySelector('.inline-bookmark-icon').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(edited).toEqual({ id: 'b1', opts: { atSource: true } });
  });

  it('opens the disambiguation popover for a multi-bookmark icon on tap', () => {
    let popoverIds = null;
    window.__openBookmarkPopover = (ids) => { popoverIds = ids; };
    bookmarks = [
      { id: 'b1', hlKey: 'k:0-5', created: 1 },
      { id: 'b2', hlKey: 'k:0-5', created: 1 },
    ];
    const c = setup('Hello world');
    applyDOMBookmarks();
    c.querySelector('.inline-bookmark-icon').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(popoverIds).toEqual(['b1', 'b2']);
  });
});

/* T4 — icon-placement / slide-off edge coverage for _insertBookmarkIconAt.
   ─────────────────────────────────────────────────────────────────────
   _insertBookmarkIconAt shares the slide-off algorithm with _insertLinkIconAt
   but threads the just-created pulse class through every placement branch and
   adds inline-link-icon / inline-bookmark-icon to its skip list (bookmarks
   render AFTER links in the same pass, so they must not land on top of a link
   icon). The suite above only placed icons at clean boundaries; these pin the
   slide rules at the offsets that trigger them, the cross-overlay skip, the
   just-created threading on a slid + a fallback placement, and removal-on-rerun
   under a <mark> (the real post-applyDOMHighlights DOM). */
describe('applyDOMBookmarks — icon placement & slide-off (T4)', () => {
  // One bookmark whose range ends at global offset `end` (optionally merged with extra fields).
  const bkmEndingAt = (end, extra) => {
    bookmarks = [Object.assign({ id: 'b1', hlKey: 'k:0-' + end, created: 1 }, extra)];
  };
  const firstIcon = (c) => c.querySelector('.inline-bookmark-icon');

  it('slides a mid-word end forward to the word boundary', () => {
    bkmEndingAt(2); // mid-"Hello"
    const c = setup('Hello world');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.nodeValue).toBe('Hello');
    expect(icon.nextSibling.nodeValue).toBe(' world');
    expect(c.textContent).toBe('Hello world');
  });

  it('slides past closing punctuation so the icon hugs the word', () => {
    bkmEndingAt(4);
    const c = setup('word. Next');
    applyDOMBookmarks();
    expect(firstIcon(c).previousSibling.nodeValue).toBe('word.');
  });

  it('slides PAST an adjacent skip element (fn-ref)', () => {
    bkmEndingAt(7);
    const c = setup('written<span class="fn-ref">1</span> more');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.className).toContain('fn-ref');
    expect(icon.nextSibling.nodeValue).toBe(' more');
  });

  it('slides past the whole skip element when the end lands INSIDE it', () => {
    bkmEndingAt(3);
    const c = setup('go<span class="fn-ref">12</span>end');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.className).toContain('fn-ref');
    expect(icon.nextSibling.nodeValue).toBe('end');
  });

  it('flows the icon through an inline <em> phrase across the text-node boundary', () => {
    bkmEndingAt(4);
    const c = setup('the <em>same?</em> Then');
    applyDOMBookmarks();
    expect(firstIcon(c).previousSibling.tagName).toBe('EM');
  });

  it('stops the slide at a block boundary (does not cross a <br>)', () => {
    bkmEndingAt(4);
    const c = setup('done<br>next');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.nodeValue).toBe('done');
    expect(icon.nextSibling.tagName).toBe('BR');
  });

  it('slides past an existing inline-link-icon (cross-overlay skip)', () => {
    // Bookmarks render after links; a bookmark ending where a link icon already
    // sits must skip past it, not stack on top.
    bkmEndingAt(4);
    const c = setup('done<span class="inline-link-icon"></span>');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.previousSibling.className).toContain('inline-link-icon');
  });

  it('appends an end-of-block icon (keeping just-created) when the offset is past all text', () => {
    bkmEndingAt(99, { created: Date.now() });
    const c = setup('Hi');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.classList.contains('just-created')).toBe(true);
  });

  it('climbs out to the container and appends when the final node has no next sibling', () => {
    bkmEndingAt(8);
    const c = setup('<span>written.</span><span class="fn-ref">1</span>');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.previousSibling.className).toContain('fn-ref');
  });

  it('places multiple bookmarks at distinct offsets', () => {
    bookmarks = [
      { id: 'b1', hlKey: 'k:0-3', created: 1 },
      { id: 'b2', hlKey: 'k:4-7', created: 1 },
    ];
    const c = setup('abc def ghi');
    applyDOMBookmarks();
    const all = icons(c);
    expect(all.length).toBe(2);
    expect(all[0].previousSibling.nodeValue).toBe('abc');
    expect(all[1].previousSibling.nodeValue).toBe(' def');
  });

  it('threads the just-created pulse through a slid placement', () => {
    bkmEndingAt(2, { created: Date.now() });
    const c = setup('Hello world');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(icon.classList.contains('just-created')).toBe(true);
    expect(icon.previousSibling.nodeValue).toBe('Hello'); // and still slid correctly
  });

  it('removes a stale icon nested inside a <mark> and re-places cleanly', () => {
    const c = setup('<mark class="hl-yellow" data-hl-id="x">Hello</mark> world');
    const stale = document.createElement('span');
    stale.className = 'inline-bookmark-icon';
    c.querySelector('mark').appendChild(stale);
    bookmarks = [{ id: 'b1', hlKey: 'k:0-5', created: 1 }];
    applyDOMBookmarks();
    const all = icons(c);
    expect(all.length).toBe(1);
    expect(all[0].parentNode).toBe(c);
    expect(c.textContent).toBe('Hello world');
  });

  it('appends when the end is inside a skip element that is the last node', () => {
    bkmEndingAt(3); // inside the trailing fn-ref's "12"
    const c = setup('go<span class="fn-ref">12</span>');
    applyDOMBookmarks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.previousSibling.className).toContain('fn-ref');
  });

  it('skips a malformed bookmark with no hlKey', () => {
    bookmarks = [{ id: 'nope', created: 1 }]; // no hlKey → guarded out
    const c = setup('Hello world');
    applyDOMBookmarks();
    expect(icons(c).length).toBe(0);
  });
});
