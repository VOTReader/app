/* v2 letter text (picture 1a-letter): the kit's pieces, and the same DOM text the read-along timings were cut against. */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LetterBlock, FormatBBlock, titleClass } from './letter-text.jsx';
import { segmentsDomText } from '../utils/segment-dom-text.js';
import { formatBDomText } from '../utils/format-b-dom-text.js';
import { LetterScreen } from './screens/LetterScreen.jsx';

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

describe('Format B (Words To Live By, The Blessed, some Holy Days pages: `paragraphs` of { align, text })', () => {
  const TEXT = '**Thus says The Lord:** Come,\nLove awaits you _in every\nhour_ {{ref:John 3:16}} and {{nav:john:3}} [From "Chosen by God" ~ Volume One]';
  it("draws main's markup (bold, italics, line breaks, cites) with main's DOM text, so marks and read-along address it", () => {
    const { container } = render(<FormatBBlock para={{ align: 'left', text: TEXT }} hlKey="wtlb:wtlb1-001:0" bookTitle={() => 'John'} />);
    const p = container.querySelector('p');
    expect(p.textContent).toBe(formatBDomText(TEXT, { bookTitle: () => 'John' }));
    expect(p.querySelector('strong').textContent).toBe('Thus says The Lord:');
    expect(p.querySelector('em').textContent).toBe('in everyhour');
    expect(p.querySelectorAll('br').length).toBe(2);
    expect(p.textContent).toContain('(John 3:16) and [John 3] [From "Chosen by God" ~ Volume One]');
    expect(p.getAttribute('data-hl-key')).toBe('wtlb:wtlb1-001:0');
    expect(p.getAttribute('data-hl-dom')).toBe('true');
  });
  it("an entry's page shows every paragraph (they were blank: the page read only `blocks`)", async () => {
    const g = /** @type {any} */ (globalThis);
    g.COL_BY_KEY = new Map([['wtlb1', { volKey: 'wtlb1', readKey: 'wtlb-one', globalName: 'WTLB_ONE', prefaceGlobal: null,
      label: 'Words To Live By: Part One', kind: 'wtlb', indexScreen: 'wtlb-one-index' }]]);
    g.WTLB_ONE = [{ id: 'wtlb1-001', num: 1, title: 'Introduction', paragraphs: [{ align: 'left', text: 'Come, _My_ children.' },
      { align: 'center', text: 'Love awaits\nyou' }] }];
    try {
      const { container } = render(<LetterScreen collection="wtlb1" n={1} />);
      const ps = [...container.querySelectorAll('[data-hl-key]')];
      expect(ps.map((p) => [p.getAttribute('data-hl-key'), p.textContent])).toEqual([
        ['wtlb:wtlb1-001:0', 'Come, My children.'], ['wtlb:wtlb1-001:1', 'Love awaitsyou']]);
    } finally {
      delete g.COL_BY_KEY;
      delete g.WTLB_ONE;
    }
  });
  it('a centred paragraph stays centred', () => {
    const { container } = render(<FormatBBlock para={{ align: 'center', text: 'Blessed are they' }} hlKey="wtlb:b:1" />);
    expect(container.querySelector('p').style.textAlign).toBe('center');
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
