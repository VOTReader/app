/* SrchGroup — one collection's results under a header that opens and closes.
   A closed group renders no cards (a long result set opens with every group
   closed, and each card cuts and measures a snippet), and the header says
   whether it is open. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SrchGroup } from './SrchGroup.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).SRCH_GROUP_META = { v7: { label: 'Volume Seven', order: 8 } };
  /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
});
afterEach(() => { cleanup(); });

const items = [{ doc: { title: 'Vengeance Is Mine' } }, { doc: { title: 'A Day of Slaughter' } }];

describe('SrchGroup', () => {
  it('a closed group renders no cards, and opening it renders them', () => {
    const { container, getByRole } = render(<SrchGroup gkey="v7" items={items} terms={[]} onSelect={() => {}} defaultOpen={false} />);
    const header = getByRole('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.stub-card')).toHaveLength(0);
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect([...container.querySelectorAll('.stub-card')].map((c) => c.textContent)).toEqual(['Vengeance Is Mine', 'A Day of Slaughter']);
  });

  it('the header counts what the group holds: letters, entries, verses; "matches" only for an unknown group', () => {
    const count = (gkey, list) => {
      const { container, unmount } = render(<SrchGroup gkey={gkey} items={list} terms={[]} onSelect={() => {}} defaultOpen={false} />);
      const text = container.querySelector('.srch-group-count-inline').textContent;
      unmount();
      return text;
    };
    expect(count('v7', items)).toBe(' · 2 letters');
    expect(count('v7', items.slice(0, 1))).toBe(' · 1 letter');
    expect(count('wtlb1', items)).toBe(' · 2 entries');
    expect(count('bible', items)).toBe(' · 2 verses');
    expect(count('answers', items)).toBe(' · 2 topics');
    expect(count('bible-studies', items)).toBe(' · 2 chapters');
    expect(count('zz', items)).toBe(' · 2 matches');
  });

  it('a capped group says "400+" (it may hold more), in grouped thousands', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ doc: { title: 'v' + i } }));
    const { container } = render(<SrchGroup gkey="bible" items={many} terms={[]} onSelect={() => {}} defaultOpen={false} capped={true} />);
    expect(container.querySelector('.srch-group-count-inline').textContent).toBe(' · 400+ verses');
  });

  it('renders a long group a page at a time', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ doc: { title: 'L' + i } }));
    const { container } = render(<SrchGroup gkey="answers" items={many} terms={[]} onSelect={() => {}} defaultOpen={true} />);
    expect(container.querySelectorAll('.stub-card')).toHaveLength(50);
    const more = container.querySelector('.srch-group-more');
    expect(more.textContent).toBe('Show 50 more of 70');
    fireEvent.click(more);
    expect(container.querySelectorAll('.stub-card')).toHaveLength(100);
    expect(container.querySelector('.srch-group-more').textContent).toBe('Show 20 more');
    fireEvent.click(container.querySelector('.srch-group-more'));
    expect(container.querySelectorAll('.stub-card')).toHaveLength(120);
    expect(container.querySelector('.srch-group-more')).toBeNull();
  });

  it('a card keeps its own state when Book order re-sorts the group (keyed by doc, not by index)', () => {
    // A card with state of its own: what it was first given. With index keys, the
    // re-sort handed card 0's state (an opened places list, a centred snippet) to
    // whichever result moved into slot 0.
    function StatefulCard({ entry }) {
      const [first] = React.useState(entry.doc.title);
      return <div className="stub-card">{entry.doc.title + '=' + first}</div>;
    }
    /** @type {any} */ (globalThis).SrchCard = StatefulCard;
    const a = { doc: { kind: 'letter', ref: 'Volume Seven · Letter 55', title: 'Vengeance Is Mine', text: 'x' } };
    const b = { doc: { kind: 'letter', ref: 'Volume Seven · Letter 9', title: 'Recompense', text: 'y' } };
    const { container, rerender } = render(<SrchGroup gkey="v7" items={[a, b]} terms={[]} onSelect={() => {}} defaultOpen={true} />);
    rerender(<SrchGroup gkey="v7" items={[b, a]} terms={[]} onSelect={() => {}} defaultOpen={true} />);
    expect([...container.querySelectorAll('.stub-card')].map((c) => c.textContent))
      .toEqual(['Recompense=Recompense', 'Vengeance Is Mine=Vengeance Is Mine']);
  });

  it('an open group closes again', () => {
    const { container, getByRole } = render(<SrchGroup gkey="v7" items={items} terms={[]} onSelect={() => {}} defaultOpen={true} />);
    expect(container.querySelectorAll('.stub-card')).toHaveLength(2);
    fireEvent.click(getByRole('button'));
    expect(container.querySelectorAll('.stub-card')).toHaveLength(0);
  });
});
