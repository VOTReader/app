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
import { ModeToggle, renderCommentaryCite } from './ModeToggle.jsx';

afterEach(cleanup);

/* r-study (W2h): the switch sits under the chapter title, in words: Study notes: In the text | At the end | Off. */
const radios = () => screen.getAllByRole('radio');
const names = () => radios().map((b) => b.textContent.trim());
const chosen = () => radios().filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent.trim());
const mount = (mode, showStudy) => {
  const onChange = vi.fn(); const onShowStudyChange = vi.fn();
  render(<ModeToggle mode={mode} onChange={onChange} showStudy={showStudy} onShowStudyChange={onShowStudyChange} />);
  return { onChange, onShowStudyChange };
};
afterEach(cleanup);

describe('the study-notes switch names each view in words and checks the one the reader is in', () => {
  it.each([['pdf', true, 'At the end'], ['inline', true, 'In the text'], ['pdf', false, 'Off']])('%s, shown %s: %s', (mode, shown, want) => {
    mount(mode, shown);
    expect(names()).toEqual(['In the text', 'At the end', 'Off']);
    expect(chosen()).toEqual([want]);
    expect(screen.getByText('Study notes')).toBeTruthy();
  });
  it('a view picked while hidden turns the notes on in that view; Off hides them', () => {
    const h = mount('pdf', false);
    fireEvent.click(screen.getByRole('radio', { name: 'In the text' }));
    expect(h.onShowStudyChange).toHaveBeenCalledWith(true);
    expect(h.onChange).toHaveBeenCalledWith('inline');
    cleanup();
    const v = mount('inline', true);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(v.onShowStudyChange).toHaveBeenCalledWith(false);
    expect(v.onChange).not.toHaveBeenCalled();
  });
});

describe('renderCommentaryCite still ships from this file', () => {
  it('styles an inline scripture reference and leaves the prose as text', () => {
    const text = 'He is Elijah (Matthew 11:14) who was to come';
    const parts = renderCommentaryCite(text);
    expect(Array.isArray(parts)).toBe(true);
    render(<span>{parts}</span>);
    const ref = document.querySelector('.inline-scrip-ref');
    expect(ref && ref.textContent).toBe('Matthew 11:14');
    expect(document.body.textContent).toBe(text);
    expect(renderCommentaryCite('')).toBe('');
  });
});

/* reading-flow hunt 2026-11-04: a Matthew note's references were gold (this class is the app's
   tappable reference) and did nothing when tapped. They open the chapter's scripture sheet now, so
   each must be the reference it names: the old greedy tail took the "1" of "1 Corinthians"
   ("Ephesians 1:22, 1" + "Corinthians 12:13") and left ":17" off "Revelation 21:9, 22:17". */
describe('renderCommentaryCite: the references a commentary note names', () => {
  // Matthew 16:18's note, verbatim from matthew.js.
  const NOTE = 'In the Bible, the word "church" refers to The Lord\'s body or body of believers, the Messianic community (Ephesians 1:22, 1 Corinthians 12:13); and also the Bride (John 3:29; Revelation 21:9, 22:17).';

  it('reads each reference whole, and leaves a following book its own number', () => {
    render(<span>{renderCommentaryCite(NOTE)}</span>);
    expect([...document.querySelectorAll('.inline-scrip-ref')].map((e) => e.textContent))
      .toEqual(['Ephesians 1:22', '1 Corinthians 12:13', 'John 3:29', 'Revelation 21:9, 22:17']);
    expect(document.body.textContent).toBe(NOTE);
  });

  it('opens a reference when handed a way to, as every other gold reference does', () => {
    const onRef = vi.fn();
    render(<span>{renderCommentaryCite('First through John the Baptist (Matthew 11:14); then', onRef)}</span>);
    const ref = document.querySelector('.inline-scrip-ref');
    expect(ref.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(ref);
    expect(onRef).toHaveBeenCalledWith('Matthew 11:14');
  });
});
