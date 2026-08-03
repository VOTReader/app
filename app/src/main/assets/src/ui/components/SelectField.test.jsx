/* SelectField ⓘ-description tests.
   ─────────────────────────────────
   The Bible Translation row now passes a React NODE as `desc` (the
   Restored-Name editions' reasoning + the AI-assistance disclaimer,
   TranslationInfoDesc in SettingsScreen.jsx) where every other caller passes
   a string. Lock down: (A) a node desc renders behind the ⓘ toggle exactly
   like a string desc — hidden until tapped, hidden again on re-tap; (B) the
   string path keeps working. (The real TranslationInfoDesc copy is
   preview-verified; its wording is deliberately not pinned here.) */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SelectField } from './SelectField.jsx';

beforeEach(() => modalRegistry._reset());
afterEach(() => { cleanup(); modalRegistry._reset(); });

const OPTIONS = [
  { id: 'a', label: 'Alpha', desc: 'first option' },
  { id: 'b', label: 'Beta', desc: 'second option' },
];

describe('SelectField — ⓘ description', () => {
  it('reveals and hides a plain string desc on ⓘ taps', () => {
    render(<SelectField eyebrow="Test" title="Row" label="Row" desc="plain string desc" value="a" options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByText('plain string desc')).toBeNull();
    fireEvent.click(screen.getByLabelText('Show description'));
    expect(screen.getByText('plain string desc')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide description'));
    expect(screen.queryByText('plain string desc')).toBeNull();
  });

  it('renders a React-node desc (paragraphs + list) behind the same toggle', () => {
    const node = (
      <>
        lead sentence
        <p>Editions were prepared with AI assistance and may contain errors.</p>
        <ul><li>rule one</li><li>rule two</li></ul>
      </>
    );
    render(<SelectField eyebrow="Test" title="Row" label="Row" desc={node} value="a" options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByText(/AI assistance/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Show description'));
    expect(screen.getByText(/AI assistance/)).toBeTruthy();
    expect(screen.getByText('rule one')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide description'));
    expect(screen.queryByText(/AI assistance/)).toBeNull();
  });
});

describe('SelectField sheet accessibility', () => {
  it('registers and traps a labelled dialog, then restores focus on close', () => {
    const onChange = vi.fn();
    const { container } = render(<SelectField eyebrow="Test" title="Choose a value" label="Row" desc={null} value="a" options={OPTIONS} onChange={onChange} />);
    const trigger = /** @type {HTMLElement} */ (container.querySelector('.settings-select-trigger'));
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Choose a value' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(modalRegistry.peek().id).toContain('select-sheet-');

    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
