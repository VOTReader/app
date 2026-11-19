/* scroll-place — where a saved reading place puts a column.
   jsdom gives every element a zero getBoundingClientRect, so each element's
   rect is stubbed per test. querySelector('[data-hl-key="..."]') runs against
   real jsdom DOM. */
import { describe, it, expect } from 'vitest';
import { hasBox, anchorContentTop, isFirstContent, placeTarget, announcePlaced } from './scroll-place.js';

function rect(top, width = 100, height = 20) {
  return { top, left: 0, width, height, right: width, bottom: top + height, x: 0, y: top, toJSON: () => ({}) };
}

function stubRect(el, r) {
  el.getBoundingClientRect = () => r;
}

/** A column at top 100 with scrollTop 50, holding anchored children. */
function column() {
  const el = document.createElement('div');
  stubRect(el, rect(100));
  el.scrollTop = 50;
  return el;
}

function child(el, key, top, width = 100, height = 20) {
  const c = document.createElement('p');
  c.setAttribute('data-hl-key', key);
  stubRect(c, rect(top, width, height));
  el.appendChild(c);
  return c;
}

describe('hasBox', () => {
  it('is true for a laid-out box', () => {
    expect(hasBox({ width: 10, height: 5 })).toBe(true);
  });

  it('is true for width alone', () => {
    expect(hasBox({ width: 10, height: 0 })).toBe(true);
  });

  it('is true for height alone', () => {
    expect(hasBox({ width: 0, height: 5 })).toBe(true);
  });

  it('is false for a zero box', () => {
    expect(hasBox({ width: 0, height: 0 })).toBe(false);
  });
});

describe('anchorContentTop', () => {
  it('returns null when the column is null', () => {
    expect(anchorContentTop(null, 'k1')).toBeNull();
  });

  it('returns null when the anchor key is null', () => {
    expect(anchorContentTop(column(), null)).toBeNull();
  });

  it('returns null when the anchor key is empty', () => {
    expect(anchorContentTop(column(), '')).toBeNull();
  });

  it('returns null when no element carries the key', () => {
    const el = column();
    child(el, 'k1', 300);
    expect(anchorContentTop(el, 'k2')).toBeNull();
  });

  it('returns null when the anchor has no box', () => {
    const el = column();
    child(el, 'k1', 300, 0, 0);
    expect(anchorContentTop(el, 'k1')).toBeNull();
  });

  it('returns (anchor.top - column.top) + scrollTop', () => {
    const el = column();
    child(el, 'k1', 300);
    // (300 - 100) + 50 = 250
    expect(anchorContentTop(el, 'k1')).toBe(250);
  });

  it('finds an anchor key containing a double quote', () => {
    const el = column();
    child(el, 'a"b', 400);
    // (400 - 100) + 50 = 350; the key is escaped into the selector.
    expect(anchorContentTop(el, 'a"b')).toBe(350);
  });
});

describe('isFirstContent', () => {
  it('is false when the column is null', () => {
    expect(isFirstContent(null, 'k1')).toBe(false);
  });

  it('is false when no element is laid out', () => {
    const el = column();
    child(el, 'k1', 300, 0, 0);
    expect(isFirstContent(el, 'k1')).toBe(false);
  });

  it('is true when the key is the first laid-out element', () => {
    const el = column();
    child(el, 'k1', 300);
    child(el, 'k2', 400);
    expect(isFirstContent(el, 'k1')).toBe(true);
  });

  it('is false when the key is laid out but not first', () => {
    const el = column();
    child(el, 'k1', 300);
    child(el, 'k2', 400);
    expect(isFirstContent(el, 'k2')).toBe(false);
  });

  it('skips zero-box elements when finding the first', () => {
    const el = column();
    child(el, 'k0', 250, 0, 0);
    child(el, 'k1', 300);
    expect(isFirstContent(el, 'k1')).toBe(true);
    expect(isFirstContent(el, 'k0')).toBe(false);
  });
});

describe('placeTarget', () => {
  it('returns y 0, unanchored, for a null saved place', () => {
    expect(placeTarget(column(), null)).toEqual({ y: 0, anchored: false });
  });

  it('returns the legacy number when saved is a number', () => {
    expect(placeTarget(column(), 120)).toEqual({ y: 120, anchored: false });
  });

  it('returns the saved y when there is no anchor', () => {
    const el = column();
    child(el, 'k1', 300);
    expect(placeTarget(el, { y: 80, anchorKey: 'missing', anchorOff: 0 })).toEqual({ y: 80, anchored: false });
  });

  it('lets the anchor win over the saved y', () => {
    const el = column();
    child(el, 'k1', 300);
    child(el, 'k2', 400);
    // anchor k2: aTop (400 - 100) + 50 = 350; off 10 -> 360
    expect(placeTarget(el, { y: 80, anchorKey: 'k2', anchorOff: 10 })).toEqual({ y: 360, anchored: true });
  });

  it('rounds the anchored y', () => {
    const el = column();
    const c = child(el, 'k1', 300);
    stubRect(c, { top: 300.4, left: 0, width: 100, height: 20, right: 100, bottom: 320.4, x: 0, y: 300.4, toJSON: () => ({}) });
    // aTop (300.4 - 100) + 50 = 250.4; off 0 -> round 250
    expect(placeTarget(el, { y: 0, anchorKey: 'k1', anchorOff: 0 })).toEqual({ y: 250, anchored: true });
  });

  it('clamps a negative anchored y to 0', () => {
    const el = column();
    child(el, 'k1', 300);
    child(el, 'k2', 400);
    // anchor k2: aTop 350; off -400 -> -50 -> clamped 0
    expect(placeTarget(el, { y: 80, anchorKey: 'k2', anchorOff: -400 })).toEqual({ y: 0, anchored: true });
  });

  it('lets the pixel y win for a negative offset on the first content element', () => {
    const el = column();
    child(el, 'k1', 300);
    // k1 is first content; off -10 means the top sat in the header, so the
    // saved pixel y wins instead of the reflowed anchor position.
    expect(placeTarget(el, { y: 80, anchorKey: 'k1', anchorOff: -10 })).toEqual({ y: 80, anchored: true });
  });

  it('uses the anchor position for a negative offset that is not first content', () => {
    const el = column();
    child(el, 'k1', 300);
    child(el, 'k2', 400);
    // k2 is not first; aTop 350 + off -10 -> 340
    expect(placeTarget(el, { y: 80, anchorKey: 'k2', anchorOff: -10 })).toEqual({ y: 340, anchored: true });
  });

  it('falls back to the saved y when the anchor has no box', () => {
    const el = column();
    child(el, 'k1', 300, 0, 0);
    expect(placeTarget(el, { y: 80, anchorKey: 'k1', anchorOff: 10 })).toEqual({ y: 80, anchored: false });
  });

  it('ignores a non-numeric anchorOff', () => {
    const el = column();
    child(el, 'k1', 300);
    // anchorOff '5' is not a number -> treated as 0; aTop 250
    expect(placeTarget(el, { y: 80, anchorKey: 'k1', anchorOff: '5' })).toEqual({ y: 250, anchored: true });
  });

  it('returns y 0 when saved is an object without y', () => {
    const el = column();
    expect(placeTarget(el, {})).toEqual({ y: 0, anchored: false });
  });
});

describe('announcePlaced', () => {
  it('dispatches vot:placed on the element', () => {
    const el = column();
    const seen = [];
    el.addEventListener('vot:placed', () => seen.push(1));
    announcePlaced(el);
    expect(seen).toEqual([1]);
  });

  it('does not throw for a null element', () => {
    expect(() => announcePlaced(null)).not.toThrow();
  });

  it('swallows a dispatchEvent that throws', () => {
    const el = column();
    el.dispatchEvent = () => { throw new Error('boom'); };
    expect(() => announcePlaced(el)).not.toThrow();
  });
});
