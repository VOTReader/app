/* search-landing.js (v2-gaps 9): which block a search hit opens on, and its words marked there as the Bible page marks
   a verse hit (mark.qm). Fixtures copy the corpus's shapes (volume-one.js Letter 9's first paragraph, wtlb-one.js 46). */
import { describe, it, expect } from 'vitest';
import { landingOf, markWords, unmarkWords } from './search-landing.js';

const NAME = { id: 'whats-in-a-name', blocks: [
  { type: 'heading', text: 'Section One' },
  { type: 'para', segments: [{ t: 'text', v: 'There is only one name under Heaven by which you must be saved.' }, { t: 'fn', v: '1' },
    { t: 'text', v: ' And oh how blessed are those who put their trust in His name.' }] },
  { type: 'poetry', lines: [[{ t: 'italic', v: 'Is written in The Book of Life;' }]] },
] };
const GALLOWS = { id: 'building-the-gallows', paragraphs: [
  { align: 'center', text: 'Vanity is a rope, and pride builds the gallows;\n\nEnvy leads to hate, and jealousy' },
  { align: 'center', text: 'Therefore, beware of the thoughts of your heart,\n\nLest you follow in Haman’s error {{nav:esther:7}}\n\nAnd walk in the way of Cain, {{ref:1 John 3:12}}' },
] };

/** @param {string} html */
function el(html) {
  const p = document.createElement('p');
  p.innerHTML = html;
  document.body.appendChild(p);
  return p;
}

describe('landingOf', () => {
  it("finds the block the excerpt was cut from and where in it the excerpt starts (Format A, by the index's text)", () => {
    const at = landingOf(NAME, 'only one name under Heaven by which you must be saved.', ['name']);
    expect(at.index).toBe(1);
    expect(at.off).toBe('There is '.length);
  });

  it('reads a Format B paragraph without its {{...}} tokens, its lines joined', () => {
    expect(landingOf(GALLOWS, 'beware of the thoughts of your heart, Lest you follow in Haman’s error And walk', ['Haman']).index).toBe(1);
  });

  it('no excerpt, or one no block holds: -1 (the letter opens at its top)', () => {
    expect(landingOf(NAME, '', ['name'])).toEqual({ index: -1, off: -1 });
    expect(landingOf(NAME, 'words that are in no paragraph of this letter at all, anywhere', ['words']).index).toBe(-1);
    expect(landingOf(null, 'only one name', ['name']).index).toBe(-1);
  });
});

describe('markWords', () => {
  it('marks every place a word is, across text nodes, and returns the one nearest the landing', () => {
    const p = el('one name, <em>two</em> name, three name');
    const at = p.textContent.indexOf('two');
    const m = markWords(p, ['name'], at);
    const marks = p.querySelectorAll('mark.qm');
    expect(Array.from(marks, (x) => x.textContent)).toEqual(['name', 'name', 'name']);
    expect(m).toBe(marks[1]);
    expect(p.textContent).toBe('one name, two name, three name');
  });

  it('a word split by an <em> is marked in both pieces; the landing is its first piece', () => {
    const p = el('the na<em>me</em> under Heaven');
    const m = markWords(p, ['name'], 0);
    expect(Array.from(p.querySelectorAll('mark.qm'), (x) => x.textContent)).toEqual(['na', 'me']);
    expect(m && m.textContent).toBe('na');
    expect(p.querySelector('em mark.qm')).not.toBeNull();
  });

  it("leaves a footnote number alone: it is not read as part of the word, and never marked", () => {
    const p = el('the name<sup class="fn-ref">2</sup> under Heaven');
    markWords(p, ['name', '2'], 0);
    expect(Array.from(p.querySelectorAll('mark.qm'), (x) => x.textContent)).toEqual(['name']);
    expect(p.querySelector('.fn-ref').innerHTML).toBe('2');
  });

  it('marking twice keeps one mark per word; unmarkWords gives the text back as one node', () => {
    const p = el('one name under Heaven');
    const a = markWords(p, ['name'], 0);
    const b = markWords(p, ['name'], 0);
    expect(p.querySelectorAll('mark.qm').length).toBe(1);
    expect(b).toBe(a);
    unmarkWords(p);
    expect(p.querySelector('mark')).toBeNull();
    expect(p.childNodes.length).toBe(1);
    expect(p.textContent).toBe('one name under Heaven');
  });

  it('none of the words there: null, nothing marked', () => {
    const p = el('one name under Heaven');
    expect(markWords(p, ['gallows'], 0)).toBeNull();
    expect(markWords(p, [], 0)).toBeNull();
    expect(p.querySelector('mark')).toBeNull();
  });
});
