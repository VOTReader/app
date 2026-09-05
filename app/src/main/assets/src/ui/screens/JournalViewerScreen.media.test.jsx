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
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { JournalAudioBlock, JournalImageBlock } from './JournalViewerScreen.jsx';
import { JournalHubScreen } from './JournalHubScreen.jsx';

/**
 * objectUrl resolves `url` (null = no url could be minted).
 *
 * `record` is what get() answers. The two are deliberately separate: the store
 * returns null from objectUrl for THREE different facts — no such record, a
 * record with no blob, and `URL.createObjectURL` throwing on a perfectly good
 * blob (journal-media-store.js catches that and returns null). Only the first
 * two are missing. The third is intact user data.
 */
function setupGlobals(url, record) {
  window.JournalMediaStore = {
    objectUrl: vi.fn(() => Promise.resolve(url)),
    get: vi.fn(() => Promise.resolve(record === undefined ? null : record)),
  };
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
    expect(play === null || /** @type {HTMLButtonElement} */ (play).disabled).toBe(true);

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

/* The hazard the Architect caught in the first cut of this fix, and it is
   sharper than it looks because of what sits next to the missing state.

   `objectUrl` returns null for three different facts, and deriving `missing`
   from the url alone collapses them. The third — `URL.createObjectURL` threw
   on an intact blob, which the store catches and turns into null — would then
   paint "Recording missing" over bytes that are entirely fine. Beside it is
   the block's delete control, which we deliberately kept, and which now reads
   as a prompt to finish the job: the user removes the block, the record goes
   unreferenced and unmarked, and the boot sweep prunes it. Real audio
   destroyed by a transient URL-minting failure — this design's own loss class,
   reached through the affordance we chose to keep.

   So `missing` is derived from the RECORD, not from the url.

   ponytail: a mintable-but-unmintable blob now renders as loading, i.e. a
   silently blank block, and there is no third visual state for it. Wrong in
   this direction costs a blank block; wrong in the other costs user data. The
   console.warn is what makes it diagnosable. Add the third state if it is ever
   seen in the wild. */
describe('JournalAudioBlock — null is not always missing', () => {
  it('does NOT say missing when the record is intact and only the URL failed', async () => {
    setupGlobals(null, { id: 'm_ok', type: 'audio', blob: new Blob(['x']) });
    await renderSettled(<JournalAudioBlock mediaId="m_ok" duration={72} caption="Morning walk" />);

    expect(screen.queryByText(/recording missing/i)).toBeNull();
  });

  it('an IndexedDB failure is not evidence about the user data either', async () => {
    window.JournalMediaStore = {
      objectUrl: vi.fn(() => Promise.reject(new Error('database open blocked'))),
      get: vi.fn(() => Promise.reject(new Error('database open blocked'))),
    };
    window.JournalHelpers = { formatDuration: () => '0:00' };
    window.ConfirmStrip = () => null;
    await renderSettled(<JournalAudioBlock mediaId="m_idb" duration={72} caption="Morning walk" />);

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

/* R5 — journal-3 (b), the other half of "never deleted, and always visible".
   Skipping prune is only half the invariant: a record nothing references and
   nothing shows is preserved and invisible, which is indistinguishable from
   lost as far as the user is concerned. The Hub is where the whole set can be
   seen at once, which is also why recovery lives here and not on the block. */
describe('JournalHubScreen — unclaimed recordings are offered back', () => {
  function setupHub({ unclaimed = [], entries = [] } = {}) {
    const added = [];
    window.ScreenLayout = ({ children, navChildren }) => (<div><div>{navChildren}</div>{children}</div>);
    window.LibraryNav = (opts) => <>{(opts && opts.rightExtras) || null}</>;
    window.JournalStore = {
      subscribe: () => () => {},
      getVersion: () => 1,
      all: () => entries.slice(),
      collectAllMediaIds: () => [],
      add: vi.fn((seed) => { added.push(seed); return { id: 'e-new', ...seed }; }),
      togglePin: vi.fn(),
      remove: vi.fn(),
    };
    window.JournalHelpers = {
      entryDisplayTitle: (e) => e.title || 'Untitled',
      previewText: () => '',
      attachmentSummary: () => [],
      shortDate: () => 'Sep 4',
      shortTime: () => '5:00 PM',
      longDate: () => 'September 4, 2026',
      formatDuration: (n) => '0:' + String(Math.round(n || 0)).padStart(2, '0'),
    };
    window.JournalMediaStore = {
      unclaimed: vi.fn(() => Promise.resolve(unclaimed)),
      markLinked: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
    };
    window.ConfirmStrip = ({ question, onConfirm }) => (
      <div><span>{question}</span><button onClick={onConfirm}>Yes, delete</button></div>
    );
    return { added };
  }

  afterEach(() => {
    delete window.ScreenLayout;
    delete window.LibraryNav;
    delete window.JournalStore;
    delete window.JournalHelpers;
    delete window.JournalMediaStore;
    delete window.ConfirmStrip;
  });

  it('R5: shows a banner for an unclaimed recording, and Recover builds an entry carrying it', async () => {
    const { added } = setupHub({
      unclaimed: [{ id: 'm_lost', type: 'audio', duration: 8, created: 1757000000000, unlinked: true }],
    });
    await act(async () => { render(<JournalHubScreen />); });

    expect(screen.getByText(/saved but never attached/i)).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /recover/i })); });

    expect(added.length).toBe(1);
    const blocks = added[0].blocks;
    expect(blocks.some((b) => b.type === 'audio' && b.mediaId === 'm_lost')).toBe(true);
    expect(window.JournalMediaStore.markLinked).toHaveBeenCalledWith('m_lost');
  });

  it('renders nothing when there is nothing unclaimed', async () => {
    setupHub({ unclaimed: [] });
    await act(async () => { render(<JournalHubScreen />); });
    expect(screen.queryByText(/saved but never attached/i)).toBeNull();
  });

  it('Discard is confirm-gated and deletes the record', async () => {
    setupHub({ unclaimed: [{ id: 'm_lost', type: 'audio', duration: 8, created: 1757000000000, unlinked: true }] });
    await act(async () => { render(<JournalHubScreen />); });

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(window.JournalMediaStore.delete).not.toHaveBeenCalled();   // gated, not immediate

    await act(async () => { fireEvent.click(screen.getByText('Yes, delete')); });
    expect(window.JournalMediaStore.delete).toHaveBeenCalledWith('m_lost');
  });
});
