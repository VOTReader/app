// @ts-nocheck — partial stores and DOM fixtures
/* W65 (sweep 2026-10-13): the inline note, bookmark and link icons in the reading text were bare spans with a
   click listener (no role, no Tab stop, no name, no Enter), so a keyboard or screen-reader reader could not open
   any of them. Every one of the six builders now makes a named button: role=button, tabIndex 0, an aria-label
   that says what it opens, Enter and Space run the tap's own path, and the svg is out of the accessibility tree.
   Pattern: FootnoteListSection's number. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { applyDOMLinks } from './dom-links.js';
import { applyDOMBookmarks } from './dom-bookmarks.js';
import { applyNoteIcons, HighlightableText } from './annotation-engine.jsx';
import { BookmarkIcon } from '../ui/components/BookmarkIcon.jsx';
import { LinkIcon } from '../ui/components/LinkIcon.jsx';

const key = (el, k) => fireEvent.keyDown(el, { key: k });

/** The shape every icon must have. */
function expectNamedButton(el, label) {
  expect(el, 'icon rendered').not.toBeNull();
  expect(el.getAttribute('role')).toBe('button');
  expect(el.getAttribute('tabindex')).toBe('0');
  expect(el.getAttribute('aria-label')).toBe(label);
  expect(el.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
}

let links, bookmarks;
beforeEach(() => {
  links = [];
  bookmarks = [];
  window.LinkStore = { getForKeyPrefix: () => links, getForKey: () => links, subscribe: () => () => {}, getVersion: () => 0 };
  window.BookmarkStore = { getForKeyPrefix: () => bookmarks, subscribe: () => () => {}, getVersion: () => 0 };
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  delete window.LinkStore; delete window.BookmarkStore; delete window.AnnotationStore; delete window.NoteStore;
  delete window.__openLinkSidebar; delete window.__bookmarkEdit; delete window.__openBookmarkPopover;
  delete window.__openNote; delete window.__showMultiNote;
});

const block = (html) => {
  document.body.innerHTML = '<div id="c" data-hl-key="k" data-hl-dom>' + html + '</div>';
  return document.getElementById('c');
};

describe('W65: the DOM-built icons (letters, WTLB, journal)', () => {
  it('a link icon is a named button; Enter and Space open the links, other keys do nothing', () => {
    links = [
      { source: { key: 'k', start: 0, end: 9, text: 'Be strong' }, target: { key: 'x:1' } },
      { source: { key: 'k', start: 0, end: 9, text: 'Be strong' }, target: { key: 'x:2' } },
    ];
    const c = block('<p>Be strong and of good courage.</p>');
    applyDOMLinks();
    const icon = c.querySelector('.inline-link-icon');
    expectNamedButton(icon, 'Open 2 links');
    window.__openLinkSidebar = vi.fn();
    key(icon, 'Tab');
    expect(window.__openLinkSidebar).not.toHaveBeenCalled();
    key(icon, 'Enter');
    key(icon, ' ');
    expect(window.__openLinkSidebar).toHaveBeenCalledTimes(2);
    expect(window.__openLinkSidebar).toHaveBeenCalledWith('k');
  });

  it('a one-link icon says "Open link"', () => {
    links = [{ source: { key: 'k' }, target: { key: 'x:1' } }];   // legacy: one icon at the block end
    const c = block('<p>Be strong.</p>');
    applyDOMLinks();
    expectNamedButton(c.querySelector('.inline-link-icon'), 'Open link');
  });

  it('a bookmark icon is a named button; Enter opens the bookmark the way a tap does', () => {
    bookmarks = [{ id: 'b1', hlKey: 'k:0-9', text: 'Be strong', created: 1 }];
    const c = block('<p>Be strong and of good courage.</p>');
    applyDOMBookmarks();
    const icon = c.querySelector('.inline-bookmark-icon');
    expectNamedButton(icon, 'Open bookmark');
    window.__bookmarkEdit = vi.fn();
    key(icon, 'Enter');
    expect(window.__bookmarkEdit).toHaveBeenCalledWith('b1', { atSource: true });
  });

  it('two bookmarks at one place: "Open 2 bookmarks", and Space opens the chooser under the icon', () => {
    bookmarks = [
      { id: 'b1', hlKey: 'k:0-9', created: 1 },
      { id: 'b2', hlKey: 'k:0-9', created: 2 },
    ];
    const c = block('<p>Be strong and of good courage.</p>');
    applyDOMBookmarks();
    const icon = c.querySelector('.inline-bookmark-icon');
    expectNamedButton(icon, 'Open 2 bookmarks');
    window.__openBookmarkPopover = vi.fn();
    key(icon, ' ');
    expect(window.__openBookmarkPopover).toHaveBeenCalledTimes(1);
    expect(window.__openBookmarkPopover.mock.calls[0][0]).toEqual(['b1', 'b2']);
  });

  it('a note icon is a named button; Enter opens the note', () => {
    const c = block('<p><mark class="hl-mark hl-note hl-yellow" data-group-id="gn">noted</mark> tail</p>');
    applyNoteIcons();
    const icon = c.querySelector('.hl-note-icon');
    expectNamedButton(icon, 'Open note');
    window.__openNote = vi.fn();
    key(icon, 'Enter');
    expect(window.__openNote).toHaveBeenCalledWith('gn');
  });

  it('two notes at one place: "Open 2 notes", and Enter opens the list under the icon', () => {
    const c = block('<p><mark class="hl-mark hl-note hl-yellow" data-group-id="g1">noted</mark><mark class="hl-mark hl-note hl-yellow" data-group-id="g2"></mark> tail</p>');
    applyNoteIcons();
    const icon = c.querySelector('.hl-note-icon');
    expectNamedButton(icon, 'Open 2 notes');
    icon.getBoundingClientRect = () => ({ left: 100, width: 20, top: 50, bottom: 70, right: 120, height: 20 });
    window.__showMultiNote = vi.fn();
    key(icon, 'Enter');
    expect(window.__showMultiNote).toHaveBeenCalledWith(['g1', 'g2'], 110, 74);
  });
});

describe('W65: the React-rendered icons (Bible, Matthew Study, chapters)', () => {
  it('the verse note icon is a named button; Enter opens the note', () => {
    window.AnnotationStore = {
      get: (k) => (k === 'k:v' ? [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', start: 0, end: 5 }] : []),
      subscribe: () => () => {}, getVersion: () => 0, getVersionForKey: () => 0,
    };
    window.NoteStore = {
      get: (gid) => (gid === 'g1' ? { groupId: 'g1', body: 'a note' } : null),
      subscribe: () => () => {}, getVersion: () => 0, getVersionForKey: () => 0,
    };
    const { container } = render(<HighlightableText text="hello world" hlKey="k:v" />);
    const icon = container.querySelector('.hl-note-icon');
    expectNamedButton(icon, 'Open note');
    window.__openNote = vi.fn();
    key(icon, 'Enter');
    expect(window.__openNote).toHaveBeenCalledWith('g1');
  });

  it('BookmarkIcon is a named button; Enter opens the bookmark', () => {
    bookmarks = [{ id: 'b1', hlKey: 'bible:john:3:16' }];
    const { container } = render(<BookmarkIcon hlKey="bible:john:3:16" />);
    const icon = container.querySelector('.inline-bookmark-icon');
    expectNamedButton(icon, 'Open bookmark');
    window.__bookmarkEdit = vi.fn();
    key(icon, 'Enter');
    expect(window.__bookmarkEdit).toHaveBeenCalledWith('b1', { atSource: true });
  });

  it('LinkIcon is a named button; Space opens the links', () => {
    links = [{ source: { key: 'bible:john:3:16' }, target: { key: 'x:1' } }, { source: { key: 'bible:john:3:16' }, target: { key: 'x:2' } }];
    const onClick = vi.fn();
    const { container } = render(<LinkIcon hlKey="bible:john:3:16" onClick={onClick} />);
    const icon = container.querySelector('.verse-link-icon');
    expectNamedButton(icon, 'Open 2 links');
    key(icon, 'a');
    expect(onClick).not.toHaveBeenCalled();
    key(icon, ' ');
    expect(onClick).toHaveBeenCalledWith('bible:john:3:16');
  });
});
