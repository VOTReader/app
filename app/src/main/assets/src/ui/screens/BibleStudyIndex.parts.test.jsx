// @ts-nocheck -- classic-global screen contract (ScreenLayout / LibraryNav are bundle globals).
/* The study contents page in the UI pass's parts (second studies pass,
   2026-11-12): a hero that sets the long title in three levels, a card that
   says where to go next, and one grouped list. A part is a row that opens its
   sections under it; a single-section part goes straight to its chapter; the
   part holding the reader's section opens on arrival. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { BibleStudyIndex } from './BibleStudyIndex.jsx';

const STUDY = {
  id: 's1', slug: 's1', title: 'Purity - Bible/Letter Study', prefaceId: 'pre',
  parts: [
    { num: 1, title: 'The Call', subtitle: 'Who is called', chapterIds: ['ch1', 'ch2'] },
    { num: 2, title: 'The Answer', chapterIds: ['ch3'] },
  ],
  chapters: [
    { id: 'pre', num: 0, title: 'Preface' },
    { id: 'ch1', num: 1, title: 'Section One: The First' },
    { id: 'ch2', num: 2, title: 'Two' },
    { id: 'ch3', num: 3, title: 'Three' },
  ],
};
const common = { study: STUDY, onSelect: vi.fn(), onBack: vi.fn(), theme: 'dark', onThemeChange: vi.fn(), isRead: () => false, readCount: () => 0, markAsReadEnabled: false };

beforeEach(() => {
  common.onSelect.mockClear();
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
});
afterEach(() => { cleanup(); delete globalThis.ScreenLayout; delete globalThis.LibraryNav; });

const q = (sel, root = document) => root.querySelector(sel);
const all = (sel, root = document) => [...root.querySelectorAll(sel)];
/** the list's rows, in order: the preface, the parts, and an open part's sections */
const rows = () => all('.ui-group .sty-row');
const part = (n) => all('.sty-part')[n];
const text = (el, sel) => (q(sel, el) ? q(sel, el).textContent : null);

describe('BibleStudyIndex: the hero', () => {
  it('sets the name as the heading and the tag as the label; the title’s tag is not said twice', () => {
    render(<BibleStudyIndex {...common} />);
    expect(text(document, '.sty-hero .root-eyebrow')).toBe('Bible/Letter Study');
    expect(text(document, '.sty-hero h1')).toBe('Purity');
    expect(q('.sty-hero p')).toBeNull();
  });
  it('a long title: the name, the rest under it, and "Extensive" in the label; every word is still on the page', () => {
    const title = 'YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)';
    render(<BibleStudyIndex {...common} study={{ ...STUDY, title }} />);
    expect(text(document, '.sty-hero .root-eyebrow')).toBe('Extensive Bible/Letter Study');
    expect(text(document, '.sty-hero h1')).toBe('YAHUSHUA More Than a Man');
    expect(text(document, '.sty-hero p')).toBe('YahuShua Is The Fulfillment of All Messianic Prophecy');
  });
  it('a study with its own subtitle shows it under the name', () => {
    render(<BibleStudyIndex {...common} study={{ ...STUDY, title: 'The Lamb of God', subtitle: 'The True Chronology' }} />);
    expect(text(document, '.sty-hero p')).toBe('The True Chronology');
  });
});

describe('BibleStudyIndex: the list', () => {
  it('is one group: the preface, then a row for each part with its gold label, title and facts', () => {
    render(<BibleStudyIndex {...common} />);
    expect(all('.ui-group').length).toBe(1);
    expect(rows().map((r) => text(r, '.ui-row-title'))).toEqual(['Preface', 'The Call', 'The Answer']);
    expect(text(part(0), '.root-eyebrow')).toBe('Part 1');
    expect(text(part(0), '.ui-row-meta')).toBe('Who is called · 2 sections');
    expect(q('.ui-row-chev', part(0))).not.toBeNull();
    expect(text(document, '.ui-label-aside')).toBe('2 parts');
  });

  it('a part opens and closes, saying so in aria-expanded; its sections sit under it with their label split off', () => {
    render(<BibleStudyIndex {...common} />);
    expect(part(0).getAttribute('aria-expanded')).toBe('false');
    expect(q('.root-sublist')).toBeNull();
    fireEvent.click(part(0));
    expect(part(0).getAttribute('aria-expanded')).toBe('true');
    const subs = all('.root-sublist .sty-row');
    expect(subs.map((r) => text(r, '.ui-row-title'))).toEqual(['The First', 'Two']);
    expect(text(subs[0], '.ui-row-over')).toBe('Section One');
    expect(q('.ui-row-over', subs[1])).toBeNull();
    fireEvent.click(subs[0]);
    expect(common.onSelect).toHaveBeenCalledWith('ch1');
    fireEvent.click(part(0));
    expect(q('.root-sublist')).toBeNull();
  });

  it('a single-section part does not open: it goes straight to its chapter', () => {
    render(<BibleStudyIndex {...common} />);
    const single = rows()[2];
    expect(single.className).not.toContain('sty-part');
    expect(single.hasAttribute('aria-expanded')).toBe(false);
    expect(text(single, '.root-eyebrow')).toBe('Part 2');
    fireEvent.click(single);
    expect(common.onSelect).toHaveBeenCalledWith('ch3');
  });

  it('the part holding the current section opens on arrival, and that section is marked current', () => {
    render(<BibleStudyIndex {...common} currentChapter="ch2" />);
    expect(part(0).getAttribute('aria-expanded')).toBe('true');
    const current = all('.sty-row[aria-current="true"]');
    expect(current.map((r) => text(r, '.ui-row-title'))).toEqual(['Two']);
  });

  it('a study without parts is its chapters, the study’s name left out of each label', () => {
    const flat = { id: 'purity', title: 'Purity - Bible/Letter Study', chapters: [{ id: 'a', num: 1, title: 'Purity Part One: Purity is Important to God' }, { id: 'b', num: 2 }] };
    render(<BibleStudyIndex {...common} study={flat} />);
    expect(rows().map((r) => text(r, '.ui-row-title'))).toEqual(['Purity is Important to God', 'Part 2']);
    expect(text(rows()[0], '.ui-row-over')).toBe('Part One');
    expect(text(document, '.ui-label-aside')).toBe('2 parts');
  });
});

describe('BibleStudyIndex: read marks', () => {
  it('a read chapter carries the round tick, named "Read"', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled isRead={(id) => id === 'ch3'} readCount={() => 1} />);
    const tick = q('.ui-row-mark.is-tick', rows()[2]);
    expect(tick.getAttribute('aria-label')).toBe('Read');
    expect(q('.ui-row-mark', rows()[0])).toBeNull();
  });
  it('read again: the mark says how many times', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled isRead={(id) => id === 'pre'} readCount={() => 3} />);
    const mark = q('.ui-row-mark', rows()[0]);
    expect(text(mark, '.sr-only')).toBe('Read 3 times');
    expect(mark.textContent).toContain('×3');
  });
  it('with "Mark as read" off nothing is marked and the label counts the parts', () => {
    render(<BibleStudyIndex {...common} isRead={() => true} readCount={() => 2} />);
    expect(q('.ui-row-mark')).toBeNull();
    expect(text(document, '.ui-label-aside')).toBe('2 parts');
  });
  it('the label says how far through the study the reader is, and the part says how many of its sections', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled isRead={(id) => id === 'pre' || id === 'ch1'} readCount={() => 1} />);
    expect(text(document, '.ui-label-aside')).toBe('2 of 4 read');
    expect(text(part(0), '.ui-row-meta')).toBe('Who is called · 2 sections · 1 read');
  });
});

describe('BibleStudyIndex: the minute chip', () => {
  afterEach(() => { delete globalThis.countItemWords; delete globalThis.readingMinutes; });
  it('sections and single-section parts show "~N min" in their meta line when the counter is there', () => {
    globalThis.countItemWords = () => 460;
    globalThis.readingMinutes = (w) => Math.round(w / 230);
    render(<BibleStudyIndex {...common} />);
    expect(text(rows()[2], '.idx-min-chip')).toBe('~2 min');
    expect(q('.idx-min-chip', part(0))).toBeNull();
    fireEvent.click(part(0));
    expect(text(all('.root-sublist .sty-row')[0], '.ui-row-meta .idx-min-chip')).toBe('~2 min');
  });
  it('a chapter holding prophecy cards shows none (the counter leaves the cards out)', () => {
    globalThis.countItemWords = () => 230;
    globalThis.readingMinutes = (w) => Math.round(w / 230);
    const chapters = STUDY.chapters.map((c) => c.id === 'ch3' ? { ...c, blocks: [{ type: 'prophecy-group', ot: { blocks: [] } }] } : c);
    render(<BibleStudyIndex {...common} study={{ ...STUDY, chapters }} />);
    expect(q('.idx-min-chip', rows()[2])).toBeNull();
  });
});

describe('BibleStudyIndex: the card that says where to go next', () => {
  const card = () => q('.sty-next');
  it('a study not begun: "Start here", the first chapter, and no progress bar', () => {
    render(<BibleStudyIndex {...common} />);
    expect(text(card(), '.root-eyebrow')).toBe('Start here');
    expect(text(card(), '.ui-row-title')).toBe('Preface');
    expect(q('.ui-progress', card())).toBeNull();
    fireEvent.click(card());
    expect(common.onSelect).toHaveBeenCalledWith('pre');
  });
  it('a chapter left open and not yet read: "Continue", with its part and label', () => {
    render(<BibleStudyIndex {...common} currentChapter="ch1" />);
    expect(text(card(), '.root-eyebrow')).toBe('Continue');
    expect(text(card(), '.ui-row-title')).toBe('The First');
    expect(text(card(), '.ui-row-meta')).toBe('Part 1 · Section One');
    fireEvent.click(card());
    expect(common.onSelect).toHaveBeenCalledWith('ch1');
  });
  it('the open chapter is read: "Up next" is the first unread one after it, with the study’s progress under it', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled currentChapter="ch1" isRead={(id) => id === 'pre' || id === 'ch1'} readCount={() => 1} />);
    expect(text(card(), '.root-eyebrow')).toBe('Up next');
    expect(text(card(), '.ui-row-title')).toBe('Two');
    expect(q('.ui-progress > span', card()).style.width).toBe('50%');
  });
  it('everything read: "Read again" from the start', () => {
    render(<BibleStudyIndex {...common} markAsReadEnabled isRead={() => true} readCount={() => 1} />);
    expect(text(card(), '.root-eyebrow')).toBe('Read again');
    expect(text(card(), '.ui-row-title')).toBe('Preface');
  });
});

describe('BibleStudyIndex: Listen', () => {
  it('a study with a recording shows a Listen button under the card, and it opens the recordings', () => {
    const onListen = vi.fn();
    render(<BibleStudyIndex {...common} onListen={onListen} />);
    const btn = q('.sty > .ui-btn');
    expect(btn.textContent).toBe('Listen');
    fireEvent.click(btn);
    expect(onListen).toHaveBeenCalledTimes(1);
  });
  it('a study with none shows no button', () => {
    render(<BibleStudyIndex {...common} />);
    expect(q('.sty > .ui-btn')).toBeNull();
  });
});
