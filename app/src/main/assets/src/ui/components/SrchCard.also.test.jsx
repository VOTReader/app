/* SrchCard — "Also in N places": the reprints Best Matches folded under this card
   (search200 UX B10 item 2, mockup ux/mockups/2-reprints/PICK.png). One quiet row after
   the snippet, closed until asked; open, each reprint is its own tap, its title over
   where it is filed. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SrchCard, cardPassage } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, snippetAt, highlightSpans, morePlaces } from '../../search/snippet.js';

const PASSAGE = 'Thus says The Lord: I have written it with parchment and ink through My prophets, behold, I have etched My words in stone with My own finger, yet who has received My message?';
const letter = { score: 3, doc: { kind: 'letter', title: 'Abide in the Doctrine of The Messiah', ref: 'Volume Three \u00b7 Letter 17', text: PASSAGE, volumeId: 'v3', letterId: 'abide' } };
const obedience = { score: 2, doc: { kind: 'answers', title: 'Regarding Obedience', ref: 'Answers Only God Can Give', text: PASSAGE, letterId: 'regarding-obedience' } };
const scoffers = { score: 1, doc: { kind: 'answers', title: 'Regarding Scoffers', ref: 'Answers Only God Can Give', text: PASSAGE, letterId: 'regarding-scoffers' } };

beforeEach(() => {
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { letter: { label: 'Letter', cls: 'badge-letter' }, answers: { label: 'Answers', cls: '' } };
  /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g || doc.kind;
  /** @type {any} */ (globalThis).SRCH_GROUP_META = { answers: { label: 'Answers Only God Can Give' }, v2: { label: 'Volume Two' }, blessed: { label: 'The Blessed' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, snippetAt, highlightSpans, morePlaces };
});
afterEach(() => { cleanup(); });

describe('SrchCard — also in N places (B10 item 2)', () => {
  it('a card with no reprints has no such row', () => {
    const { container } = render(<SrchCard entry={letter} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    expect(container.querySelector('.srch-also-toggle')).toBeNull();
  });

  /* search200 audit 144: "Also in 1 place" did not say what a place is; the row names the collections. */
  it('names the collections the passage is also in, closed until asked', () => {
    const one = render(<SrchCard entry={letter} also={[obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    const toggle = one.container.querySelector('.srch-also-toggle');
    expect(toggle.textContent).toBe('Also in Answers Only God Can Give▸');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(one.container.querySelector('.srch-also')).toBeNull();
    one.unmount();
    const two = render(<SrchCard entry={letter} also={[obedience, scoffers]} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    expect(two.container.querySelector('.srch-also-toggle').textContent).toContain('Also 2 times in Answers Only God Can Give');
    two.unmount();
    const v2 = { score: 1, doc: { ...obedience.doc, kind: 'letter', g: 'v2', title: 'B' } };
    const bl = { score: 1, doc: { ...obedience.doc, kind: 'blessed', g: 'blessed', title: 'C' } };
    const mix = render(<SrchCard entry={letter} also={[v2, obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    expect(mix.container.querySelector('.srch-also-toggle').textContent).toContain('Also in Volume Two and Answers Only God Can Give');
    mix.unmount();
    const three = render(<SrchCard entry={letter} also={[v2, obedience, bl, scoffers]} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    expect(three.container.querySelector('.srch-also-toggle').textContent).toContain('Also in Volume Two, Answers Only God Can Give and The Blessed');
  });

  it('opens to each reprint, its title over where it is filed, and a reprint opens itself', () => {
    const picked = [];
    const { container } = render(<SrchCard entry={letter} also={[obedience, scoffers]} terms={['etched']} onSelect={(e) => picked.push(e)} isDirect={false} />);
    fireEvent.click(container.querySelector('.srch-also-toggle'));
    expect(container.querySelector('.srch-also-toggle').getAttribute('aria-expanded')).toBe('true');
    const rows = [...container.querySelectorAll('.srch-also-item')];
    expect(rows.map((r) => r.querySelector('.srch-also-title').textContent)).toEqual(['Regarding Obedience', 'Regarding Scoffers']);
    expect(rows[0].querySelector('.srch-also-where').textContent).toBe('Answers Only God Can Give');
    fireEvent.click(rows[1]);
    expect(picked).toEqual([scoffers]);
  });

  it('comes after the snippet and before the more-places row', () => {
    const pad = (n) => 'and the word went on. '.repeat(n);
    const long = { ...letter, doc: { ...letter.doc, text: pad(3) + 'I have etched My words in stone. ' + pad(300) + 'etched again in stone. ' + pad(3) } };
    const { container } = render(<SrchCard entry={long} also={[obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    const order = [...container.querySelectorAll('.srch-card, .srch-also-toggle, .srch-places-toggle')].map((e) => e.className.split(' ')[0]);
    expect(order).toEqual(['srch-card', 'srch-also-toggle', 'srch-places-toggle']);
  });

  it('a list the reader opened is open again when the search comes back, in that row only', () => {
    const first = render(<SrchCard entry={letter} also={[obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} memo="etched|a" where="best" />);
    fireEvent.click(first.container.querySelector('.srch-also-toggle'));
    first.unmount();
    const again = render(<SrchCard entry={letter} also={[obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} memo="etched|a" where="best" />);
    expect(again.container.querySelector('.srch-also-toggle').getAttribute('aria-expanded')).toBe('true');
    again.unmount();
    const other = render(<SrchCard entry={letter} also={[obedience]} terms={['etched']} onSelect={() => {}} isDirect={false} memo="etched|a" where="v3" />);
    expect(other.container.querySelector('.srch-also-toggle').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('cardPassage — the passage a card shows, for the fold to compare', () => {
  it('is the snippet the card quotes', () => {
    const { container } = render(<SrchCard entry={letter} terms={['etched']} onSelect={() => {}} isDirect={false} />);
    expect(cardPassage(letter, ['etched'])).toBe(container.querySelector('.srch-snippet-scroll').textContent);
  });

  it('says nothing without a snippet engine, or for a direct card', () => {
    /** @type {any} */ (globalThis).VotSearchMini = {};
    expect(cardPassage(letter, ['etched'])).toBe('');
    expect(cardPassage({ __label: 'John 3:16' }, [])).toBe('');
  });
});
