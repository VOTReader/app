// @ts-nocheck — installs free-var globals + DOM-node style reads (the
// SettingsScreen.test.jsx precedent for classic-script-seam tests).
/* FontPickerRow tests — the Reading Font picker's contract.
   ─────────────────────────────────────────────────────────────────────────
   What we lock down:
     A) Collapsed by default; the head names the CURRENT font and expands
        to the full registry grid.
     B) Selecting a built-in (or already-downloaded) font applies straight
        through ensureReadingFont → onSelect. No confirm.
     C) Selecting an UN-downloaded font asks first — a size-labeled
        ConfirmStrip — and applies only on confirm; Cancel applies nothing.
     D) A failed download leaves the setting UNCHANGED and shows a toast.
     E) Every chip name carries its preview font-family ('p-<id>').

   FontPickerRow resolves its deps as free-var globals (the SettingsScreen
   classic-script seam): READING_FONTS, readingFontById, ensureReadingFont,
   isReadingFontCached, ConfirmStrip, showToast. Installed per-test. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { FontPickerRow } from './FontPickerRow.jsx';
import { ConfirmStrip } from './ConfirmStrip.jsx';
import { READING_FONTS, readingFontById } from '../../utils/reading-fonts.js';

const INSTALLED = [];
function put(name, value) { INSTALLED.push(name); globalThis[name] = value; }

let ensureSpy, toastSpy;

beforeEach(() => {
  ensureSpy = vi.fn(() => Promise.resolve(true));
  toastSpy = vi.fn();
  put('READING_FONTS', READING_FONTS);
  put('readingFontById', readingFontById);
  put('ensureReadingFont', ensureSpy);
  put('isReadingFontCached', (def) => Promise.resolve(!def || !def.files));
  put('ConfirmStrip', ConfirmStrip);
  put('showToast', toastSpy);
});
afterEach(() => {
  cleanup();
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
});

const mount = (value = 'classic', onSelect = () => {}) =>
  render(<FontPickerRow value={value} onSelect={onSelect} />);

const openGrid = () => fireEvent.click(screen.getByRole('button', { name: /Reading Font/ }));
const chip = (label) => [...document.querySelectorAll('.font-chip')]
  .find((c) => c.querySelector('.font-chip-name').textContent.trim() === label);

describe('FontPickerRow', () => {
  it('collapsed by default; head shows the current font in its preview family', () => {
    mount('modern');
    expect(document.querySelector('.font-picker-grid')).toBeNull();
    const current = document.querySelector('.font-picker-current');
    expect(current.textContent).toBe('EB Garamond');
    expect(current.style.fontFamily).toContain('p-modern');
  });

  it('a corrupt persisted id degrades to System Serif instead of crashing', () => {
    mount('not-a-font');
    expect(document.querySelector('.font-picker-current').textContent).toBe('System Serif');
  });

  it('expanding renders one chip per registry font, named in its own preview font', () => {
    mount();
    openGrid();
    const chips = [...document.querySelectorAll('.font-chip')];
    expect(chips.length).toBe(READING_FONTS.length);
    for (const def of READING_FONTS) {
      const c = chip(def.label);
      expect(c).toBeTruthy();
      const name = c.querySelector('.font-chip-name');
      expect(name.style.fontFamily).toContain(def.id === 'classic' ? 'serif' : `p-${def.id}`);
    }
  });

  it('marks the active font and shows a size hint on un-downloaded ones', async () => {
    mount('classic');
    openGrid();
    expect(chip('System Serif').querySelector('.font-chip-status').textContent).toBe('✓ Active');
    const lora = readingFontById('lora');
    await waitFor(() =>
      expect(chip('Lora').querySelector('.font-chip-status').textContent).toBe(`~${lora.kb} KB`));
  });

  it('built-in select applies immediately — no confirm', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openGrid();
    fireEvent.click(chip('EB Garamond'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('modern'));
    expect(document.querySelector('.confirm-strip, [class*="confirm"]')?.textContent || '').not.toContain('Download');
  });

  it('un-downloaded font asks with the size, applies only on Download', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openGrid();
    fireEvent.click(chip('Lora'));
    // Nothing applied yet — the confirm is the gate.
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    const q = await screen.findByText(/Download Lora \(~77 KB\)/);
    expect(q).toBeTruthy();
    fireEvent.click(screen.getByText('Download'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('lora'));
    expect(ensureSpy).toHaveBeenCalledWith(readingFontById('lora'));
  });

  it('Cancel on the confirm applies nothing', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openGrid();
    fireEvent.click(chip('Literata'));
    await screen.findByText(/Download Literata/);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Download Literata/)).toBeNull();
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a failed download leaves the setting unchanged and toasts', async () => {
    ensureSpy.mockImplementation(() => Promise.reject(new Error('offline')));
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openGrid();
    fireEvent.click(chip('Lora'));
    fireEvent.click(await screen.findByText('Download'));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Could not download Lora') })));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('an already-downloaded font applies without re-asking', async () => {
    put('isReadingFontCached', () => Promise.resolve(true)); // everything cached
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openGrid();
    await waitFor(() =>
      expect(chip('Lora').querySelector('.font-chip-status').textContent).toBe('Downloaded'));
    fireEvent.click(chip('Lora'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('lora'));
    expect(screen.queryByText(/Download Lora/)).toBeNull();
  });

  it('tapping the ACTIVE font is a no-op', async () => {
    const onSelect = vi.fn();
    mount('modern', onSelect);
    openGrid();
    fireEvent.click(chip('EB Garamond'));
    await Promise.resolve();
    expect(onSelect).not.toHaveBeenCalled();
    expect(ensureSpy).not.toHaveBeenCalled();
  });
});
