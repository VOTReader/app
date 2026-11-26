// @ts-nocheck
/* Fix list 8: Saved's search matched the reader's one-letter code, not the name its row shows ('Volume One ·
   Benjamin'), so 'Benjamin' found nothing and 'b' found every Benjamin recording. */
import { describe, it, expect } from 'vitest';
import { trackSearchText } from './AudioShelf.jsx';

const track = { key: 'vol1:letter-a', title: 'The Wide Path', sub: 'Volume One', readerCode: 'B' };

describe('trackSearchText searches what the row shows', () => {
  it("finds a recording by its reader's name", () => {
    expect(trackSearchText(track)).toContain('benjamin');
  });

  it("does not carry the reader's code as a word of its own", () => {
    expect(trackSearchText(track).split(' ')).not.toContain('b');
  });
});
