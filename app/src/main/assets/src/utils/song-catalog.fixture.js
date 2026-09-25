// @ts-nocheck
/* Test fixture for the Songs of the Letters catalog (schema 1,
   D:/Swarm/calls/ai-music/catalog-schema.md). Imported by tests only — no
   bundle entry reaches it.

   fam-a  wtlb1     a1 featured (country, high link) · a2 (pop, high) · a3 HIDDEN duplicate of a2
   fam-b  inspired  b1 (worship, spoken, no link)
   fam-c  one       c1 (worship + pop, LOW link) · c2 featured (rock, medium link)
   fam-d  originals d1 with no shard (not playable) */

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
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, lyr: 2 }),
    song({ id: 'aaaaaaaaaaa2', t: 'Come, Love Awaits You', f: 'fam-a', v: 'Pop', st: ['pop'],
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' } }),
    song({ id: 'aaaaaaaaaaa3', t: 'Come, Love Awaits You', f: 'fam-a', v: 'Pop (copy)', st: ['pop'], hid: true, dup: 'aaaaaaaaaaa2' }),
    song({ id: 'bbbbbbbbbbb1', t: 'Lead Me To That Place', f: 'fam-b', v: 'Spoken', st: ['worship'], dl: 'spoken', sh: 2 }),
    song({ id: 'ccccccccccc1', t: 'The Letter', f: 'fam-c', v: 'Worship', st: ['worship', 'pop'], sh: 2,
      src: { k: 'letter', id: 'one:the-letter', c: 'l' } }),
    song({ id: 'ccccccccccc2', t: 'The Letter', f: 'fam-c', v: 'Rock', st: ['rock'], sh: 2,
      src: { k: 'letter', id: 'one:the-letter', c: 'm' } }),
    song({ id: 'ddddddddddd1', t: 'Unhosted', f: 'fam-d', v: '', sh: 0 }),
  ],
  families: [
    { id: 'fam-a', t: 'Come, Love Awaits You', feat: 'aaaaaaaaaaa1', n: 2, col: 'wtlb1', src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, lb: 'letter words' },
    { id: 'fam-b', t: 'Lead Me To That Place', feat: 'bbbbbbbbbbb1', n: 1, col: 'inspired', src: { k: 'none', id: '', c: 'l' }, lb: 'inspired by the letters' },
    { id: 'fam-c', t: 'The Letter', feat: 'ccccccccccc2', n: 2, col: 'one', src: { k: 'letter', id: 'one:the-letter', c: 'm' }, lb: 'letter words' },
    { id: 'fam-d', t: 'Unhosted', feat: 'ddddddddddd1', n: 0, col: 'originals', src: { k: 'none', id: '', c: 'l' }, lb: 'original' },
  ],
  readings: [{ key: 'blessed:blessed-are-those-who-worship-me', song: null, d: 195.8 }],
  styles: { pop: 'Pop', country: 'Country', worship: 'Worship', rock: 'Rock', spoken: 'Spoken' },
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
