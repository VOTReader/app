import { describe, it, expect } from 'vitest';
import { MARK_KINDS, isMarkKind } from './mark-kinds.js';

describe('mark-kinds (v05-04)', () => {
  it('a mark is a highlight, an underline or a squiggle - never a note', () => {
    expect(MARK_KINDS).toEqual(['highlight', 'underline', 'squiggle']);
    for (const k of MARK_KINDS) expect(isMarkKind(k)).toBe(true);
    for (const k of ['note', 'note-only', '', undefined, null]) expect(isMarkKind(k)).toBe(false);
  });
});
