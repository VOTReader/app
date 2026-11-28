// @ts-nocheck
/* songs-sort slice 1 (Corbin 2026-11-27, "if I want all the letters that are spoken ... download that playlist"):
   the two sets the Songs hub offers, read from the catalog's own fields (vs, dl, src) so a corrected catalog fills
   them with no app build. No count is fixed here beyond the fixture's own rows. */
import { beforeEach, describe, expect, it } from 'vitest';
import { SongCatalog, adoptSongCatalog, songsInSet, SONG_SETS, _resetSongCatalogForTests } from './song-catalog.js';
import { SONG_FIXTURE } from './song-catalog.fixture.js';

const song = (o) => ({
  t: 'Untitled', f: '', v: '', st: [], dl: 'sung', lang: 'en', src: { k: 'none', id: '', c: 'l' },
  d: 180, b: 3000000, sh: 1, cr: null, lyr: 0, rd: null, fs: '2025-09-21', hid: false, dup: null, ...o,
});
const fam = (o) => ({ n: 1, col: 'inspired', src: { k: 'none', id: '', c: 'l' }, lb: 'unknown', ...o });

/** One family per edge: each row says why it is in or out of 'words'. */
const EDGES = {
  schema: 1, version: 'sets.1', generated: '', readings: [], styles: {},
  songs: [
    song({ id: 'a00000000001', f: 'w', vs: true, src: { k: 'letter', id: 'one:a', c: 'h' } }),              // in: sung, vs, high link
    song({ id: 'a00000000002', f: 'w', vs: true, src: { k: 'letter', id: 'one:a', c: 'h' }, sh: 2 }),     // in, and the family's vfeat
    song({ id: 'a00000000003', f: 'w', vs: false, src: { k: 'letter', id: 'one:a', c: 'h' } }),            // out: not the Letter's words
    song({ id: 'b00000000001', f: 'b', vs: true, src: { k: 'bible', id: 'john:1', c: 'h' } }),             // out: the Bible's words
    song({ id: 'c00000000001', f: 'l', vs: true, src: { k: 'letter', id: 'one:b', c: 'l' } }),             // out: a low link is never shown
    song({ id: 'd00000000001', f: 's', vs: true, dl: 'spoken', src: { k: 'letter', id: 'one:c', c: 'm' } }), // out of words (spoken), in spoken
    song({ id: 'e00000000001', f: 'h', vs: true, hid: true, src: { k: 'letter', id: 'one:d', c: 'h' } }),  // out: hidden
    song({ id: 'f00000000001', f: 'u', dl: 'spoken' }),                                                    // in spoken: no link needed
  ],
  families: [
    fam({ id: 'w', t: 'W', feat: 'a00000000001', n: 3, col: 'one', vfeat: 'a00000000002' }),
    fam({ id: 'b', t: 'B', feat: 'b00000000001', col: 'bible' }),
    fam({ id: 'l', t: 'L', feat: 'c00000000001', col: 'one' }),
    fam({ id: 's', t: 'S', feat: 'd00000000001', col: 'one' }),
    fam({ id: 'h', t: 'H', feat: 'e00000000001', col: 'one' }),
    fam({ id: 'u', t: 'U', feat: 'f00000000001' }),
  ],
};

const ids = (list) => list.map((s) => s.id);

beforeEach(() => { _resetSongCatalogForTests(); });

describe('songsInSet', () => {
  it('names the two sets the hub offers', () => {
    expect(SONG_SETS).toEqual(['words', 'spoken']);
    expect(SongCatalog.songsInSet).toBe(songsInSet);
  });

  it('words: only visible songs that sing a shown Letter\'s own words, the family\'s vfeat first', () => {
    adoptSongCatalog(EDGES);
    expect(ids(songsInSet('words'))).toEqual(['a00000000002', 'a00000000001']);
  });

  it('spoken: every visible spoken song, linked to a Letter or not', () => {
    adoptSongCatalog(EDGES);
    expect(ids(songsInSet('spoken'))).toEqual(['d00000000001', 'f00000000001']);
  });

  it('on the app\'s fixture: a1 and a2 (vfeat a1 first), then c2; the spoken one is b1', () => {
    adoptSongCatalog(SONG_FIXTURE);
    expect(ids(songsInSet('words'))).toEqual(['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'ccccccccccc2']);
    expect(ids(songsInSet('spoken'))).toEqual(['bbbbbbbbbbb1']);
  });

  it('an unknown set, or no catalog yet, is empty', () => {
    expect(songsInSet('words')).toEqual([]);
    adoptSongCatalog(EDGES);
    expect(songsInSet('inspired')).toEqual([]);
    expect(songsInSet(undefined)).toEqual([]);
  });
});
