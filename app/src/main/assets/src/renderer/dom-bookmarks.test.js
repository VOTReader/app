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
