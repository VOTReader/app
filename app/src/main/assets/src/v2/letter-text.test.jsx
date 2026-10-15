/* v2 letter text (picture 1a-letter): the kit's pieces, and the same DOM text the read-along timings were cut against. */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LetterBlock, titleClass } from './letter-text.jsx';
import { segmentsDomText } from '../utils/segment-dom-text.js';

describe('LetterBlock', () => {
  it('a paragraph: the lead-in in italics, segments spaced by the read-along rule', () => {
    const segments = [{ t: 'bold-italic', v: 'Thus says The Lord to His servant:' }, { t: 'text', v: 'Many things you must overcome.' }];
    const { container } = render(<LetterBlock block={{ type: 'para', segments }} />);
    const p = container.querySelector('p');
    expect(p.className).toBe('');
    expect(p.querySelector('i.lead-in').textContent).toBe('Thus says The Lord to His servant:');
    expect(p.textContent).toBe(segmentsDomText(segments));
    expect(p.textContent).toBe('Thus says The Lord to His servant: Many things you must overcome.');
  });
  it("a footnote mark is a superscript (main's .fn-ref chrome); a closing-fn block keeps its type as its class", () => {
    const { container } = render(<LetterBlock block={{ type: 'closing-fn', segments: [{ t: 'italic', v: 'says The Lord.' }, { t: 'fn', v: '1' }] }} />);
    expect(container.querySelector('p.closing-fn i').textContent).toBe('says The Lord.');
    expect(container.querySelector('sup.fn.fn-ref').textContent).toBe('1');
  });
  it('a closing block shows its words: the corpus keeps them as text ("Says The Lord."), not segments', () => {
    const { container } = render(<LetterBlock block={{ type: 'closing', text: 'Says The Lord.' }} hlKey="letter:x:4" />);
    const p = container.querySelector('p.closing');
    expect(p.textContent).toBe('Says The Lord.');
    expect(p.getAttribute('data-hl-key')).toBe('letter:x:4');
  });
  it("poetry: a block of lines, stanza breaks between (block elements: a copy or a mark breaks the line, as main's)", () => {
    const lines = [[{ t: 'italic', v: 'For in My love' }], [{ t: 'stanza-break' }], [{ t: 'italic', v: 'Were you created' }]];
    const { container } = render(<LetterBlock block={{ type: 'poetry', lines }} />);
    const p = container.querySelector('div.poetry');
    expect([...p.children].map((c) => c.tagName + '.' + c.className)).toEqual(['DIV.poem', 'DIV.stanza-break', 'DIV.poem']);
    expect(p.textContent).toBe('For in My loveWere you created');
  });
});

describe('titleClass', () => {
  it("steps the kit's title down for long titles", () => {
    expect(titleClass('Chosen by God')).toBe('display');
    expect(titleClass('Honor Not the Day')).toBe('display long');
    expect(titleClass('x'.repeat(56))).toBe('display long');
    expect(titleClass('x'.repeat(57))).toBe('display longer');
  });
});
