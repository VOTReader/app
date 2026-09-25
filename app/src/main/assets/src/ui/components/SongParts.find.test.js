// @ts-nocheck - builds a catalog from the shared fixture
/* n3-07 (sweep 2, 09-25): 25 song titles in the live catalog carry a curly
   apostrophe ("God’s Glory", "Cup Don’t Pass"), and Find matched only by
   lowercasing, so typing the keyboard's straight ' found none of them. Find now
   folds apostrophes and accents on both sides. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { SONG_FIXTURE } from '../../utils/song-catalog.fixture.js';
import { findSongFamilies } from './SongParts.jsx';

beforeEach(() => {
  _resetSongCatalogForTests();
  const families = SONG_FIXTURE.families.map((f) => (f.id === 'fam-b' ? { ...f, t: 'God’s Glory Rosé' } : f));
  adoptSongCatalog({ ...SONG_FIXTURE, families });
});
afterEach(() => { _resetSongCatalogForTests(); });

describe('findSongFamilies folds apostrophes and accents (n3-07)', () => {
  it("a straight ' finds a title with a curly one", () => {
    expect(findSongFamilies("God's").map((f) => f.id)).toEqual(['fam-b']);
  });
  it('a curly one and a plain letter find it too', () => {
    expect(findSongFamilies('God’s rose').map((f) => f.id)).toEqual(['fam-b']);
  });
});
