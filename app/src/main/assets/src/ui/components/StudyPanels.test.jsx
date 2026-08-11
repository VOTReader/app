/* StudyPanels / InlineNotes / InlineEcho — the volume caption on a votNote.
   ──────────────────────────────────────────────────────────────────────────
   The New Testament Study Bible PDF lists most notes as
   "10:1  Volume One, Humility and The Word of God, …" but five rows name no
   volume, because the letter they cite is not in a published volume. The
   importer put the title in BOTH fields for those (or null in `vol`), which
   is faithful to the source — and every render path printed `n.vol` raw, so
   the reader was shown the title twice, or an echo pill ending in a bare
   em dash.

   These pin the display: a real volume is captioned, a duplicate is not, and
   a note whose letter cannot be resolved renders as static text — no chevron,
   no button, no dead-end tap. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { StudyPanels } from './StudyPanels.jsx';
import { InlineNotes } from './InlineNotes.jsx';
import { InlineEcho } from './InlineEcho.jsx';
import { votNoteVolLabel } from '../../data/vot-note-label.js';

const g = /** @type {any} */ (globalThis);
const Panels = /** @type {any} */ (StudyPanels);
const Inline = /** @type {any} */ (InlineNotes);
const Echo = /** @type {any} */ (InlineEcho);

// The real rows, verbatim from matthew.js.
const REAL_VOLUME = {
  ref: '10:1', vol: 'Volume One', letter: 'Humility and The Word of God',
  excerpt: 'Thus says The Lord to His servant…',
};
const DUPLICATED = {
  ref: '26:28',
  vol: 'The Promise',
  letter: 'The Promise',
  excerpt: 'Your sins are forgiven you…',
};
const NULL_VOL = {
  ref: '5:1-11', vol: null,
  letter: 'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior',
  excerpt: 'Everything which comes from the mouth of The Lord your God is a blessing for all!',
};

beforeEach(() => {
  // Components read these as free-var globals (window-attached in prod).
  g.votNoteVolLabel = votNoteVolLabel;
  // The app's real classification: index.html's HIDDEN_MANNA_TITLES already
  // names all three volume-less letters, but only "Woe to Dallas" was ever
  // imported — so the other two carry the HM badge and stay untappable.
  g.isHiddenManna = (n) => ['The Promise', 'I Have Purged; Behold, I Shall Wipe Away and Restore',
    'Woe to Dallas'].includes((n && n.letter || '').trim());
  // Only the ordinary note resolves; the volume-less ones do not exist in the
  // corpus, which is exactly the live situation.
  g.resolveVotLetter = (vol, letter) => (letter === 'Humility and The Word of God'
    ? { id: 'humility', screen: 'vot-one-letter', volKey: 'one' } : null);
  g.StaticSubtree = ({ children }) => children;
  g.renderCommentaryCite = (c) => c;
});
afterEach(() => { cleanup(); });

describe.each([
  ['StudyPanels', Panels],
  ['InlineNotes', Inline],
])('%s — volume caption', (name, Comp) => {
  it('captions a note that names a real volume', () => {
    render(<Comp scriptures={[]} votNotes={[REAL_VOLUME]} onVotLetterClick={() => {}} />);
    expect(screen.getByText('Volume One')).toBeTruthy();
  });

  it('does NOT print the title twice when vol duplicates the letter', () => {
    render(<Comp scriptures={[]} votNotes={[DUPLICATED]} onVotLetterClick={() => {}} />);
    // The quoted title stays; the caption above it must be gone.
    const hits = screen.getAllByText((_t, el) => !!el && /^["“”]?The Promise["“”]?$/.test(
      (el.textContent || '').trim()));
    // Only the quoted-title element (and its ancestors are excluded by the
    // exact-match regex) — never a second bare "The Promise" caption.
    const exactCaptions = hits.filter((el) => (el.textContent || '').trim() === 'The Promise');
    expect(exactCaptions).toHaveLength(0);
  });

  it('renders a volume-less note as static text, not a dead-end button', () => {
    const { container } = render(
      <Comp scriptures={[]} votNotes={[DUPLICATED]} onVotLetterClick={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
    // …and the reader still gets the reference, the title and the excerpt.
    expect(container.textContent).toContain('26:28');
    expect(container.textContent).toContain('The Promise');
    expect(container.textContent).toContain('Your sins are forgiven you');
  });

  it('still offers the tap when the letter DOES resolve', () => {
    const { container } = render(
      <Comp scriptures={[]} votNotes={[REAL_VOLUME]} onVotLetterClick={() => {}} />);
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('omits the caption entirely for a null volume', () => {
    const { container } = render(
      <Comp scriptures={[]} votNotes={[NULL_VOL]} onVotLetterClick={() => {}} />);
    const caption = container.querySelector('.vot-note-vol, .inline-vot-vol');
    expect(caption).toBeNull();
  });
});

describe.each([
  ['StudyPanels', Panels],
  ['InlineNotes', Inline],
])('%s — an un-imported Hidden Manna letter', (name, Comp) => {
  it('shows the HM badge but offers no tap, since the letter is not here', () => {
    // index.html's HIDDEN_MANNA_TITLES lists "The Promise" and "I Have
    // Purged…" alongside "Woe to Dallas", but hidden-manna.js only carries the
    // last. The badge marks what the note IS; tappability follows what the
    // corpus actually holds, so there is no dead-end tap.
    const { container } = render(
      <Comp scriptures={[]} votNotes={[DUPLICATED]} onVotLetterClick={() => {}} />);
    expect(container.querySelector('.vot-note-hm, .inline-vot-hm')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.vot-note-chevron, .inline-vot-chevron')).toBeNull();
  });
});

describe('InlineEcho — pill label', () => {
  it('shows "ref — Volume" when there is a volume', () => {
    const { container } = render(<Echo scriptures={[]} votNotes={[REAL_VOLUME]} />);
    expect(container.textContent).toContain('10:1 — Volume One');
  });

  it('leaves no dangling separator when the note names no volume', () => {
    const { container } = render(<Echo scriptures={[]} votNotes={[NULL_VOL]} />);
    const text = container.textContent || '';
    expect(text).toContain('5:1-11');
    expect(text).not.toContain('—');
  });

  it('does not repeat a duplicated title on the pill', () => {
    const { container } = render(<Echo scriptures={[]} votNotes={[DUPLICATED]} />);
    expect(container.textContent).not.toContain('The Promise');
  });
});
