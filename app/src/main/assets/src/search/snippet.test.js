import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { snippet, snippetAt, highlightSpans, matchExcerpt, morePlaces, findPlaces } from './snippet.js';

describe('snippet', () => {
  it('returns short text unchanged when no terms', () => {
    expect(snippet('short text', [])).toBe('short text');
  });

  it('truncates long text with an ellipsis when no terms', () => {
    const out = snippet('abcdefghij', [], 5);
    expect(out).toBe('abcde…');
  });

  it('centers on the matched term with ellipses', () => {
    const text = 'A'.repeat(100) + ' shepherd ' + 'B'.repeat(100);
    const out = snippet(text, ['shepherd'], 60);
    expect(out).toContain('shepherd');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  it('centers on the densest cluster of query terms, not the first stray hit', () => {
    const early = 'beloved beloved beloved beloved beloved. '; // "beloved" alone, early
    const cluster = 'Now I call my beloved ones to come. ';     // call + beloved + ones together
    const text = early + 'x'.repeat(40) + cluster + 'y'.repeat(60);
    const out = snippet(text, ['call', 'beloved', 'ones'], 80);
    // The window with all three terms (the cluster) wins over the lone early "beloved".
    expect(out).toContain('call');
    expect(out).toContain('ones');
  });

  it('is archaic-aware (a "you" query centers on "thou")', () => {
    expect(snippet('Thou art holy', ['you'])).toBe('Thou art holy');
  });

  it('falls back to truncation when no term is found', () => {
    const out = snippet('xxxxxxxxxxxxxxxx', ['zzz'], 8);
    expect(out).toBe('xxxxxxxx…');
  });

  it('handles empty text', () => {
    expect(snippet('', ['x'])).toBe('');
  });
});

describe('highlightSpans', () => {
  it('splits into hit / non-hit spans', () => {
    const spans = highlightSpans('the LORD is good', ['lord']);
    expect(spans).toEqual([
      { text: 'the ', hit: false },
      { text: 'LORD', hit: true },
      { text: ' is good', hit: false },
    ]);
  });

  it('returns a single non-hit span when no terms', () => {
    expect(highlightSpans('plain text', [])).toEqual([{ text: 'plain text', hit: false }]);
  });

  it('highlights archaic variants of a modern query term', () => {
    const spans = highlightSpans('thou art mine', ['you']);
    expect(spans.some((s) => s.hit && s.text === 'thou')).toBe(true);
  });

  it('ignores sub-2-char terms', () => {
    expect(highlightSpans('a a a', ['a'])).toEqual([{ text: 'a a a', hit: false }]);
  });

  it('is regex-escape safe (special chars do not throw)', () => {
    const spans = highlightSpans('a.b c', ['a.b']);
    expect(spans.some((s) => s.hit && s.text === 'a.b')).toBe(true);
  });

  it('handles empty text', () => {
    expect(highlightSpans('', ['x'])).toEqual([{ text: '', hit: false }]);
  });
});

describe('matchExcerpt — where a search hit LANDS in its letter', () => {
  const text = 'In the beginning was the Word. And the still small voice spoke to him in the cave. He listened.';
  it('starts AT the first matched term of the best window, not centred on it', () => {
    const ex = matchExcerpt(text, ['still', 'voice']);
    expect(ex.startsWith('still small voice')).toBe(true);
  });
  it('runs the asked length and no further', () => {
    expect(matchExcerpt(text, ['cave'], 12)).toBe('cave. He lis');
  });
  it('is empty when no term occurs (the letter opens at the top, as before)', () => {
    expect(matchExcerpt(text, ['zebra'])).toBe('');
    expect(matchExcerpt('', ['still'])).toBe('');
    expect(matchExcerpt(text, [])).toBe('');
  });
  // search sr11 (2026-10-15, bench t238): "gods people obey his commandments and enjoy keeping the sabbath" found
  // the letter by "keep", but the excerpt counted only the typed spellings, so "keeping" met nothing and the line
  // holding "obey" (rarer) opened instead of "My people are those who keep My Commandments".
  it('counts the engine\'s matched words that are another form of a typed word, not its prefix finds', () => {
    const letter = 'For those who obey My Commandments remain in My love, and those who remember My Sabbaths keep My company. '
      + 'Why, O churches of men, do you forsake My Sabbaths? For My people are those who keep My Commandments and take pleasure in My Sabbaths.';
    const typed = ['people', 'obey', 'commandments', 'keeping'];
    expect(matchExcerpt(letter, typed).startsWith('obey My Commandments')).toBe(true);   // the typed spellings alone
    expect(matchExcerpt(letter, typed, undefined, ['keep', 'god']).startsWith('people are those who keep')).toBe(true);
    // a prefix find of a typed word ("these" for "the") is no form of it and counts nothing
    const t2 = 'these are they. And the voice said: the end is near.';
    expect(matchExcerpt(t2, ['the', 'voice'], 12, ['these'])).toBe(matchExcerpt(t2, ['the', 'voice'], 12));
  });
});

/* Whole words only (2026-09-22). The reader audit searched "love one another" at
   412 px and 1 John 4:7 came back marked "every[one]" and "Be[love]d", while the
   top snippet opened "…d... Understand Love." on half a word. The engine tokenises
   on word boundaries, so a hit inside another word is never what it matched on. */
describe('search results read as whole words', () => {
  const v147 = 'Beloved, let us love one another, for love is of God; and everyone who loves is born of God and knows God.';

  it('marks a term only where a word starts, and marks the whole word', () => {
    const hits = highlightSpans(v147, ['love', 'one', 'another']).filter((s) => s.hit).map((s) => s.text);
    // the typed words in a row are one mark (search200 B7)
    expect(hits).toEqual(['love one another', 'love', 'loves']);
  });

  it('never marks inside another word', () => {
    const spans = highlightSpans('someone gone, done: the stone', ['one']);
    expect(spans).toEqual([{ text: 'someone gone, done: the stone', hit: false }]);
  });

  it('keeps an archaic variant and a capitalised word whole', () => {
    const hits = highlightSpans('Thou lovest righteousness; LORD, Thee I love', ['you', 'love', 'lord']).filter((s) => s.hit).map((s) => s.text);
    // two typed words in a row are one mark (search200 B7)
    expect(hits).toEqual(['Thou lovest', 'LORD', 'Thee', 'love']);
  });

  /** The snippet (without its … marks) is a run of whole words of `text`. */
  function wholeWords(text, out) {
    const core = out.replace(/^…/, '').replace(/…$/, '');
    const at = text.indexOf(core);
    expect(at, `snippet "${out}" is not a slice of the text`).toBeGreaterThan(-1);
    const W = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
    expect(W(text[at - 1]) && W(core[0]), `"${out}" opens inside a word`).toBe(false);
    expect(W(core[core.length - 1]) && W(text[at + core.length]), `"${out}" closes inside a word`).toBe(false);
    // and it opens ON a word, not on the punctuation the cut word left behind ("….. Understand")
    if (out.startsWith('…')) expect(W(core[0]) || /^["“‘(]/.test(core), `"${out}" opens on debris`).toBe(true);
  }

  it('never opens or closes on half a word, at any width', () => {
    const text = 'And now I will make you understand... Understand Love. For in My love were you created, To receive and to give; ' +
      'And in the giving does one also receive. Therefore, love one another As I have loved you, Says The Lord.';
    for (let maxLen = 40; maxLen <= 160; maxLen += 3) wholeWords(text, snippet(text, ['love', 'one', 'another'], maxLen));
  });

  it('still keeps the matched words inside the window', () => {
    const text = 'x'.repeat(30) + ' filler words here and there ' + 'Therefore, love one another As I have loved you' + ' more words follow here'.repeat(4);
    const out = snippet(text, ['love', 'one', 'another'], 70);
    expect(out).toContain('love one another');
  });
});

/* Every place a letter says the words (Brianna, 2026-09-26). "flood" showed
   Vengeance Is Mine's "a flooding rain" and never the "flood of judgment" further
   down the same letter; a card now lists the rest. The text below is that letter's
   shape: one early hit, then three late ones, two of them one line apart. */
describe('morePlaces — every other place a unit matches', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  const TEXT = pad(3) + 'Behold, I shall bring upon them a flooding rain, a great deluge. ' + pad(300)
    + 'nor shall I flood the face of the earth in My anger, nor drown the nations in the depths of My sorrow. '
    + 'For that which I pour out shall not Be a flood of water which covers, But a flood of judgment to destroy, '
    + pad(3);

  it('lists the hits the snippet does not show, a line apart joined as one place, in reading order', () => {
    const places = morePlaces(TEXT, ['flood'], 120);
    expect(places.map((p) => TEXT.slice(p.start, p.start + 12))).toEqual(['flood the fa', 'flood of wat']);
    expect(places[0].clip).toContain('nor shall I flood the face');
    expect(places[1].clip).toContain('Be a flood of water which covers, But a flood of judgment');
  });

  it('never lists the hit the snippet already shows', () => {
    const shown = snippet(TEXT, ['flood'], 180);
    expect(shown).toContain('flooding rain');
    expect(morePlaces(TEXT, ['flood'], 120).some((p) => p.clip.includes('flooding rain'))).toBe(false);
  });

  it('counts a word and the longer forms the engine matched as ONE word', () => {
    // SrchCard highlights the query plus the engine's matched forms: flood + flooding.
    // Counted apart, the "flooding" hit was worth two words and every place holding
    // "flood" alone was filtered away as a partial match.
    const places = morePlaces(TEXT, ['flood', 'flooding'], 120);
    expect(places.map((p) => TEXT.slice(p.start, p.start + 5))).toEqual(['flood', 'flood']);
  });

  it('with two query words, keeps only the places that hold both', () => {
    const t = pad(3) + 'the flood came first. ' + pad(40) + 'a flood alone here. ' + pad(40)
      + 'a flood of judgment to destroy. ' + pad(40) + 'judgment alone. ' + pad(3);
    const places = morePlaces(t, ['flood', 'judgment'], 120);
    // the snippet shows the both-words window; nothing else holds both
    expect(snippet(t, ['flood', 'judgment'], 180)).toContain('flood of judgment');
    expect(places).toEqual([]);
  });

  it('counts an archaic form as its modern word ("thee" is "you")', () => {
    const t = pad(3) + 'I love you. ' + pad(40) + 'I have called thee by name. ' + pad(40) + 'you and thee both. ' + pad(3);
    const places = morePlaces(t, ['you'], 120);
    // one query word: every place is kept, whichever form it holds
    expect(places.map((p) => t.slice(p.start, p.start + 4))).toEqual(['thee', 'you ']);
  });

  it('returns nothing for no terms, no hits, or one hit', () => {
    expect(morePlaces(TEXT, [])).toEqual([]);
    expect(morePlaces(TEXT, ['zebra'])).toEqual([]);
    expect(morePlaces(pad(10) + 'one flood only. ' + pad(10), ['flood'])).toEqual([]);
  });

  it('starts every place on a word, so the landing excerpt reads from the hit', () => {
    for (const p of morePlaces(TEXT, ['flood'], 120)) {
      expect(TEXT.slice(p.start).startsWith('flood')).toBe(true);
    }
  });
});

/* sweep W33 (2026-10-13): a card the meaning search placed quotes the window that opens at its place (snippetAt), and
   its places list is every place but one that window's box already shows whole (refuter repros, round 1). */
describe('a placed card: snippetAt and morePlaces(..., shownAt)', () => {
  it('snippetAt opens at the place and closes between words, an ellipsis only where it cuts', () => {
    const t = 'Preface. Remember now your Creator in the days of your youth.';
    expect(snippetAt(t, 9, 30)).toBe('Remember now your Creator in…');
    expect(snippetAt(t, 9, 180)).toBe('Remember now your Creator in the days of your youth.');
    expect(snippetAt(t, 0, 180)).toBe(t);
  });
  it('a hit the box shows is not offered again', () => {
    const t = 'Preface. ' + 'alpha ' + 'x '.repeat(35) + 'alpha ' + 'x '.repeat(60);
    expect(morePlaces(t, ['alpha'], undefined, 9)).toEqual([]);
  });
  it('the words’ best place, only partly in the window, is offered whole, not split away', () => {
    const t = 'Preface. ' + 'x '.repeat(78) + 'alpha ' + 'x '.repeat(17) + 'beta gamma ' + 'x '.repeat(60);
    const p = morePlaces(t, ['alpha', 'beta', 'gamma'], undefined, 9);
    expect(p.map((x) => x.start)).toEqual([t.indexOf('alpha')]);
  });
  it('a card placed at the opening offers what lies past its window', () => {
    const t = 'alpha ' + 'x '.repeat(100) + 'beta';
    expect(morePlaces(t, ['beta'], undefined, 0).map((x) => x.start)).toEqual([t.indexOf('beta')]);
  });
});

describe('bestMatch counts word families, not highlight forms', () => {
  it('a longer matched form is not worth two words: the earliest window of the typed word wins', () => {
    const t = 'the flood rose. ' + 'and the word went on. '.repeat(20) + 'the flooding came, flooded and flooding. ';
    // Before: flood + flooding + flooded counted as three distinct terms, pulling the
    // snippet to the late cluster of longer forms and away from the plain word.
    expect(snippet(t, ['flood', 'flooding', 'flooded'], 60)).toContain('the flood rose');
  });
});

/* When the query's words never meet in a text, the passage worth showing is the
   one with the word that tells this text apart, not the first of a word it says
   everywhere (2026-09-26: "the lord is my shepherd" showed an Answers topic's
   first "Lord" and listed 23 more Lords, with its one "shepherd" nowhere). */
describe('the rarer word leads when the words never meet', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  const TOPIC = pad(2) + 'the Lord spoke. ' + pad(20) + 'the Lord came. ' + pad(20) + 'the Lord is near. '
    + pad(20) + 'He is our shepherd and guide. ' + pad(20) + 'the Lord reigns. ' + pad(2);

  it('the snippet shows the rarer word', () => {
    expect(snippet(TOPIC, ['lord', 'shepherd'], 120)).toContain('our shepherd');
  });

  it('the other places are the rarer word\'s, not every "Lord"', () => {
    const two = TOPIC + pad(20) + 'The good shepherd knows His own. ' + pad(2);
    const places = morePlaces(two, ['lord', 'shepherd'], 120);
    expect(places.map((p) => two.slice(p.start, p.start + 8))).toEqual(['shepherd']);
    expect(places[0].clip).toContain('good shepherd knows');
  });

  it('a word said 500 times cannot crowd the rarer one out of the scan', () => {
    const t = 'Lord, '.repeat(500) + 'my shepherd. ' + pad(3);
    expect(snippet(t, ['lord', 'shepherd'], 120)).toContain('my shepherd');
  });

  it('where the words DO meet, that passage still wins over the rare word alone', () => {
    const t = pad(2) + 'a shepherd alone. ' + pad(20) + 'the Lord is my shepherd. ' + pad(20) + 'the Lord. ' + pad(2);
    expect(snippet(t, ['lord', 'shepherd'], 120)).toContain('the Lord is my shepherd');
  });
});

describe('findPlaces — every place, the snippet\'s own included, with its hits', () => {
  it('lists each place in reading order with the hits it marks', () => {
    const t = 'a flooding rain. ' + 'and the word went on. '.repeat(10) + 'Be a flood of water which covers, But a flood of judgment.';
    const places = findPlaces(t, ['flood', 'flooding'], 120);
    expect(places.map((p) => p.hits.map((h) => t.slice(h.idx, h.idx + h.len)))).toEqual([['flooding'], ['flood', 'flood']]);
    expect(t.slice(places[1].start).startsWith('flood of water')).toBe(true);
  });

  it('is empty for no hits', () => {
    expect(findPlaces('nothing here', ['flood'])).toEqual([]);
  });
});

/* Review of 22419b59 (2026-09-26): a card's term list is the typed words first,
   then their synonyms and the engine's matched forms. Counted as separate words
   they skewed every rule that counts words; they are one word family, named by
   the typed word, which wins a tie. */
describe('synonyms, forms and archaic twins are one word with the word typed', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  let prev;
  beforeEach(() => { prev = window.VotSearchData; window.VotSearchData = { SYNONYM_MAP: { love: ['love', 'charity'], charity: ['love', 'charity'] } }; });
  afterEach(() => { window.VotSearchData = prev; });

  it('a synonym is not a rarer word: the snippet shows the word typed, and every place is kept', () => {
    const t = pad(2) + 'I love you. ' + pad(20) + 'love one another. ' + pad(20) + 'put on charity. ' + pad(20) + 'love is patient. ' + pad(20) + 'love never fails. ' + pad(2);
    expect(snippet(t, ['love', 'charity'], 120)).toContain('I love you');
    expect(findPlaces(t, ['love', 'charity'], 120)).toHaveLength(5);
    expect(morePlaces(t, ['love', 'charity'], 120).map((p) => p.clip.includes('charity') || p.clip.includes('love'))).toEqual([true, true, true, true]);
  });

  it('a back-form is not a rarer word: typed "wept" leads, and weep’s places stay', () => {
    const t = pad(2) + 'weep with those who weep. ' + pad(20) + 'weep not. ' + pad(20) + 'Jesus wept. ' + pad(20) + 'they weep. ' + pad(2);
    // typed wept, the engine's matched forms after it
    expect(snippet(t, ['wept', 'weep'], 120)).toContain('Jesus wept');
    expect(findPlaces(t, ['wept', 'weep'], 120)).toHaveLength(4);
  });

  it('the words that meet still win, and two different typed words still count as two', () => {
    const t = pad(2) + 'a charity alone. ' + pad(20) + 'love the brethren with charity and faith. ' + pad(20) + 'faith alone. ' + pad(2);
    // love (+ charity) and faith: two typed words
    expect(snippet(t, ['love', 'faith', 'charity'], 120)).toContain('love the brethren');
  });
});

describe('findPlaces never comes back empty when the words appear (review of 22419b59)', () => {
  it('a pair straddling a cut is still one place: lord at 0 and 100, shepherd at 130', () => {
    const t = 'Lord' + ' '.repeat(96) + 'Lord' + ' '.repeat(26) + 'shepherd.';
    const places = findPlaces(t, ['lord', 'shepherd'], 120);
    expect(places.length).toBeGreaterThan(0);
    expect(places.map((p) => p.hits.map((h) => t.slice(h.idx, h.idx + h.len)))).toEqual([['Lord', 'shepherd']]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   search200 B7 (the UX walk, 2026-10-17): the marks. A stop word the engine searches
   ("who") marked every word it starts ("whom", "whole"); the typed words in a row
   were marked word by word with gaps between; and an Answers topic's dateline
   ("7/5/10 From The Lord ... Ears to Hear"), which says "Lord" in every topic, was the
   snippet. These are the card's helpers: matchExcerpt (the engine's landing) is not
   the screen's to change. findPlaces (the reader's find bar) follows the marks since
   search200 UX D6: it counted "whom" for a typed "who".
   ─────────────────────────────────────────────────────────────────────── */
describe('search200 B7: marks for what was typed, a run as one, never a dateline', () => {
  /** @type {any} */ let prev;
  /** @type {any} */ let REAL;
  beforeAll(async () => {
    prev = window.VotSearchData;
    // @ts-ignore -- a classic script: it sets window.VotSearchData
    await import('../../search-data.js');
    REAL = window.VotSearchData;
  });
  beforeEach(() => { window.VotSearchData = REAL; });
  afterEach(() => { window.VotSearchData = prev; });
  afterAll(() => { window.VotSearchData = prev; });
  /** @param {string} t @param {string[]} terms @param {string[]} [typed] */
  const hits = (t, terms, typed) => highlightSpans(t, terms, typed).filter((s) => s.hit).map((s) => s.text);

  it('a word of the fuller stop list marks only itself: "who" never "whom" or "whole", "not" never "nothing"', () => {
    expect(hits('Who is he whom you seek? The whole of it, whose it is, who knows.', ['who'])).toEqual(['Who', 'who']);
    expect(hits('not one thing, nothing', ['not'])).toEqual(['not']);
    expect(hits('However the howling, how long', ['how'])).toEqual(['how']);
    // a content word still marks its forms
    expect(hits('He loves and is beloved; love', ['love'])).toEqual(['loves', 'love']);
  });

  /* search200 UX D6: the reader's find bar in a letter opened from a lone "who" marked and counted "whom" and
     "whoever" (D:/Swarm/lanes/search200/out/ux/fix-D/find6-before.log), words its card left unmarked. Its
     places hold the words as the card marks them. */
  it('D6: the find bar counts a word of the fuller stop list only as itself, as the card marks it', () => {
    // the whole word each hit starts
    const words = (/** @type {string} */ t, /** @type {string[]} */ terms) => findPlaces(t, terms, 120)
      .flatMap((p) => p.hits.map((h) => (t.slice(h.idx).match(/^[\p{L}\p{N}]+/u) || [''])[0]));
    const t = 'Who is he whom you seek? ' + 'word '.repeat(40) + 'Whoever will, come. ' + 'word '.repeat(40) + 'And who knows?';
    expect(words(t, ['who'])).toEqual(['Who', 'who']);
    // a content word still finds its forms
    expect(words('He loves them. ' + 'word '.repeat(40) + 'Beloved, love one another.', ['love'])).toEqual(['loves', 'love']);
  });

  it('the typed words in a row are one mark, joined by spaces or by small words', () => {
    expect(highlightSpans('He leads me beside the still waters.', ['still', 'waters'])).toEqual([
      { text: 'He leads me beside the ', hit: false },
      { text: 'still waters', hit: true },
      { text: '.', hit: false },
    ]);
    expect(hits('Now faith is the substance of things hoped for', ['faith', 'substance'])).toEqual(['faith is the substance']);
  });

  it('but not across punctuation, a word not typed, or more than three small words', () => {
    expect(hits('the waters, still and deep', ['waters', 'still'])).toEqual(['waters', 'still']);
    expect(hits('love the Lord your God', ['love', 'god'])).toEqual(['love', 'God']);
    expect(hits('faith and it is the substance', ['faith', 'substance'])).toEqual(['faith', 'substance']);
    // one word said twice is no run
    expect(hits('He loved them and loves them still', ['love'])).toEqual(['loved', 'loves']);
  });

  /* search200 UX D8: one word said twice with only a space between was one mark, as if typed twice in a row:
     "sleep drunken" marked "sleep sleep" whole in KJV 1 Thessalonians 5:7 and "drunken are drunken" as two
     (D:/Swarm/lanes/search200/out/ux/fix-D/join8-before.log). It is two marks, by space or small word alike. */
  it('D8: one word said twice with only a space between is two marks, as across a small word', () => {
    const v = 'For they that sleep sleep in the night; and they that be drunken are drunken in the night.';
    expect(hits(v, ['sleep', 'drunken'])).toEqual(['sleep', 'sleep', 'drunken', 'drunken']);
    expect(hits('a thousand thousand men', ['thousand'])).toEqual(['thousand', 'thousand']);
    // two different typed words still join across a space
    expect(hits('He leads me beside the still waters.', ['still', 'waters'])).toEqual(['still waters']);
  });

  /* search200 UX D8: a mark bridged words never typed. A hit was "which typed word" by the longest term it
     starts with, so two forms or a synonym of ONE typed word read as two words in a row and joined across small
     words: "holy" marked "Holiest of Holies", "blessed" "Blessed are those who Bless", "righteous" "just as He is
     righteous" (D:/Swarm/lanes/search200/out/ux/fix-D/bridge8-before.log). A hit is its word's family: the
     word typed, its forms, its synonyms and archaic twins (familiesOf), and one family twice is no run. */
  it('D8: the forms and synonyms of one typed word are one word: no run joins them across words never typed', () => {
    // the card's terms: the typed word, its synonyms, then the engine's matched forms; its typed list: the
    // typed word and its synonyms (SearchScreen expandSnippetTerms)
    expect(hits('He loved them and loves them still', ['love', 'charity', 'agape', 'loved', 'loves'], ['love', 'charity', 'agape'])).toEqual(['loved', 'loves']);
    expect(hits('Beloved, love and charity are one', ['love', 'charity', 'agape'])).toEqual(['love', 'charity']);
    expect(hits('into the Holiest of Holies', ['holy', 'holiest', 'holies'], ['holy'])).toEqual(['Holiest', 'Holies']);
    expect(hits('Blessed are those who Bless', ['blessed', 'bless'], ['blessed'])).toEqual(['Blessed', 'Bless']);
    expect(hits('just as He is righteous', ['righteous', 'righteousness', 'just', 'justified', 'justification'])).toEqual(['just', 'righteous']);
    // two typed words, each with its forms, still read as one run
    expect(hits('the still waters', ['still', 'waters', 'water'])).toEqual(['still waters']);
    expect(hits('Now faith is the substance of things', ['faith', 'substance', 'faithful'])).toEqual(['faith is the substance']);
  });

  /* search200 UX D8 review (of 9ed4911fb): a hit as its word's family split the typed words in a row when two of
     them are forms of one word: "king of kings" marked "KING" and "KINGS" apart in Revelation 19:16, and "lord of
     lords", "God of gods", "song of songs", "vanity of vanities" alike, on the snippet, the headline and the
     places' clips (D:/Swarm/lanes/search200/out/ux/fix-D/kings8d-before.log). A word the reader typed is its own
     word; only what search added for it (its forms, and the synonym table's words that ride the typed list)
     folds into it. */
  it('D8 review: two typed forms of one word in a row are one mark; what search added for a typed word still folds', () => {
    // the card's typed list: the reader's words, the small ones dropped, then the synonym table's ("king": ruler, monarch, sovereign)
    const kings = ['king', 'kings', 'lord', 'lords', 'ruler', 'monarch', 'sovereign'];
    expect(hits('a name written: KING OF KINGS AND LORD OF LORDS.', kings.concat(['kingdom']), kings)).toEqual(['KING OF KINGS AND LORD OF LORDS']);
    const ecc = '“Vanity of vanities,” says the Preacher; “Vanity of vanities! All is vanity.”';
    expect(hits(ecc, ['vanity', 'vanities'], ['vanity', 'vanities'])).toEqual(['Vanity of vanities', 'Vanity of vanities', 'vanity']);
    expect(hits('The song of songs, which is Solomon’s.', ['song', 'songs'], ['song', 'songs'])).toEqual(['song of songs']);
    expect(hits('into the Holy of Holies', ['holy', 'holies', 'holiest'], ['holy', 'holies'])).toEqual(['Holy of Holies']);
    // no typed list: the terms are the typed words
    expect(hits('the God of gods', ['god', 'gods'])).toEqual(['God of gods']);
    // what search added for one typed word is still that word: no run across words never typed
    expect(hits('into the Holiest of Holies', ['holy', 'holiest', 'holies'], ['holy'])).toEqual(['Holiest', 'Holies']);
    const righteous = ['righteous', 'righteousness', 'just', 'justified', 'justification'];
    expect(hits('just as He is righteous', righteous, righteous)).toEqual(['just', 'righteous']);
    expect(hits('He loved them and loves them still', ['love', 'charity', 'agape', 'loved', 'loves'], ['love', 'charity', 'agape']))
      .toEqual(['loved', 'loves']);
  });

  it('a small word the engine matched marks only beside a typed word, once a real word was typed', () => {
    const job = 'He sets on high those who are lowly, And those who mourn are lifted to safety.';
    // the card's terms: the typed real word, then the engine's matched forms ("who")
    const typedMourn = highlightSpans(job, ['mourn', 'who'], ['mourn']).filter((s) => s.hit).map((s) => s.text);
    expect(typedMourn).toEqual(['who mourn']);
    const rock = 'A rock of offense which can not be broken, A stone which can not be moved';
    expect(highlightSpans(rock, ['rock', 'moved', 'which', 'can'], ['rock', 'moved']).filter((s) => s.hit).map((s) => s.text))
      .toEqual(['rock', 'which can not be moved']);
    // only small words typed ("who"): they are the search, and every form the engine matched marks
    expect(highlightSpans('Who knows? The one whom you seek', ['who', 'whom'], ['who']).filter((s) => s.hit).map((s) => s.text)).toEqual(['Who', 'whom']);
    // no typed list: the terms are the typed words
    expect(hits(job, ['mourn', 'who'])).toEqual(['who mourn']);
    // the unmarked text reads whole
    expect(highlightSpans(job, ['mourn', 'who'], ['mourn']).map((s) => s.text).join('')).toBe(job);
  });

  const HEAD = '7/5/10 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For All Those Who Have Ears to Hear ';
  const HEAD2 = '2/17/06 From YahuShua HaMashiach, Our Lord and Savior The Word of The Lord Spoken to Timothy For The Lord’s Little Flock, and For All Those Who Have Ears to Hear ';
  const pad = (/** @type {number} */ n) => 'and the word went on. '.repeat(n);
  const TOPIC = HEAD + 'Behold, little children, ' + pad(6) + 'the day of the Lord is near, and My people shall hear. ' + pad(30)
    + '~ [From “The Alarm of War” ~ Volume 7] ' + HEAD2 + pad(6) + 'Return to the Lord your God while He may be found. ' + pad(4);

  it('an Answers dateline is not the snippet: the words where the topic says them', () => {
    const out = snippet(TOPIC, ['lord'], 120);
    expect(out).toContain('day of the Lord');
    expect(out).not.toContain('Spoken to Timothy');
    // no word met: the topic opens after its dateline, and so does a card that lands at its top
    expect(snippet(TOPIC, ['zebra'], 60).startsWith('Behold')).toBe(true);
    expect(snippetAt(TOPIC, 0, 60).startsWith('Behold')).toBe(true);
    // the dateline alone says it: then it is the place
    expect(snippet(HEAD + 'Behold. ' + pad(3), ['timothy'], 120)).toContain('Timothy');
  });

  it('a hit right after a dateline: the window opens past it, not on its tail', () => {
    const t = HEAD + 'Thus says The Lord: ' + pad(10);
    const out = snippet(t, ['lord'], 120);
    expect(out).toContain('Thus says The Lord');
    expect(out).not.toContain('Ears to Hear');
    expect(out.replace(/^…/, '').startsWith('Thus says')).toBe(true);
  });

  it('a window does not run on into the next dateline', () => {
    const t = HEAD + pad(10) + 'the Lord is near. ' + HEAD2 + pad(10);
    const out = snippet(t, ['lord'], 160);
    expect(out).toContain('the Lord is near');
    expect(out).not.toContain('2/17/06');
    expect(out).not.toContain('YahuShua');
  });

  it('the other dateline shapes the topics use: one closing on "Spoken to Timothy", one "from Timothy"', () => {
    const short = '10/7/04 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy ';
    const exhort = '1/18/06 An Exhortation from Timothy For All Those Who Have Ears to Hear ';
    for (const head of [short, exhort]) {
      const t = pad(8) + 'the Lord is near. ' + pad(1) + head + 'Behold, ' + pad(8);
      const out = snippet(t, ['lord', 'timothy'], 200);
      expect(out, head).toContain('the Lord is near');
      expect(out, head).not.toMatch(/\d+\/\d+\/\d+/);
      expect(out, head).not.toContain('Timothy');
    }
    // a dateline needs "from" near its date: a date in a sentence is words
    const said = pad(3) + 'On 3/4/05 the Lord spoke to Timothy, saying: ' + pad(3);
    expect(snippet(said, ['timothy'], 120)).toContain('3/4/05 the Lord spoke to Timothy');
  });

  it('the topic’s title line before its first dateline is heading, not content', () => {
    const t = 'The Name of The Lord ' + HEAD + 'Behold, ' + pad(6) + 'call upon the name of the Lord in one accord. ' + pad(6);
    const out = snippet(t, ['lord'], 120);
    expect(out).toContain('name of the Lord in one accord');
    expect(out).not.toContain('7/5/10');
    expect(snippet(t, ['zebra'], 60).startsWith('Behold')).toBe(true);
  });

  it('the places a card lists are never a dateline', () => {
    const clips = morePlaces(TOPIC, ['lord'], 120).map((p) => p.clip);
    expect(clips.length).toBeGreaterThan(0);
    for (const c of clips) expect(c, c).not.toContain('Spoken to Timothy');
    expect(clips.some((c) => c.includes('Return to the Lord'))).toBe(true);
  });

  // matchExcerpt is the engine's (engine.js lands and ranks by it): the screen's marks must not move the search
  it('the engine’s landing is left as it was', () => {
    expect(matchExcerpt(TOPIC, ['lord']).startsWith('Lord, Our God')).toBe(true);
  });
});

/* search200 bugcheck #6: find in page stopped at 400 hits of a word (the snippet's cap for long bodies), so the
   pill could never step past the 400th place of a word a long topic says more often. */
describe('findPlaces: no cap on the hits find in page steps through', () => {
  it('finds every one of 450 hits of a word', () => {
    const t = Array.from({ length: 450 }, (_, i) => 'And the flood came on day ' + i + '.').join(' ');
    const hits = findPlaces(t, ['flood'], 120).reduce((a, p) => a + p.hits.length, 0);
    expect(hits).toBe(450);
  });
});
