/* RED for w-study-view-toggle (Corbin, 2026-09-11, via the Orchestrator: a button whose label is the
   CURRENT mode on a touch screen cannot be read — "PDF" while you are in PDF mode, tapping it takes you
   to Inline; the audit of 17:5x found this the one either-or control in the app that shows one label).

   The pill becomes a three-segment control — PDF | Inline | Off — under the same "Study Notes" caption,
   in the grammar the Scripture Web's "Scripture | My web" pair already uses: every segment is on screen
   in every state, each names a VIEW and never an action, and exactly one is pressed (aria-pressed, the
   gold `.active` fill): the one the reader is in. Red today in all three states: shown+PDF renders two
   buttons ("PDF", "Off"), shown+Inline renders ("Inline", "Off"), hidden renders one ("Show"); none
   carries aria-pressed. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ModeToggle } from './ModeToggle.jsx';

afterEach(cleanup);

const SEGMENTS = ['PDF', 'Inline', 'Off'];
const names = () => screen.getAllByRole('button').map((b) => b.textContent.trim());
const pressed = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim());

const mount = (mode, showStudy) => {
  const onChange = vi.fn(), onShowStudyChange = vi.fn();
  render(<ModeToggle mode={mode} onChange={onChange} showStudy={showStudy} onShowStudyChange={onShowStudyChange} />);
  return { onChange, onShowStudyChange };
};

describe('the Study Notes control shows every view at once and presses the one the reader is in', () => {
  it.each([
    ['shown, PDF', 'pdf', true, 'PDF'],
    ['shown, Inline', 'inline', true, 'Inline'],
    ['hidden', 'pdf', false, 'Off'],
  ])('%s: three segments PDF | Inline | Off, exactly one pressed — %s', (_label, mode, showStudy, want) => {
    mount(mode, showStudy);
    expect(names(), 'every segment is on screen').toEqual(SEGMENTS);
    expect(pressed(), 'exactly one pressed, the view the reader is in').toEqual([want]);
    expect(screen.getByText('Study Notes')).toBeTruthy();
  });

  it('no segment is an action word — the labels name views (never Show, Hide, or "tap to switch")', () => {
    mount('pdf', false);
    for (const n of names()) expect(SEGMENTS, n).toContain(n);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/>Show</);
    expect(html).not.toMatch(/tap to switch/i);
  });

  it('tapping a view segment while hidden turns the notes on IN THAT VIEW; tapping Off hides them; tapping the pressed one changes nothing', () => {
    const a = mount('pdf', false);
    fireEvent.click(screen.getByRole('button', { name: 'Inline' }));
    expect(a.onShowStudyChange).toHaveBeenCalledWith(true);
    expect(a.onChange).toHaveBeenCalledWith('inline');
    cleanup();
    const b = mount('inline', true);
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(b.onShowStudyChange).toHaveBeenCalledWith(false);
    expect(b.onChange).not.toHaveBeenCalled();
    cleanup();
    const c = mount('pdf', true);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(c.onChange).not.toHaveBeenCalled();
    expect(c.onShowStudyChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inline' }));
    expect(c.onChange).toHaveBeenCalledWith('inline');
    expect(c.onShowStudyChange).not.toHaveBeenCalled();   // already shown: the view changes, the visibility does not
  });

  it('the control is one labelled group, so a screen reader hears "Study Notes" once and then the three views', () => {
    mount('pdf', true);
    const group = screen.getByRole('group', { name: 'Study Notes' });
    expect(group.querySelectorAll('button').length).toBe(3);
  });
});
