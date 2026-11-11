/* ActionSheet (U rule 13, the UI pass W1 2026-11-11): a title, worded actions, Cancel / the action as words. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ActionSheet, SelectSheet } from './SelectField.jsx';

beforeEach(() => modalRegistry._reset());
afterEach(() => { cleanup(); modalRegistry._reset(); });

describe('ActionSheet', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<ActionSheet open={false} onClose={() => {}} title="X" actions={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('a menu: title, sub line, worded rows; picking one runs it, then closes', () => {
    const close = vi.fn(); const open = vi.fn(); const del = vi.fn();
    const { container, getByRole } = render(
      <ActionSheet open onClose={close} title="Be steadfast. He strengthens the weak." sub="Chosen by God · Just now"
        actions={[{ id: 'open', icon: 'book', label: 'Open in the letter', onSelect: open },
          { id: 'nb', icon: 'journal', label: 'Move to a notebook', value: 'Not in one', onSelect: () => {}, keepOpen: true },
          { id: 'del', icon: 'trash', label: 'Delete note', danger: true, onSelect: del }]} />);
    const dlg = getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('.ui-sheet-title').textContent).toBe('Be steadfast. He strengthens the weak.');
    expect(dlg.getAttribute('aria-describedby')).toBe(container.querySelector('.ui-sheet-sub').id);
    const rows = [...container.querySelectorAll('.ui-sheet-action')];
    expect(rows.map((r) => r.querySelector('.ui-row-title').textContent)).toEqual(['Open in the letter', 'Move to a notebook', 'Delete note']);
    expect(rows[1].querySelector('.ui-row-value').textContent).toBe('Not in one');
    expect(rows[2].className).toContain('is-danger');
    fireEvent.click(rows[1]); expect(close).not.toHaveBeenCalled();
    fireEvent.click(rows[0]); expect(open).toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
    // no menu inside the menu: the rows carry no ⋯ of their own
    expect(container.querySelector('.ui-row-menu')).toBeNull();
  });

  it('a confirm: the body, then Cancel and the action as words', () => {
    const close = vi.fn(); const ok = vi.fn();
    const { container } = render(
      <ActionSheet open onClose={close} title="Delete this note?" confirm={{ label: 'Delete', onConfirm: ok, danger: true }}>
        It is removed from this phone.
      </ActionSheet>);
    expect(container.querySelector('.ui-sheet-body').textContent).toBe('It is removed from this phone.');
    const [cancel, del] = container.querySelectorAll('.ui-sheet-foot button');
    expect(cancel.textContent).toBe('Cancel');
    expect(del.textContent).toBe('Delete');
    expect(del.className).toContain('is-primary');
    expect(del.className).toContain('is-danger');
    fireEvent.click(cancel); expect(ok).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(del); expect(ok).toHaveBeenCalled();
  });

  it('the backdrop closes it, and it registers as the open modal', () => {
    const close = vi.fn();
    const { container } = render(<ActionSheet open onClose={close} title="T" actions={[{ id: 'a', label: 'A', onSelect() {} }]} />);
    fireEvent.click(container.querySelector('.select-sheet-backdrop'));
    expect(close).toHaveBeenCalled();
  });
});

describe('SelectSheet in the new look', () => {
  it('draws no ornament and keeps the tick on the chosen option', () => {
    const { container } = render(<SelectSheet open onClose={() => {}} eyebrow="Reading" title="Bible translation" value="b"
      options={[{ id: 'a', label: 'KJV' }, { id: 'b', label: 'NKJV' }]} onChange={() => {}} />);
    expect(container.querySelector('.select-sheet-ornament')).toBeNull();
    const chosen = container.querySelector('.select-sheet-option.selected');
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(chosen.querySelector('.select-sheet-option-check')).not.toBeNull();
  });
});
