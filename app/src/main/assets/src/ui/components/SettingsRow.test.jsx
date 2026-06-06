/* SettingsRow tests — the compact (Option B) layout.
   ──────────────────────────────────────────────────
   What we lock down about the redesigned row:
     A) The description is HIDDEN by default and revealed only when the ⓘ
        button is tapped (the whole point of the compaction — the long
        descriptions no longer inflate every row).
     B) A second tap collapses it again (the aria-label flips Show↔Hide).
     C) No ⓘ button renders when there is no description.
     D) The toggle still fires onToggle, and a disabled row neither fires
        onToggle nor swallows its disabledReason hint.
*/

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsRow } from './SettingsRow.jsx';

// vitest-config doesn't set globals:true, so RTL auto-cleanup doesn't engage.
afterEach(cleanup);

describe('SettingsRow (compact + ⓘ reveal)', () => {
  it('hides the description until the ⓘ button is tapped', () => {
    render(<SettingsRow label="Modern Fonts" desc="Use Cinzel headings." checked={false} onToggle={() => {}} />);
    expect(screen.queryByText('Use Cinzel headings.')).toBeNull();
    fireEvent.click(screen.getByLabelText('Show description'));
    expect(screen.getByText('Use Cinzel headings.')).toBeTruthy();
  });

  it('collapses the description again on a second tap', () => {
    render(<SettingsRow label="X" desc="Hello desc." checked={false} onToggle={() => {}} />);
    fireEvent.click(screen.getByLabelText('Show description'));
    expect(screen.getByText('Hello desc.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide description'));
    expect(screen.queryByText('Hello desc.')).toBeNull();
  });

  it('renders no ⓘ button when there is no description', () => {
    render(<SettingsRow label="Bare" checked={false} onToggle={() => {}} />);
    expect(screen.queryByLabelText('Show description')).toBeNull();
  });

  it('fires onToggle when the switch is changed', () => {
    const onToggle = vi.fn();
    render(<SettingsRow label="X" desc="d" checked={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('when disabled: does not fire onToggle and shows the disabled hint', () => {
    const onToggle = vi.fn();
    render(
      <SettingsRow
        label="X" desc="d" checked={false}
        disabled disabledReason="Turn on Search first."
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Turn on Search first.')).toBeTruthy();
  });
});
