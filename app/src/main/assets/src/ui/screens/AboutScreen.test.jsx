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
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';

const GLOBALS = ['ScreenLayout', 'HomeBtn', 'ThemeBtn', 'LibraryNav', 'NavButtons'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.HomeBtn = () => null;
  globalThis.ThemeBtn = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.NavButtons = NavButtons;
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

/* B1 (2026-08-10). Page 2 is the app's own account of itself, and it had gone
   stale in the one direction that matters: it promised "nothing is downloaded
   except the Garden images" months after every Listen began streaming an MP3
   from a GitHub release. The privacy promise underneath it (nothing of YOURS
   leaves the device) was always true and stays; the download claim is now the
   truth, and the Listening Library is named where the rest of the library is. */
describe('AboutScreen — page 2 describes the app that actually shipped', () => {
  const page2 = () => {
    setupGlobals();
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    return document.querySelector('.about-features').textContent;
  };

  it('no longer claims the Garden images are the only thing fetched', () => {
    const text = page2();
    expect(text).not.toMatch(/nothing is downloaded/i);
    expect(text).toMatch(/Listen streams/i);
  });

  it('still promises the reader that their own data stays on the device', () => {
    expect(page2()).toMatch(/your own data never leaves this device/i);
  });

  it('names the Listening Library among what the library holds', () => {
    expect(page2()).toMatch(/Listening Library/);
  });
});
