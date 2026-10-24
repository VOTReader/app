// @ts-nocheck — installs free-var globals + DOM-node style reads (the
// SettingsScreen.test.jsx precedent for classic-script-seam tests).
/* FontPickerRow tests — the Reading Font dropdown's contract.
   ─────────────────────────────────────────────────────────────────────────
   What we lock down:
     A) It IS a SelectField dropdown (owner call): a compact row whose
        trigger opens the standard bottom sheet — no inline grid.
     B) One option per registry font IN REGISTRY ORDER (owner call:
        scripture faces top, sans bottom), each name rendered in its own
        font family, style blurb underneath.
     C) All fonts are vendored (owner call: predownloaded) — selection
        applies IMMEDIATELY through onSelect. No confirm, no download UI.
     D) Re-selecting the active font is a no-op; a corrupt persisted id
        degrades to System Serif.

   FontPickerRow resolves its deps as free-var globals (the SettingsScreen
   classic-script seam): READING_FONTS, readingFontById, SelectField. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FontPickerRow } from './FontPickerRow.jsx';
import { SelectField } from './SelectField.jsx';
import { READING_FONTS, readingFontById } from '../../utils/reading-fonts.js';

const INSTALLED = [];
function put(name, value) { INSTALLED.push(name); globalThis[name] = value; }

beforeEach(() => {
  put('READING_FONTS', READING_FONTS);
  put('readingFontById', readingFontById);
  put('SelectField', SelectField);
});
afterEach(() => {
  cleanup();
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
});

const mount = (value = 'classic', onSelect = () => {}) =>
  render(<FontPickerRow value={value} onSelect={onSelect} />);

const openSheet = () => fireEvent.click(document.querySelector('.settings-select-trigger'));
const sheet = () => document.querySelector('.select-sheet');
const options = () => [...document.querySelectorAll('.select-sheet-option')];
const option = (label) => options()
  .find((o) => o.querySelector('.select-sheet-option-label').textContent.trim() === label);

describe('FontPickerRow (SelectField dropdown, all fonts vendored)', () => {
  it('renders as a closed dropdown row; the trigger shows the current font in its own family', () => {
    mount('modern');
    expect(sheet()).toBeNull();
    const value = document.querySelector('.settings-row-value');
    expect(value.textContent).toBe('EB Garamond');
    expect(value.style.fontFamily).toContain('EB Garamond');
    expect(document.querySelector('.settings-row-label').textContent).toBe('Reading Font');
  });

  it('a corrupt persisted id degrades to System Serif instead of crashing', () => {
    mount('not-a-font');
    expect(document.querySelector('.settings-row-value').textContent).toBe('System Serif');
  });

  it('the sheet lists every registry font, the easy-to-read pair first, the rest IN REGISTRY ORDER, each named in its own family', () => {
    mount();
    openSheet();
    const opts = options();
    expect(opts.length).toBe(READING_FONTS.length);
    const shown = [...READING_FONTS.filter((d) => d.easy), ...READING_FONTS.filter((d) => !d.easy)];
    opts.forEach((o, i) => {
      const def = shown[i];
      const name = o.querySelector('.select-sheet-option-label');
      expect(name.textContent.trim()).toBe(def.label);
      expect(name.style.fontFamily).toContain(def.family || 'serif');
      expect(o.querySelector('.select-sheet-option-desc').textContent).toBe(def.sub);
    });
  });

  it('marks the active font selected', () => {
    mount('cardo');
    openSheet();
    expect(option('Cardo').className).toContain('selected');
    expect(option('Cardo').querySelector('.select-sheet-option-check')).toBeTruthy();
    expect(option('Lora').className).not.toContain('selected');
  });

  it('shows NO download chrome anywhere — every font is built in', () => {
    mount();
    openSheet();
    expect(document.querySelector('.select-sheet-option-meta')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Download|~\d+ KB/);
  });

  it('selecting any font applies immediately through onSelect and closes the sheet', () => {
    const onSelect = vi.fn();
    mount('classic', onSelect);
    openSheet();
    fireEvent.click(option('IM Fell English'));
    expect(onSelect).toHaveBeenCalledWith('im-fell-english');
    expect(sheet()).toBeNull();
    openSheet();
    fireEvent.click(option('EB Garamond'));
    expect(onSelect).toHaveBeenCalledWith('modern');
  });

  it('re-selecting the ACTIVE font is a no-op', () => {
    const onSelect = vi.fn();
    mount('modern', onSelect);
    openSheet();
    fireEvent.click(option('EB Garamond'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// A09.4: "Easy to read" opens the sheet (Atkinson Hyperlegible was card 24 of 25), and each card shows a sample in its face.
describe('FontPickerRow — Easy to read, and a sample per font', () => {
  it('heads the sheet with Easy to read: Atkinson Hyperlegible and Lexend, then the serif faces', () => {
    mount();
    openSheet();
    const heads = [...document.querySelectorAll('.select-sheet-group')].map((h) => h.textContent);
    expect(heads).toEqual(['Easy to read', 'Serif faces']);
    expect(options().slice(0, 2).map((o) => o.querySelector('.select-sheet-option-label').textContent)).toEqual(['Atkinson Hyperlegible', 'Lexend']);
    expect(options()[2].querySelector('.select-sheet-option-label').textContent).toBe('System Serif');
  });

  it('every card carries a sample line set in its own face, hidden from the screen reader', () => {
    mount();
    openSheet();
    for (const o of options()) {
      const sample = o.querySelector('.select-sheet-option-sample');
      expect(sample.textContent).toBe('In the beginning was the Word');
      expect(sample.getAttribute('aria-hidden')).toBe('true');
      expect(sample.style.fontFamily).toBe(o.querySelector('.select-sheet-option-label').style.fontFamily);
    }
  });
});
