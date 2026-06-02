// @ts-nocheck — tests construct partial link records + DOM fixtures
/* dom-links — inline chain-icon injection over [data-hl-dom] containers.
   ──────────────────────────────────────────────────────────────────────
   applyDOMLinks() reads LinkStore and inserts a tappable chain icon at the
   END of each linked text range inside a container, distinguishing source
   (full gold) from target (dim) and merging links that end at the same
   offset. It had ZERO tests; U15 brings renderer/ under coverage. These
   exercise the placement, the source/target class, merge counting, the
   legacy end-of-block fallback, removal-on-rerun, and the tap handler. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyDOMLinks } from './dom-links.js';

let links;
beforeEach(() => {
  links = [];
  window.LinkStore = { getForKeyPrefix: () => links };
  window.__openLinkSidebar = () => {};
});
afterEach(() => {
  document.body.innerHTML = '';
  delete window.LinkStore;
  delete window.__openLinkSidebar;
});

const setup = (text, key = 'k', dom = true) => {
  document.body.innerHTML = '<div id="c" data-hl-key="' + key + '"' + (dom ? ' data-hl-dom' : '') + '>' + text + '</div>';
  return document.getElementById('c');
};
const icons = (c) => c.querySelectorAll('.inline-link-icon');

describe('applyDOMLinks', () => {
  it('inserts no icon when there are no links', () => {
    const c = setup('Hello world');
    applyDOMLinks();
    expect(icons(c).length).toBe(0);
  });

  it('ignores containers without data-hl-dom', () => {
    links = [{ source: { key: 'k', start: 0, end: 5 }, target: { key: 'x:1:1-2' } }];
    const c = setup('Hello world', 'k', /* dom */ false);
    applyDOMLinks();
    expect(icons(c).length).toBe(0);
  });

  it('places a target-side icon (dim) at the range end, text preserved', () => {
    links = [{ source: { key: 'other:1', end: 2 }, target: { key: 'k:0-5' } }];
    const c = setup('Hello world');
    applyDOMLinks();
    const icon = c.querySelector('.inline-link-icon');
    expect(icon).not.toBeNull();
    expect(icon.classList.contains('inline-link-icon-source')).toBe(false); // target → dim
    expect(icon.title).toBe('1 link');
    expect(c.textContent).toBe('Hello world');
  });

  it('marks a source-side icon with the source class (full gold)', () => {
    links = [{ source: { key: 'k', start: 0, end: 5 }, target: { key: 'x:2:2-3' } }];
    const c = setup('Hello world');
    applyDOMLinks();
    const icon = c.querySelector('.inline-link-icon');
    expect(icon.classList.contains('inline-link-icon-source')).toBe(true);
  });

  it('merges two links ending at the same offset into one icon with a count', () => {
    links = [
      { source: { key: 'other:1', end: 1 }, target: { key: 'k:0-5' } },
      { source: { key: 'k', start: 0, end: 5 }, target: { key: 'z:1:1-2' } },
    ];
    const c = setup('Hello world');
    applyDOMLinks();
    expect(icons(c).length).toBe(1);
    const icon = c.querySelector('.inline-link-icon');
    expect(icon.title).toBe('2 links');
    expect(icon.classList.contains('inline-link-icon-source')).toBe(true); // any source → gold
  });

  it('falls back to a single end-of-block icon for a legacy link (no position)', () => {
    links = [{ source: { key: 'k' }, target: { key: 'other' } }];
    const c = setup('Hello world');
    applyDOMLinks();
    expect(icons(c).length).toBe(1);
    expect(c.lastChild.classList.contains('inline-link-icon')).toBe(true); // appended at end
  });

  it('removes stale icons before re-applying', () => {
    const c = setup('Hello world');
    const stale = document.createElement('span');
    stale.className = 'inline-link-icon';
    c.appendChild(stale);
    links = []; // nothing to re-add
    applyDOMLinks();
    expect(icons(c).length).toBe(0);
  });

  it('opens the link sidebar for the block on tap', () => {
    let opened = null;
    window.__openLinkSidebar = (k) => { opened = k; };
    links = [{ source: { key: 'k', start: 0, end: 5 }, target: { key: 'x:1:1-2' } }];
    const c = setup('Hello world');
    applyDOMLinks();
    c.querySelector('.inline-link-icon').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(opened).toBe('k');
  });
});

/* T4 — icon-placement / slide-off edge coverage for _insertLinkIconAt.
   ─────────────────────────────────────────────────────────────────────
   The suite above placed every icon at a clean word boundary in bare text,
   so the slide-off logic (the bulk of the file — and the code that runs on
   EVERY Android annotation render) was untested. These pin the documented
   placement rules at the offsets that actually trigger them: mid-word/punct
   slide, skip-element jump (adjacent + when the offset lands inside one),
   cross-text-node flow through inline <em>, the block-boundary stop, the two
   end-of-block fallbacks (offset past all text; nextInsertionPoint climbing
   out to the container), multi-offset placement, the dim legacy target-only
   link, and removal-on-rerun when the stale icon is nested inside a <mark>
   (the real production DOM, where applyDOMHighlights has already wrapped the
   text in marks before the link/bookmark pass runs). */
describe('applyDOMLinks — icon placement & slide-off (T4)', () => {
  // One source-side link whose range ends at global offset `end`.
  const linkEndingAt = (end) => { links = [{ source: { key: 'k', start: 0, end } }]; };
  const firstIcon = (c) => c.querySelector('.inline-link-icon');

  it('slides a mid-word end forward to the word boundary', () => {
    linkEndingAt(2); // mid-"Hello"
    const c = setup('Hello world');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.nodeValue).toBe('Hello');
    expect(icon.nextSibling.nodeValue).toBe(' world');
    expect(c.textContent).toBe('Hello world');
  });

  it('slides past closing punctuation so the icon hugs the word', () => {
    linkEndingAt(4); // right after "word", before "."
    const c = setup('word. Next');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.nodeValue).toBe('word.');
    expect(icon.nextSibling.nodeValue).toBe(' Next');
  });

  it('slides PAST an adjacent skip element (fn-ref) instead of landing before it', () => {
    linkEndingAt(7); // end of "written", directly before the fn-ref bubble
    const c = setup('written<span class="fn-ref">1</span> more');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.className).toContain('fn-ref'); // landed AFTER the fn-ref
    expect(icon.nextSibling.nodeValue).toBe(' more');
  });

  it('slides past the whole skip element when the end lands INSIDE it', () => {
    linkEndingAt(3); // inside the fn-ref's "12" text node
    const c = setup('go<span class="fn-ref">12</span>end');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.className).toContain('fn-ref');
    expect(icon.nextSibling.nodeValue).toBe('end');
  });

  it('flows the icon through an inline <em> phrase across the text-node boundary', () => {
    linkEndingAt(4); // boundary before <em>; follows "same?" into the em
    const c = setup('the <em>same?</em> Then');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.tagName).toBe('EM');
    expect(icon.nextSibling.nodeValue).toBe(' Then');
  });

  it('stops the slide at a block boundary (does not cross a <br>)', () => {
    linkEndingAt(4); // end of "done"; a <br> follows
    const c = setup('done<br>next');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon.previousSibling.nodeValue).toBe('done');
    expect(icon.nextSibling.tagName).toBe('BR'); // before the br, not after it
  });

  it('appends an end-of-block icon when the end offset is past all text', () => {
    linkEndingAt(99);
    const c = setup('Hi');
    applyDOMLinks();
    expect(icons(c).length).toBe(1);
    expect(c.lastChild.classList.contains('inline-link-icon')).toBe(true);
  });

  it('climbs out to the container and appends when the final node has no next sibling', () => {
    // end-of-"written." inside a wrapper span; the only following node is a skip
    // fn-ref, so nextInsertionPoint walks up and out, then appends at block end.
    linkEndingAt(8);
    const c = setup('<span>written.</span><span class="fn-ref">1</span>');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.previousSibling.className).toContain('fn-ref');
  });

  it('places two links at distinct offsets, each correctly', () => {
    links = [
      { source: { key: 'k', start: 0, end: 3 } }, // → after "abc"
      { source: { key: 'k', start: 4, end: 7 } }, // → after "def"
    ];
    const c = setup('abc def ghi');
    applyDOMLinks();
    const all = icons(c);
    expect(all.length).toBe(2);
    expect(all[0].previousSibling.nodeValue).toBe('abc');
    expect(all[1].previousSibling.nodeValue).toBe(' def');
    expect(c.textContent).toBe('abc def ghi');
  });

  it('appends a DIM end-of-block icon for a legacy target-only link', () => {
    links = [{ source: { key: 'other' }, target: { key: 'k' } }]; // bare key, no position
    const c = setup('Hello world');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(icon).not.toBeNull();
    expect(icon.classList.contains('inline-link-icon-source')).toBe(false); // target → dim
    expect(c.lastChild).toBe(icon);
  });

  it('removes a stale icon nested inside a <mark> and re-places cleanly', () => {
    const c = setup('<mark class="hl-yellow" data-hl-id="x">Hello</mark> world');
    const stale = document.createElement('span');
    stale.className = 'inline-link-icon';
    c.querySelector('mark').appendChild(stale); // stale icon nested inside the mark
    links = [{ source: { key: 'k', start: 0, end: 5 } }];
    applyDOMLinks();
    const all = icons(c);
    expect(all.length).toBe(1);
    expect(all[0].parentNode).toBe(c); // re-placed outside the mark, at the boundary
    expect(c.textContent).toBe('Hello world');
  });

  it('appends when the end is inside a skip element that is the last node', () => {
    // fn-ref at end of block, nothing insertable after it → append to container.
    linkEndingAt(3); // inside the trailing fn-ref's "12"
    const c = setup('go<span class="fn-ref">12</span>');
    applyDOMLinks();
    const icon = firstIcon(c);
    expect(c.lastChild).toBe(icon);
    expect(icon.previousSibling.className).toContain('fn-ref');
  });
});
