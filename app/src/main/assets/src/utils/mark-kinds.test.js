import { describe, it, expect } from 'vitest';
import { MARK_KINDS, isMarkKind, countMarkGroups } from './mark-kinds.js';

describe('mark-kinds (v05-04)', () => {
  it('a mark is a highlight, an underline or a squiggle - never a note', () => {
    expect(MARK_KINDS).toEqual(['highlight', 'underline', 'squiggle']);
    for (const k of MARK_KINDS) expect(isMarkKind(k)).toBe(true);
    for (const k of ['note', 'note-only', '', undefined, null]) expect(isMarkKind(k)).toBe(false);
  });

  it('counts groups: a mark across several blocks is one', () => {
    expect(countMarkGroups({
      a: [{ id: '1', kind: 'squiggle', groupId: 'g' }, { id: '2', kind: 'note' }],
      b: [{ id: '3', kind: 'squiggle', groupId: 'g' }, { id: '4', kind: 'underline' }, null],
    })).toBe(2);
    expect(countMarkGroups(null)).toBe(0);
  });
});
