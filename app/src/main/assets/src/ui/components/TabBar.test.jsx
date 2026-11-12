// @ts-nocheck — free-var globals stubbed per test (bundle-d contract)
/* TabBar: Read / Listen / Library at the bottom (the layout pass, 2026-11-10). Where it shows and which tab it
   lights is utils/app-sections.js (its own tests); these pin the drawing, the taps and the dock class. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { TabBar } from './TabBar.jsx';

afterEach(() => {
  cleanup();
  delete globalThis.TourController;
  delete globalThis.AboutSeenFlagStore;
  delete globalThis.__scrollEl;
  document.documentElement.classList.remove('kb-up');
  document.body.classList.remove('tabbar-on', 'nav-tabbed');
});

const tabs = () => [...document.querySelectorAll('.tabbar-tab')].map((b) => b.textContent);

describe('TabBar', () => {
  it('draws Read, Listen and Library, lights the screen’s tab, and lifts the dock', () => {
    render(<TabBar screen="notes-index" onOpen={vi.fn()} />);
    expect(tabs()).toEqual(['Read', 'Listen', 'Library']);
    const on = screen.getByRole('button', { name: 'Library' });
    expect(on.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Read' }).getAttribute('aria-current')).toBeNull();
    expect(document.body.classList.contains('tabbar-on')).toBe(true);
  });

  it('Settings keeps the tab you came from lit; a reader has no bar and no tabbed top bar', () => {
    const { rerender } = render(<TabBar screen="library" onOpen={vi.fn()} />);
    rerender(<TabBar screen="settings" onOpen={vi.fn()} />);
    expect(document.querySelector('[aria-current]').textContent).toBe('Library');
    expect(document.body.classList.contains('nav-tabbed')).toBe(true);
    rerender(<TabBar screen="bible-ch" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).toBeNull();
    expect(document.body.classList.contains('tabbar-on')).toBe(false);
    expect(document.body.classList.contains('nav-tabbed')).toBe(false);
  });

  it('the keyboard takes the bar down but leaves the top bar as it was', async () => {
    render(<TabBar screen="search" onOpen={vi.fn()} />);
    await act(async () => { document.documentElement.classList.add('kb-up'); await Promise.resolve(); });
    expect(document.body.classList.contains('tabbar-on')).toBe(false);
    expect(document.body.classList.contains('nav-tabbed')).toBe(true);
  });

  it('a tab opens its root; the lit tab on its root scrolls the page to the top instead', () => {
    const onOpen = vi.fn();
    const scrollTo = vi.fn();
    globalThis.__scrollEl = { scrollTo };
    const { rerender } = render(<TabBar screen="volumes-home" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(onOpen).toHaveBeenLastCalledWith('listen', 'audio-library');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(onOpen).toHaveBeenLastCalledWith('read', 'home');
    rerender(<TabBar screen="home" onOpen={onOpen} />);
    onOpen.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('steps aside over the tabs overview, on the first-run About, while the tour runs and while the keyboard is up', async () => {
    const { rerender } = render(<TabBar screen="home" overviewOpen onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).toBeNull();

    globalThis.AboutSeenFlagStore = { is: () => false, subscribe: () => () => {}, getVersion: () => 0 };
    rerender(<TabBar screen="about" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).toBeNull();
    cleanup();
    globalThis.AboutSeenFlagStore = { is: () => true, subscribe: () => () => {}, getVersion: () => 1 };
    render(<TabBar screen="about" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).not.toBeNull();
    cleanup();

    globalThis.TourController = { getState: () => ({ active: true }), subscribe: () => () => {}, getVersion: () => 0 };
    render(<TabBar screen="home" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).toBeNull();
    cleanup();
    // The welcome card (stop 0) floats mid-screen with the bar left in view under the dim.
    globalThis.TourController = { getState: () => ({ active: true, index: 0 }), subscribe: () => () => {}, getVersion: () => 0 };
    render(<TabBar screen="home" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).not.toBeNull();
    cleanup();
    delete globalThis.TourController;

    render(<TabBar screen="search" onOpen={vi.fn()} />);
    expect(document.querySelector('.tabbar')).not.toBeNull();
    await act(async () => { document.documentElement.classList.add('kb-up'); await Promise.resolve(); });
    expect(document.querySelector('.tabbar')).toBeNull();
  });
});
