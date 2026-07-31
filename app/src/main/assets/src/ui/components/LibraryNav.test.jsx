// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* LibraryNav — THE shared top nav (2026-07-30 consolidation).
   ═══════════════════════════════════════════════════════════════════════
   Before this module owned every nav, 19 hand-rolled copies drifted: the
   enlarged back arrow existed on scripture screens but not on letters (the
   only `nav-volume` in the app lost the cascade to `.nav-back-icon`) and not
   on the 14 volume indexes (still a TEXT "← Volumes" button).

   What these tests pin — the things a screen-level test can't see, and the
   things CSS silently depends on:
   - the back button's EXACT class list. `nav-back-icon` is the 2.1rem glyph;
     `nav-home` is the right-cluster margin-right:auto anchor (app.css:318-319).
     Dropping either one is a visual regression with no other test coverage.
   - `nav-volume` never appears again. That single class was the whole bug.
   - the right-cluster title strings. The Settings visibility toggles select
     on title="Settings"/"History"/"Search" (app.css:320-338), not on classes,
     so `hide` must remove a button outright and leave the survivors' titles
     byte-identical.
   - both back-label conventions: backLabel names the DESTINATION ("← X" /
     "Back to X"); backTitle is the raw legacy string ("Back", "Done"). */

import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LibraryNav } from './LibraryNav.jsx';
import { HomeBtn } from './HomeBtn.jsx';
import { NavButtons } from './NavButtons.jsx';
import { ThemeBtn } from './ThemeBtn.jsx';

const GLOBALS = ['HomeBtn', 'NavButtons', 'ThemeBtn'];
globalThis.HomeBtn = HomeBtn;
globalThis.NavButtons = NavButtons;
globalThis.ThemeBtn = ThemeBtn;

afterEach(() => { cleanup(); });
afterAll(() => { GLOBALS.forEach((k) => { delete globalThis[k]; }); });

const nav = (opts) => render(<div>{LibraryNav(opts)}</div>);
const back = (c) => c.querySelector('.nav-back-icon');
const titles = (c) => [...c.querySelectorAll('button[title]')].map((b) => b.getAttribute('title'));

describe('back button', () => {
  it('carries BOTH load-bearing classes and names the destination from backLabel', () => {
    const { container } = nav({ backLabel: 'Volumes' });
    expect(back(container).className).toBe('nav-home nav-back-icon');
    expect(back(container).getAttribute('title')).toBe('← Volumes');
    expect(back(container).getAttribute('aria-label')).toBe('Back to Volumes');
    expect(back(container).textContent).toBe('‹');
  });

  it('falls back to the raw backTitle when no backLabel is given (JournalEditor "Done")', () => {
    const { container } = nav({ backTitle: 'Done' });
    expect(back(container).getAttribute('title')).toBe('Done');
    expect(back(container).getAttribute('aria-label')).toBe('Done');
  });

  it('defaults to "Back" with neither, and backLabel wins when both are passed', () => {
    const { container: bare } = nav({});
    expect(back(bare).getAttribute('title')).toBe('Back');
    const { container: both } = nav({ backLabel: 'Studies', backTitle: 'Done' });
    expect(back(both).getAttribute('title')).toBe('← Studies');
  });

  it('fires onBack, and hideBack omits the button entirely (home screen)', () => {
    const onBack = vi.fn();
    const { container } = nav({ onBack });
    fireEvent.click(back(container));
    expect(onBack).toHaveBeenCalledTimes(1);

    const { container: none } = nav({ hideBack: true, onBack });
    expect(back(none)).toBeNull();
  });
});

describe('Home button', () => {
  it('renders by default with the title="Home" the CSS anchor selects on', () => {
    const { container } = nav({});
    expect(container.querySelector('[title="Home"]')).toBeTruthy();
  });

  it('showHome:false omits it (the three hub landings + home + search)', () => {
    const { container } = nav({ showHome: false });
    expect(container.querySelector('[title="Home"]')).toBeNull();
  });

  it('forwards onHomeBefore as HomeBtn beforeGo — it must run BEFORE __goHome', () => {
    const calls = [];
    window.__goHome = () => calls.push('home');
    const { container } = nav({ onHomeBefore: () => calls.push('before') });
    fireEvent.click(container.querySelector('[title="Home"]'));
    expect(calls).toEqual(['before', 'home']);
    delete window.__goHome;
  });
});

describe('right cluster — hide drops exactly the named buttons', () => {
  it('renders the full set by default, with the exact title strings the Settings toggles match', () => {
    const { container } = nav({ theme: 'dark' });
    expect(titles(container)).toEqual(['Back', 'Home', 'Settings', 'History', 'Search', 'Switch to light theme']);
  });

  it("hide:['settings'] drops only the gear (SettingsScreen / AboutScreen)", () => {
    const { container } = nav({ theme: 'dark', hide: ['settings'] });
    expect(titles(container)).toEqual(['Back', 'Home', 'History', 'Search', 'Switch to light theme']);
    expect(container.querySelector('.settings-gear-btn')).toBeNull();
  });

  it("hide:['history'] drops only history (HistoryScreen)", () => {
    const { container } = nav({ theme: 'dark', hide: ['history'] });
    expect(titles(container)).toEqual(['Back', 'Home', 'Settings', 'Search', 'Switch to light theme']);
  });

  it("hide:['settings','history'] leaves search + theme (HomeScreen)", () => {
    const { container } = nav({ theme: 'dark', hideBack: true, showHome: false, hide: ['settings', 'history'] });
    expect(titles(container)).toEqual(['Search', 'Switch to light theme']);
  });

  it('hiding all four leaves an empty right cluster (Tabs overview overlay)', () => {
    const { container } = nav({ backTitle: 'Back', hide: ['settings', 'history', 'search', 'theme'] });
    expect(titles(container)).toEqual(['Back', 'Home']);
    expect(container.querySelector('.nav-theme-btn')).toBeNull();
  });

  it('reading flags the history button; leftExtras and rightExtras render', () => {
    const { container } = nav({
      reading: true,
      leftExtras: <span className="jrn-saved-ind">Saved</span>,
      rightExtras: <button className="jrn-entry-menu-btn">⋯</button>,
      theme: 'dark',
    });
    expect(container.querySelector('[title="History"]').className).toContain('nav-history-reading');
    expect(container.querySelector('.jrn-saved-ind')).toBeTruthy();
    expect(container.querySelector('.jrn-entry-menu-btn')).toBeTruthy();
  });
});

describe('reading arrows', () => {
  it('renders the prev/next cluster with the reading screens exact markup', () => {
    const onPrev = vi.fn(); const onNext = vi.fn();
    const { container } = nav({
      arrows: { onPrev, onNext, prevLabel: 'Previous letter', nextLabel: 'Next letter' },
    });
    const arrows = container.querySelectorAll('.nav-arrows .nav-arrow-btn');
    expect(arrows).toHaveLength(2);
    expect(arrows[0].textContent).toBe('‹');
    expect(arrows[1].textContent).toBe('›');
    expect(arrows[0].getAttribute('title')).toBe('Previous');
    expect(arrows[1].getAttribute('title')).toBe('Next');
    expect(arrows[0].getAttribute('aria-label')).toBe('Previous letter');
    expect(arrows[1].getAttribute('aria-label')).toBe('Next letter');
    fireEvent.click(arrows[0]); fireEvent.click(arrows[1]);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('honours prevDisabled / nextDisabled independently (chain boundaries)', () => {
    const { container } = nav({ arrows: { prevDisabled: true, nextDisabled: false } });
    const arrows = container.querySelectorAll('.nav-arrow-btn');
    expect(arrows[0].disabled).toBe(true);
    expect(arrows[1].disabled).toBe(false);
  });

  it('omits the cluster entirely on non-reading screens', () => {
    const { container } = nav({ backLabel: 'Volumes' });
    expect(container.querySelector('.nav-arrows')).toBeNull();
  });

  it('renders the bookmark button only when chapterBookmark is given', () => {
    globalThis.ChapterBookmarkBtn = () => <button className="nav-bookmark-btn" title="Bookmark" />;
    const { container: without } = nav({});
    expect(without.querySelector('.nav-bookmark-btn')).toBeNull();
    const { container: with_ } = nav({ chapterBookmark: { hlKey: 'letter:x', label: 'X' } });
    expect(with_.querySelector('.nav-bookmark-btn')).toBeTruthy();
    delete globalThis.ChapterBookmarkBtn;
  });
});

describe('the nav-volume regression', () => {
  it('never emits nav-volume — in ANY option combination', () => {
    const combos = [
      { backLabel: 'Volume Two', reading: true, arrows: { prevDisabled: true }, theme: 'dark' },
      { backTitle: 'Back', hide: ['settings'] },
      { hideBack: true, showHome: false },
    ];
    for (const opts of combos) {
      const { container } = nav(opts);
      expect(container.querySelector('.nav-volume')).toBeNull();
      expect(container.innerHTML).not.toContain('nav-volume');
      cleanup();
    }
  });
});
