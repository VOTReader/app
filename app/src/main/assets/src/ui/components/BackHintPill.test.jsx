/* BackHintPill — the "‹ Back to …" pill above a reading view (search200 UX Track D 2).
   ──────────────────────────────────────────────────────────────────────────
   The pill's lead ("‹ Back to") is Cinzel capitals; the place after it is the
   italic title slot, kept in its own case because it is a real name ("The Last
   Trump"). Round 1's search pill put the word "results" in that slot, so it
   read "BACK TO results": two cases in one label. A destination named by a word
   rather than a title (`plain`) now reads whole in the lead's case, like the
   app's other pills ("PLAY", the find pill's word). The four reading views draw
   the same pill, so they share this one. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { BackHintPill } from './BackHintPill.jsx';

afterEach(() => { cleanup(); });

describe('BackHintPill', () => {
  it('a destination named by a word reads whole in the label case: one span, no title slot', () => {
    const onClick = vi.fn();
    const { container } = render(<BackHintPill backHint={{ title: 'results', volumeLabel: null, plain: true }} onClick={onClick} />);
    const pill = container.querySelector('.back-hint-row .back-hint-pill');
    expect(pill).toBeTruthy();
    expect(pill.getAttribute('aria-label')).toBe('Back to results');
    expect(pill.querySelector('.back-hint-title')).toBeNull();
    const lead = pill.querySelector('.back-hint-lead');
    expect(lead.textContent.replace(/\s+/g, ' ').trim()).toBe('‹Back to results');
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a titled place keeps its title slot (its own case), with the volume when there is one', () => {
    const { container } = render(<BackHintPill backHint={{ title: 'The Last Trump', volumeLabel: 'Volume Two' }} onClick={() => {}} />);
    const pill = container.querySelector('.back-hint-pill');
    expect(pill.getAttribute('aria-label')).toBe('Back to Volume Two · The Last Trump');
    expect(pill.querySelector('.back-hint-lead').textContent).toBe('‹Back to');
    expect(pill.querySelector('.back-hint-title').textContent).toBe('Volume Two · The Last Trump');
  });

  it('no hint, no pill', () => {
    const { container } = render(<BackHintPill backHint={null} onClick={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
// That the four reading views draw this pill and no copy of it: screens/back-hint-label.test.js.
