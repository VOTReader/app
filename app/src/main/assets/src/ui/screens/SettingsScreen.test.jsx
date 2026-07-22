// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — the auto-scroll disclosure contract.
   ═══════════════════════════════════════════════════════════════════════
   Rendering this screen at all requires 73 runtime globals; ./settings-
   harness.jsx pays that cost once so assertions here stay cheap. The rows
   under test are the REAL SettingsRow / SelectField components, so this
   fails if their markup or wiring rots — not just if the gate does.

   WHAT IT PINS: auto-scroll's sub-settings are COLLAPSED (unmounted), not
   merely disabled, until the feature is on, and Auto-Continue Pause nests
   one level deeper under Auto-Continue. Unmounting is the load-bearing
   part of the owner's ask — a disabled row still occupies the page, still
   reads as maybe-usable, and is still in tab and screen-reader order.
   "Invisible and uninteractable" means GONE. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings, rowLabels, row,
} from './settings-harness.jsx';

beforeEach(() => {
  setupSettingsGlobals();
  if (!window.matchMedia) {
    /** @type {any} */ (window).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
afterEach(() => { cleanup(); teardownSettingsGlobals(); vi.restoreAllMocks(); });

const slider = (label) => document.querySelector(`input[type="range"][aria-label*="${label}"]`);

describe('harness', () => {
  it('renders the whole screen with the real row components', () => {
    renderSettings();
    expect(screen.getByTestId('screen-layout')).toBeTruthy();
    expect(rowLabels()).toContain('Auto-Scroll');
    expect(rowLabels().length).toBeGreaterThan(10);
  });
});

describe('auto-scroll settings disclosure', () => {
  const SUB_ROWS = ['Scroll Speed', 'Auto-Continue', 'Auto-Continue Pause'];

  it('COLLAPSES every sub-setting while auto-scroll is off', () => {
    renderSettings({ autoScroll: false });
    expect(rowLabels()).toContain('Auto-Scroll');
    for (const label of SUB_ROWS) expect(row(label)).toBeUndefined();
  });

  it('collapsed means UNMOUNTED, not disabled — nothing is left to interact with', () => {
    const { container } = renderSettings({ autoScroll: false });
    expect(container.querySelector('input[aria-label*="Auto-scroll speed"]')).toBeNull();
    expect(container.querySelector('input[aria-label*="Pause before continuing"]')).toBeNull();
    expect(screen.queryByText(/lines\/min/)).toBeNull();
  });

  it('reveals speed + auto-continue when auto-scroll is enabled', () => {
    renderSettings({ autoScroll: true });
    expect(row('Scroll Speed')).toBeTruthy();
    expect(row('Auto-Continue')).toBeTruthy();
    // …but the pause is meaningless until auto-continue is on.
    expect(row('Auto-Continue Pause')).toBeUndefined();
  });

  it('reveals the pause only when auto-continue is on', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true });
    for (const label of SUB_ROWS) expect(row(label)).toBeTruthy();
  });

  it('never leaks the nested row when the parent feature is off', () => {
    // A profile imported with autoScrollNext:true must still collapse fully.
    renderSettings({ autoScroll: false, autoScrollNext: true });
    expect(row('Auto-Continue')).toBeUndefined();
    expect(row('Auto-Continue Pause')).toBeUndefined();
  });

  it('discloses progressively — each step adds rows, never removes one', () => {
    const seen = [];
    renderSettings({ autoScroll: false }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true, autoScrollNext: true }); seen.push(rowLabels().length);
    expect(seen[1]).toBe(seen[0] + 2);  // speed + auto-continue
    expect(seen[2]).toBe(seen[1] + 1);  // + pause
  });
});

describe('auto-scroll controls', () => {
  it('the speed slider is bounded to the transport’s real range', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    const s = slider('Auto-scroll speed');
    expect(s.min).toBe('4');
    expect(s.max).toBe('40');
    expect(s.value).toBe('16');
  });

  it('the dwell slider spans no-pause to a long sit, in half seconds', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '2500' });
    const s = slider('Pause before continuing');
    expect(s.min).toBe('0');
    expect(s.max).toBe('15000');
    expect(s.step).toBe('500');
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('2.5s');
  });

  it('reads 0 as "None" rather than "0s"', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '0' });
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('None');
  });

  it('still renders a legacy preset dwell value from before the slider', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '6000' });
    expect(slider('Pause before continuing').value).toBe('6000');
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('6s');
  });

  it('clamps a corrupt persisted speed instead of rendering it', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '9999' });
    expect(slider('Auto-scroll speed').value).toBe('40');
  });

  it('writes speed changes back through onSetting', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollLpm: '16' }, { onSetting });
    fireEvent.change(slider('Auto-scroll speed'), { target: { value: '24' } });
    expect(onSetting).toHaveBeenCalledWith('autoScrollLpm', '24');
  });

  it('writes dwell changes back through onSetting', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '2500' }, { onSetting });
    fireEvent.change(slider('Pause before continuing'), { target: { value: '9000' } });
    expect(onSetting).toHaveBeenCalledWith('autoScrollEndMs', '9000');
  });

  it('toggling auto-scroll goes through onToggle so the key stays canonical', () => {
    const onToggle = vi.fn();
    renderSettings({ autoScroll: false }, { onToggle });
    fireEvent.click(row('Auto-Scroll').querySelector('.settings-toggle input[type="checkbox"]'));
    expect(onToggle).toHaveBeenCalledWith('autoScroll');
  });

  it('offers Reset only when the value has moved off standard', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    expect(row('Scroll Speed').querySelector('.txtsize-reset').disabled).toBe(true);
    cleanup();
    renderSettings({ autoScroll: true, autoScrollLpm: '30' });
    expect(row('Scroll Speed').querySelector('.txtsize-reset').disabled).toBe(false);
  });
});
