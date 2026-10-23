/* A05.3 + s20.8: journal times said nothing about edits. The hub card showed
   updated||created as if it were when the entry was written, and the viewer
   showed only when it was written. An entry edited more than a minute after it
   was written now says so in both places. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';
import { JournalHubScreen, JournalCardMenu } from './JournalHubScreen.jsx';
import { JournalHelpers } from '../../data/journal-helpers.js';

/** @type {any} */ (globalThis).JournalCardMenu = JournalCardMenu;

const at = (/** @type {number} */ d, /** @type {number} */ h, /** @type {number} */ m, s = 0) => new Date(2026, 9, d, h, m, s).getTime();

function setup(/** @type {any[]} */ entries) {
  const w = /** @type {any} */ (window);
  w.ScreenLayout = ({ children, navChildren }) => <div><div>{navChildren}</div>{children}</div>;
  w.LibraryNav = (opts) => <>{(opts && opts.rightExtras) || null}</>;
  w.JournalStore = {
    subscribe: () => () => {}, getVersion: () => 1,
    get: (id) => entries.find((e) => e.id === id) || null,
    all: () => entries.slice(),
    togglePin: vi.fn(), remove: vi.fn(), associatedDataSummary: () => null, collectAllMediaIds: () => [],
  };
  w.JournalHelpers = JournalHelpers;
}
afterEach(() => {
  cleanup();
  const w = /** @type {any} */ (window);
  for (const k of ['ScreenLayout', 'LibraryNav', 'JournalStore', 'JournalHelpers']) delete w[k];
});

const entry = (/** @type {number} */ created, /** @type {number} */ updated) => ({ id: 'e1', title: 'Psalm night', created, updated, blocks: [], tags: [] });
const viewerLine = () => /** @type {HTMLElement} */ (document.querySelector('.jrn-viewer-date')).textContent;
const cardLine = () => /** @type {HTMLElement} */ (document.querySelector('.jrn-card-date')).textContent;

describe('journal times say when an entry was edited (A05.3, s20.8)', () => {
  it('viewer: written and edited the same day', () => {
    setup([entry(at(22, 19, 8), at(22, 19, 12))]);
    render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    expect(viewerLine()).toBe('October 22, 2026 · Written 7:08 PM · edited 7:12 PM');
  });
  it('viewer: edited on a later day names that day', () => {
    setup([entry(at(22, 19, 8), at(24, 9, 5))]);
    render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    expect(viewerLine()).toBe('October 22, 2026 · Written 7:08 PM · edited October 24, 2026 · 9:05 AM');
  });
  it('viewer: a save within the minute is not an edit', () => {
    setup([entry(at(22, 19, 8), at(22, 19, 8, 40))]);
    render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    expect(viewerLine()).toBe('October 22, 2026 · 7:08 PM');
  });
  it('hub card: an edited entry says Edited', () => {
    setup([entry(at(22, 19, 8), at(24, 9, 5))]);
    render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} onNewEntry={() => {}} />);
    expect(cardLine()).toBe('Edited Oct 24 · 9:05 AM');
  });
  it('hub card: an unedited entry shows when it was written, bare', () => {
    setup([entry(at(22, 19, 8), at(22, 19, 8, 30))]);
    render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} onNewEntry={() => {}} />);
    expect(cardLine()).toBe('Oct 22 · 7:08 PM');
  });
});
