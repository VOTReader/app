// @ts-nocheck
// Fix list #20: a bookmark's place line was cut with an ellipsis, so its date read "2 …".
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BookmarkRow } from './BookmarksScreen.jsx';

afterEach(() => { cleanup(); delete globalThis.relativeDate; delete globalThis._bookmarkSourceLabel; });

describe('BookmarkRow meta keeps the date whole', () => {
  it('cuts the place, never the date', () => {
    globalThis.relativeDate = () => '2 days ago';
    globalThis._bookmarkSourceLabel = () => 'Psalm 23';
    const { container } = render(<BookmarkRow bkm={{ id: 'b', hlKey: 'bible:psalms:23:1', label: 'Still waters', created: 1, updated: 1 }} />);
    const keep = container.querySelector('.ui-row-meta .ui-meta-keep');
    expect(keep && keep.textContent).toMatch(/2 days ago$/);
    expect(container.querySelector('.ui-row-meta .ui-meta-cut')).not.toBeNull();
  });
});
