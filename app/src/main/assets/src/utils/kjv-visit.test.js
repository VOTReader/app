/* search200 idea A (2026-10-22): a verse its KJV wording found opens in the KJV for the visit, whatever the reader's
   edition, unless the reader reads the KJV already. */
import { describe, it, expect } from 'vitest';
import { kjvVisitEdition } from './kjv-visit.js';

describe('kjvVisitEdition', () => {
  it('is the KJV for any edition but the KJV itself', () => {
    expect(kjvVisitEdition('nkjv')).toBe('kjv');
    expect(kjvVisitEdition(undefined)).toBe('kjv');
    expect(kjvVisitEdition('rnkjv')).toBe('kjv');
    expect(kjvVisitEdition('web')).toBe('kjv');
    expect(kjvVisitEdition('kjv')).toBeNull();
  });
});
