/* A journal card with no title takes its title from the entry's preview; the card then said it twice. A recovered
   recording read "[Voice recording] [Voice recording] Voice · 0:42", and a short untitled note its words twice. */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { JournalHubScreen, JournalCardMenu } from './JournalHubScreen.jsx';
import { JournalHelpers } from '../../data/journal-helpers.js';
import * as ReactDOM from 'react-dom';
/** @type {any} */ (globalThis).ReactDOM = ReactDOM;
/** @type {any} */ (globalThis).JournalCardMenu = JournalCardMenu;

const LONG = 'Grace for today, and strength for the road ahead of us, and rest in the evening once the work is done.';
const ENTRIES = [
  { id: 'rec', title: '', created: 1720000000000, updated: 1720000000000, tags: [],
    blocks: [{ id: 'a1', type: 'audio', mediaId: 'm1', duration: 42, samples: null }] },
  { id: 'short', title: '', created: 1720000100000, updated: 1720000100000, tags: [],
    blocks: [{ id: 'p1', type: 'p', text: 'Grace for today.' }] },
  { id: 'named', title: 'Morning prayer', created: 1720000200000, updated: 1720000200000, tags: [],
    blocks: [{ id: 'p2', type: 'p', text: 'A short first paragraph.' }] },
  { id: 'long', title: '', created: 1720000300000, updated: 1720000300000, tags: [],
    blocks: [{ id: 'p3', type: 'p', text: LONG }] },
];

beforeEach(() => {
  modalRegistry._reset();
  window.ScreenLayout = ({ children, navChildren }) => <div><div>{navChildren}</div>{children}</div>;
  window.LibraryNav = () => null;
  window.JournalStore = {
    subscribe: () => () => {}, getVersion: () => 1, get: (id) => ENTRIES.find((e) => e.id === id) || null,
    all: () => ENTRIES.slice(), togglePin: vi.fn(), remove: vi.fn(), associatedDataSummary: () => null, collectAllMediaIds: () => [],
  };
  window.JournalHelpers = JournalHelpers;
});
afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.ScreenLayout; delete window.LibraryNav; delete window.JournalStore; delete window.JournalHelpers;
});

/** The open control of the card whose title is `title`. */
const card = (container, title) => Array.from(container.querySelectorAll('.jrn-card-open'))
  .find((c) => c.querySelector('.jrn-card-title').textContent === title);

describe('a journal card says its words once', () => {
  it('a recording with no title: the title says "[Voice recording]" and no preview repeats it', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    const c = card(container, '[Voice recording]');
    expect(c).toBeTruthy();
    expect(c.querySelector('.jrn-card-preview')).toBeNull();
    expect(c.textContent.split('[Voice recording]').length - 1).toBe(1);
    expect(c.querySelector('.jrn-card-attachments').textContent).toBe('Voice · 0:42');
  });
  it('a short untitled note shows its words once; a titled one keeps its preview', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    expect(card(container, 'Grace for today.').querySelector('.jrn-card-preview')).toBeNull();
    expect(card(container, 'Morning prayer').querySelector('.jrn-card-preview').textContent).toBe('A short first paragraph.');
  });
  it('a long untitled note (over 50 characters): the title is its first words, the preview goes on from there', () => {
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    const title = 'Grace for today, and strength for the road ahead o…';
    expect(JournalHelpers.entryDisplayTitle(ENTRIES[3])).toBe(title);
    const c = card(container, title);
    expect(c).toBeTruthy();
    const preview = c.querySelector('.jrn-card-preview').textContent;
    expect(preview).toBe('…of us, and rest in the evening once the work is done.');
    expect(preview).not.toContain('Grace for today');
  });
});
