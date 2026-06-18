// @ts-nocheck — presentational render assertions; React is a global (vitest.setup.js)
/* pager-preview — the INERT neighbor previews for the page-swipe pager.
   The load-bearing assertion: a peek must be invisible to every annotation
   pass, so its rendered DOM carries NO data-hl-dom / data-hl-key and NO
   <mark> / .fn-ref / .wtlb-cite / link/bookmark icons / interactive <a>. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  PreviewLetterBody, PreviewWtlbBody, PreviewVerses, PagerPeek,
  segmentsToPlainText, stripFormatBMarkers, resolveNeighborLetter,
} from './pager-preview.jsx';

afterEach(cleanup);

// The full annotation-engine / dom-links / dom-bookmarks scan surface, plus
// the React verse-annotation artifacts. A peek must contain NONE of these.
const FORBIDDEN = [
  '[data-hl-dom]', '[data-hl-key]', 'mark',
  '.fn-ref', '.wtlb-cite', '.inline-scrip-ref', '.letter-link-ref',
  '.verse-link-icon', '.inline-link-icon', '.inline-bookmark-icon', '.hl-note-icon',
];
function assertInert(container) {
  for (const sel of FORBIDDEN) {
    expect(container.querySelectorAll(sel).length, `must render no ${sel}`).toBe(0);
  }
}

describe('PreviewLetterBody (Format A) is inert', () => {
  const blocks = [
    { type: 'intro', segments: [{ t: 'bold-italic', v: 'Thus says The Lord:' }, { t: 'text', v: ' hear Me.' }, { t: 'fn', v: '1' }] },
    { type: 'para', segments: [{ t: 'text', v: 'Peoples of the earth ' }, { t: 'italic', v: 'turn now' }, { t: 'fn', v: '2' }] },
    { type: 'heading', text: 'A Section', level: 2 },
    { type: 'poetry', lines: [[{ t: 'text', v: 'line one' }], [{ t: 'stanza-break' }], [{ t: 'italic', v: 'line two' }]] },
    { type: 'closing', text: 'Says The Lord.' },
  ];

  it('renders content but no annotation hooks', () => {
    const { container } = render(<PreviewLetterBody blocks={blocks} />);
    assertInert(container);
    expect(container.textContent).toContain('Thus says The Lord:');
    expect(container.textContent).toContain('turn now');
    expect(container.textContent).toContain('Says The Lord.');
  });
  it('keeps emphasis (em/strong) and DROPS footnote bubbles', () => {
    const { container } = render(<PreviewLetterBody blocks={blocks} />);
    expect(container.querySelectorAll('em').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('strong').length).toBeGreaterThan(0);
    // footnote bubble text ('1','2') must not appear as a rendered fn marker
    expect(container.querySelectorAll('.fn-ref').length).toBe(0);
  });
  it('handles null/garbage blocks without throwing', () => {
    expect(() => render(<PreviewLetterBody blocks={null} />)).not.toThrow();
  });
});

describe('PreviewWtlbBody (Format B) is inert', () => {
  const paragraphs = [
    { align: 'justify', text: 'Plain prose with _italic_ and **bold** and {{ref:Matthew 4:4}} and {{nav:esther:7}} done.' },
    { align: 'center', text: 'A centered\nstanza line.' },
  ];
  it('renders content, unwraps emphasis, inertizes refs/nav', () => {
    const { container } = render(<PreviewWtlbBody paragraphs={paragraphs} />);
    assertInert(container);
    expect(container.querySelectorAll('a').length, 'no interactive links').toBe(0);
    expect(container.querySelectorAll('em').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('strong').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('(Matthew 4:4)'); // {{ref:}} → inert text
    expect(container.textContent).toContain('[esther 7]');     // {{nav:}} → inert text
    expect(container.textContent).not.toContain('{{');         // no raw markers
  });
});

describe('PreviewVerses (Format C) is inert', () => {
  const verses = [{ n: 1, text: 'In the beginning God created.' }, { n: 2, text: 'The earth was without form.' }];
  it('renders verse spans with numbers, no annotation components', () => {
    const { container } = render(<PreviewVerses verses={verses} />);
    assertInert(container);
    expect(container.querySelectorAll('.verses-block').length).toBe(1);
    expect(container.querySelectorAll('.verse').length).toBe(2);
    expect(container.querySelector('.verse-num').textContent).toBe('1');
    expect(container.textContent).toContain('In the beginning God created.');
  });
  it('adds is-poetry when poetry flag set', () => {
    const { container } = render(<PreviewVerses verses={verses} poetry />);
    expect(container.querySelector('.verses-block').className).toContain('is-poetry');
  });
});

describe('PagerPeek wrapper', () => {
  it('renders a letter peek, inert + aria-hidden', () => {
    const { container } = render(
      <PagerPeek side="next" desc={{ kind: 'letter', hero: { eyebrow: 'Volume Two · Letter 12', title: 'The Narrow Gate' }, blocks: [{ type: 'para', segments: [{ t: 'text', v: 'body text here' }] }] }} />
    );
    assertInert(container);
    expect(container.querySelector('.pager-peek-next')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelector('.hero-title').textContent).toBe('The Narrow Gate');
    expect(container.textContent).toContain('body text here');
  });
  it('renders a verses peek with the chapter-body wrapper', () => {
    const { container } = render(
      <PagerPeek side="prev" desc={{ kind: 'verses', hero: { eyebrow: 'Genesis', title: 'Chapter 2' }, verses: [{ n: 1, text: 'Thus the heavens.' }], wrapClass: 'chapter-body' }} />
    );
    assertInert(container);
    expect(container.querySelector('.chapter-body')).toBeTruthy();
    expect(container.querySelector('.pager-peek-prev')).toBeTruthy();
  });
  it('renders a boundary card peek (no full content)', () => {
    const { container } = render(
      <PagerPeek side="next" desc={{ kind: 'boundary', eyebrow: 'Next · A Return to the Garden', title: 'A Return to the Garden' }} />
    );
    assertInert(container);
    expect(container.querySelector('.pager-peek-boundary')).toBeTruthy();
    expect(container.querySelector('.bottom-nav-title').textContent).toBe('A Return to the Garden');
  });
  it('renders nothing for a null descriptor', () => {
    const { container } = render(<PagerPeek side="next" desc={null} />);
    expect(container.querySelector('.pager-peek')).toBeNull();
  });
});

describe('plain-text helpers', () => {
  it('segmentsToPlainText joins text, drops fn + stanza-break', () => {
    expect(segmentsToPlainText([{ t: 'text', v: 'Hello ' }, { t: 'italic', v: 'world' }, { t: 'fn', v: '1' }, { t: 'stanza-break' }])).toBe('Hello world');
    expect(segmentsToPlainText(null)).toBe('');
  });
  it('stripFormatBMarkers unwraps emphasis + inertizes ref/nav', () => {
    expect(stripFormatBMarkers('a **b** _c_ {{ref:John 3:16}} {{nav:esther:7}}')).toBe('a b c (John 3:16) [esther 7]');
    expect(stripFormatBMarkers(42)).toBe('');
  });
});

describe('resolveNeighborLetter', () => {
  it('returns null safely when corpus globals are unavailable', () => {
    // COL_BY_KEY is undefined in the test env — the typeof guard must hold.
    expect(resolveNeighborLetter('two', 'some-id')).toBeNull();
    expect(resolveNeighborLetter(null, null)).toBeNull();
  });
});
