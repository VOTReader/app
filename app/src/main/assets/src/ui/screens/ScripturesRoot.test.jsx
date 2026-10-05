// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* ScripturesRoot — The Holy Bible in the new look (rs2c, overhaul): one page,
   an Old / New Testament switch (remembered on the device), each genre a gold
   capital heading over book rows; a row opens its book as a book tile did. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ScripturesHome } from './ScripturesHome.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'SCRIPTURE_GENRES', 'BottomTabs'];
const GENRES = {
  ot: [{ id: 'law', label: 'The Law', books: [{ id: 'genesis', title: 'Genesis', detail: '50 Chapters' }, { id: 'exodus', title: 'Exodus', detail: '40 Chapters' }] }],
  nt: [
    { id: 'gospels', label: 'Gospels', books: [{ id: 'matthew-plain', title: 'Matthew', detail: '28 Chapters' }, { id: 'mark', title: 'Mark', detail: '16 Chapters' }] },
    { id: 'acts', label: 'Acts', single: true, books: [{ id: 'acts', title: 'Acts', detail: '28 Chapters' }] },
  ],
};

function setup() {
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = (o) => <span data-testid="nav">{o.leftExtras}</span>;
  globalThis.SCRIPTURE_GENRES = GENRES;
  globalThis.BottomTabs = { select: () => {} };
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  delete window.__loadBibleCorpus;
  localStorage.clear();
});

const renderBible = (props = {}) => {
  setup();
  return render(<ScripturesHome onSelect={() => {}} onGenre={() => {}} onBack={() => {}} onSearch={() => {}} translation="nkjv" {...props} />);
};

describe('ScripturesRoot — The Holy Bible', () => {
  it('opens on the Old Testament: its genres as headings over book rows, the translation over the title', () => {
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    renderBible();
    expect(screen.getByText('The Holy Bible')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Scriptures of Truth');
    expect(screen.getByRole('tab', { name: 'Old Testament' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'The Law' })).toBeTruthy();
    expect(screen.getByText('50 chapters')).toBeTruthy();
    expect(screen.queryByText('Matthew')).toBeNull();
    expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
  });

  it('switches to the New Testament, says Matthew has its Study Bible, and remembers the choice', () => {
    renderBible();
    fireEvent.click(screen.getByRole('tab', { name: 'New Testament' }));
    expect(screen.getByRole('heading', { name: 'Gospels' })).toBeTruthy();
    expect(screen.getByText('28 chapters · Study Bible available')).toBeTruthy();
    expect(screen.queryByText('Genesis')).toBeNull();
    expect(localStorage.getItem('vot-bible-testament')).toBe('nt');
    cleanup();
    renderBible();
    expect(screen.getByRole('tab', { name: 'New Testament' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a book row opens that book (genre cleared), a one-book genre included', () => {
    const onSelect = vi.fn();
    localStorage.setItem('vot-bible-testament', 'nt');
    renderBible({ onSelect });
    fireEvent.click(screen.getByText('Mark'));
    expect(onSelect).toHaveBeenLastCalledWith('mark', true);
    fireEvent.click(screen.getAllByText('Acts').find((el) => el.className === 'root-row-title'));
    expect(onSelect).toHaveBeenLastCalledWith('acts', true);
  });

  it('keeps the classic layouts where there is no tab bar', () => {
    renderBible();
    delete globalThis.BottomTabs;
    cleanup();
    globalThis.SCRIPTURE_GENRES = GENRES;
    render(<ScripturesHome onSelect={() => {}} onGenre={() => {}} onBack={() => {}} translation="nkjv" layout="genre" />);
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
