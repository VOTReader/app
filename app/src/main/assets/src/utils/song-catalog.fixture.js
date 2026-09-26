// @ts-nocheck
/* Test fixture for the Songs of the Letters catalog (schema 1,
   D:/Swarm/calls/ai-music/catalog-schema.md). Imported by tests only — no
   bundle entry reaches it.

   fam-a  wtlb1     a1 featured (country, high link) · a2 (pop, high) · a3 HIDDEN duplicate of a2
   fam-b  inspired  b1 (worship, spoken, no link)
   fam-c  one       c1 (worship + pop, LOW link) · c2 featured (rock, medium link)
   fam-d  originals d1 with no shard (not playable)

   The verbatim gate (vb / vs, catalog-schema.md): a1, a2 and c2 sing their
   letter's own words (vs true); the rest are not judged. VERBATIM_FIXTURE
   below holds the golden rows copied from the live catalog. */

const song = (o) => ({
  t: 'Untitled', f: '', v: '', st: [], dl: 'sung', lang: 'en', src: { k: 'none', id: '', c: 'l' },
  d: 180, b: 3000000, sh: 1, cr: null, lyr: 0, rd: null, fs: '2025-09-21', hid: false, dup: null, ...o,
});

export const SONG_FIXTURE = Object.freeze({
  schema: 1,
  version: '2026-09-24.6',
  generated: '2026-09-24T23:40:00-06:00',
  songs: [
    song({ id: 'aaaaaaaaaaa1', t: 'Come, Love Awaits You', f: 'fam-a', v: 'Country · hmarie777', st: ['country'], cr: 'hmarie777',
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, lyr: 2, vb: 0.99, vs: true }),
    song({ id: 'aaaaaaaaaaa2', t: 'Come, Love Awaits You', f: 'fam-a', v: 'Pop', st: ['pop'],
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, vb: 0.9, vs: true }),
    song({ id: 'aaaaaaaaaaa3', t: 'Come, Love Awaits You', f: 'fam-a', v: 'Pop (copy)', st: ['pop'], hid: true, dup: 'aaaaaaaaaaa2' }),
    song({ id: 'bbbbbbbbbbb1', t: 'Lead Me To That Place', f: 'fam-b', v: 'Spoken', st: ['worship'], dl: 'spoken', sh: 2 }),
    song({ id: 'ccccccccccc1', t: 'The Letter', f: 'fam-c', v: 'Worship', st: ['worship', 'pop'], sh: 2,
      src: { k: 'letter', id: 'one:the-letter', c: 'l' } }),
    song({ id: 'ccccccccccc2', t: 'The Letter', f: 'fam-c', v: 'Rock', st: ['rock'], sh: 2,
      src: { k: 'letter', id: 'one:the-letter', c: 'm' }, vb: 0.8, vs: true }),
    song({ id: 'ddddddddddd1', t: 'Unhosted', f: 'fam-d', v: '', sh: 0 }),
  ],
  families: [
    { id: 'fam-a', t: 'Come, Love Awaits You', feat: 'aaaaaaaaaaa1', n: 2, col: 'wtlb1', src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, lb: 'letter words', vs: true, vfeat: 'aaaaaaaaaaa1', nvs: 2 },
    { id: 'fam-b', t: 'Lead Me To That Place', feat: 'bbbbbbbbbbb1', n: 1, col: 'inspired', src: { k: 'none', id: '', c: 'l' }, lb: 'inspired by the letters' },
    { id: 'fam-c', t: 'The Letter', feat: 'ccccccccccc2', n: 2, col: 'one', src: { k: 'letter', id: 'one:the-letter', c: 'm' }, lb: 'letter words', vs: true, vfeat: 'ccccccccccc2', nvs: 1 },
    { id: 'fam-d', t: 'Unhosted', feat: 'ddddddddddd1', n: 0, col: 'originals', src: { k: 'none', id: '', c: 'l' }, lb: 'original' },
  ],
  readings: [{ key: 'blessed:blessed-are-those-who-worship-me', song: null, d: 195.8 }],
  styles: { pop: 'Pop', country: 'Country', worship: 'Worship', rock: 'Rock', spoken: 'Spoken' },
});

/**
 * The verbatim gate's golden rows (Corbin 2026-09-25: "Hear it sung" only for
 * songs that sing the letter's or the scripture's own words). Copied from the
 * live catalog 2026-09-25.1092.2:
 *   born-again             620080f78d26 "Born Again", Rock · hmarie777: wholly new lyrics (vb 0, vs false);
 *                          its family has no verbatim version.
 *   come-love-awaits-you   179aabfb6748 Country · hmarie777: the letter's words (vb 0.99, vs true).
 *   the-kingdom (mixed)    00000000cab1 an interpretation, featured; 00000000cab2 verbatim, the family's vfeat.
 *   no-vs                  a row of an older catalog without vb / vs.
 */
export const VERBATIM_FIXTURE = Object.freeze({
  schema: 1,
  version: '2026-09-25.1092.2',
  generated: '2026-09-25T20:00:00-06:00',
  songs: [
    song({ id: '620080f78d26', t: 'Born Again', f: 'born-again', v: 'Rock · hmarie777', st: ['rock'], cr: 'hmarie777',
      src: { k: 'letter', id: 'three:born-again', c: 'h' }, d: 190.1, b: 2947531, sh: 2, lyr: 1, fs: '2025-11-08', vb: 0.0, vs: false }),
    song({ id: '179aabfb6748', t: 'Come, Love Awaits You', f: 'come-love-awaits-you', v: 'Country · hmarie777', st: ['country'], cr: 'hmarie777',
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, d: 159.3, b: 2396391, sh: 2, lyr: 1, fs: '2025-12-03', vb: 0.99, vs: true }),
    song({ id: '00000000cab1', t: 'The Kingdom', f: 'the-kingdom', v: 'Cinematic', st: ['cinematic'], lyr: 1,
      src: { k: 'letter', id: 'wtlb1:the-kingdom', c: 'h' }, vb: 0.1, vs: false }),
    song({ id: '00000000cab2', t: 'The Kingdom', f: 'the-kingdom', v: 'Worship', st: ['worship'], lyr: 1,
      src: { k: 'letter', id: 'wtlb1:the-kingdom', c: 'h' }, vb: 0.93, vs: true }),
    song({ id: 'fffffffffff1', t: 'Old Catalog Song', f: 'no-vs', v: 'Pop', st: ['pop'], lyr: 1,
      src: { k: 'letter', id: 'one:old-letter', c: 'h' } }),
  ],
  families: [
    { id: 'born-again', t: 'Born Again', feat: '620080f78d26', n: 1, col: 'three', src: { k: 'letter', id: 'three:born-again', c: 'h' }, lb: 'letter words', vs: false, vfeat: null, nvs: 0 },
    { id: 'come-love-awaits-you', t: 'Come, Love Awaits You', feat: '179aabfb6748', n: 1, col: 'wtlb1', src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, lb: 'letter words', vs: true, vfeat: '179aabfb6748', nvs: 1 },
    { id: 'the-kingdom', t: 'The Kingdom', feat: '00000000cab1', n: 2, col: 'wtlb1', src: { k: 'letter', id: 'wtlb1:the-kingdom', c: 'h' }, lb: 'letter words', vs: true, vfeat: '00000000cab2', nvs: 1 },
    { id: 'no-vs', t: 'Old Catalog Song', feat: 'fffffffffff1', n: 1, col: 'one', src: { k: 'letter', id: 'one:old-letter', c: 'h' }, lb: 'letter words' },
  ],
  readings: [],
  styles: { rock: 'Rock', country: 'Country', cinematic: 'Cinematic', worship: 'Worship', pop: 'Pop' },
});

/**
 * A catalog of `n` one-version families with realistic field lengths — the
 * shape the boot-snapshot size test needs (a 900-song shuffle).
 * @param {number} n
 */
export function bigSongCatalog(n) {
  const songs = [];
  const families = [];
  for (let i = 0; i < n; i++) {
    const id = (0x100000000000 + i).toString(16).slice(-12);
    const f = 'family-number-' + i + '-with-a-longish-title-slug';
    songs.push(song({
      id, f, t: 'A Song From The Letters Number ' + i + ' With A Realistic Title', v: 'Cinematic · Pop · hmarie777 · No. 17',
      st: ['cinematic', 'pop'], sh: 1 + Math.floor(i / 250), src: { k: 'letter', id: 'wtlb1:letter-' + i, c: 'h' },
    }));
    families.push({ id: f, t: 'A Song From The Letters Number ' + i, feat: id, n: 1, col: 'wtlb1', src: { k: 'none', id: '', c: 'l' }, lb: 'letter words' });
  }
  return { schema: 1, version: 'big.' + n, generated: '', songs, families, readings: [], styles: {} };
}
