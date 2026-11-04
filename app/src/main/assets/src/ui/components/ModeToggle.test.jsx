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

  it('each segment keeps the pill\'s glyph — three SVGs, one per segment, all different (PDF lines, Inline pen, Off circle-slash)', () => {
    mount('pdf', true);
    const glyphs = screen.getAllByRole('button').map((b) => { const svg = b.querySelector('svg'); return svg ? svg.innerHTML : null; });
    expect(glyphs.every(Boolean), 'every segment carries an svg').toBe(true);
    expect(new Set(glyphs).size, 'and no two are the same drawing').toBe(3);
  });
  it('the glyphs are decoration: hidden from assistive tech, so each segment is heard as its label alone — never an unlabelled image first', () => {
    mount('pdf', true);
    for (const b of screen.getAllByRole('button')) {
      const svg = b.querySelector('svg');
      expect(svg && svg.getAttribute('aria-hidden'), `${b.textContent.trim()}: the glyph is aria-hidden`).toBe('true');
      expect(svg && svg.getAttribute('focusable'), `${b.textContent.trim()}: the glyph takes no focus stop (IE/old Edge)`).toBe('false');
      // testing-library resolves the role query by ACCESSIBLE NAME, so landing on this very element proves the name is the label
      expect(screen.getByRole('button', { name: b.textContent.trim() }), 'and the accessible name is the label').toBe(b);
    }
  });
  it('the control is one labelled group, so a screen reader hears "Study Notes" once and then the three views', () => {
    mount('pdf', true);
    const group = screen.getByRole('group', { name: 'Study Notes' });
    expect(group.querySelectorAll('button').length).toBe(3);
  });
});

/* The file also carries renderCommentaryCite, which InlineNotes and StudyPanels read as a bare bundle-d
   global (_entry-d.js attaches it) and StudyPanels.test stubs — so no unit case saw the 1829d12a rewrite
   drop the export; esbuild did ("No matching export … for import renderCommentaryCite"). This pins the
   export where the file is, so removing it is a red case and not only a red build. */
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
