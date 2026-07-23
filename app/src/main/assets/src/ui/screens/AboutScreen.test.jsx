// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* AboutScreen tests — Wave 0 MISC-SCREENS item (4).
   ──────────────────────────────────────
   The first-run final page CTA was a flat "Continue" — the last step of
   onboarding should be warm and action-oriented ("Begin Reading"). Page
   1 keeps "Continue" (it genuinely continues to page 2); only the final
   page changes.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { AboutScreen } from './AboutScreen.jsx';

const GLOBALS = ['ScreenLayout', 'HomeBtn', 'ThemeBtn'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.HomeBtn = () => null;
  globalThis.ThemeBtn = () => null;
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const renderAbout = (props = {}) => render(
  <AboutScreen
    onContinue={() => {}}
    onBack={() => {}}
    onSearch={() => {}}
    onHistory={() => {}}
    theme="dark"
    onThemeChange={() => {}}
    {...props}
  />
);

describe('AboutScreen — page-aware CTA', () => {
  it('says "Continue" on page 1 (it advances to page 2)', () => {
    setupGlobals();
    renderAbout();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says "Begin Reading" on the final page and fires onContinue', () => {
    setupGlobals();
    const onContinue = vi.fn();
    renderAbout({ onContinue });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const cta = screen.getByRole('button', { name: 'Begin Reading' });
    fireEvent.click(cta);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
