/* ExpandableText — the collapsed preview cut (sweep low, mw9).
   The cut sliced UTF-16 code units, so a threshold landing inside an emoji left half of it (a lone
   surrogate, drawn as a replacement glyph) before the ellipsis. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ExpandableText } from './ExpandableText.jsx';

afterEach(cleanup);

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const TAIL = ' and the words that run on past the cut';

describe('ExpandableText — collapsed preview', () => {
  it('a cut inside an emoji drops the whole emoji, never half of it', () => {
    const { container } = render(<ExpandableText text={'a'.repeat(9) + '\u{1F600}' + TAIL} threshold={10} />);
    const shown = container.textContent;
    expect(LONE_SURROGATE.test(shown)).toBe(false);
    expect(shown.startsWith('a'.repeat(9) + '…')).toBe(true);
  });

  it('a cut just after an emoji keeps it', () => {
    const { container } = render(<ExpandableText text={'a'.repeat(9) + '\u{1F600}' + TAIL} threshold={11} />);
    expect(container.textContent.startsWith('a'.repeat(9) + '\u{1F600}…')).toBe(true);
  });

  it('short text renders whole, with no toggle', () => {
    const { container } = render(<ExpandableText text={'short \u{1F600}'} threshold={10} />);
    expect(container.textContent).toBe('short \u{1F600}');
    expect(container.querySelector('button')).toBeNull();
  });
});
