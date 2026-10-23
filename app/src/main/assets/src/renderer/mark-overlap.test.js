/* uncoveredLine — RC.11 (UX sweep 2026-10-22): deleting the green note highlight brought back the yellow it had
   covered, with no word (sel/21 -> sel/26). The delete confirms now say what shows again. */
import { describe, it, expect } from 'vitest';
import { uncoveredLine } from './mark-overlap.js';

const ann = (o) => ({ kind: 'highlight', ...o, groupId: o.groupId || o.id });
const storeOf = (byKey) => ({
  get: (k) => byKey[k] || [],
  getByGroup: (gid) => {
    const out = [];
    Object.keys(byKey).forEach((k) => byKey[k].forEach((a) => { if (a.groupId === gid) out.push({ key: k, ann: a }); }));
    return out;
  },
});

describe('uncoveredLine (RC.11)', () => {
  it('names the older colour a deleted mark paints over', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 19, end: 26, created: 1 }),
      ann({ id: 'g', color: 'green', start: 6, end: 40, created: 2 }),
    ] });
    expect(uncoveredLine(['g'], store)).toBe('The yellow under it shows again.');
  });

  it('says nothing when the deleted mark is the older one (the newer stays on top)', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 19, end: 26, created: 1 }),
      ann({ id: 'g', color: 'green', start: 6, end: 40, created: 2 }),
    ] });
    expect(uncoveredLine(['y'], store)).toBe('');
  });

  it('says nothing for a blank note mark (it paints nothing, so it hides nothing)', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 0, end: 10, created: 1 }),
      ann({ id: 'n', color: 'blank', start: 0, end: 10, created: 2 }),
    ] });
    expect(uncoveredLine(['n'], store)).toBe('');
  });

  it('says nothing for marks that only sit side by side', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 0, end: 5, created: 1 }),
      ann({ id: 'g', color: 'green', start: 5, end: 10, created: 2 }),
    ] });
    expect(uncoveredLine(['g'], store)).toBe('');
  });

  it('says nothing when a newer mark that stays still covers the older one', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 4, end: 8, created: 1 }),
      ann({ id: 'g', color: 'green', start: 0, end: 10, created: 2 }),
      ann({ id: 'b', color: 'blue', start: 2, end: 9, created: 3 }),
    ] });
    expect(uncoveredLine(['g'], store)).toBe('');
    // ...but where the newest leaves part of it open, that part shows again.
    store.get('k')[2].start = 6;
    expect(uncoveredLine(['g'], store)).toBe('The yellow under it shows again.');
  });

  it('names an underline or squiggle by its style; cyan is the palette teal', () => {
    expect(uncoveredLine(['g'], storeOf({ k: [
      ann({ id: 'u', kind: 'underline', color: 'blue', start: 0, end: 4, created: 1 }),
      ann({ id: 'g', color: 'green', start: 0, end: 4, created: 2 }),
    ] }))).toBe('The blue underline under it shows again.');
    expect(uncoveredLine(['g'], storeOf({ k: [
      ann({ id: 'c', color: 'cyan', start: 0, end: 4, created: 1 }),
      ann({ id: 'g', color: 'green', start: 0, end: 4, created: 2 }),
    ] }))).toBe('The teal under it shows again.');
  });

  it('two different marks under it read as one line', () => {
    const store = storeOf({ k: [
      ann({ id: 'y', color: 'yellow', start: 0, end: 3, created: 1 }),
      ann({ id: 'p', color: 'pink', start: 5, end: 8, created: 1 }),
      ann({ id: 'g', color: 'green', start: 0, end: 10, created: 2 }),
    ] });
    expect(uncoveredLine(['g'], store)).toBe('The marks under it show again.');
  });

  it('follows a group across verses, and ignores marks deleted with it', () => {
    const store = storeOf({
      a: [ann({ id: 'g1', groupId: 'g', color: 'green', start: 0, end: 9, created: 2 })],
      b: [
        ann({ id: 'y', color: 'yellow', start: 0, end: 4, created: 1 }),
        ann({ id: 'g2', groupId: 'g', color: 'green', start: 0, end: 6, created: 2 }),
      ],
    });
    expect(uncoveredLine(['g'], store)).toBe('The yellow under it shows again.');
    expect(uncoveredLine(['g', 'y'], store)).toBe('');
  });

  it('a store without the lookups (a test stub, a store not loaded) says nothing', () => {
    expect(uncoveredLine(['g'], { getByGroup: () => [{ key: 'k', ann: ann({ id: 'g', color: 'green', start: 0, end: 4 }) }] })).toBe('');
    expect(uncoveredLine(['g'], null)).toBe('');
  });
});
