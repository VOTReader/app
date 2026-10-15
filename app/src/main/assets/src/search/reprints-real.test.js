/* The original first, its reprint right after (sr11 pushback, 2026-10-15). Corbin (DECISIONS 10-14) on a letter
   that Words To Live By later excerpts: "what surfaces first? The original, yes. But both should surface, with
   WTLB being second." The search benchmark's open misses of that kind, each on a fixture shaped like its texts:
   a Words To Live By title the query names in passing, a study that restores His name in the verse it quotes or
   quotes the KJV and cites the verse, a Words To Live By entry the query describes, and a reprint that sat far
   below its original. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const STOP = new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'shall', 'no', 'but', 'me', 'by', 'am', 'be', 'has', 'an', 'are', 'who', 'as', 'was', 'with', 'or', 'at', 'when', 'our', 'what', 'have', 'can', 'on', 'this', 'these', 'him', 'she', 'her', 'so', 'all', 'they', 'them', 'were', 'about']);
const BOOK_IDS = ['exodus', 'job', 'ecclesiastes', 'luke', 'romans'];
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: Object.fromEntries(BOOK_IDS.map((b) => [b, b])), BOOK_DISPLAY: { exodus: 'Exodus', job: 'Job', ecclesiastes: 'Ecclesiastes', luke: 'Luke', romans: 'Romans' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['exodus', 'job', 'ecclesiastes'], NT_BOOK_IDS: ['luke', 'romans'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
// Verses outnumber titled texts, as in the corpus.
const FILLER = Array.from({ length: 40 }, (_, i) => ({ n: 40 + i, text: 'And the people went up to the city, and they sat down there. ' + i }));
const book = (id, title, num, verses) => ({ id, title, chapters: [{ num, sections: [{ heading: '', verses: verses.concat(FILLER) }] }] });
const letter = (id, num, title, text) => ({ id, num, title, blocks: [{ segments: [{ v: text }] }] });
const entry = (id, num, title, text) => ({ id, num, title, paragraphs: [{ text }] });
const study = (slug, title, num, text) => ({ slug, title, chapters: [{ id: slug + '-ch' + num, num, title: 'Part ' + num, blocks: [{ segments: [{ v: text }] }] }] });

const PREPARED = 'What I have prepared cannot be seen with the eyes, nor can it be attained by human means or mere proclamation, says The Lord.';
const COMING = 'The One who was has come; The One who is, is come; The One who is to come is coming quickly to fulfill and complete, to gather His own and to judge the earth in righteousness. HISTORY HAS AN END. And His name is The Great I AM, The Holy One of Israel.';
const SERVANT = 'Who is a wise and faithful servant? Is he not one who receives the blessings of his Father without constraint, one who embraces My speech, whether soft or hard?';
const EMBRACE = 'It is time for you to embrace Me as I truly am.';
const GLOBALS = {
  BOOKS: {
    exodus: book('exodus', 'Exodus', 12, [{ n: 27, text: 'that you shall say, ‘It is the Passover sacrifice of the LORD, who passed over the houses of the children of Israel in Egypt when He struck the Egyptians and delivered our households.’ ” So the people bowed their heads and worshiped.' }]),
    job: book('job', 'Job', 1, [{ n: 21, text: 'And he said: “Naked I came from my mother’s womb, And naked shall I return there. The LORD gave, and the LORD has taken away; Blessed be the name of the LORD.”' }]),
    ecclesiastes: book('ecclesiastes', 'Ecclesiastes', 3, [{ n: 5, text: 'A time to cast away stones, And a time to gather stones; A time to embrace, And a time to refrain from embracing;' }]),
    luke: book('luke', 'Luke', 7, [{ n: 9, text: 'When Jesus heard these things, He marveled at him, and turned around and said to the crowd that followed Him, “I say to you, I have not found such great faith, not even in Israel!”' }]),
    romans: book('romans', 'Romans', 3, [{ n: 23, text: 'for all have sinned and fall short of the glory of God,' }]),
  },
  LETTERS_V1: [
    letter('kingdom', 3, 'The Kingdom Prepared', 'Hear Me, O My people, and seek My face. ' + PREPARED + ' Seek Me, and you shall find Me, when you seek Me with all your heart.'),
    // a letter is long, the entry cut from it short: the entry led by its words and its title
    letter('i-am-come', 24, 'I AM COME', 'I AM COME. ' + COMING + ' Behold, He comes with the clouds, and every eye shall see Him. ' + 'Repent, O you people, turn from your wicked ways and be ready. '.repeat(40)),
    // another letter holding the typed run, below the one quoted: it sat between the letter and its reprint
    letter('love', 13, 'Love One Another', 'Love one another, as I have loved you, and be kind to the weary and the poor. '.repeat(20) + 'Beloved, I call for you to embrace Me with all your heart.'),
    letter('word', 12, 'Blessed by The Word of God', SERVANT + ' A servant such as this is wise indeed. Beloved, it is time for you to follow your heart. ' + EMBRACE + ' Embrace My word, and live. Says The Lord.'),
  ],
  WTLB_TWO: [
    entry('not-by-human-means', 115, 'Not By Human Means', 'What I have prepared can not be seen With the eyes, nor can it be attained By human means or mere proclamation...'),
    entry('history-has-an-end', 73, 'History Has an End', 'I AM COME... ' + COMING.replace('HISTORY HAS AN END.', 'HISTORY HAS AN END!...')),
    entry('a-wise-and-faithful-servant', 69, 'A Wise and Faithful Servant', SERVANT.replace('?', '?...') + ' A servant such as this is wise indeed...'),
  ],
  THE_BLESSED: [
    entry('receive-of-me', 4, 'Blessed Are Those Who Receive of Me', 'Blessed are those who bless the name of The Lord, who give thanks in all things. † Blessed be the name of The Lord... For He gives, and He takes away.'),
  ],
  BIBLE_STUDIES: [
    study('grace-and-the-law', 'Grace AND The Law', 1, 'The entire human race has fallen. “All have sinned, and come short of the glory of God.” – Romans 3:23 Therefore grace is given to those who repent and obey.'),
    study('lamb-of-god', 'The Lamb of God', 7, 'On the day of Passover the lamb was slain. “It is the Passover sacrifice of The Lord, who passed over the houses of the children of Israel in Egypt when He struck the Egyptians and delivered our households.” – Exodus 12:27 So the Lamb of God was slain for us.'),
    study('more-than-a-man', 'More Than a Man', 14, 'When YahuShua heard these things, He marveled at him, and turned around and said to the crowd that followed Him, "I say to you, I have not found such great faith, not even in Israel!" – Luke 7:9'),
    // a study chapter is long: the reprint sat far below its letter (#15)
    study('purity', 'Purity', 4, 'Purity is a matter of the heart, and of the ways we walk in. '.repeat(150) + 'Beloved, it is time for you to follow your heart. It is time for you to embrace Me as I truly am, says The Lord. (From “Blessed by The Word of God”) Sanctify them in the truth. ' + 'Walk in the light, as He is in the light. '.repeat(150)),
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref + (x.doc.kind === 'verse' ? '' : ' · ' + x.doc.title));

describe('the original first, its reprint right after', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  /* "attained by human means" quotes the letter, and names the entry's title in passing: the title kept the entry
     above its letter (benchmark t333). A title typed whole still finds its entry first. */
  it('a quote of a letter that names a Words To Live By title in passing finds the letter, then the entry', async () => {
    const r = refs(await VotSearchMini.search('attained by human means'));
    expect(r.slice(0, 2)).toEqual(['Volume One · Letter 3 · The Kingdom Prepared', 'Words To Live By: Part Two 115 · Not By Human Means']);
    expect(refs(await VotSearchMini.search('not by human means'))[0]).toBe('Words To Live By: Part Two 115 · Not By Human Means');
  });

  /* A study restores His name in the verse it quotes; the edition prints "Jesus" (benchmark t471). */
  it('a study quoting a verse with His name restored finds the verse, then the study', async () => {
    const r = refs(await VotSearchMini.search('when yahushua heard these things he marveled at him'));
    expect(r.slice(0, 2)).toEqual(['Luke 7:9', 'More Than a Man 14 · More Than a Man — Part 14']);
  });

  /* A study quotes the KJV ("come short") and names the verse after it; the edition says "fall short" (t464). */
  it('a quote of the KJV that a study cites finds the cited verse, then the study', async () => {
    const r = refs(await VotSearchMini.search('sinned and come short'));
    expect(r.slice(0, 2)).toEqual(['Romans 3:23', 'Grace AND The Law 1 · Grace AND The Law — Part 1']);
  });

  /* ...but a reader describing the study asks for the study (t441): the citation names the original of a quote. */
  it('a study described in other words stays first over the verse it cites', async () => {
    expect(refs(await VotSearchMini.search('passover study about the lamb when god struck the egyptians'))[0]).toBe('The Lamb of God 7 · The Lamb of God — Part 7');
  });

  /* "Blessed be the name of our lord": its content words sit thickest in the line above the quote (t358). */
  it('a quote held nearly word for word finds its verse though its content words sit thicker a line away', async () => {
    const r = refs(await VotSearchMini.search('blessed be the name of our lord'));
    expect(r.slice(0, 2)).toEqual(['Job 1:21', 'The Blessed 4 · Blessed Are Those Who Receive of Me']);
  });

  /* A reader describing the letter a Words To Live By entry is cut from: the entry led with its letter holding as
     much of the query (t482). */
  it('a letter described in other words comes before the entry cut from it', async () => {
    const r = refs(await VotSearchMini.search('letter explaining that history has an end and christ is coming'));
    expect(r.slice(0, 2)).toEqual(['Volume One · Letter 24 · I AM COME', 'Words To Live By: Part Two 73 · History Has an End']);
  });

  /* The reprint of the passage the reader typed comes second: not an entry reprinting another part of the letter,
     and found by the typed run the screen lands on, not the query's one content word (t286). */
  it('the reprint of the passage typed comes right after its letter', async () => {
    const r = refs(await VotSearchMini.search('for you to embrace me'));
    expect(r.slice(0, 2)).toEqual(['Volume One · Letter 12 · Blessed by The Word of God', 'Purity 4 · Purity — Part 4']);
  });
});
