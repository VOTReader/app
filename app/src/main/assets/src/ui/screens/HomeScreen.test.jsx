// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HomeScreen tests — Wave 0 MISC-SCREENS item (5).
   ──────────────────────────────────────
   The Surprise FAB was a bare "breathing dice" glyph: an aria-label for
   screen readers, but nothing on screen telling a sighted user what the
   pulsing icon does. It now carries a visible "Surprise Me" caption that
   matches the accessible name (label-in-name), pinned here.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { HomeScreen } from './HomeScreen.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';

const GLOBALS = ['ScreenLayout', 'ThemeBtn', 'HomeOrderStore', 'createPressDrag', 'translationLabel', 'LibraryNav', 'NavButtons'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.ThemeBtn = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.NavButtons = NavButtons;
  globalThis.HomeOrderStore = {
    get: () => ['volumes', 'scriptures', 'studies', 'listening', 'library', 'settings', 'history'],
    set: () => {},
  };
  // The shared press-drag lifecycle — inert here; no gesture is simulated.
  globalThis.createPressDrag = () => ({
    start: () => {}, suppressed: () => false, destroy: () => {}, land: () => {},
  });
  globalThis.translationLabel = () => 'NKJV';
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const renderHome = (props = {}) => render(
  <HomeScreen
    onSelect={() => {}}
    onSurprise={() => {}}
    showSurprise={true}
    onSettings={() => {}}
    onSearch={() => {}}
    onHistory={() => {}}
    historyEnabled={true}
    onAbout={() => {}}
    history={[]}
    theme="dark"
    onThemeChange={() => {}}
    translation="nkjv"
    {...props}
  />
);

describe('HomeScreen — Listening Library card', () => {
  it('renders the card pixel-consistent with its neighbors and routes through onOpenAudio', () => {
    setupGlobals();
    const onOpenAudio = vi.fn();
    const onSelect = vi.fn();
    renderHome({ onOpenAudio, onSelect });

    const card = screen.getByRole('button', { name: /Listening Library/ });
    expect(card.className).toContain('home-nav-item');           // same anatomy as the other six
    expect(card.textContent).toContain('Audio Readings');        // eyebrow
    expect(card.textContent).toContain('The Letters & Scriptures, read aloud');

    fireEvent.click(card);
    expect(onOpenAudio).toHaveBeenCalledTimes(1);                // origin-aware capture path…
    expect(onSelect).not.toHaveBeenCalled();                     // …never the origin-less chain
  });
});

describe('HomeScreen — Surprise FAB naming', () => {
  it('exposes the accessible name "Surprise Me"', () => {
    setupGlobals();
    renderHome();
    const fab = screen.getByRole('button', { name: 'Surprise Me' });
    expect(fab.className).toContain('surprise-fab');
  });

  it('shows a visible caption matching the accessible name', () => {
    setupGlobals();
    renderHome();
    const fab = screen.getByRole('button', { name: 'Surprise Me' });
    const caption = fab.querySelector('.surprise-fab-caption');
    expect(caption).toBeTruthy();
    expect(caption.textContent).toBe('Surprise Me');
  });

  it('renders no FAB when the setting is off', () => {
    setupGlobals();
    renderHome({ showSurprise: false });
    expect(screen.queryByRole('button', { name: 'Surprise Me' })).toBeNull();
  });
});
