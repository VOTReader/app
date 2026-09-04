/* Journal media blocks — what the reader is told when the bytes are gone.
   ─────────────────────────────────────────────────────────────────
   journal-3 clause (c): a journal block whose `mediaId` resolves to no
   record renders as MISSING. It must never render as a healthy player.

   Before this, `JournalAudioBlock` painted the whole player — play button,
   waveform with role="slider", "Voice memo", a duration read off the
   entry's own record — and simply omitted the <audio> element when
   `objectUrl` resolved null. The user saw a memo that looked fine and did
   nothing when tapped. Not a data loss: a lie about one. `JournalImageBlock`
   told the same lie.

   These cases assert the ACCESSIBLE NAME and the TEXT, never a CSS class.
   The visual treatment of the missing state belongs to Design & Performance;
   pinning the promise rather than the paint is what lets them restyle it
   without breaking this file.

   Screens read bare globals — stubbed below, the same shape
   JournalViewerScreen.menu.test.jsx uses. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { JournalAudioBlock, JournalImageBlock } from './JournalViewerScreen.jsx';

/** objectUrl resolves `url` (null = the record is gone). */
function setupGlobals(url) {
  window.JournalMediaStore = { objectUrl: vi.fn(() => Promise.resolve(url)) };
  window.JournalHelpers = {
    formatDuration: (s) => {
      const t = Math.max(0, Math.round(s || 0));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    },
  };
  window.ConfirmStrip = () => null;
}

/** Render and let the objectUrl promise settle. */
async function renderSettled(el) {
  let out;
  await act(async () => { out = render(el); });
  return out;
}

afterEach(() => {
  cleanup();
  delete window.JournalMediaStore;
  delete window.JournalHelpers;
  delete window.ConfirmStrip;
});

describe('JournalAudioBlock — the bytes are gone', () => {
  it('R6: says the recording is missing, and offers no control that would do nothing', async () => {
    setupGlobals(null);
    const { container } = await renderSettled(
      <JournalAudioBlock mediaId="m_gone" duration={72} caption="Morning walk" />
    );

    // The missing state reaches the accessibility tree as TEXT. A visual-only
    // difference tells a screen-reader user a memo exists and gives them no
    // way to learn it does not.
    expect(screen.getByText(/recording missing/i)).toBeTruthy();

    // No play button — a control that does nothing is the defect. A disabled
    // one whose accessible name says why would also pass; a live one must not.
    const play = screen.queryByRole('button', { name: /play|pause/i });
    expect(play === null || play.disabled).toBe(true);

    // No duration. `duration` is a claim about bytes that are gone: 72s here,
    // which today renders as "0:00 / 1:12".
    expect(container.textContent).not.toMatch(/1:12/);

    // No slider over nothing.
    expect(screen.queryByRole('slider')).toBeNull();

    // The caption is the user's own words about the memo. It stays.
    expect(screen.getByText('Morning walk')).toBeTruthy();
  });

  it('still renders the player when the bytes are there', async () => {
    setupGlobals('blob:ok');
    await renderSettled(<JournalAudioBlock mediaId="m_ok" duration={72} caption="Morning walk" />);

    expect(screen.queryByText(/recording missing/i)).toBeNull();
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  /* The third state, and the reason `src === null` cannot mean "missing" on
     its own: before the promise settles there is no url either. A block that
     renders MISSING on the first frame accuses the store of losing data every
     time the reader opens an entry. */
  it('says nothing while the lookup is still in flight', () => {
    setupGlobals(null);
    render(<JournalAudioBlock mediaId="m_slow" duration={72} caption="Morning walk" />);
    expect(screen.queryByText(/recording missing/i)).toBeNull();
  });
});

describe('JournalImageBlock — the bytes are gone', () => {
  it('R6b: says the image is missing rather than rendering an empty frame', async () => {
    setupGlobals(null);
    await renderSettled(<JournalImageBlock mediaId="i_gone" caption="The old gate" />);

    expect(screen.getByText(/image missing/i)).toBeTruthy();
    expect(screen.getByText('The old gate')).toBeTruthy();
  });
});
