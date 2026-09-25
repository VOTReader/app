/* check-mark-anchors (n4-02): a corpus edit that moves unchanged paragraphs to a
   new index moves readers' marks with them, since marks key on block position. */
import { describe, it, expect } from 'vitest';
import { entriesOf, shiftedEntries, KEYED } from './check-mark-anchors.mjs';

const letters = (blocks) => 'var LETTERS_X = [{ "id": "the-wide-path", "title": "T", "blocks": ' + JSON.stringify(blocks) + ' }];';
const answers = (paras) => 'var ANSWERS = [{"id":"regarding-spiritual-gifts","type":"wtlb","paragraphs":' + JSON.stringify(paras) + '}];';
const p = (t) => ({ type: 'para', segs: [{ t: 'text', v: t }] });

describe('check-mark-anchors', () => {
  it('reads letter blocks and WTLB-shaped paragraphs out of a data file', () => {
    expect(entriesOf(letters([p('a'), p('b')])).get('the-wide-path')).toHaveLength(2);
    expect(entriesOf(answers(['one', 'two', 'three'])).get('regarding-spiritual-gifts')).toHaveLength(3);
  });

  it('an inserted paragraph above unchanged ones is a shift (the c62 case)', () => {
    const s = shiftedEntries(entriesOf(answers(['one', 'two', 'three'])), entriesOf(answers(['new', 'one', 'two', 'three'])));
    expect(s).toEqual([{ id: 'regarding-spiritual-gifts', moved: 3, from: 0, to: 1 }]);
  });

  it('a removed paragraph above unchanged ones is a shift', () => {
    const s = shiftedEntries(entriesOf(letters([p('a'), p('b'), p('c')])), entriesOf(letters([p('b'), p('c')])));
    expect(s.map((x) => x.moved)).toEqual([2]);
  });

  it('an edit in place, or paragraphs added at the end, moves nothing', () => {
    const before = entriesOf(answers(['one', 'two', 'three']));
    expect(shiftedEntries(before, entriesOf(answers(['one', 'TWO fixed', 'three'])))).toEqual([]);
    expect(shiftedEntries(before, entriesOf(answers(['one', 'two', 'three', 'four'])))).toEqual([]);
    expect(shiftedEntries(before, entriesOf(answers(['one', 'two'])))).toEqual([]);
  });

  it('repeated paragraphs ("Amen") are not read as moved', () => {
    const s = shiftedEntries(entriesOf(answers(['Amen', 'x', 'Amen'])), entriesOf(answers(['y', 'Amen', 'x', 'Amen'])));
    expect(s).toEqual([{ id: 'regarding-spiritual-gifts', moved: 1, from: 1, to: 2 }]);
  });

  it('covers the keyed collections and leaves the Bible translations out', () => {
    for (const f of ['volume-one', 'lords-rebuke', 'letters-flock', 'wtlb-two', 'the-blessed', 'holy-days', 'answers', 'bible-studies']) {
      expect(KEYED.test('app/src/main/assets/src/data/' + f + '.js'), f).toBe(true);
    }
    for (const f of ['bible-kjv', 'matthew', 'audio-sync', 'books']) {
      expect(KEYED.test('app/src/main/assets/src/data/' + f + '.js'), f).toBe(false);
    }
  });
});
