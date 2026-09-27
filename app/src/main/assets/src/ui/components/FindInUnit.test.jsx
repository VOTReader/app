/* FindInUnit — a unit opened from search marks every place the words appear and
   steps between them (Brianna, 2026-09-26: "flood" in Vengeance Is Mine). The
   places come from the search's own findPlaces over the RENDERED text; the marks
   are CSS Custom Highlights (stubbed here the way the read-along tests stub them). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { FindInUnit, readUnitText, rangeFor, locate, placeAt } from './FindInUnit.jsx';
import { findPlaces } from '../../search/snippet.js';

// ReactDOM is a runtime global in the app (bundle-a UMD); the pill portals through it.
/** @type {any} */ (globalThis).ReactDOM = ReactDOM;
class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
const REAL_CSS = globalThis.CSS;

/** The letter the way LetterView builds it: prose, a footnote number, a stanza of lines. */
function Host({ anchor, unitId = 'vengeance' }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key="k0">I shall bring upon them a flooding rain<sup className="fn-ref">1</sup>, a great deluge.</p>
        <p data-hl-key="k1">{'and the word went on. '.repeat(12)}</p>
        <p data-hl-key="k2">nor shall I flood the face of the earth in My anger.</p>
        <p data-hl-key="k3">{'and the word went on. '.repeat(12)}</p>
        <div data-hl-key="k4">For that which I pour out shall not<br />Be a flood of water which covers,<br />But a flood of judgment to destroy,</div>
      </div>
      <FindInUnit anchor={anchor} unitId={unitId} mainRef={mainRef} noun="letter" />
    </div>
  );
}
const anchor = (text, extra = {}) => ({ type: 'excerpt', text, letterId: 'vengeance', find: { terms: ['flood', 'flooding'], label: 'flood' }, ...extra });
const pill = () => document.querySelector('.find-pill');
const marked = (name) => {
  const h = /** @type {any} */ (globalThis.CSS.highlights.get(name));
  return h ? h.ranges.map((r) => r.toString()) : null;
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  /** @type {any} */ (globalThis).Highlight = FakeHighlight;
  /** @type {any} */ (window).VotSearchMini = { findPlaces };
  // jsdom has no layout: a scroller that records the one write a step makes, and
  // ranges that stand somewhere below it
  Element.prototype.scrollTo = vi.fn();
  /** @type {any} */ (Range.prototype).getBoundingClientRect = () => ({ top: 900, bottom: 920, left: 0, right: 50, width: 50, height: 20 });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  delete globalThis.Highlight;
  delete /** @type {any} */ (window).VotSearchMini;
  delete Element.prototype.scrollTo;
  delete /** @type {any} */ (Range.prototype).getBoundingClientRect;
});

describe('readUnitText — the words the reader sees', () => {
  it('skips footnote numbers, reads a line break and a block as a space, and maps back to the text nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>a flood<sup class="fn-ref">1</sup> came</p><div>line one<br>line two</div><p style="display:none">hidden flood</p>';
    const { flat, segs } = readUnitText(root);
    expect(flat).toBe('a flood came line one line two ');
    expect(flat).not.toContain('hidden');
    const at = flat.indexOf('flood');
    expect(rangeFor(segs, at, at + 5).toString()).toBe('flood');
  });

  it('a word split across two text nodes (an annotation mark) is one range', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>the flo<mark>od</mark> rose</p>';
    const { flat, segs } = readUnitText(root);
    const at = flat.indexOf('flood');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(rangeFor(segs, at, at + 5).toString()).toBe('flood');
  });
});

describe('readUnitText with a key prefix — the unit’s own blocks only', () => {
  it('reads the keyed blocks and never the footnote list, links or cards the body also holds (review of b3841d3e)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p data-hl-key="letter:v:0">a flood came</p>'
      + '<ol class="footnotes"><li>Genesis 7:17 the flood was forty days</li></ol>'
      + '<div data-hl-key="letter:v:g1:0"><p>a flood of judgment</p></div>'
      + '<div class="related"><a>God Speaks About the Flood</a></div>'
      + '<p data-hl-key="letter:vv:0">another letter’s flood</p>'
      + '<p data-hl-key="letter:v:9" style="display:none">a hidden flood</p>';
    const { flat } = readUnitText(root, 'letter:v:');
    expect(flat.trim().replace(/\s+/g, ' ')).toBe('a flood came a flood of judgment');
  });
});

describe('placeAt — the place the landing is in', () => {
  it('the place whose span holds the landing, even when it does not start there (review of b3841d3e)', () => {
    // a card grouped its places around its snippet: the tapped one starts at 100,
    // inside this list's first place (0-105), not at the second's start (130)
    const places = [{ start: 0, span: 105 }, { start: 130, span: 5 }, { start: 250, span: 5 }];
    expect(placeAt(places, 100)).toBe(0);
    expect(placeAt(places, 131)).toBe(1);
    expect(placeAt(places, 200)).toBe(2);   // in none: the nearest start
    expect(placeAt(places, -1)).toBe(0);
  });
});

describe('locate — where the landing excerpt starts', () => {
  it('finds the excerpt whatever the whitespace, by its head', () => {
    const flat = 'x  Be a flood\n of water which covers, But a flood of judgment';
    expect(locate(flat, 'Be a flood of water which covers, But a flood of judgment to destroy')).toBe(flat.indexOf('Be a'));
    expect(locate(flat, '')).toBe(-1);
    expect(locate(flat, 'not in this text at all, anywhere, ever')).toBe(-1);
  });
});

describe('FindInUnit', () => {
  it('marks every place, the landing one as current, and the pill counts them', () => {
    render(<Host anchor={anchor('flooding rain, a great deluge.')} />);
    expect(pill().textContent).toBe('flood1 of 3‹›×');
    expect(pill().getAttribute('aria-label')).toBe('Search words in this letter');
    expect(marked('vot-find-current')).toEqual(['flooding']);
    expect(marked('vot-find')).toEqual(['flood', 'flood', 'flood']);
  });

  it('a landing on a later place starts there', () => {
    render(<Host anchor={anchor('flood of water which covers, But a flood of judgment')} />);
    expect(pill().textContent).toContain('3 of 3');
    expect(marked('vot-find-current')).toEqual(['flood', 'flood']);
  });

  it('› and ‹ step through the places, wrapping, each step one scroll write', () => {
    render(<Host anchor={anchor('flooding rain, a great deluge.')} />);
    const next = pill().querySelector('[aria-label="Next place"]');
    const prev = pill().querySelector('[aria-label="Previous place"]');
    fireEvent.click(next);
    expect(pill().textContent).toContain('2 of 3');
    expect(marked('vot-find-current')).toEqual(['flood']);
    expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(pill().textContent).toContain('1 of 3');
    fireEvent.click(prev);
    expect(pill().textContent).toContain('3 of 3');
    expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(4);
  });

  it('× closes it: no pill, no marks', () => {
    render(<Host anchor={anchor('flooding rain')} />);
    fireEvent.click(pill().querySelector('[aria-label="Close"]'));
    expect(pill()).toBeNull();
    expect(globalThis.CSS.highlights.has('vot-find')).toBe(false);
    expect(globalThis.CSS.highlights.has('vot-find-current')).toBe(false);
  });

  it('leaving the unit (unmount) clears the marks', () => {
    const { unmount } = render(<Host anchor={anchor('flooding rain')} />);
    expect(globalThis.CSS.highlights.has('vot-find')).toBe(true);
    unmount();
    expect(globalThis.CSS.highlights.has('vot-find')).toBe(false);
  });

  it('nothing for an anchor made for another unit, one with no words to find, or no engine', () => {
    const { unmount } = render(<Host anchor={anchor('flooding rain')} unitId="another-letter" />);
    expect(pill()).toBeNull();
    unmount();
    const { unmount: u2 } = render(<Host anchor={{ type: 'excerpt', text: 'flooding rain', letterId: 'vengeance' }} />);
    expect(pill()).toBeNull();
    u2();
    delete /** @type {any} */ (window).VotSearchMini;
    render(<Host anchor={anchor('flooding rain')} />);
    expect(pill()).toBeNull();
  });

  it('one place: the pill says 1 of 1 and its arrows are off', () => {
    function One() {
      const mainRef = React.useRef(null);
      return (
        <div className="screen-scroll">
          <div className="letter-body" ref={mainRef}><p>as a flood overflowing the dam</p></div>
          <FindInUnit anchor={anchor('flood overflowing the dam')} unitId="vengeance" mainRef={mainRef} />
        </div>
      );
    }
    render(<One />);
    expect(pill().textContent).toContain('1 of 1');
    expect(/** @type {HTMLButtonElement} */ (pill().querySelector('[aria-label="Next place"]')).disabled).toBe(true);
  });

  it('without the Highlight API it still counts and steps, unmarked', () => {
    Object.defineProperty(globalThis, 'CSS', { value: undefined, writable: true, configurable: true });
    render(<Host anchor={anchor('flooding rain')} />);
    expect(pill().textContent).toContain('1 of 3');
    fireEvent.click(pill().querySelector('[aria-label="Next place"]'));
    expect(pill().textContent).toContain('2 of 3');
  });

  it('a DOM change under the body (the annotation paint) rebuilds the marks', async () => {
    vi.useFakeTimers();
    render(<Host anchor={anchor('flooding rain')} />);
    const p = document.querySelector('[data-hl-key="k2"]');
    // the paint wraps a word: the old ranges' text node is split
    await act(async () => {
      p.innerHTML = 'nor shall I <mark class="hl">flood</mark> the face of the earth in My anger.';
      await Promise.resolve();
    });
    act(() => { vi.advanceTimersByTime(200); });
    expect(marked('vot-find')).toEqual(['flood', 'flood', 'flood']);
    vi.useRealTimers();
  });
});
