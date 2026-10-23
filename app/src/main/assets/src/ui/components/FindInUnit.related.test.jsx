/* FindInUnit: exact and related places (search200 ideas D, 2026-10-22). A unit opened from "wept" marked "weeping"
   and "weep" exactly as it marked "wept", and the pill counted them all as places of the word typed. With the typed
   words on the anchor (use-search excerptAnchor's `find.typed`), the places holding a word typed are the places ("1 of
   2", and ‹ › step through them); the places holding only what search matched for it are counted apart ("· 2
   related") and marked with a dotted underline (::highlight(vot-find-related)). With no exact place, the pill counts
   and steps through the related ones. An anchor with no typed words reads as before. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FindInUnit } from './FindInUnit.jsx';
import { findPlaces } from '../../search/snippet.js';

/** @type {any} */ (globalThis).ReactDOM = ReactDOM;
class FakeHighlight { constructor(/** @type {any[]} */ ...ranges) { this.ranges = ranges; } }
const REAL_CSS = globalThis.CSS;
const FILL = 'and the word went on. '.repeat(12);

/** @param {{ anchor: any, blocks: string[] }} p */
function Host({ anchor, blocks }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>{blocks.map((b, i) => <p key={i} data-hl-key={'k' + i}>{b}</p>)}</div>
      <FindInUnit anchor={anchor} unitId="tears" mainRef={mainRef} noun="letter" />
    </div>
  );
}
const find = { terms: ['wept', 'weeping', 'weep'], label: 'wept', typed: ['wept'] };
const anchor = (/** @type {string} */ text, extra = {}) => ({ type: 'excerpt', text, letterId: 'tears', find, ...extra });
const pill = () => /** @type {HTMLElement} */ (document.querySelector('.find-pill'));
const count = () => (pill().querySelector('.find-pill-count') || {}).textContent;
const marked = (/** @type {string} */ name) => {
  const h = /** @type {any} */ (globalThis.CSS.highlights.get(name));
  return h ? h.ranges.map((/** @type {Range} */ r) => r.toString()) : null;
};
const BOTH = ['And Jesus wept at the tomb.', FILL, 'The women were weeping.', FILL, 'Do not weep for Me.', FILL, 'And Peter wept bitterly.'];

beforeEach(() => {
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  /** @type {any} */ (globalThis).Highlight = FakeHighlight;
  /** @type {any} */ (window).VotSearchMini = { findPlaces };
  Element.prototype.scrollTo = vi.fn();
  /** @type {any} */ (Range.prototype).getBoundingClientRect = () => ({ top: 900, bottom: 920, left: 0, right: 50, width: 50, height: 20 });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  delete (/** @type {any} */ (globalThis)).Highlight;
  delete /** @type {any} */ (window).VotSearchMini;
  delete (/** @type {any} */ (Element.prototype)).scrollTo;
  delete /** @type {any} */ (Range.prototype).getBoundingClientRect;
});

describe('FindInUnit: the typed words\' places, and the related ones apart', () => {
  it('counts the places of the word typed, the related ones after, and marks them apart', () => {
    render(<Host anchor={anchor('Jesus wept at the tomb.')} blocks={BOTH} />);
    expect(count()).toBe('1 of 2 · 2 related');
    expect(marked('vot-find-current')).toEqual(['wept']);
    expect(marked('vot-find')).toEqual(['wept']);
    expect(marked('vot-find-related')).toEqual(['weeping', 'weep']);
  });

  it('‹ › step through the places of the word typed only', () => {
    render(<Host anchor={anchor('Jesus wept at the tomb.')} blocks={BOTH} />);
    fireEvent.click(pill().querySelector('[aria-label="Next place"]'));
    expect(count()).toBe('2 of 2 · 2 related');
    expect(marked('vot-find-current')).toEqual(['wept']);
    fireEvent.click(pill().querySelector('[aria-label="Next place"]'));
    expect(count()).toBe('1 of 2 · 2 related');
  });

  it('a landing at the top counts both', () => {
    render(<Host anchor={anchor('And Jesus wept at the tomb.', { top: true })} blocks={BOTH} />);
    expect(count()).toBe('2 places · 2 related');
  });

  it('with no place of the word typed, it counts and steps through the related ones', () => {
    const blocks = ['The women were weeping.', FILL, 'Do not weep for Me.'];
    render(<Host anchor={anchor('The women were weeping.')} blocks={blocks} />);
    expect(count()).toBe('1 of 2 related');
    expect(marked('vot-find-current')).toEqual(['weeping']);
    expect(marked('vot-find-related')).toEqual(['weep']);
    fireEvent.click(pill().querySelector('[aria-label="Next place"]'));
    expect(count()).toBe('2 of 2 related');
    expect(marked('vot-find-current')).toEqual(['weep']);
    cleanup();
    render(<Host anchor={anchor('The women were weeping.', { top: true })} blocks={blocks} />);
    expect(count()).toBe('2 related');
  });

  it('an anchor without the typed words counts every place as before', () => {
    render(<Host anchor={{ type: 'excerpt', text: 'Jesus wept at the tomb.', letterId: 'tears', find: { terms: find.terms, label: 'wept' } }} blocks={BOTH} />);
    expect(count()).toBe('1 of 4');
    expect(marked('vot-find-related')).toEqual([]);
  });
});
