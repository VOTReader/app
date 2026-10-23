// @ts-nocheck
/* reading-range (rs1, 2026-10-22): the reading text a selection covers. A verse number sits in the gutter BESIDE its
   verse's [data-hl-key] block, so a selection's end on it is read as the edge of the verse beside it, a block the
   selection only touches is not covered, and a number alone is its verse. BibleChapterView's markup. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readingRange, readingBlocksIn } from './reading-range.js';

let wrap;
const KEY = (n) => 'bible:john:3:' + n;
const block = (n) => wrap.querySelector(`[data-hl-key="${KEY(n)}"]`);
const num = (n) => wrap.querySelector(`#v-${n} .verse-num`).firstChild;
const words = (n) => block(n).firstChild;
const range = (a, ao, b, bo) => { const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo); return r; };
const keys = (res) => res.blocks.map((b) => b.getAttribute('data-hl-key'));

beforeEach(() => {
  wrap = document.createElement('div');
  wrap.className = 'verses-block';
  wrap.innerHTML = '<h3 class="section-heading">The New Birth</h3>'
    + [15, 16, 17].map((n) => `<span id="v-${n}" class="verse"><span class="verse-num">${n}</span><span data-hl-key="${KEY(n)}">Words of verse ${n}.</span> </span>`).join('');
  document.body.appendChild(wrap);
});
afterEach(() => { wrap.remove(); });

describe('readingRange', () => {
  it('a range inside one block is that block, unchanged', () => {
    const r = range(words(16), 2, words(16), 9);
    const res = readingRange(r);
    expect(keys(res)).toEqual([KEY(16)]);
    expect(res.range.toString()).toBe('rds of ');
  });

  it('a start on a number starts at its verse\'s first word; an end on a number ends after the verse before it', () => {
    const res = readingRange(range(num(16), 0, num(17), 1));
    expect(keys(res)).toEqual([KEY(16)]);
    expect(res.range.toString()).toBe('Words of verse 16.');
  });

  it('a start on a heading or in the space after a verse moves to the next block', () => {
    expect(readingRange(range(wrap.querySelector('h3').firstChild, 4, words(15), 5)).range.toString()).toBe('Words');
    const gap = wrap.querySelector('#v-15').lastChild;   // the ' ' after 15's block
    expect(keys(readingRange(range(gap, 0, words(17), 5)))).toEqual([KEY(16), KEY(17)]);
  });

  it('a block the range only touches is not covered (a triple-click ends at the next block\'s child 0)', () => {
    const res = readingRange(range(words(15), 0, block(16), 0));
    expect(keys(res)).toEqual([KEY(15)]);
    expect(keys(readingRange(range(words(15), words(15).length, words(16), 4)))).toEqual([KEY(16)]);
  });

  it('a number alone is its verse; a number of a swipe preview, or no reading text, is nothing', () => {
    const res = readingRange(range(num(16), 0, num(16), 2));
    expect(keys(res)).toEqual([KEY(16)]);
    expect(res.range.toString()).toBe('Words of verse 16.');
    expect(readingRange(range(wrap.querySelector('h3').firstChild, 0, wrap.querySelector('h3').firstChild, 3))).toBe(null);
    const peek = document.createElement('div');
    peek.className = 'pager-peek';
    peek.innerHTML = '<span class="verse"><span class="verse-num">4</span><span data-hl-key="bible:john:4:4">Next chapter.</span></span>';
    document.body.appendChild(peek);
    const n = peek.querySelector('.verse-num').firstChild;
    expect(readingRange(range(n, 0, n, 1))).toBe(null);
    peek.remove();
  });

  it('the live selection is never changed: the result is a new range', () => {
    const r = range(num(16), 0, words(16), 5);
    const res = readingRange(r);
    expect(res.range).not.toBe(r);
    expect(r.startContainer).toBe(num(16));
  });
});

describe('readingBlocksIn', () => {
  it('the keyed blocks a range reaches, in order', () => {
    expect(readingBlocksIn(range(num(15), 0, words(17), 3)).map((b) => b.getAttribute('data-hl-key'))).toEqual([KEY(15), KEY(16), KEY(17)]);
  });
});
