import { describe, it, expect } from 'vitest';
import { MARK_KINDS, isMarkKind, isCountedMark, countMarks } from './mark-kinds.js';

describe('mark-kinds (v05-04)', () => {
  it('a mark is a highlight, an underline or a squiggle - never a note', () => {
    expect(MARK_KINDS).toEqual(['highlight', 'underline', 'squiggle']);
    for (const k of MARK_KINDS) expect(isMarkKind(k)).toBe(true);
    for (const k of ['note', 'note-only', '', undefined, null]) expect(isMarkKind(k)).toBe(false);
  });
});

describe('countMarks (n363 / n236)', () => {
  it('counts each mark group once, across keys', () => {
    const data = {
      'a:1': [{ id: 'x1', groupId: 'g1', kind: 'highlight', color: 'yellow' }, { id: 'x2', kind: 'underline' }],
      'a:2': [{ id: 'x3', groupId: 'g1', kind: 'highlight', color: 'yellow' }, { id: 'x4', kind: 'squiggle', color: 'blue' }],
    };
    expect(countMarks(data)).toBe(3);
  });
  it('a blank-colour note is not a mark', () => {
    const blank = { id: 'b1', kind: 'highlight', color: 'blank' };
    expect(isCountedMark(blank)).toBe(false);
    expect(countMarks({ 'a:1': [blank, { id: 'n1', kind: 'note' }] })).toBe(0);
  });
  it('tolerates empty and missing data', () => {
    expect(countMarks(null)).toBe(0);
    expect(countMarks({ 'a:1': null })).toBe(0);
  });
});
