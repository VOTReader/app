/* align.js (search200 B4): one fixture pair per slip a reader makes when quoting from memory.
   Every text below is written for this test (none is a bench query); each query must hold its
   source at cov >= 0.8 and a plausible distractor (one sharing its rarer words) at <= 0.5.
   Pure: every case builds its own classes, so the cases pass in any order. */
import { describe, it, expect } from 'vitest';
import { alignScore, alignClasses, alignWeights, ALIGN } from './align.js';
import { kjvEncode } from './tokenize.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));
const SYN = {
  joy: ['joy', 'joyful', 'rejoice', 'gladness'],
  gladness: ['joy', 'joyful', 'rejoice', 'gladness'],
  mercy: ['mercy', 'compassion', 'pity', 'loving-kindness', 'lovingkindness'],
};

/** slip kind -> [query, source text, distractor] */
const PAIRS = {
  tense: [
    'he walks with the humble of the land and lifts up the broken in spirit',
    'In those days he walked with the humble of the land and lifted up the broken in spirit, and he restored them to their houses.',
    'The humble of the land shall inherit it, and they shall delight in the abundance of peace.',
  ],
  'shall/will': [
    'whoever trusts in me with a whole heart will not be moved and he will abide under the shadow of my wings',
    'Whoever trusts in Me with a whole heart shall not be moved, and he shall abide under the shadow of My wings.',
    'Hide me under the shadow of Your wings, from the wicked who oppress me.',
  ],
  register: [
    'thus says the lord to his people he that comes to me in truth shall never hunger and he that believes shall never thirst',
    'Thus saith the LORD unto His people: he that cometh unto Me in truth shall never hunger, and he that believeth shall never thirst.',
    'His people hunger and thirst in a dry land where no water is, and the LORD sends them bread from heaven.',
  ],
  synonym: [
    'your sorrow shall be turned into joy and no man shall take it away from you',
    'Your sorrow shall be turned into gladness, and no man shall take it away from you.',
    'Weeping may endure for a night, but joy comes in the morning.',
  ],
  'dropped clause': [
    'turn back to me with all your heart and i will heal your backsliding',
    'Turn back to Me with all your heart while the door is still open, and I will heal your backsliding.',
    'I will heal their backsliding, I will love them freely, for My anger has turned away.',
  ],
  'adjacent swap': [
    'and after the fire there came a small still voice and the prophet wrapped his face in his mantle',
    'And after the fire there came a still small voice, and the prophet wrapped his face in his mantle.',
    'The voice of the LORD is over the waters; the voice of the LORD breaks the cedars.',
  ],
  'real-word slip': [
    'rise early and prey for those who curse you for the lord hears the cry of the humble',
    'Rise early and pray for those who curse you, for the LORD hears the cry of the humble.',
    'The young lions roar after their prey and seek their food from God.',
  ],
  'merged clauses': [
    'my sheep hear my voice and none shall enter in but those who are mine',
    'My sheep hear My voice, and I know them, and they follow Me wherever I lead them. I have set watchmen upon the walls '
      + 'of the city by day and by night, and none shall enter in but those who are Mine.',
    'The sheep went astray upon the mountains, and there was none to seek them out.',
  ],
  'joined word': [
    'blessed be the lord forever and ever and let everyone that has breath praise him',
    'Blessed be the LORD for ever and ever, and let every one that hath breath praise Him.',
    'Praise Him, sun and moon; praise Him, all you stars of light.',
  ],
  'split word': [
    'is any thing too hard for the lord at the time appointed i will return to you',
    'Is anything too hard for the LORD? At the time appointed I will return unto you.',
    'Ah Lord GOD, You have made the heavens and the earth; there is nothing too hard for You.',
  ],
  // beyond the plan's list, from the open tri cases' own slips (align-probe): the commonest misremembering
  'word of their own': [
    'went out and conquered the city of the plain and took over its gates',
    'Then they went out and defeated the city of the plain, and took possession of its gates by night.',
    'The gates of the city were shut, and the men of the plain went out against them.',
  ],
  'clauses reordered': [
    'do not grow weary in doing good be steadfast and watchful in prayer',
    'Be steadfast and watchful in prayer; do not grow weary in doing good, for in due season you shall reap.',
    'Watch and pray, and do good to all, for the night comes when no one can work.',
  ],
  'number word': [
    'he went down and dipped 7 times in the jordan',
    'So he went down and dipped seven times in the Jordan, according to the saying of the man of God.',
    'Seven times a day I praise You, because of Your righteous judgments.',
  ],
};

const FILLER = [
  'And it came to pass in those days that the people went up to the house of the LORD.',
  'For I say to you that he who is faithful in little is faithful also in much.',
  'They have not known the way of peace, and there is no judgment in their goings.',
  'Hear this, all you people, and give ear, for I will open my mouth in a parable.',
  'He sent his word to them, and they were glad, and he brought them out of their distress.',
  'Be still and know that I am God; I will be exalted among the nations.',
  'The words that I speak to you are spirit, and they are life.',
  'Do not be deceived, for whatever a man sows, that he will also reap.',
  'I have seen all the works that are done under the sun, and all is vanity.',
  'My beloved, do not let your heart be troubled, neither let it be afraid.',
];

const TEXTS = Object.values(PAIRS).flatMap(([, src, dis]) => [src, dis]).concat(FILLER);
const toks = (/** @type {string} */ s) => kjvEncode(s);
const DF = new Map();
for (const t of TEXTS) for (const w of new Set(toks(t))) DF.set(w, (DF.get(w) || 0) + 1);
const N = TEXTS.length;
const df = (/** @type {string} */ w) => DF.get(w) || 0;

/** cov of a typed query against a text, fresh classes every time */
function align(/** @type {string} */ q, /** @type {string} */ text) {
  const words = toks(q);
  const classes = alignClasses(words, { stop: STOP, synonyms: SYN });
  return alignScore(toks(text), words, alignWeights(words, df, N), classes);
}

describe('alignScore: one pair per slip kind', () => {
  for (const [kind, [q, src, dis]] of Object.entries(PAIRS)) {
    it(`${kind}: holds its source (cov >= 0.8), not the distractor (<= 0.5)`, () => {
      const a = align(q, src);
      const b = align(q, dis);
      expect(a.cov).toBeGreaterThanOrEqual(0.8);
      expect(b.cov).toBeLessThanOrEqual(0.5);
      expect(a.cov).toBeGreaterThan(b.cov);
    });
  }
});

describe('alignScore: the span and the edges', () => {
  it('a quote word for word scores 1 and spans exactly its own tokens', () => {
    const text = 'Hear this, all you people. Your sorrow shall be turned into gladness, and no man shall take it away from you. Amen.';
    const q = 'your sorrow shall be turned into gladness and no man shall take it away from you';
    const r = align(q, text);
    expect(r.cov).toBeCloseTo(1, 6);
    expect(toks(text).slice(r.start, r.end)).toEqual(toks(q));
  });

  it('finds a misquote deep in a long text, and its span lands on it', () => {
    const body = [];
    for (let i = 0; i < 600; i++) body.push(FILLER[i % FILLER.length]);
    body.splice(437, 0, PAIRS.register[1]);
    const text = body.join(' ');
    const r = align(PAIRS.register[0], text);
    expect(r.cov).toBeGreaterThanOrEqual(0.8);
    const all = toks(text);
    const at = toks(body.slice(0, 437).join(' ')).length;
    expect(all.length).toBeGreaterThan(8000);
    expect(r.start).toBe(at); // "thus", the first typed word, opens the span
    expect(r.end).toBe(at + toks(PAIRS.register[1]).length);
  });

  it('an anchor the text repeats opens only its richest windows, and they still hold the quote', () => {
    const [q, src] = PAIRS.tense;
    // each content word of the query alone in a short sentence, over and over
    const decoys = ['the humble went home.', 'he walks alone.', 'the broken bread.', 'the spirit of the land.', 'he lifts his eyes.'];
    const body = [];
    for (let i = 0; i < 60; i++) body.push(decoys[i % decoys.length]);
    body.splice(31, 0, src);
    const text = body.join(' ');
    const at = toks(body.slice(0, 31).join(' ')).length;
    const words = toks(q);
    for (const WINDOWS of [1, ALIGN.WINDOWS]) {
      const cls = alignClasses(words, { stop: STOP, synonyms: SYN, credits: { WINDOWS } });
      const r = alignScore(toks(text), words, alignWeights(words, df, N), cls);
      expect(r.cov).toBeGreaterThanOrEqual(0.8);
      expect(r.start).toBeGreaterThanOrEqual(at);
      expect(r.end).toBeLessThanOrEqual(at + toks(src).length);
    }
  });

  it('a dropped clause is paid for and spanned, not skipped over', () => {
    const [q, src] = PAIRS['dropped clause'];
    const r = align(q, src);
    const t = toks(src);
    expect(t[r.start]).toBe('turn');
    expect(t[r.end - 1]).toBe('backsliding');
    expect(r.cov).toBeLessThan(1);
  });

  it('nothing to align: empty query, empty text, no anchor word', () => {
    const words = toks('the still small voice');
    const cls = alignClasses(words, { stop: STOP, synonyms: SYN });
    const w = alignWeights(words, df, N);
    expect(alignScore([], words, w, cls).cov).toBe(0);
    expect(alignScore(toks('a voice'), [], w, cls).cov).toBe(0);
    const none = alignScore(toks('and the people went up to the house'), words, w, cls);
    expect(none).toEqual({ cov: 0, start: -1, end: -1, first: -1 });
  });

  it('four-letter words meet by one vowel only: pray/prey yes, lord/word no', () => {
    expect(align('the lord', 'the word').cov).toBeLessThan(0.5);
    expect(align('watch and prey', 'watch and pray').cov).toBeGreaterThanOrEqual(0.8);
  });

  it('clauses typed in the other order span both, and one passage is never counted twice', () => {
    const [q, src] = PAIRS['clauses reordered'];
    const r = align(q, src);
    const t = toks(src);
    expect(t.slice(r.start, r.end).join(' ')).toBe('be steadfast and watchful in prayer do not grow weary in doing good');
    const twice = align('the still small voice the still small voice', 'And after the fire there came a still small voice.');
    expect(twice.cov).toBeLessThan(0.6);
  });

  it('a quote opens where its first typed words are: clauses typed in the other order open on the first clause typed', () => {
    const [q, src] = PAIRS['clauses reordered'];
    const r = align(q, src);
    const t = toks(src);
    expect(t.slice(r.first, r.first + 4).join(' ')).toBe('do not grow weary');
    // in one piece, the quote opens where its span does
    const one = align('be steadfast and watchful in prayer', src);
    expect(one.first).toBe(one.start);
  });

  it('a word of their own counts only beside a met word, and never twice in a row', () => {
    const one = align('the lord is my rock and my fortress', 'The LORD is my rock and my fortress and my deliverer.');
    const slot = align('the lord is my stone and my fortress', 'The LORD is my rock and my fortress and my deliverer.');
    const two = align('the lord is my stone and wall fortress', 'The LORD is my rock and my fortress and my deliverer.');
    expect(one.cov).toBeCloseTo(1, 6);
    expect(slot.cov).toBeLessThan(one.cov);
    expect(slot.cov).toBeGreaterThan(align('the lord is my stone and my fortress', 'The LORD is my fortress and my deliverer.').cov);
    expect(two.cov).toBeLessThan(slot.cov);
    const off = alignClasses(toks('the lord is my stone and my fortress'), { stop: STOP, synonyms: SYN, credits: { SLOT: 0 } });
    const words = toks('the lord is my stone and my fortress');
    expect(alignScore(toks('The LORD is my rock and my fortress.'), words, alignWeights(words, df, N), off).cov).toBeLessThan(slot.cov);
  });

  it('a jump between clauses stays in one passage: the last word said far off in the text is not the quote', () => {
    const src = 'Everything you carry, I carry; every burden you bear, I lift.';
    const body = [];
    for (let i = 0; i < 40; i++) body.push(FILLER[i % FILLER.length]);
    body.splice(30, 0, src);
    body.splice(10, 0, 'He set the yoke upon his shoulder.');
    const text = body.join(' ');
    const at = toks(body.slice(0, 31).join(' ')).length;
    // the last typed word the rarest: a window opens on it where the text says it, far off
    const words = toks('everything you carry i carry every burden you bear i shoulder');
    const w = Float64Array.from(words, (x) => (x === 'shoulder' ? 6 : STOP.has(x) ? 0.5 : 2));
    const r = alignScore(toks(text), words, w, alignClasses(words, { stop: STOP, synonyms: SYN }));
    expect(r.start).toBe(at);
    expect(r.end).toBeLessThanOrEqual(at + toks(src).length);
  });

  it('a reordered pair far apart is not a swap: the order a text holds still counts', () => {
    const fwd = align('mercy and truth are met together', 'Mercy and truth are met together; righteousness and peace have kissed.');
    const back = align('mercy and truth are met together', 'Together they met, the truth and the mercy.');
    expect(fwd.cov).toBeGreaterThan(0.95);
    expect(back.cov).toBeLessThan(0.5);
  });
});

describe('alignScore: classes reused and token ids', () => {
  it('one classes object scores many texts the same as fresh ones, in any order', () => {
    const q = PAIRS.tense[0];
    const words = toks(q);
    const w = alignWeights(words, df, N);
    const shared = alignClasses(words, { stop: STOP, synonyms: SYN });
    const texts = [...TEXTS].reverse();
    const reused = texts.map((t) => alignScore(toks(t), words, w, shared).cov);
    const fresh = texts.map((t) => align(q, t).cov);
    expect(reused).toEqual(fresh);
  });

  it('numeric token ids (a token store) score the same as strings', () => {
    const vocab = new Map();
    const id = (/** @type {string} */ s) => { if (!vocab.has(s)) vocab.set(s, vocab.size + 1); return vocab.get(s); };
    for (const t of TEXTS) toks(t).forEach(id);
    const names = [];
    for (const [s, i] of vocab) names[i] = s;
    const known = (/** @type {string} */ s) => vocab.get(s);
    for (const [q, src] of Object.values(PAIRS)) {
      const words = toks(q);
      const w = alignWeights(words, df, N);
      const cls = alignClasses(words, { stop: STOP, synonyms: SYN, id: known, word: (/** @type {number} */ i) => names[i] });
      const docIds = Uint32Array.from(toks(src).map(id));
      const qIds = words.map((x) => known(x) || 0);
      const r = alignScore(docIds, qIds, w, cls);
      const s = align(q, src);
      expect(r.cov).toBeCloseTo(s.cov, 9);
      expect([r.start, r.end]).toEqual([s.start, s.end]);
    }
  });
});

describe('alignClasses: what a typed word may meet', () => {
  const cls = alignClasses(toks('he walks and saith she shall weep for joy'), { stop: STOP, synonyms: SYN });
  const credit = (/** @type {string} */ tok, /** @type {number} */ pos) => {
    const e = cls.entry(tok);
    for (let k = 0; k < e.c.length; k += 2) if (e.c[k] === pos + 1) return e.c[k + 1];
    return 0;
  };
  it('word forms and lemmas: tense, number, -eth', () => {
    expect(credit('walked', 1)).toBe(ALIGN.FORM);
    expect(credit('walketh', 1)).toBe(ALIGN.FORM);
    expect(credit('wept', 6)).toBe(ALIGN.FORM);
  });
  it('the register table: saith/says, shall/will', () => {
    expect(credit('says', 3)).toBe(ALIGN.REGISTER);
    expect(credit('will', 5)).toBe(ALIGN.REGISTER);
  });
  it('a SYNONYM_MAP group, single words only', () => {
    expect(credit('gladness', 8)).toBe(ALIGN.SYNONYM);
    expect(credit('rejoice', 8)).toBe(ALIGN.SYNONYM);
  });
  it('the typed word itself is full credit, and an unrelated word nothing', () => {
    expect(credit('joy', 8)).toBe(1);
    expect(credit('river', 8)).toBe(0);
  });
  it('anchors carry the forms, so a window opens on a changed tense', () => {
    expect(cls.anchor[1].has('walked')).toBe(true);
    expect(cls.anchor[8].has('gladness')).toBe(true);
  });
});
