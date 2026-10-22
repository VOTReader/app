// @vitest-environment jsdom
/* Bug #5 (w3 canvas stream): publishRails found the root it wrote data-rails
   and the --sw-rail-* properties to with document.querySelector('.sw-root'),
   so with two screens mounted (a test's second render, a route kept alive
   under another) the first root in the document got the second screen's
   rails. It writes to the root it is handed and to nothing else. */
import { describe, it, expect, afterEach } from 'vitest';
import { publishRails } from './overlay-renderer.js';

const g = {
  total: 300,
  books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen' }, { id: 'exodus', title: 'Exodus', abbr: 'Exo' }],
  chapters: [[0, 1, 0, 150], [1, 1, 150, 150]],
};
const cam = { x: 150, ppv: 800 / 300, total: 300, y: 0 };
const v = { W: 800, H: 360, DPR: 1 };
const ro = { width: 800, base: 260 };

afterEach(() => { document.body.innerHTML = ''; });

describe('publishRails writes to its own screen root (bug #5)', () => {
  it('with two .sw-root elements mounted, only the one it is handed gets data-rails', () => {
    const first = document.createElement('div');
    first.className = 'sw-root';
    const mine = document.createElement('div');
    mine.className = 'sw-root';
    document.body.append(first, mine);
    publishRails(ro, null, g, cam, null, v, mine);
    expect(first.hasAttribute('data-rails')).toBe(false);
    expect(first.style.getPropertyValue('--sw-rail-bottom')).toBe('');
    const rails = JSON.parse(mine.getAttribute('data-rails') || 'null');
    expect(rails && rails.bottom.map((b) => b.label)).toEqual(['Genesis', 'Exodus']);
    expect(mine.style.getPropertyValue('--sw-rail-bottom')).toBe('260px');
  });

  it('without a root it writes nowhere', () => {
    const only = document.createElement('div');
    only.className = 'sw-root';
    document.body.append(only);
    publishRails(ro, null, g, cam, null, v, null);
    expect(only.hasAttribute('data-rails')).toBe(false);
  });
});
