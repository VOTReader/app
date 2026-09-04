// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* MilestonesScreen — render, filter, and the memo (2026-08-09).
   ═══════════════════════════════════════════════════════════════════════
   The screen renders what utils/achievements.js computes (that module has
   its own pure suite); these cases pin the SCREEN:

   (1) it renders every category the builder returns, with the earned marks
       and the summary the achievements module derived;
   (2) "Hide reached" leaves only what remains — and a category that empties
       out disappears with its jump chip, rather than standing as a heading
       over nothing;
   (3) the ~84-achievement rebuild is MEMOIZED. It reads ten stores and
       walks the whole readItems map, and it used to run on every render —
       including this screen's own filter toggle. The memo is observed
       through store READS, not through a spy on the builder: what matters
       is that the work does not happen again, whoever caused the render.

   Real buildAchievements / collectAchievementSnapshot are wired in — a
   stubbed builder would make every count assertion vacuous. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { MilestonesScreen } from './MilestonesScreen.jsx';
import {
  ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_STORE_NAMES, ACHIEVEMENT_TOTAL,
  FEATURED_ACHIEVEMENTS, buildAchievements, collectAchievementSnapshot,
} from '../../utils/achievements.js';

const GLOBALS = ['ScreenLayout', 'LibraryNav', ...ACHIEVEMENT_STORE_NAMES];

/** A store nobody has written to: subscribable, version 0, answers nothing. */
const idleStore = () => ({ subscribe: () => () => {}, getVersion: () => 0 });

/**
 * A store whose version can be bumped, notifying subscribers the way the real
 * CachedStore._bump does. Every read is counted so a test can prove the
 * snapshot was (or was not) re-collected.
 */
function liveStore(reads = {}) {
  let version = 0;
  const listeners = new Set();
  const calls = { getPlays: 0, saved: 0 };
  return {
    calls,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => version,
    getPlays: () => { calls.getPlays++; return reads.plays || 0; },
    saved: () => { calls.saved++; return new Array(reads.saved || 0).fill({}); },
    bump: (next) => {
      if (next) Object.assign(reads, next);
      version++;
      act(() => { listeners.forEach((cb) => cb()); });
    },
  };
}

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  for (const name of ACHIEVEMENT_STORE_NAMES) globalThis[name] = over[name] || idleStore();
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  vi.restoreAllMocks();
});

const noop = () => {};
const renderScreen = (props = {}) => render(
  <MilestonesScreen
    onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
    theme="dark" onThemeChange={noop} readItems={{}}
    {...props}
  />,
);

const catHeadings = () => [...document.querySelectorAll('.milestones-cat-head h2')].map((h) => h.textContent);
const rowLabels = () => [...document.querySelectorAll('.milestones-label')].map((l) => l.textContent);
const earnedRows = () => [...document.querySelectorAll('.milestones-list li.is-earned')];
const jumpChips = () => [...document.querySelectorAll('.milestones-jump-chip')].map((c) => c.textContent);
const filterBtn = () => document.querySelector('.milestones-filter');

/** readItems marking N distinct Scripture chapters read. */
const chaptersRead = (n) => Object.fromEntries(
  Array.from({ length: n }, (_u, i) => [`v1:psalms:${i + 1}`, 1])
);

describe('MilestonesScreen — render', () => {
  it('renders every category with its summary over the whole ledger', () => {
    setupGlobals();
    renderScreen();
    expect(catHeadings().length).toBeGreaterThan(10);
    expect(catHeadings()).toContain('Scripture Chapters');
    expect(catHeadings()).toContain('Listening');
    const summary = document.querySelector('.milestones-summary-count');
    expect(summary.textContent).toMatch(/^0of \d+ reached$/);
  });

  it('marks the tiers the data has actually reached', () => {
    setupGlobals();
    renderScreen({ readItems: chaptersRead(10) });
    const earned = earnedRows().map((li) => li.querySelector('.milestones-label').textContent);
    expect(earned).toContain('First chapter read');
    expect(earned).toContain('10 chapters read');
    expect(earned).not.toContain('25 chapters read');
    expect(document.querySelector('.milestones-summary-count strong').textContent).toBe(String(earned.length));
  });

  it('reads the listening tiers from the Listening Library', () => {
    setupGlobals({ AudioLibraryStore: liveStore({ plays: 5, saved: 1 }) });
    renderScreen();
    const earned = earnedRows().map((li) => li.querySelector('.milestones-label').textContent);
    expect(earned.some((l) => /recording/i.test(l))).toBe(true);
  });
});

describe('MilestonesScreen — hide reached', () => {
  it('starts showing everything, reached and not', () => {
    setupGlobals();
    renderScreen({ readItems: chaptersRead(10) });
    expect(filterBtn().getAttribute('aria-pressed')).toBe('false');
    expect(earnedRows().length).toBeGreaterThan(0);
  });

  it('leaves only what is still to reach', () => {
    setupGlobals();
    renderScreen({ readItems: chaptersRead(10) });
    const before = rowLabels().length;
    fireEvent.click(filterBtn());
    expect(filterBtn().getAttribute('aria-pressed')).toBe('true');
    expect(earnedRows()).toEqual([]);
    expect(rowLabels().length).toBeLessThan(before);
    expect(rowLabels()).toContain('25 chapters read');
    expect(rowLabels()).not.toContain('10 chapters read');
  });

  it('drops a fully-reached category and its jump chip together', () => {
    // 500 plays clears every Listening tier, so that whole category is done.
    setupGlobals({ AudioLibraryStore: liveStore({ plays: 500, saved: 0 }) });
    renderScreen();
    expect(catHeadings()).toContain('Listening');
    fireEvent.click(filterBtn());
    // The heading goes, and no orphan chip is left pointing at nothing.
    expect(catHeadings()).not.toContain('Listening');
    expect(jumpChips()).not.toContain('Listening');
    expect(jumpChips()).toEqual(catHeadings());
  });

  it('restores the full ledger when switched back off', () => {
    setupGlobals();
    renderScreen({ readItems: chaptersRead(10) });
    const before = rowLabels().length;
    fireEvent.click(filterBtn());
    fireEvent.click(filterBtn());
    expect(rowLabels().length).toBe(before);
    expect(earnedRows().length).toBeGreaterThan(0);
  });

  it('keeps the overall summary describing the WHOLE ledger while filtering', () => {
    setupGlobals();
    renderScreen({ readItems: chaptersRead(10) });
    const summary = document.querySelector('.milestones-summary-count').textContent;
    fireEvent.click(filterBtn());
    expect(document.querySelector('.milestones-summary-count').textContent).toBe(summary);
  });
});

describe('MilestonesScreen — jump chips', () => {
  it('offers one chip per rendered category', () => {
    setupGlobals();
    renderScreen();
    expect(jumpChips()).toEqual(catHeadings());
  });

  it('scrolls that category heading into view', () => {
    setupGlobals();
    renderScreen();
    const scrolled = [];
    for (const h of document.querySelectorAll('.milestones-cat-head h2')) {
      h.scrollIntoView = function scrollIntoView() { scrolled.push(this.id); };
    }
    const chips = [...document.querySelectorAll('.milestones-jump-chip')];
    fireEvent.click(chips[2]);
    expect(scrolled).toEqual([document.querySelectorAll('.milestones-cat-head h2')[2].id]);
  });

  /* a11y-ux-4. The app.css `prefers-reduced-motion` block sets
     `scroll-behavior: auto !important`, but per CSSOM-View that property is
     only consulted when the call passes 'auto' — an explicit 'smooth'
     argument wins over the CSS, !important included. So the jump has to read
     the media query itself. This screen stands in for the eleven call sites
     that used to hard-code 'smooth'. */
  it('jumps without animation when the OS asks for reduced motion', () => {
    const real = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q });
    try {
      setupGlobals();
      renderScreen();
      const opts = [];
      for (const h of document.querySelectorAll('.milestones-cat-head h2')) {
        h.scrollIntoView = function scrollIntoView(o) { opts.push(o); };
      }
      fireEvent.click([...document.querySelectorAll('.milestones-jump-chip')][0]);
      expect(opts).toEqual([{ behavior: 'auto', block: 'start' }]);
    } finally {
      window.matchMedia = real;
    }
  });
});

/* The memo. collectAchievementSnapshot reads every store on each rebuild, so
   a store's own read counter is the honest witness: no reads = no rebuild. */
describe('MilestonesScreen — rebuild is memoized', () => {
  it('does not rebuild when a render is caused by something else', () => {
    const library = liveStore({ plays: 3, saved: 0 });
    setupGlobals({ AudioLibraryStore: library });
    renderScreen();
    const afterMount = library.calls.getPlays;
    expect(afterMount).toBeGreaterThan(0);

    // The filter toggle re-renders the screen; the ledger's inputs did not move.
    fireEvent.click(filterBtn());
    fireEvent.click(filterBtn());
    expect(library.calls.getPlays).toBe(afterMount);
  });

  it('rebuilds when a contributing store bumps its version', () => {
    const library = liveStore({ plays: 3, saved: 0 });
    setupGlobals({ AudioLibraryStore: library });
    renderScreen();
    const afterMount = library.calls.getPlays;

    library.bump({ plays: 250 });
    expect(library.calls.getPlays).toBeGreaterThan(afterMount);
    const earned = earnedRows().map((li) => li.querySelector('.milestones-label').textContent);
    expect(earned.some((l) => /recording/i.test(l))).toBe(true);
  });

  it('rebuilds when readItems changes identity (a fresh mark)', () => {
    setupGlobals();
    const { rerender } = renderScreen({ readItems: chaptersRead(1) });
    const before = earnedRows().length;
    rerender(
      <MilestonesScreen
        onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
        theme="dark" onThemeChange={noop} readItems={chaptersRead(10)}
      />
    );
    expect(earnedRows().length).toBeGreaterThan(before);
  });

  it('subscribes to every store the achievements module names', () => {
    const subscribed = [];
    const spies = {};
    for (const name of ACHIEVEMENT_STORE_NAMES) {
      spies[name] = { subscribe: () => { subscribed.push(name); return () => {}; }, getVersion: () => 0 };
    }
    setupGlobals(spies);
    renderScreen();
    expect([...new Set(subscribed)].sort()).toEqual([...ACHIEVEMENT_STORE_NAMES].sort());
  });
});

/* ── the folded strip rows (2026-08-10) ───────────────────────────────────
   My Progress's ten-row strip used to be a SECOND milestone table. It folded
   into this engine as its FEATURED subset, which means these ten rows must
   appear on this screen exactly once each — a fold that added rows, or that
   counted a featured row twice in the summary, would be a worse bug than the
   duplication it replaced. */
describe('MilestonesScreen — the folded My Progress rows', () => {
  it('shows each featured row ONCE, inside its own category', () => {
    setupGlobals();
    renderScreen();
    const labels = rowLabels();
    for (const f of FEATURED_ACHIEVEMENTS) {
      const def = ACHIEVEMENT_CATEGORIES.flatMap((c) => c.defs).find((d) => d.key === f.key);
      expect(labels.filter((l) => l === def.label).length).toBe(1);
    }
    // The three categories the ten came from are the ones that already existed.
    expect(catHeadings()).toEqual(expect.arrayContaining(['Readings Finished', 'Words Read', 'Returnings']));
  });

  it('counts them in the summary exactly once — the total is unchanged', () => {
    setupGlobals();
    renderScreen();
    expect(document.querySelector('.milestones-summary-count').textContent)
      .toBe('0of ' + ACHIEVEMENT_TOTAL + ' reached');
    expect(rowLabels().length).toBe(ACHIEVEMENT_TOTAL);
  });

  it('earns a featured row here on the same data My Progress marks it on', () => {
    // 12 finished readings: readings-1 and readings-10 are featured rows.
    setupGlobals({
      ReadingStatsStore: {
        subscribe: () => () => {}, getVersion: () => 0,
        get: () => ({ totalWordsRead: 0, totalCompletions: 12, rereads: 0, wordsByDay: {} }),
      },
    });
    renderScreen();
    const earned = earnedRows().map((li) => li.querySelector('.milestones-label').textContent);
    expect(earned).toContain('First reading finished');
    expect(earned).toContain('10 readings finished');
    expect(earned).not.toContain('50 readings finished');
    // Same numbers the strip would show for the featured ten.
    const strip = buildAchievements(collectAchievementSnapshot({})).featured;
    expect(strip.filter((i) => i.earned).map((i) => i.label))
      .toEqual(['First reading finished', '10 readings finished']);
  });
});
