/* FindInUnit: Find in this letter (idea 160, Corbin yes 2026-10-23). The ⋯ menu offers "Find in this letter"
   on a unit FindInUnit is mounted in; it opens the same pill with a text field where the search words sit.
   What is typed is found by the same findPlaces and marked with the same highlights; Enter steps on,
   Shift+Enter back, "No matches" is said calmly, × and Escape / Back (the modal registry) close it, and
   nothing of it outlives the unit it was typed in. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FindInUnit, typedFind } from './FindInUnit.jsx';
import { findPlaces } from '../../search/snippet.js';
import { pageMenu } from '../../utils/page-menu.js';
import { modalRegistry } from '../../hooks/use-modal-registry.js';

/** @type {any} */ (globalThis).ReactDOM = ReactDOM;
class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
const REAL_CSS = globalThis.CSS;

function Host({ anchor = null, unitId = 'vengeance', noun = 'letter' }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key="letter:vengeance:0">I shall bring upon them a flooding rain<sup className="fn-ref">1</sup>, a great deluge.</p>
        <p data-hl-key="letter:vengeance:1">{'and the word went on. '.repeat(12)}</p>
        <p data-hl-key="letter:vengeance:2">nor shall I flood the face of the earth in My anger.</p>
        <p data-hl-key="letter:vengeance:3">{'and the word went on. '.repeat(12)}</p>
        <div data-hl-key="letter:vengeance:4">For that which I pour out shall not<br />Be a flood of water which covers,</div>
        <ol className="footnotes"><li>Genesis 7:17 the flood was forty days</li></ol>
      </div>
      <FindInUnit anchor={anchor} unitId={unitId} mainRef={mainRef} noun={noun} keyPrefix={'letter:' + unitId + ':'} />
    </div>
  );
}
const pill = () => document.querySelector('.find-pill');
const field = () => /** @type {HTMLInputElement | null} */ (document.querySelector('.find-pill-input'));
const count = () => (document.querySelector('.find-pill-count') || {}).textContent;
const marked = (name) => {
  const h = /** @type {any} */ (globalThis.CSS.highlights.get(name));
  return h ? h.ranges.map((r) => r.toString()) : null;
};
/** Pick the ⋯ menu's item, as MoreMenu does on a tap. */
const openFromMenu = () => {
  const items = pageMenu();
  const it = items && items.find((i) => i.key === 'find-in-unit');
  act(() => { it.onSelect(); });
};
const typeIn = (text) => {
  act(() => { fireEvent.change(field(), { target: { value: text } }); });
  act(() => { vi.advanceTimersByTime(200); });
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  /** @type {any} */ (globalThis).Highlight = FakeHighlight;
  /** @type {any} */ (window).VotSearchMini = { findPlaces };
  Element.prototype.scrollTo = vi.fn();
  /** @type {any} */ (Range.prototype).getBoundingClientRect = () => ({ top: 900, bottom: 920, left: 0, right: 50, width: 50, height: 20 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  delete globalThis.Highlight;
  delete /** @type {any} */ (window).VotSearchMini;
  delete /** @type {any} */ (window).VotSearchData;
  delete Element.prototype.scrollTo;
  delete /** @type {any} */ (Range.prototype).getBoundingClientRect;
  /** @type {any} */ (globalThis).__votPageMenu = null;
});

describe('typedFind: what was typed, as the pill\'s find', () => {
  it('a word is its own find, and every word typed is exact (nothing counted apart)', () => {
    expect(typedFind(' Flood ')).toEqual({ terms: ['flood'], label: 'Flood', typed: ['flood'] });
  });
  it('several words lead with their phrase', () => {
    expect(typedFind('flood of  water')).toEqual({ terms: ['flood of water', 'flood', 'of', 'water'], label: 'flood of water', typed: ['flood', 'of', 'water'] });
  });
  it('a small word among real ones is glue; small words alone still count', () => {
    const stop = new Set(['the', 'of', 'a']);
    expect(typedFind('the flood', stop).typed).toEqual(['flood']);
    expect(typedFind('the flood', stop).terms).toEqual(['the flood', 'flood']);
    expect(typedFind('of the', stop).typed).toEqual(['of', 'the']);
  });
  it('nothing to find until a word of two letters', () => {
    expect(typedFind('')).toBeNull();
    expect(typedFind('  f ')).toBeNull();
    expect(typedFind('—')).toBeNull();
  });
});

describe('Find in this letter: the ⋯ menu item', () => {
  it('is offered while the unit is mounted, named for it, and gone once it is not', () => {
    const { unmount } = render(<Host noun="entry" />);
    const items = pageMenu();
    expect(items.map((i) => [i.key, i.label, i.icon])).toEqual([['find-in-unit', 'Find in this entry', 'find']]);
    unmount();
    expect(pageMenu()).toBeNull();
  });

  it('opens the pill with a focused field and no count until a word is typed', () => {
    render(<Host />);
    expect(pill()).toBeNull();
    openFromMenu();
    expect(pill()).not.toBeNull();
    expect(pill().classList.contains('find-pill-ask')).toBe(true);
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute('aria-label')).toBe('Find in this letter');
    expect(count()).toBe('');
    expect(pill().parentElement).toBe(document.body);
  });
});

describe('Find in this letter: the field feeds the same pill', () => {
  it('counts and marks the places with the reader\'s own matching (word starts, the unit\'s blocks only)', () => {
    render(<Host />);
    openFromMenu();
    typeIn('flood');
    // "flooding", "flood", "flood": the footnote list's flood is not the letter's words
    expect(count()).toBe('1 of 3');
    expect(marked('vot-find-current')).toEqual(['flooding']);
    expect(marked('vot-find')).toEqual(['flood', 'flood']);
    expect(marked('vot-find-related')).toEqual([]);
  });

  it('Enter steps to the next place and Shift+Enter back, each one reader write', () => {
    render(<Host />);
    openFromMenu();
    typeIn('flood');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(count()).toBe('2 of 3');
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(count()).toBe('1 of 3');
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(count()).toBe('3 of 3');
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    fireEvent.click(document.querySelector('[aria-label="Previous place"]'));
    expect(count()).toBe('2 of 3');
  });

  it('Enter before the beat has passed finds what the field holds, without stepping past it', () => {
    render(<Host />);
    openFromMenu();
    act(() => { fireEvent.change(field(), { target: { value: 'deluge' } }); });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(count()).toBe('1 of 1');
    expect(marked('vot-find-current')).toEqual(['deluge']);
  });

  it('says "No matches" calmly, marks nothing, and steps nowhere', () => {
    render(<Host />);
    openFromMenu();
    typeIn('flood');
    typeIn('zebra');
    expect(count()).toBe('No matches');
    expect(document.querySelector('.find-pill-none')).not.toBeNull();
    expect(marked('vot-find')).toEqual([]);
    expect(/** @type {HTMLButtonElement} */ (document.querySelector('[aria-label="Next place"]')).disabled).toBe(true);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(count()).toBe('No matches');
  });

  it('a phrase of the letter\'s own words leads its place', () => {
    /** @type {any} */ (window).VotSearchData = { STOP_WORDS: new Set(['of', 'the', 'a']) };
    render(<Host />);
    openFromMenu();
    typeIn('flood of water');
    expect(count()).toBe('1 of 1');
    // the place where the words run together is the one counted, its run marked whole
    expect(marked('vot-find-current')).toContain('flood of water');
  });
});

describe('Find in this letter: it closes, and leaves nothing behind', () => {
  it('× closes it and takes the marks with it', () => {
    render(<Host />);
    openFromMenu();
    typeIn('flood');
    fireEvent.click(document.querySelector('[aria-label="Close find"]'));
    expect(pill()).toBeNull();
    expect(globalThis.CSS.highlights.size).toBe(0);
  });

  it('Escape / Android Back close it through the modal registry, and only while it is open', () => {
    render(<Host />);
    expect(modalRegistry.isAnyOpen()).toBe(false);
    openFromMenu();
    typeIn('flood');
    expect(modalRegistry.isAnyOpen()).toBe(true);
    act(() => { modalRegistry.peek().dismiss(); });
    expect(pill()).toBeNull();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('closing it does not bring back the search pill it replaced', () => {
    const anchor = { type: 'excerpt', text: 'nor shall I flood the face', letterId: 'vengeance', find: { terms: ['deluge'], label: 'deluge' } };
    render(<Host anchor={anchor} />);
    expect(count()).toBe('1 of 1');
    openFromMenu();
    expect(field()).not.toBeNull();
    typeIn('flood');
    fireEvent.click(document.querySelector('[aria-label="Close find"]'));
    expect(pill()).toBeNull();
  });

  it('the next unit opens with no field and no pill (no stale find)', () => {
    const { rerender } = render(<Host />);
    openFromMenu();
    typeIn('flood');
    rerender(<Host unitId="other" />);
    expect(pill()).toBeNull();
    expect(globalThis.CSS.highlights.size).toBe(0);
    rerender(<Host unitId="vengeance" />);
    expect(pill()).toBeNull();
  });

  it('a new search landing replaces the typed find with its own pill', () => {
    const { rerender } = render(<Host />);
    openFromMenu();
    typeIn('flood');
    const anchor = { type: 'excerpt', text: 'I shall bring upon them', letterId: 'vengeance', find: { terms: ['deluge'], label: 'deluge' } };
    rerender(<Host anchor={anchor} />);
    expect(field()).toBeNull();
    expect(document.querySelector('.find-pill-word').textContent).toBe('deluge');
  });
});
