// @ts-nocheck -- classic-global screen contract (ScreenLayout / LibraryNav / scrollBehavior are bundle globals).
/* The study contents page in Volume One's row language (studies pass,
   2026-11-12): a part is a flat row with a gold "Part 1 · 12 sections" label,
   an empty number column and the UI pass's chevron; a single-section part goes
   straight to its chapter; the part holding the reader's section opens on
   arrival and keeps the soft gold; a long title steps its size down. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { BibleStudyIndex, partRowLabel, studyTitleSizeClass } from './BibleStudyIndex.jsx';

const STUDY = {
  id: 's1', slug: 's1', title: 'Purity', prefaceId: 'pre',
  parts: [
    { num: 1, title: 'The Call', subtitle: 'Who is called', chapterIds: ['ch1', 'ch2'] },
    { num: 2, title: 'The Answer', chapterIds: ['ch3'] },
  ],
  chapters: [
    { id: 'pre', num: 0, title: 'Preface' },
    { id: 'ch1', num: 1, title: 'One' },
    { id: 'ch2', num: 2, title: 'Two' },
    { id: 'ch3', num: 3, title: 'Three' },
  ],
};
const common = { study: STUDY, onSelect: vi.fn(), onBack: vi.fn(), theme: 'dark', onThemeChange: vi.fn(), isRead: () => false, readCount: () => 0, markAsReadEnabled: false };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.scrollBehavior = () => 'auto';
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});
afterEach(() => { cleanup(); delete globalThis.ScreenLayout; delete globalThis.LibraryNav; delete globalThis.scrollBehavior; });

const rows = () => [...document.querySelectorAll('.chapter-cards > .chapter-card-btn')];
const parts = () => [...document.querySelectorAll('.part-row')];
const label = (el) => el.querySelector('.chapter-card-label').textContent;

describe('BibleStudyIndex — part rows', () => {
  it('a part is a flat row: gold label with the section count, empty number column, upright title, subtitle, chevron', () => {
    render(<BibleStudyIndex {...common} />);
    const [p1, p2] = parts();
    expect(p1.classList.contains('chapter-card-btn')).toBe(true);
    expect(label(p1)).toBe('Part 1 · 2 sections');
    expect(p1.querySelector('.chapter-card-num').textContent).toBe('');
    expect(p1.querySelector('.chapter-card-title').textContent).toBe('The Call');
    expect(p1.querySelector('.part-row-sub').textContent).toBe('Who is called');
    expect(p1.querySelector('svg.ui-row-chev').getAttribute('aria-hidden')).toBe('true');
    expect(label(p2)).toBe('Part 2');
    expect(document.querySelector('.part-group-card, .part-chevron, .part-chapters')).toBeNull();
  });

  it('opens and closes, saying so in aria-expanded; its sections follow it as plain rows', () => {
    render(<BibleStudyIndex {...common} />);
    const p1 = parts()[0];
    expect(p1.getAttribute('aria-expanded')).toBe('false');
    expect(rows().map((r) => r.textContent)).not.toContain('1One');
    fireEvent.click(p1);
    expect(p1.getAttribute('aria-expanded')).toBe('true');
    expect(p1.classList.contains('is-open')).toBe(true);
    const all = rows();
    const at = all.indexOf(p1);
    expect(all[at + 1].querySelector('.chapter-card-title').textContent).toBe('One');
    expect(all[at + 2].querySelector('.chapter-card-title').textContent).toBe('Two');
    fireEvent.click(p1);
    expect(p1.getAttribute('aria-expanded')).toBe('false');
    expect(p1.classList.contains('is-open')).toBe(false);
    expect(rows()).toHaveLength(3);   // preface + two parts
  });

  it('a single-section part has no chevron and goes straight to its chapter', () => {
    const onSelect = vi.fn();
    render(<BibleStudyIndex {...common} onSelect={onSelect} />);
    const p2 = parts()[1];
    expect(p2.hasAttribute('aria-expanded')).toBe(false);
    expect(p2.querySelector('.ui-row-chev')).toBeNull();
    fireEvent.click(p2);
    expect(onSelect).toHaveBeenCalledWith('ch3');
  });

  it('the part holding the current section opens on arrival and keeps the gold when closed', async () => {
    render(<BibleStudyIndex {...common} currentChapter="ch2" />);
    await act(async () => {});
    const p1 = parts()[0];
    expect(p1.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[aria-current="true"] .chapter-card-title').textContent).toBe('Two');
    fireEvent.click(p1);
    expect(p1.getAttribute('aria-expanded')).toBe('false');
    expect(p1.classList.contains('is-open')).toBe(true);
  });

  it('a single-section part keeps the read tick', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled isRead={(id) => id === 'ch3'} readCount={() => 1} />);
    expect(parts()[1].querySelector('.read-check')).not.toBeNull();
  });
});

describe('BibleStudyIndex — the minute chip', () => {
  afterEach(() => { delete globalThis.countItemWords; delete globalThis.readingMinutes; });
  it('sections and single-section parts show "~N min" when the counter is there', () => {
    globalThis.countItemWords = () => 460;
    globalThis.readingMinutes = (w) => Math.round(w / 230);
    render(<BibleStudyIndex {...common} />);
    expect(parts()[1].querySelector('.idx-min-chip').textContent).toBe('~2 min');
    expect(parts()[0].querySelector('.idx-min-chip')).toBeNull();
    fireEvent.click(parts()[0]);
    expect(rows()[2].querySelector('.idx-min-chip').textContent).toBe('~2 min');
  });
  it('a chapter holding prophecy cards shows none (the counter leaves the cards out)', () => {
    globalThis.countItemWords = () => 230;
    globalThis.readingMinutes = (w) => Math.round(w / 230);
    const chapters = STUDY.chapters.map((c) => c.id === 'ch3' ? { ...c, blocks: [{ type: 'prophecy-group', ot: { blocks: [] } }] } : c);
    render(<BibleStudyIndex {...common} study={{ ...STUDY, chapters }} />);
    expect(parts()[1].querySelector('.idx-min-chip')).toBeNull();
  });
});

describe('BibleStudyIndex — the title steps down with length', () => {
  it('keeps the size to 40 characters, one step past it, --fs-20 past 70', () => {
    expect(studyTitleSizeClass('Purity')).toBe('');
    expect(studyTitleSizeClass('x'.repeat(40))).toBe('');
    expect(studyTitleSizeClass('x'.repeat(41))).toBe(' is-longish');
    expect(studyTitleSizeClass('x'.repeat(70))).toBe(' is-longish');
    expect(studyTitleSizeClass('x'.repeat(108))).toBe(' is-long');
  });
  it('renders the class and the title exactly as the data has it', () => {
    const title = 'YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)';
    render(<BibleStudyIndex {...common} study={{ ...STUDY, title }} />);
    const h = document.querySelector('h1.vol-index-title');
    expect(h.className).toBe('vol-index-title is-long');
    expect(h.textContent).toBe(title);
  });
  it('partRowLabel', () => {
    expect(partRowLabel({ num: 4 }, 1)).toBe('Part 4');
    expect(partRowLabel({ num: 1 }, 12)).toBe('Part 1 · 12 sections');
  });
});
