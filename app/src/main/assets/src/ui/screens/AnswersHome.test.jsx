// @ts-nocheck — free-var globals installed on window, same shape as VolumesHome.counts.test.jsx
/* AnswersHome / AnswersSubject / AnswersAZ — the Answers landing on the real corpus. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersHome, AnswersSubject, AnswersAZ, resetAnswersLanding } from './AnswersHome.jsx';
import { ANSWERS_SUBJECTS, answersFiledUnder } from '../../utils/answers-shelves.js';

const ctx = {};
runInNewContext(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'answers.js'), 'utf8'), ctx);
const ANSWERS = ctx.ANSWERS;

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'SheetHandle', 'useFocusTrap', 'ReactDOM'];
let navProps;
beforeEach(() => {
  resetAnswersLanding();
  navProps = null;
  window.ScreenLayout = ({ navChildren, children }) => <div>{navChildren}{children}</div>;
  window.LibraryNav = (p) => { navProps = p; return <button type="button" data-testid="nav-back" onClick={p.onBack}>{p.backLabel}</button>; };
  window.SheetHandle = ({ onClose }) => <button type="button" onClick={onClose} aria-label="Close">‹</button>;
  window.useFocusTrap = () => ({ current: null });
  window.ReactDOM = ReactDOM;
});
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; delete window.__screenBack; delete window.__closeSheet; });

const noop = () => {};
const base = { entries: ANSWERS, onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop, onOpenTopic: noop, onOpenSubject: noop, onOpenAZ: noop };

describe('AnswersHome — the landing', () => {
  it('draws two tablets of five commandments and the nine subjects plus A–Z', () => {
    render(<AnswersHome {...base} />);
    const rows = document.querySelectorAll('.answers-tablet-row');
    expect(rows.length).toBe(10);
    expect([...document.querySelectorAll('.answers-tablet-numeral')].map((n) => n.textContent))
      .toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    const tiles = [...document.querySelectorAll('.answers-subject-tile .genre-tile-title')].map((t) => t.textContent);
    expect(tiles).toEqual([...ANSWERS_SUBJECTS.map((s) => s.title), 'Every Topic, A–Z']);
    expect(screen.getByText('All 121 in one list')).toBeTruthy();
  });

  it('counts come from the data: 19 commandment topics, 102 by subject', () => {
    render(<AnswersHome {...base} />);
    expect(screen.getByText('19 topics')).toBeTruthy();
    expect(screen.getByText('102 topics')).toBeTruthy();
  });

  it('a subject tile and the A–Z tile open their screens', () => {
    const onOpenSubject = vi.fn();
    const onOpenAZ = vi.fn();
    render(<AnswersHome {...base} onOpenSubject={onOpenSubject} onOpenAZ={onOpenAZ} />);
    fireEvent.click(screen.getByText('The End of This Age').closest('button'));
    expect(onOpenSubject).toHaveBeenCalledWith('the-end-of-this-age');
    fireEvent.click(screen.getByText('Every Topic, A–Z').closest('button'));
    expect(onOpenAZ).toHaveBeenCalled();
  });

  it('a tablet opens its commandment: the verse, then the site\'s topics under it', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.click(screen.getByRole('button', { name: /^Commandment II: No idols/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('The Second Commandment');
    expect(dialog.textContent).toContain('You shall not make for yourself a carved image');
    expect(dialog.textContent).not.toMatch(/^“|carved image—.*earth;”/);
    const topics = [...dialog.querySelectorAll('.answers-topic-title')].map((t) => t.textContent);
    expect(topics.sort()).toEqual(['Another Messiah', 'Idolatry', 'Materialism']);
    fireEvent.click(screen.getByText('Idolatry').closest('button'));
    expect(onOpenTopic).toHaveBeenCalledWith('god-speaks-about-idolatry', null, 'Commandment II');
    // Hardware back closes the sheet first.
    act(() => { window.__closeSheet(); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asking shows the topic, then where else it is spoken of, and opens on the matching passage', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersHome {...base} onOpenTopic={onOpenTopic} />);
    fireEvent.change(screen.getByLabelText('Search the topics'), { target: { value: 'sabbath' } });
    const card = document.querySelector('.answers-hit-card');
    expect(card.querySelector('.answers-hit-title').textContent).toBe('The Sabbath');
    expect(card.querySelector('.answers-hit-eyebrow').textContent).toMatch(/^Commandment IV · \d+ passages$/);
    expect(card.querySelector('.answers-hit-mark').textContent.toLowerCase()).toBe('sabbath');
    expect(screen.getByText('Also spoken of in')).toBeTruthy();
    expect(document.querySelector('.answers-tablets')).toBeNull();
    fireEvent.click(card);
    const [id, anchor, from] = onOpenTopic.mock.calls[0];
    expect(id).toBe('god-speaks-about-the-sabbath');
    expect(anchor.toLowerCase()).toContain('sabbath');
    expect(from).toBe('Answers');
  });

  it('Back with a question typed clears it before leaving the screen', () => {
    const onBack = vi.fn();
    render(<AnswersHome {...base} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Search the topics'), { target: { value: 'pride' } });
    expect(typeof window.__screenBack).toBe('function');
    act(() => { expect(window.__screenBack()).toBe(true); });
    expect(screen.getByLabelText('Search the topics').value).toBe('');
    expect(window.__screenBack).toBeFalsy();
    fireEvent.click(screen.getByTestId('nav-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('remembers the question across a round trip to a topic, until the Home card resets it', () => {
    const first = render(<AnswersHome {...base} />);
    fireEvent.change(screen.getByLabelText('Search the topics'), { target: { value: 'prayer' } });
    first.unmount();
    render(<AnswersHome {...base} />);
    expect(screen.getByLabelText('Search the topics').value).toBe('prayer');
    cleanup();
    resetAnswersLanding();
    render(<AnswersHome {...base} />);
    expect(screen.getByLabelText('Search the topics').value).toBe('');
  });

  it('says so when nothing speaks of it, and offers the whole library', () => {
    const onSearchLibrary = vi.fn();
    render(<AnswersHome {...base} onSearchLibrary={onSearchLibrary} />);
    fireEvent.change(screen.getByLabelText('Search the topics'), { target: { value: 'xylophone' } });
    expect(screen.getByText(/Nothing in Answers speaks of/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Search the whole library/));
    expect(onSearchLibrary).toHaveBeenCalledWith('xylophone');
  });
});

describe('AnswersSubject', () => {
  it('lists the subject\'s topics, most spoken of first, by short title', () => {
    const onOpenTopic = vi.fn();
    render(<AnswersSubject {...base} subjectId="the-end-of-this-age" onOpenTopic={onOpenTopic} />);
    expect(document.querySelector('h1').textContent).toBe('The End of This Age');
    const titles = [...document.querySelectorAll('.answers-topic-title')].map((t) => t.textContent);
    expect(titles.length).toBe(17);
    expect(titles[0]).toBe('The Coming of The Lord');
    const counts = [...document.querySelectorAll('.answers-topic-count')].map((c) => Number(c.textContent));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    fireEvent.click(screen.getByText('The Gathering Up (Rapture)').closest('button'));
    expect(onOpenTopic).toHaveBeenCalledWith('regarding-the-gathering-up-rapture', null, 'The End of This Age');
    expect(navProps.backLabel).toBe('Answers');
  });
});

describe('AnswersAZ', () => {
  it('files all 121 under their letters, with a jump row', () => {
    render(<AnswersAZ {...base} />);
    expect(document.querySelectorAll('.answers-topic-row').length).toBe(121);
    const letters = [...document.querySelectorAll('.answers-az-letter')].map((l) => l.textContent);
    expect(letters[0]).toBe('#');
    expect(letters.slice(1)).toEqual([...letters.slice(1)].sort());
    expect(document.querySelectorAll('.answers-az-jump button').length).toBe(letters.length);
  });
});

describe('answersFiledUnder', () => {
  it('names a commandment by numeral, anything else by its subject', () => {
    const byId = new Map(ANSWERS.map((e) => [e.id, e]));
    expect(answersFiledUnder(byId.get('god-speaks-about-the-sabbath'))).toBe('Commandment IV');
    expect(answersFiledUnder(byId.get('regarding-pride'))).toBe('Walking With God');
  });
});
