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
