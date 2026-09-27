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

  it('an open group closes again', () => {
    const { container, getByRole } = render(<SrchGroup gkey="v7" items={items} terms={[]} onSelect={() => {}} defaultOpen={true} />);
    expect(container.querySelectorAll('.stub-card')).toHaveLength(2);
    fireEvent.click(getByRole('button'));
    expect(container.querySelectorAll('.stub-card')).toHaveLength(0);
  });
});
