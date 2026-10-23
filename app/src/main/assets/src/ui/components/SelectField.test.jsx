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
    fireEvent.click(screen.getByLabelText('Show description for Row'));
    expect(screen.getByText('plain string desc')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide description for Row'));
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
    fireEvent.click(screen.getByLabelText('Show description for Row'));
    expect(screen.getByText(/AI assistance/)).toBeTruthy();
    expect(screen.getByText('rule one')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide description for Row'));
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

// Sweep low (mw10): the sheet's options showed the current one only by a class and a ✓ glyph.
describe('SelectField options state', () => {
  it('each option says whether it is the current value; the ✓ is decoration', () => {
    const { container } = render(<SelectField eyebrow="Test" title="Choose a value" label="Row" desc={null} value="a" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(/** @type {HTMLElement} */ (container.querySelector('.settings-select-trigger')));
    const opts = [...document.querySelectorAll('.select-sheet-option')];
    // s15.4: one choice of several is a radio group, not a row of toggle buttons.
    expect(document.querySelector('.select-sheet-options').getAttribute('role')).toBe('radiogroup');
    expect(opts.map((b) => b.getAttribute('role'))).toEqual(OPTIONS.map(() => 'radio'));
    expect(opts.map((b) => b.getAttribute('aria-checked'))).toEqual(OPTIONS.map((o) => String(o.id === 'a')));
    expect(opts.some((b) => b.hasAttribute('aria-pressed'))).toBe(false);
    expect(opts.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(document.querySelector('.select-sheet-option-check').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('SelectField radio group keys and links (s15.4, s15.9)', () => {
  it('names the group by the sheet title, and arrows move focus between the options', () => {
    const { container } = render(<SelectField eyebrow="Test" title="Choose a value" label="Row" desc={null} value="a" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(/** @type {HTMLElement} */ (container.querySelector('.settings-select-trigger')));
    expect(screen.getByRole('radiogroup', { name: 'Choose a value' })).toBeTruthy();
    const [alpha, beta] = screen.getAllByRole('radio');
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(beta);
    fireEvent.keyDown(beta, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(alpha, { key: 'End' });
    expect(document.activeElement).toBe(beta);
  });

  it('the trigger controls the sheet only while it is open, and a shown description describes it', () => {
    const { container } = render(<SelectField eyebrow="Test" title="Choose" label="Row" desc="what it does" value="a" options={OPTIONS} onChange={() => {}} />);
    const trigger = /** @type {HTMLElement} */ (container.querySelector('.settings-select-trigger'));
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    const info = screen.getByLabelText('Show description for Row');
    expect(info.hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(info);
    const descId = trigger.getAttribute('aria-describedby');
    expect(document.getElementById(descId).textContent).toBe('what it does');
    expect(screen.getByLabelText('Hide description for Row').getAttribute('aria-controls')).toBe(descId);
    fireEvent.click(trigger);
    expect(document.getElementById(trigger.getAttribute('aria-controls'))).toBeTruthy();
  });

  it('valueLabel replaces only the value on the closed row, never the option in the sheet', () => {
    const { container } = render(<SelectField eyebrow="Test" title="Choose" label="Row" desc={null} value="a" valueLabel="Alpha · later" options={OPTIONS} onChange={() => {}} />);
    const trigger = /** @type {HTMLElement} */ (container.querySelector('.settings-select-trigger'));
    expect(trigger.textContent).toContain('Alpha · later');
    expect(trigger.getAttribute('aria-label')).toBe('Row: Alpha · later');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('radio')[0].textContent).toContain('Alpha');
    expect(screen.getAllByRole('radio')[0].textContent).not.toContain('later');
  });
});
