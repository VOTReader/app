/* songs-gate.js - the Songs pictures' facts, pinned (states.json 6d-songs and 6e-song-page; design's dz14).

   Design drew the live catalog 2026-10-06.1097 (lanes/design/out/dz14/songs-src). These are the views songs-facts.js
   builds from that catalog on a real boot (dumped 10-15 by zones, lanes/zones/out/v2p6/dump), written small: a gate
   boot fetches nothing, so the pictures hold however many songs the flock adds. */

import { versionLabels } from './songs-facts.js';

const INSPIRED = 'Inspired by the letters';

/** New from the flock: [song id, family, title, line, length, versions]. */
const NEWEST = [
  ['fff560651f2a', 'true-faith', 'True Faith', INSPIRED, '1:32', 1],
  ['ffb262e068f1', 'i-belong', 'I Belong', INSPIRED, '3:56', 1],
  ['ffad4de7e413', 'still-small-voice', 'Still Small Voice', INSPIRED, '3:26', 1],
  ['ff87aa6a382d', 'shut-my-eyes-lord', 'Shut My Eyes, Lord', 'Letters from Timothy', '2:59', 1],
  ['ff5915e5e66e', 'purge-my-soul', 'Purge My Soul', 'Letters from Timothy', '2:48', 1],
  ['ff4c64a6c2e0', 'king-of-heaven', 'King of Heaven', 'Sky of Sapphire', '3:54', 1],
  ['ff4176d97f8a', 'roaring-lions', 'Roaring Lions', 'Volume Seven', '2:46', 4],
  ['fef7729cc81d', 'rightly-dividing-the-word', 'Rightly Dividing The Word', INSPIRED, '3:46', 1],
  ['fe3bd38543c4', 'grace-fall-low', 'Grace Fall Low', INSPIRED, '3:09', 1],
  ['fe2ab4d2a55d', 'never-gonna-turn-away', 'Never Gonna Turn Away', INSPIRED, '3:27', 1],
];

/** From the letters, biggest first: [collection, label, songs, the first four covers]. */
const TILES = [
  ['wtlb1', 'Words To Live By: Part One', 88, 'ade505fecd06 758a7d7598c6 6d9e521a88ab b6dec9f64c37'],
  ['timothy', 'Letters from Timothy', 30, '0809749c3a0e 697114cc00f6 959465e1f142 e8447552e0a4'],
  ['blessed', 'The Blessed', 27, 'cccd2902db8b 0df5db0ef95a fab68e5ba878 6b00548117a1'],
  ['seven', 'Volume Seven', 21, 'e754a247e4bf 1e9177808f23 41928875b747 21b6a86aea97'],
  ['one', 'Volume One', 16, '38d21b876868 4c7d2951d7cc c771acb672a5 486f2716ad9a'],
  ['five', 'Volume Five', 11, '9ff007943320 5700d3356aec 80117d7fd8dc d913ce12137d'],
  ['flock', 'Letters to The Lord\'s Little Flock', 8, '8a04d623e420 5f2145b923b9 3b5f37a9b966 ac7838b54fbe'],
  ['two', 'Volume Two', 7, '519f2b92e65e 53e51a310207 e9a0b4621cb1 26192a3c933f'],
  ['three', 'Volume Three', 7, '749fc3463295 e7a3adae1184 d887b7e8cfe5 5463f0f5b4d9'],
  ['six', 'Volume Six', 7, '123ad4544d77 58bd64984ef7 95b0a62d2787 5ca1406dd2a1'],
  ['rebuke', 'The Lord\'s Rebuke', 5, '3075d4f24828 3acb4417f20b 925eed6f7709 367b8e1ba86a'],
  ['wtlb2', 'Words To Live By: Part Two', 4, 'e3df8cc15e93 04bcbc558724'],
  ['four', 'Volume Four', 2, 'b8da3e302238 fe19d6f04bc8'],
];

/** The chips: main's five, then More's twelve with their song counts. */
const MORE = [['rock', 'Rock', 143], ['rnb', 'R&B', 126], ['dance', 'Dance', 90], ['world', 'World', 78], ['spoken', 'Spoken', 63],
  ['country', 'Country', 58], ['retro', 'Retro', 43], ['reggae', 'Reggae', 20], ['a-cappella', 'A cappella', 14], ['blues', 'Blues', 14],
  ['instrumental', 'Instrumental', 13], ['spanish', 'Spanish', 11]];

/** 6d: the hub at the top, nothing typed; states.json's Your songs (3 saved, 12 recent, 2 kept · 7.6 MB). */
export function gateSongsHub() {
  return {
    hub: {
      chips: {
        primary: [['worship', 'Worship'], ['pop', 'Pop'], ['hip-hop', 'Hip-hop'], ['cinematic', 'Cinematic'], ['folk', 'Folk']].map(([key, label]) => ({ key, label })),
        more: MORE.map(([key, label, n]) => ({ key, label, n })),
      },
      newest: NEWEST.map(([id, fam, title, line, len, versions]) => ({ id, fam, title, line, len, versions })),
      saved: 3, recent: 12, kept: '2 · 7.6 MB',
      tiles: TILES.map(([col, label, n, ids]) => {
        const covers = String(ids).split(' ');
        while (covers.length < 4) covers.push('');
        return { col, label, n: n + ' songs', covers };
      }),
      shelves: [{ v: 'shelf:inspired', title: INSPIRED, n: '669 songs' }, { v: 'shelf:originals', title: 'Flock originals and prayers', n: '194 songs' }],
      readings: 13,
    },
  };
}

/** Elect and Precious's sixteen versions, featured first: [song id, its name in the catalog, length]. */
const EP = [['fcac1412cff5', 'Cinematic', '2:05'], ['01d48f8f20d8', 'Cinematic', '2:53'], ['07762d9e986f', 'Cinematic', '2:19'],
  ['0ff4be826a67', 'Cinematic', '2:40'], ['159c5d8e9654', 'Folk · Pop', '3:28'], ['33e1c89ef2d3', 'Spoken · Cinematic', '1:16'],
  ['60bb336d92c2', 'Cinematic', '2:44'], ['63da78bd7e39', 'Cinematic', '2:57'], ['85b0ed9bca3e', 'Cinematic', '2:08'],
  ['91e75069cf1d', 'Cinematic', '3:28'], ['97b4dcad828f', 'Cinematic', '2:16'], ['ac959181ab06', 'Cinematic', '3:46'],
  ['b892c2c02630', 'Cinematic', '2:46'], ['be13c64bb473', 'Cinematic', '2:15'], ['c526218a5774', 'Cinematic', '2:46'],
  ['f8509c667cd8', 'Cinematic', '3:12']];
/** Their bytes together (the catalog's b): what Keep would download. */
const EP_BYTES = 37616949;

/** 6e: Elect and Precious from the hub, not saved, not kept (states.json); its lyrics' first lines. */
export function gateSongPage() {
  const labels = versionLabels(EP.map(([, v]) => ({ v })));
  return {
    song: {
      fam: 'elect-and-precious', title: 'Elect and Precious', eyebrow: 'Song · 16 versions', lead: 'fcac1412cff5',
      from: 'From the letter:', letter: { key: 'wtlb1:elect-and-precious', title: 'Elect and Precious', route: { place: 'letter', collection: 'wtlb1', n: 76 } },
      shelf: 'Words To Live By: Part One', makers: 'Made with Suno · by members of the flock',
      versions: EP.map(([id, , len], i) => ({ id, label: labels[i], len })),
      worded: 'fcac1412cff5', instrumental: false, foot: 'Words from the letter “Elect and Precious” · lyrics transcribed', more: [], moreAll: 0,
    },
    saved: false,
    keep: { avail: 'ok', p: { total: 16, kept: 0, busy: 0, failed: 0, bytes: EP_BYTES, needBytes: EP_BYTES } },
    lyrics: [
      'You are more than the filth that covers you, more than the sin that fills you, much more',
      'than the choices you make, for I see your beauty, I know your heart, and the love which',
      'you have for me Behold, I know you as you are and will be',
      'with me where I am You are not that which you choose',
      'In a moment of weakness You are that which I have created',
    ],
  };
}
