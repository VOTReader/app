// @ts-nocheck
/* letter-linking — linkWtlbEntries chains a WTLB-shaped collection in array order.
   The Answers Main Page (c72) is appended LAST to ANSWERS so no topic's paragraph
   index moves; it must not become the last topic's Next (aogcg phase 1a). */
import { describe, it, expect } from 'vitest';
import { linkWtlbEntries } from './letter-linking.js';

const E = (id) => ({ id, title: id.toUpperCase() });

describe('linkWtlbEntries', () => {
  it('links neighbours in array order, the ends open', () => {
    const arr = [E('a'), E('b'), E('c')];
    linkWtlbEntries(arr);
    expect(arr.map((e) => [e.prevEntry && e.prevEntry.id, e.nextEntry && e.nextEntry.id]))
      .toEqual([[null, 'b'], ['a', 'c'], ['b', null]]);
    expect(arr[1].nextEntry).toEqual({ id: 'c', title: 'C' });
  });

  it('leaves the Answers Main Page out of the chain: the last topic keeps no Next', () => {
    const arr = [E('there-is-no-other'), E('come-out-and-fight-against-me'), E('answers-main-page')];
    linkWtlbEntries(arr);
    expect(arr[1].nextEntry).toBeNull();
    expect(arr[1].prevEntry).toEqual({ id: 'there-is-no-other', title: 'THERE-IS-NO-OTHER' });
    expect(arr[2].prevEntry).toBeNull();
    expect(arr[2].nextEntry).toBeNull();
  });
});
