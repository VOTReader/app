/* journal-link-picker — the journal's LinkPicker hand-off (W2c).
   targetToJournalBlock turns a picked target into a journal block via the
   JournalHelpers global; openJournalLinkPicker opens the bridge and hands
   the block to onInsertBlock. COLLECTIONS is a typeof-guarded global. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openJournalLinkPicker, targetToJournalBlock } from './journal-link-picker.js';

const BLOCK = { kind: 'made-block' };

let newBlockMock;

beforeEach(() => {
  newBlockMock = vi.fn(() => BLOCK);
  vi.stubGlobal('JournalHelpers', { newBlock: newBlockMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function newBlockArgs(i = 0) {
  return newBlockMock.mock.calls[i];
}

describe('targetToJournalBlock', () => {
  it('returns null for a null target', () => {
    expect(targetToJournalBlock(null, null, false)).toBeNull();
    expect(targetToJournalBlock(undefined, null, false)).toBeNull();
    expect(newBlockMock).not.toHaveBeenCalled();
  });

  it('returns null for an unknown type', () => {
    expect(targetToJournalBlock({ type: 'song' }, null, false)).toBeNull();
  });

  it('bible excerpt with a label uses the label as the ref', () => {
    const out = targetToJournalBlock(
      { type: 'bible', text: 'In the beginning', label: 'Gen 1:1', partial: true, bookId: 'gen', chapter: 1, verse: 1 },
      null, true,
    );
    expect(out).toBe(BLOCK);
    expect(newBlockArgs()).toEqual(['verse-block', {
      ref: 'Gen 1:1', text: 'In the beginning', partial: true,
      bookId: 'gen', chapter: 1, verse: 1, verseEnd: null, isStudy: false,
    }]);
  });

  it('bible excerpt without a label builds the ref from book, chapter and verse range', () => {
    targetToJournalBlock(
      { type: 'bible', text: 't', bookId: 'gen', chapter: 1, verse: 3, verseEnd: 5 },
      null, true,
    );
    expect(newBlockArgs()[1].ref).toBe('gen 1:3-5');
    expect(newBlockArgs()[1].isStudy).toBe(false);
  });

  it('bible excerpt without a verse builds a chapter-only ref', () => {
    targetToJournalBlock({ type: 'bible', text: 't', bookId: 'gen', chapter: 1 }, null, true);
    expect(newBlockArgs()[1].ref).toBe('gen 1');
    expect(newBlockArgs()[1].verse).toBeNull();
  });

  it('bible excerpt with a verse but no verseEnd has no dash', () => {
    targetToJournalBlock({ type: 'bible', text: 't', bookId: 'gen', chapter: 1, verse: 3 }, null, true);
    expect(newBlockArgs()[1].ref).toBe('gen 1:3');
  });

  it('study excerpt marks isStudy', () => {
    targetToJournalBlock({ type: 'study', text: 't', label: 'L', bookId: 'gen', chapter: 1 }, null, true);
    expect(newBlockArgs()[1].isStudy).toBe(true);
  });

  it('bible without excerpt text falls through to a chapter card', () => {
    const out = targetToJournalBlock(
      { type: 'bible', bookId: 'gen', chapter: 1, verse: 1 }, null, true,
    );
    expect(out).toBe(BLOCK);
    expect(newBlockArgs()).toEqual(['chapter-card', { bookId: 'gen', chapter: 1, isStudy: false }]);
  });

  it('bible with bookId and chapter but asExcerpt false is a chapter card', () => {
    targetToJournalBlock({ type: 'bible', text: 't', bookId: 'gen', chapter: 2 }, null, false);
    expect(newBlockArgs()).toEqual(['chapter-card', { bookId: 'gen', chapter: 2, isStudy: false }]);
  });

  it('study chapter card marks isStudy', () => {
    targetToJournalBlock({ type: 'study', bookId: 'gen', chapter: 2 }, null, false);
    expect(newBlockArgs()[1].isStudy).toBe(true);
  });

  it('bible with neither text nor bookId/chapter returns null', () => {
    expect(targetToJournalBlock({ type: 'bible' }, null, false)).toBeNull();
    expect(targetToJournalBlock({ type: 'bible', text: 't' }, null, false)).toBeNull();
  });

  it('letter with volKey and letterId is a letter card', () => {
    const out = targetToJournalBlock(
      { type: 'letter', volKey: 'v1', letterId: 'L12' }, null, false,
    );
    expect(out).toBe(BLOCK);
    expect(newBlockArgs()).toEqual(['letter-card', { volKey: 'v1', letterId: 'L12' }]);
  });

  it('letterId falls back to entryId then studyChapterId', () => {
    targetToJournalBlock({ type: 'letter', volKey: 'v1', entryId: 'E7' }, null, false);
    expect(newBlockArgs()[1].letterId).toBe('E7');
    targetToJournalBlock({ type: 'letter', volKey: 'v1', studyChapterId: 'S3' }, null, false);
    expect(newBlockArgs(1)[1].letterId).toBe('S3');
  });

  it('letter volKey resolves from the target collection label via COLLECTIONS', () => {
    vi.stubGlobal('COLLECTIONS', [
      { label: 'Answers', volKey: 'ans' },
      { label: 'Letters', volKey: 'let' },
    ]);
    targetToJournalBlock({ type: 'letter', letterId: 'L1', collection: 'Letters' }, null, false);
    expect(newBlockArgs()[1].volKey).toBe('let');
  });

  it('letter volKey resolves from the item collection label when the target has none', () => {
    vi.stubGlobal('COLLECTIONS', [{ label: 'Answers', volKey: 'ans' }]);
    targetToJournalBlock(
      { type: 'wtlb', letterId: 'L1' }, { collection: 'Answers' }, false,
    );
    expect(newBlockArgs()[1].volKey).toBe('ans');
  });

  it('letter without volKey or letterId returns null', () => {
    expect(targetToJournalBlock({ type: 'letter', letterId: 'L1' }, null, false)).toBeNull();
    expect(targetToJournalBlock({ type: 'letter', volKey: 'v1' }, null, false)).toBeNull();
    expect(newBlockMock).not.toHaveBeenCalled();
  });

  it('blessed and holy-days take the letter-card path', () => {
    targetToJournalBlock({ type: 'blessed', volKey: 'v1', letterId: 'L1' }, null, false);
    expect(newBlockArgs()[0]).toBe('letter-card');
    targetToJournalBlock({ type: 'holy-days', volKey: 'v1', letterId: 'L1' }, null, false);
    expect(newBlockArgs()[0]).toBe('letter-card');
  });

  it('study-letter adds studyId and studyChapterId', () => {
    targetToJournalBlock(
      { type: 'study-letter', volKey: 'v1', letterId: 'L1', studyId: 'st1', studyChapterId: 'SC9' },
      null, false,
    );
    expect(newBlockArgs()[1]).toEqual({
      volKey: 'v1', letterId: 'L1', studyId: 'st1', studyChapterId: 'SC9',
    });
  });

  it('study-letter studyChapterId falls back to the letterId', () => {
    targetToJournalBlock(
      { type: 'study-letter', volKey: 'v1', letterId: 'L1', studyId: 'st1' },
      null, false,
    );
    expect(newBlockArgs()[1].studyChapterId).toBe('L1');
  });

  it('letter excerpt adds excerpt, blockKey, start and end', () => {
    targetToJournalBlock(
      { type: 'letter', volKey: 'v1', letterId: 'L1', text: 'excerpt text', blockKey: 'bk', start: 4, end: 9 },
      null, true,
    );
    expect(newBlockArgs()[1]).toEqual({
      volKey: 'v1', letterId: 'L1', excerpt: 'excerpt text', blockKey: 'bk', start: 4, end: 9,
    });
  });

  it('letter excerpt without text adds no excerpt fields', () => {
    targetToJournalBlock({ type: 'letter', volKey: 'v1', letterId: 'L1' }, null, true);
    expect(newBlockArgs()[1]).toEqual({ volKey: 'v1', letterId: 'L1' });
  });

  it('letter excerpt start/end default to null when absent', () => {
    targetToJournalBlock(
      { type: 'letter', volKey: 'v1', letterId: 'L1', text: 'x' }, null, true,
    );
    expect(newBlockArgs()[1].start).toBeNull();
    expect(newBlockArgs()[1].end).toBeNull();
    expect(newBlockArgs()[1].blockKey).toBeNull();
  });
});

describe('openJournalLinkPicker', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.__openLinkPickerForTarget;
  });

  it('warns and returns when the bridge is unavailable', () => {
    delete window.__openLinkPickerForTarget;
    openJournalLinkPicker('card', vi.fn());
    expect(warnSpy).toHaveBeenCalledWith('LinkPicker bridge unavailable');
  });

  it('opens the bridge with the kind and hands the made block to onInsertBlock', () => {
    const bridge = vi.fn();
    window.__openLinkPickerForTarget = bridge;
    const onInsertBlock = vi.fn();
    openJournalLinkPicker('card', onInsertBlock);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge.mock.calls[0][0]).toBe('card');
    const cb = bridge.mock.calls[0][1];
    cb({ type: 'bible', text: 't', label: 'L', bookId: 'gen', chapter: 1 }, null);
    expect(onInsertBlock).toHaveBeenCalledWith(BLOCK);
  });

  it('passes asExcerpt true for the excerpt kind', () => {
    const bridge = vi.fn();
    window.__openLinkPickerForTarget = bridge;
    openJournalLinkPicker('excerpt', vi.fn());
    const cb = bridge.mock.calls[0][1];
    cb({ type: 'bible', text: 't', bookId: 'gen', chapter: 1, verse: 1 }, null);
    expect(newBlockArgs()[0]).toBe('verse-block');
  });

  it('does not call onInsertBlock when the target makes no block', () => {
    const bridge = vi.fn();
    window.__openLinkPickerForTarget = bridge;
    const onInsertBlock = vi.fn();
    openJournalLinkPicker('card', onInsertBlock);
    bridge.mock.calls[0][1](null, null);
    expect(onInsertBlock).not.toHaveBeenCalled();
  });

  it('does not throw when onInsertBlock is absent', () => {
    const bridge = vi.fn();
    window.__openLinkPickerForTarget = bridge;
    openJournalLinkPicker('card', null);
    expect(() => bridge.mock.calls[0][1](
      { type: 'bible', text: 't', label: 'L', bookId: 'gen', chapter: 1 }, null,
    )).not.toThrow();
  });

  it('warns and swallows a failure inside the callback', () => {
    const bridge = vi.fn();
    window.__openLinkPickerForTarget = bridge;
    newBlockMock.mockImplementation(() => { throw new Error('boom'); });
    openJournalLinkPicker('card', vi.fn());
    expect(() => bridge.mock.calls[0][1](
      { type: 'bible', text: 't', label: 'L', bookId: 'gen', chapter: 1 }, null,
    )).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Insert card failed', expect.any(Error));
  });
});
