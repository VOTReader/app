// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element.
/* THE PLAYER'S "NOW READING" CARD (player brief 3b, pl-l2; picture 05).
   The clause the voice is in, read from the same rows the wash paints and the letter's own blocks in the same text
   domain; the clauses before it in the same sentence dim; nothing before the first timed clause; "Open the reading"
   whether or not a line is known. A WTLB compilation reads the letter under its clock. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { LiveLine, liveLineAt, rollOffset, rowWords } from './LiveLine.jsx';

// The KJV's words for the Bible card's tests; any other edition or verse answers the NKJV base it is handed.
const { KJV } = vi.hoisted(() => ({ KJV: { 'john|1|1': 'In the beginning was the Word,', 'john|1|2': 'The same was in the beginning with God.' } }));
vi.mock('../../data/translations.js', () => ({
  translateVerse: (bookId, ch, v, tr) => (tr === 'kjv' ? KJV[bookId + '|' + ch + '|' + v.n] : null) || v.text,
  loadTranslation: () => Promise.resolve(),
  holdTranslation: () => () => {},
  isTranslationLoaded: () => true,
}));

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1; this.volume = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const SENTENCE = 'Many things you must overcome in the years ahead; many things will I show you, many things will I teach you.';
const LETTER = {
  id: 'chosen',
  title: 'Chosen by God',
  blocks: [
    { type: 'heading', segments: [{ t: 'text', v: 'Chosen by God' }] },
    { type: 'para', segments: [{ t: 'text', v: 'Beloved, hear Me. ' }, { t: 'text', v: SENTENCE }] },
  ],
};
// Clause onsets into block 1's DOM text ("Beloved, hear Me. " is 18 characters).
const B = 'Beloved, hear Me. '.length;
const at = (s) => B + SENTENCE.indexOf(s);
const ROWS = [
  [2.0, 1, 0, 17, 0],
  [4.0, 1, at('Many'), at('many things will I show'), 0],
  [7.0, 1, at('many things will I show'), at('many things will I teach'), 0],
  [9.0, 1, at('many things will I teach'), B + SENTENCE.length, 0],
];
const ENTRY = { id: 'gift', title: 'Embracing The Gift', paragraphs: [{ text: 'Receive the gift {{ref:John 3:16}} with joy.' }] };
const PART1 = 'sectionAsset1';

const tick = (t) => { const el = FakeAudio.last; el.duration = 300; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); };

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'one:chosen': [['idChosen', 'B']] };
  globalThis.AUDIO_SYNC = { 'one:chosen': ROWS };
  globalThis.AUDIO_SECTIONS = { wtlb1: [['Part 1', PART1, 'T']] };
  globalThis.AUDIO_SYNC_SECTIONS = { [PART1]: { 'wtlb1:gift': [[10, 0, -1, -1, 0]] } };
  globalThis.COL_BY_KEY = new Map([['one', { volKey: 'one' }], ['wtlb1', { volKey: 'wtlb1' }]]);
  globalThis.colLetterArr = (col) => (col.volKey === 'one' ? [LETTER] : [ENTRY]);
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  for (const k of ['AUDIO_MANIFEST', 'AUDIO_SYNC', 'AUDIO_SECTIONS', 'AUDIO_SYNC_SECTIONS', 'COL_BY_KEY', 'colLetterArr']) delete globalThis[k];
});

const playLetter = () => AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'chosen', title: 'Chosen by God' }, collectionLabel: 'Volume One' });
const current = () => { const s = AudioPlayer.getState(); return s.queue[s.qi]; };

describe('liveLineAt', () => {
  it('is nothing before the first timed clause (the voice is on the heading)', () => {
    playLetter();
    expect(liveLineAt(current(), 1)).toBe(null);
  });

  it('names the clause being read, and the clauses before it in the same sentence', () => {
    playLetter();
    expect(liveLineAt(current(), 4.5)).toMatchObject({ lead: '', now: 'Many things you must overcome in the years ahead;', key: 'one:chosen' });
    expect(liveLineAt(current(), 9.5)).toMatchObject({
      lead: 'Many things you must overcome in the years ahead; many things will I show you,',
      now: 'many things will I teach you.',
      key: 'one:chosen',
    });
  });

  it('says how far the voice is through the clause: onset to the next row, the last by its length', () => {
    playLetter();
    expect(liveLineAt(current(), 4).at).toBe(0);
    expect(liveLineAt(current(), 5.5).at).toBeCloseTo(0.5);
    // The last row ends about 14 characters a second after its onset (at least 2 s): 29 characters, ~2.07 s.
    expect(liveLineAt(current(), 10).at).toBeCloseTo(1 / (29 / 14));
    expect(liveLineAt(current(), 60).at).toBe(1);
  });

  it('stops the lead at the sentence before', () => {
    playLetter();
    // 4.5 s: the clause before it ("Beloved, hear Me.") ends a sentence, so it is not carried.
    expect(liveLineAt(current(), 4.5).lead).toBe('');
  });

  it('reads the letter under a compilation clock, a whole paragraph with its markup read away', () => {
    AudioPlayer.playSection('wtlb1', 0, 'Words to Live By: Part One');
    expect(liveLineAt(current(), 12)).toMatchObject({ lead: '', now: 'Receive the gift John 3:16 with joy.', key: 'wtlb1:gift' });
  });

  it('is nothing while the corpus has not landed', () => {
    playLetter();
    delete globalThis.colLetterArr;
    expect(liveLineAt(current(), 4.5)).toBe(null);
  });
});

describe('rowWords', () => {
  it('leaves footnote markers out, and the offsets still land', () => {
    const unit = { blocks: [{ type: 'para', segments: [{ t: 'text', v: 'adopted son of Abraham,' }, { t: 'fn', v: '1' }, { t: 'text', v: ' says The Lord.' }] }] };
    expect(rowWords(unit, [0, 0, 0, 'adopted son of Abraham,1 says The Lord.'.length, 0])).toBe('adopted son of Abraham, says The Lord.');
    expect(rowWords(unit, [0, 0, 'adopted son of Abraham,1 '.length, 'adopted son of Abraham,1 says The Lord.'.length, 0])).toBe('says The Lord.');
  });

  it('widens a row a character off its word to whole words', () => {
    expect(rowWords(LETTER, [0, 1, at('Many') + 1, at('many things will I show') - 2, 0])).toBe('Many things you must overcome in the years ahead;');
  });

  /* Corbin 10-25 (Volume Seven, "I Am Calling You Out! (Part 1)"): the card read "heal;And heal;And though I", the
     poem's lines run together and the word at the seam twice. Its rows end exactly where a drawn line does. */
  it('reads a poem line break as a space, and never widens a row across one', () => {
    const lines = ['And though I afflict, I will also heal;', 'And though I strike the people in My wrath,', 'I will also bind up their wounds...'];
    const unit = { blocks: [{ type: 'poetry', lines: lines.map((v) => [{ t: 'italic', v }]) }] };
    const [l0, l1] = [lines[0].length, lines[0].length + lines[1].length];
    expect(rowWords(unit, [0, 0, 0, l0, 0])).toBe(lines[0]);
    expect(rowWords(unit, [0, 0, l0, l1, 0])).toBe(lines[1]);
    expect(rowWords(unit, [0, 0, 0, l1, 0])).toBe(lines[0] + ' ' + lines[1]);
    expect(rowWords(unit, [0, 0, -1, -1, 0])).toBe(lines.join(' '));
    // A poem kept as bare segments, one a line with its leading newline away on the page.
    const bare = { blocks: [{ type: 'poetry', segments: lines.map((v, i) => ({ t: 'text', v: (i ? '\n' : '') + v })) }] };
    expect(rowWords(bare, [0, 0, l0, l1, 0])).toBe(lines[1]);
    // A stanza break inside a run ends its line too.
    const stanza = { blocks: [{ type: 'para', segments: [{ t: 'text', v: 'heal;' }, { t: 'stanza-break', v: '' }, { t: 'text', v: 'And so' }] }] };
    expect(rowWords(stanza, [0, 0, -1, -1, 0])).toBe('heal; And so');
  });
});

/* Corbin 10-24: on a long verse or paragraph the words being read ran off the bottom of the card (a five-line clamp
   kept the start), and lines drew over each other. The words now sit in a five-line window that rolls with the voice. */
describe('rollOffset', () => {
  it('stays put while the words fit', () => {
    expect(rollOffset(160, 160, 32, 1)).toBe(0);
    expect(rollOffset(96, 160, 32, 0.9)).toBe(0);
    expect(rollOffset(320, 160, 0, 0.9)).toBe(0);
  });

  it('keeps the place being read in the window, a whole line at a time, never past the last line', () => {
    expect(rollOffset(320, 160, 32, 0)).toBe(0);
    expect(rollOffset(320, 160, 32, 0.3)).toBe(32);    // 96 - 64
    expect(rollOffset(320, 160, 32, 0.5)).toBe(96);    // 160 - 64
    expect(rollOffset(320, 160, 32, 1)).toBe(160);     // the last five lines
    for (let at = 0; at <= 1; at += 0.05) {
      const y = rollOffset(320, 160, 32, at);
      expect(at * 320).toBeGreaterThanOrEqual(y - 1);
      expect(at * 320).toBeLessThanOrEqual(y + 160 + 1);
      expect(y % 32).toBe(0);
    }
  });
});

describe('LiveLine', () => {
  it('shows NOW READING with the bright clause, and opens the reading on a tap', () => {
    playLetter();
    act(() => { tick(9.5); });
    const open = vi.fn();
    render(<LiveLine track={current()} time={9.5} title="Chosen by God" onOpen={open} />);
    expect(screen.getByText('Now reading')).toBeTruthy();
    expect(document.querySelector('.np-live-now').textContent).toBe('many things will I teach you.');
    expect(document.querySelector('.np-live-lead').textContent).toContain('many things will I show you,');
    fireEvent.click(screen.getByRole('button', { name: 'Open the reading — Chosen by God; playback continues' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('with no line known, is just "Open the reading"', () => {
    playLetter();
    render(<LiveLine track={current()} time={0.5} title="Chosen by God" onOpen={() => {}} />);
    expect(screen.queryByText('Now reading')).toBeNull();
    expect(screen.getByRole('button').textContent).toContain('Open the reading');
  });

  it('with neither a line nor a reading to open, renders nothing', () => {
    playLetter();
    const { container } = render(<LiveLine track={current()} time={0.5} title="" onOpen={null} />);
    expect(container.innerHTML).toBe('');
  });
});

/* pl-l2b: a Bible chapter's card reads the verse under the clock, whole, from the verse onsets of the edition the
   recording is, in that edition's words (the NKJV base where it is not loaded), its number dim before it. */
describe('liveLineAt — a Bible chapter', () => {
  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:john': [['brm2_john_001', '', 'Chapter 1'], ['brm2_john_002', '', 'Chapter 2']] };
    globalThis.BIBLE_AUDIO_BOOKS = [['john', 'John']];
    globalThis.BIBLE_SYNC_BRM_KJV = { john: { 1: [500, 1200, 0] } };   // verse 3 not proven
    globalThis.resolveVerseText = ({ bookId, chapter, verse }) => 'NKJV ' + bookId + ' ' + chapter + ':' + verse;
  });
  afterEach(() => {
    for (const k of ['BIBLE_AUDIO_MANIFEST', 'BIBLE_AUDIO_BOOKS', 'BIBLE_SYNC_BRM_KJV', 'resolveVerseText']) delete globalThis[k];
  });
  const playJohn = (n) => act(() => { AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'john', label: 'KJV', chapterNum: n }); });

  it('is the verse being read, in the edition playing, its number as the lead', () => {
    playJohn(1);
    expect(liveLineAt(current(), 3)).toBeNull();                       // before verse 1 (the chapter heading)
    expect(liveLineAt(current(), 6)).toMatchObject({ lead: '1', now: 'In the beginning was the Word,', key: 'bible-brm-kjv:john' });
    expect(liveLineAt(current(), 8.5).at).toBeCloseTo(0.5);   // verse 1 runs 5 s to 12 s
    expect(liveLineAt(current(), 20).now).toBe('The same was in the beginning with God.');   // verse 3 unproven: 2 holds
  });

  it('is nothing for a chapter with no timings, or before they load', () => {
    playJohn(2);
    expect(liveLineAt(current(), 6)).toBeNull();
    delete globalThis.BIBLE_SYNC_BRM_KJV;
    playJohn(1);
    expect(liveLineAt(current(), 6)).toBeNull();
  });

  it('rolls a long verse up with the voice so the words being read stay on the card', () => {
    // jsdom lays nothing out: the words are ten 32 px lines in a five-line window.
    const LONG = 'word '.repeat(120).trim();
    globalThis.resolveVerseText = () => LONG;
    const heights = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('np-live-roll') ? 320 : 0;
    });
    const rooms = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
      return this.classList.contains('np-live-text') ? 160 : 0;
    });
    const real = window.getComputedStyle;
    const styles = vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => (el.classList && el.classList.contains('np-live-roll') ? { lineHeight: '32px' } : real(el)));
    try {
      playJohn(1);
      act(() => tick(5));
      const { rerender } = render(<LiveLine track={current()} time={5} title="John 1" onOpen={() => {}} />);
      const box = document.querySelector('.np-live-text');
      const roll = document.querySelector('.np-live-roll');
      expect(roll.style.transform).toBe('');
      expect(box.style.maxHeight).toBe('160px');   // outside the player: five lines
      expect(box.getAttribute('data-more')).toBe('below');
      rerender(<LiveLine track={current()} time={10} title="John 1" onOpen={() => {}} />);   // 5 s into a 7 s verse
      expect(roll.style.transform).toBe('translateY(-160px)');
      expect(box.getAttribute('data-more')).toBe('above');
      expect(document.querySelector('.np-live-text').style.webkitLineClamp || '').toBe('');
    } finally {
      heights.mockRestore(); rooms.mockRestore(); styles.mockRestore();
    }
  });

  it('gives up lines, to two, when the player has no room for five', () => {
    const LONG = 'word '.repeat(120).trim();
    globalThis.resolveVerseText = () => LONG;
    // The body is 330 px; the card is 400 px, its words 160 of it: 90 px to spare, two lines.
    const heights = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('np-live-roll') ? 320 : this.classList.contains('np-live') ? 400 : 0;
    });
    const rooms = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
      return this.classList.contains('np-live-text') ? 160 : this.classList.contains('np-body') ? 330 : 0;
    });
    const real = window.getComputedStyle;
    const styles = vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => (el.classList && el.classList.contains('np-live-roll') ? { lineHeight: '32px' } : real(el)));
    try {
      playJohn(1);
      act(() => tick(5));
      render(<div className="np-body"><LiveLine track={current()} time={5} title="John 1" onOpen={() => {}} /></div>);
      expect(document.querySelector('.np-live-text').style.maxHeight).toBe('64px');
    } finally {
      heights.mockRestore(); rooms.mockRestore(); styles.mockRestore();
    }
  });

  /* Corbin 10-27: "minify the title and leave most of the screen for the text. Same size and behavior, just more room
     for it." The card's words take every line the player's body has room for, past five. */
  it('takes every line the player has room for, counting the card by its parts', () => {
    const LONG = 'word '.repeat(120).trim();
    globalThis.resolveVerseText = () => LONG;
    // The body is 600 px; the card is 560 of it (2 px border), its kicker 20 and cue 28: 544 px to spare, 17 lines.
    const heights = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const c = this.classList;
      return c.contains('np-live-roll') ? 960 : c.contains('np-live') ? 560 : c.contains('np-live-kicker') ? 20 : c.contains('np-live-cue') ? 28 : 0;
    });
    const rooms = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
      const c = this.classList;
      return c.contains('np-live-text') ? 160 : c.contains('np-live') ? 558 : c.contains('np-body') ? 600 : 0;
    });
    const real = window.getComputedStyle;
    const styles = vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => (el.classList && el.classList.contains('np-live-roll') ? { lineHeight: '32px' } : real(el)));
    try {
      playJohn(1);
      act(() => tick(5));
      render(<div className="np-body"><LiveLine track={current()} time={5} title="John 1" onOpen={() => {}} /></div>);
      expect(document.querySelector('.np-live-text').style.maxHeight).toBe('544px');
    } finally {
      heights.mockRestore(); rooms.mockRestore(); styles.mockRestore();
    }
  });

  it('shows the verse on the card', () => {
    playJohn(1);
    act(() => tick(13));
    render(<LiveLine track={current()} time={13} title="John 1" onOpen={() => {}} />);
    expect(document.querySelector('.np-live-lead').textContent).toBe('2 ');
    expect(document.querySelector('.np-live-now').textContent).toBe('The same was in the beginning with God.');
  });
});
