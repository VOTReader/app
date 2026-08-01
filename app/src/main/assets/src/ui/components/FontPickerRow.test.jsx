// @ts-nocheck — installs free-var globals + DOM-node style reads (the
// SettingsScreen.test.jsx precedent for classic-script-seam tests).
/* FontPickerRow tests — the Reading Font dropdown's contract.
   ─────────────────────────────────────────────────────────────────────────
   What we lock down:
     A) It IS a SelectField dropdown (owner call 2026-07-31): a compact row
        whose trigger opens the standard bottom sheet — no inline grid.
     B) Every option's name renders in its preview family ('p-<id>'), with
        a right-aligned status (Built in / Downloaded / ~KB).
     C) Selecting a built-in (or already-downloaded) font applies straight
        through ensureReadingFont → onSelect. No confirm.
     D) Selecting an UN-downloaded font closes the sheet and asks below the
        row — a size-labeled ConfirmStrip — applying only on confirm;
        Cancel applies nothing.
     E) A failed download leaves the setting UNCHANGED and shows a toast.

   FontPickerRow resolves its deps as free-var globals (the SettingsScreen
   classic-script seam): READING_FONTS, readingFontById, ensureReadingFont,
   isReadingFontCached, SelectField, ConfirmStrip, showToast. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { FontPickerRow } from './FontPickerRow.jsx';
import { SelectField } from './SelectField.jsx';
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
  put('SelectField', SelectField);
  put('ConfirmStrip', ConfirmStrip);
  put('showToast', toastSpy);
});
afterEach(() => {
  cleanup();
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
});

const mount = (value = 'classic', onSelect = () => {}) =>
  render(<FontPickerRow value={value} onSelect={onSelect} />);

const openSheet = () => fireEvent.click(document.querySelector('.settings-select-trigger'));
const sheet = () => document.querySelector('.select-sheet');
const option = (label) => [...document.querySelectorAll('.select-sheet-option')]
  .find((o) => o.querySelector('.select-sheet-option-label').textContent.trim() === label);

describe('FontPickerRow (SelectField dropdown)', () => {
  it('renders as a closed dropdown row; the trigger shows the current font in its preview family', () => {
    mount('modern');
    expect(sheet()).toBeNull();
    const value = document.querySelector('.settings-row-value');
    expect(value.textContent).toBe('EB Garamond');
    expect(value.style.fontFamily).toContain('p-modern');
    expect(document.querySelector('.settings-row-label').textContent).toBe('Reading Font');
  });

  it('a corrupt persisted id degrades to System Serif instead of crashing', () => {
    mount('not-a-font');
    expect(document.querySelector('.settings-row-value').textContent).toBe('System Serif');
  });

  it('the trigger opens the standard sheet with one option per registry font, named in its own preview font', () => {
    mount();
    openSheet();
    expect(sheet()).toBeTruthy();
    const opts = [...document.querySelectorAll('.select-sheet-option')];
    expect(opts.length).toBe(READING_FONTS.length);
    for (const def of READING_FONTS) {
      const o = option(def.label);
      expect(o).toBeTruthy();
      const name = o.querySelector('.select-sheet-option-label');
      expect(name.style.fontFamily).toContain(def.id === 'classic' ? 'serif' : `p-${def.id}`);
      expect(o.querySelector('.select-sheet-option-desc').textContent).toBe(def.sub);
    }
  });

  it('marks the active font selected and shows a size status on un-downloaded ones', async () => {
    mount('classic');
    openSheet();
    expect(option('System Serif').className).toContain('selected');
    expect(option('System Serif').querySelector('.select-sheet-option-check')).toBeTruthy();
    expect(option('System Serif').querySelector('.select-sheet-option-meta').textContent).toBe('Built in');
    const lora = readingFontById('lora');
    await waitFor(() =>
      expect(option('Lora').querySelector('.select-sheet-option-meta').textContent).toBe(`~${lora.kb} KB`));
  });

  it('built-in select applies immediately and closes the sheet — no confirm', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openSheet();
    fireEvent.click(option('EB Garamond'));
    expect(sheet()).toBeNull();
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('modern'));
    expect(screen.queryByText(/Download/)).toBeNull();
  });

  it('un-downloaded font closes the sheet and asks with the size; applies only on Download', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openSheet();
    fireEvent.click(option('Lora'));
    expect(sheet()).toBeNull();
    // Nothing applied yet — the confirm is the gate.
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    await screen.findByText(/Download Lora \(~77 KB\)/);
    fireEvent.click(screen.getByText('Download'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('lora'));
    expect(ensureSpy).toHaveBeenCalledWith(readingFontById('lora'));
  });

  it('Cancel on the confirm applies nothing', async () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openSheet();
    fireEvent.click(option('Literata'));
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
    openSheet();
    fireEvent.click(option('Lora'));
    fireEvent.click(await screen.findByText('Download'));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Could not download Lora') })));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows a Downloading status line while the confirmed fetch runs', async () => {
    let resolveEnsure;
    ensureSpy.mockImplementation(() => new Promise((r) => { resolveEnsure = r; }));
    mount('classic');
    openSheet();
    fireEvent.click(option('Lora'));
    fireEvent.click(await screen.findByText('Download'));
    await screen.findByText('Downloading Lora…');
    resolveEnsure(true);
    await waitFor(() => expect(screen.queryByText('Downloading Lora…')).toBeNull());
  });

  it('an already-downloaded font applies without re-asking', async () => {
    put('isReadingFontCached', () => Promise.resolve(true)); // everything cached
    const onSelect = vi.fn();
    mount('classic', onSelect);
    await waitFor(() => expect(onSelect).not.toHaveBeenCalled()); // let the probe land
    openSheet();
    await waitFor(() =>
      expect(option('Lora').querySelector('.select-sheet-option-meta').textContent).toBe('Downloaded'));
    fireEvent.click(option('Lora'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('lora'));
    expect(screen.queryByText(/Download Lora/)).toBeNull();
  });

  it('re-selecting the ACTIVE font is a no-op', async () => {
    const onSelect = vi.fn();
    mount('modern', onSelect);
    openSheet();
    fireEvent.click(option('EB Garamond'));
    await Promise.resolve();
    expect(onSelect).not.toHaveBeenCalled();
    expect(ensureSpy).not.toHaveBeenCalled();
  });
});
