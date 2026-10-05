/* passage-copy (cp1) — what a copied passage says and where it is from.
   A reader copied John 7:37-39 and pasted "37On the last day, ..." with no
   reference, then typed "John 7:37-39" by hand. These pin the shape a copy
   takes on every reading surface: a verse per line, its number and a space,
   footnote digits and icons left out, and the reference on the last line. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { passageCopy, passageLabel, passageReference, readingBlocksIn, isVerseKey, translationTag, sheetReference, quotedPassage } from './passage-copy.js';

const V37 = 'On the last day, that great day of the feast, YahuShua stood and cried out, saying, “If anyone thirsts, let him come to Me and drink.';
const V38 = 'He who believes in Me, as the Scripture has said, out of his heart will flow rivers of living water.”';
const V39 = 'But this He spoke concerning the Spirit, whom those believing in Him would receive; for the Holy Spirit was not yet given, because YahuShua was not yet glorified.';

const g = /** @type {any} */ (globalThis);

beforeEach(() => {
  g._bookTitle = (/** @type {string} */ id) => ({ john: 'John', psalms: 'Psalms', 'matthew-plain': 'Matthew' })[id] || id;
  g.StateStore = { get: () => ({ settings: { translation: 'rnkjv' } }) };
  g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'rnkjv', label: 'NKJV-R' }, { id: 'kjv', label: 'KJV' }];
  g.findEntryContext = (/** @type {string} */ id) => ({
    'the-wide-path': { title: 'The Wide Path', collection: 'Volume Two', screen: 'vot-letter' },
    'faith': { title: 'Faith', collection: 'Words To Live By: Part One', screen: 'wtlb-one-entry' },
    'manna-1': { title: 'The Bread of Life', collection: 'Hidden Manna', screen: 'hm-letter' },
  })[id] || null;
});

afterEach(() => {
  document.body.innerHTML = '';
  delete g._bookTitle; delete g.StateStore; delete g.TRANSLATION_OPTIONS; delete g.findEntryContext;
});

/** BibleChapterView's verse markup: the number is a gutter <span> beside the
    verse's [data-hl-key] block, then the link/bookmark icons and a space.
    @param {Array<[number, string]>} verses @param {string} [bookCh] */
function bibleChapter(verses, bookCh = 'john:7') {
  const wrap = document.createElement('div');
  wrap.className = 'verses-block';
  wrap.innerHTML = verses.map(([n, t]) =>
    `<span id="v-${n}" class="verse"><span class="verse-num">${n}</span><span data-hl-key="bible:${bookCh}:${n}">${t}</span><span class="verse-link-icon"><svg></svg></span> </span>`,
  ).join('');
  document.body.appendChild(wrap);
  return wrap;
}
/** @param {string} key */
const block = (key) => /** @type {Element} */ (document.querySelector(`[data-hl-key="${key}"]`));
/** @param {Element} el */
const lastText = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n = null, t; while ((t = w.nextNode())) n = t; return /** @type {Text} */ (n); };
/** @param {Node} sn @param {number} so @param {Node} en @param {number} eo */
function range(sn, so, en, eo) { const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo); return r; }

describe('passageCopy — a Bible passage (the reader\'s John 7:37-39)', () => {
  it('selected from the verse number: a verse per line, "37 On", and the reference with the translation', () => {
    bibleChapter([[36, 'What is this thing?'], [37, V37], [38, V38], [39, V39], [40, 'Therefore many...']]);
    const num37 = /** @type {Node} */ (document.querySelector('#v-37 .verse-num')?.firstChild);
    const end = lastText(block('bible:john:7:39'));
    const out = /** @type {any} */ (passageCopy(range(num37, 0, end, end.length)));
    expect(out.text).toBe(`"37 ${V37}\n38 ${V38}\n39 ${V39}"\n\nJohn 7:37-39 (NKJV-R)`);
    expect(out.keys).toEqual(['bible:john:7:37', 'bible:john:7:38', 'bible:john:7:39']);
    expect(out.isPublic).toBe(true);
  });

  it('selected from the first WORD of a verse (the number is in the gutter): every line is still numbered', () => {
    bibleChapter([[37, V37], [38, V38], [39, V39]]);
    const start = /** @type {Node} */ (block('bible:john:7:37').firstChild);
    const end = lastText(block('bible:john:7:39'));
    expect(/** @type {any} */ (passageCopy(range(start, 0, end, end.length))).text)
      .toBe(`"37 ${V37}\n38 ${V38}\n39 ${V39}"\n\nJohn 7:37-39 (NKJV-R)`);
  });

  it('started mid-verse: that part-verse has no number, the rest do, and the reference still names it', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const start = /** @type {Node} */ (block('bible:john:7:37').firstChild);
    const end = lastText(block('bible:john:7:38'));
    const out = /** @type {any} */ (passageCopy(range(start, V37.indexOf('YahuShua'), end, end.length)));
    expect(out.text).toBe(`"${V37.slice(V37.indexOf('YahuShua'))}\n38 ${V38}"\n\nJohn 7:37-38 (NKJV-R)`);
  });

  it('one verse (cp4): the words quoted, a blank line, the reference; no number even when the number was selected', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const t = /** @type {Node} */ (block('bible:john:7:38').firstChild);
    expect(/** @type {any} */ (passageCopy(range(t, 0, t, 15))).text).toBe('"He who believes"\n\nJohn 7:38 (NKJV-R)');
    const num = /** @type {Node} */ (document.querySelector('#v-38 .verse-num')?.firstChild);
    expect(/** @type {any} */ (passageCopy(range(num, 0, t, 15))).text).toBe('"He who believes"\n\nJohn 7:38 (NKJV-R)');
  });

  it('a start dropped between the digits of a number still copies the whole number', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const num = /** @type {Node} */ (document.querySelector('#v-37 .verse-num')?.firstChild);
    const end = lastText(block('bible:john:7:38'));
    expect(/** @type {any} */ (passageCopy(range(num, 1, end, end.length))).text.startsWith('"37 On the last day')).toBe(true);
  });

  it('numbers: false gives the words alone, a verse per line, with the reference apart', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const num37 = /** @type {Node} */ (document.querySelector('#v-37 .verse-num')?.firstChild);
    const end = lastText(block('bible:john:7:38'));
    const out = /** @type {any} */ (passageCopy(range(num37, 0, end, end.length), { numbers: false }));
    expect(out.body).toBe(`${V37}\n${V38}`);
    expect(out.reference).toBe('John 7:37-38 (NKJV-R)');
    expect(out.keys[0]).toBe('bible:john:7:37');
  });

  it('an end resting on the NEXT verse\'s number leaves that verse (and its number) out', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const start = /** @type {Node} */ (block('bible:john:7:37').firstChild);
    const num38 = /** @type {Node} */ (document.querySelector('#v-38 .verse-num')?.firstChild);
    expect(/** @type {any} */ (passageCopy(range(start, 0, num38, 2))).text).toBe(`"${V37}"\n\nJohn 7:37 (NKJV-R)`);
  });

  it('a range across chapters is named as one: "John 7:53-8:1"', () => {
    const a = bibleChapter([[53, 'And everyone went to his own house.']], 'john:7');
    const b = bibleChapter([[1, 'But Jesus went to the Mount of Olives.']], 'john:8');
    const out = /** @type {any} */ (passageCopy(range(a, 0, b, b.childNodes.length)));
    expect(out.text).toBe('"53 And everyone went to his own house.\n1 But Jesus went to the Mount of Olives."\n\nJohn 7:53-8:1 (NKJV-R)');
  });

  it('footnote digits, note icons and link icons never reach the clipboard', () => {
    bibleChapter([[1, 'In the beginning']]);
    const b1 = block('bible:john:7:1');
    b1.innerHTML = 'In the <mark class="hl-mark">beginning</mark><span class="fn-ref">3</span> was<span class="hl-note-icon" data-hl-key="bible:john:7:1"><svg></svg></span> the Word';
    const out = /** @type {any} */ (passageCopy(range(b1, 0, b1, b1.childNodes.length)));
    expect(out.text).toBe('"In the beginning was the Word"\n\nJohn 7:1 (NKJV-R)');
    expect(out.keys).toEqual(['bible:john:7:1']);
  });
});

describe('passageCopy — letters and poems', () => {
  function letter() {
    const body = document.createElement('div');
    body.className = 'letter-body';
    body.innerHTML =
      '<p class="letter-para" data-hl-key="letter:the-wide-path:0">Hear the Word of The Lord.<span class="fn-ref">1</span></p>' +
      '<h2 class="study-heading">A heading between</h2>' +
      '<div class="letter-poetry" data-hl-key="letter:the-wide-path:1"><div class="poetry-line">Therefore, turn from this</div><div class="poetry-line">Wicked way you have chosen!<span class="fn-ref">2</span></div></div>';
    document.body.appendChild(body);
    return body;
  }

  it('paragraphs a blank line apart, a poem a line per line, the heading left out, the letter named with its volume', () => {
    const body = letter();
    const out = /** @type {any} */ (passageCopy(range(body, 0, body, body.childNodes.length)));
    expect(out.text).toBe('"Hear the Word of The Lord.\n\nTherefore, turn from this\nWicked way you have chosen!"\n\nThe Wide Path (Volume Two)\n'
      + 'https://www.thevolumesoftruth.com/The_Wide_Path');
  });

  it('<br> soft breaks (WTLB) are line breaks, not glued words', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'wtlb:faith:2');
    p.innerHTML = 'Take your every thought captive<br><br>That you may be set apart';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, p.childNodes.length))).text)
      .toBe('"Take your every thought captive\n\nThat you may be set apart"\n\nFaith (Words To Live By: Part One)\n'
        + 'https://www.thevolumesoftruth.com/Words_To_Live_By:_Part_One#Faith');
  });

  it('a verse number inside a quoted poem line gets its space too', () => {
    const c = document.createElement('div');
    c.setAttribute('data-hl-key', 'letter:the-wide-path:3');
    c.innerHTML = '<div class="poem-line"><span class="verse-num">18</span>If anyone adds to these words,</div>';
    document.body.appendChild(c);
    expect(/** @type {any} */ (passageCopy(range(c, 0, c, c.childNodes.length))).text.split('\n')[0]).toBe('"18 If anyone adds to these words,"');
  });

  it('Hidden Manna is named by its title alone', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'letter:manna-1:0');
    p.textContent = 'I AM the Bread of Life.';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, 1))).text)
      .toBe('"I AM the Bread of Life."\n\nThe Bread of Life\nhttps://www.thevolumesoftruth.com/The_Bread_of_Life');
  });

  it('the reader\'s own journal: the words alone, and not public (the browser keeps its own copy)', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'journal:e1:b1');
    p.textContent = 'What I learned today';
    document.body.appendChild(p);
    const out = /** @type {any} */ (passageCopy(range(p, 0, p, 1)));
    expect(out.text).toBe('What I learned today');
    expect(out.isPublic).toBe(false);
  });

  it('text outside every reading block copies nothing of ours', () => {
    const d = document.createElement('div');
    d.textContent = 'Settings';
    document.body.appendChild(d);
    expect(passageCopy(range(d, 0, d, 1))).toBeNull();
  });
});

describe('readingBlocksIn — only the page the reader is on', () => {
  it('a select-all never reaches the swipe previews (inert clones of the neighbouring chapters)', () => {
    const peek = document.createElement('div');
    peek.className = 'pager-peek pager-peek-prev';
    peek.setAttribute('inert', '');
    peek.innerHTML = '<span data-hl-key="bible:john:6:71">He spoke of Judas.</span>';
    document.body.appendChild(peek);
    bibleChapter([[1, 'After these things']]);
    const all = range(document.body, 0, document.body, document.body.childNodes.length);
    expect(readingBlocksIn(all).map((e) => e.getAttribute('data-hl-key'))).toEqual(['bible:john:7:1']);
    expect(/** @type {any} */ (passageCopy(all)).text).toBe('"After these things"\n\nJohn 7:1 (NKJV-R)');
  });
});

describe('labels', () => {
  it('ranges take the ASCII hyphen (Permanent Rule 1)', () => {
    expect(passageLabel('bible:john:3:16', 'bible:john:3:18')).toBe('John 3:16-18');
    expect(passageLabel('bible:john:3:36', 'bible:john:4:2')).toBe('John 3:36-4:2');
    expect(passageLabel('study:matthew-5:3', 'study:matthew-5:5')).toBe('Matthew 5:3-5');
    expect(passageLabel('study:matthew-5:48', 'study:matthew-6:2')).toBe('Matthew 5:48-6:2');
  });

  it('a study note is a paragraph, not a verse', () => {
    expect(isVerseKey('study:matthew-5:12')).toBe(true);
    expect(isVerseKey('study:matthew-5:12-s0')).toBe(false);
    expect(passageReference(['study:matthew-5:12-s0'])).toBe('Matthew 5:12 (study note)');
  });

  it('the translation is the reader\'s, read from Settings at the copy; unknown settings claim nothing', () => {
    expect(translationTag('bible:john:3:16')).toBe(' (NKJV-R)');
    g.StateStore = { get: () => ({ settings: { translation: 'kjv' } }) };
    expect(translationTag('bible:john:3:16')).toBe(' (KJV)');
    expect(translationTag('letter:x:1')).toBe('');
    delete g.StateStore;
    expect(translationTag('bible:john:3:16')).toBe('');
  });

  /* cp1 follow-up: Matthew is "matthew-plain" in the Bible reader, and the old
     rule (no tag for an id with a '-', meant for TSOT Matthew) dropped its tag. */
  it('Matthew in the Bible reader names the translation too; a book the reader does not translate does not', () => {
    g.BIBLE_BOOK_LIST = [{ id: 'john', title: 'John' }, { id: 'matthew-plain', title: 'Matthew' }];
    try {
      expect(translationTag('bible:matthew-plain:5:16')).toBe(' (NKJV-R)');
      expect(translationTag('bible:matthew-tsot:5:16')).toBe('');
      expect(passageReference(['bible:matthew-plain:5:3', 'bible:matthew-plain:5:5'])).toBe('Matthew 5:3-5 (NKJV-R)');
    } finally { delete g.BIBLE_BOOK_LIST; }
  });

  it('the Matthew Study Bible is named as itself, whatever Settings say (its words do not change with them)', () => {
    expect(passageReference(['study:matthew-5:3', 'study:matthew-5:5'])).toBe('Matthew 5:3-5 (Study Bible)');
    expect(passageReference(['study:matthew-5'])).toBe('Matthew 5 (Study Bible)');
  });

  it('a whole chapter (a page\'s own key) is named with its translation', () => {
    expect(passageReference(['bible:john:7'])).toBe('John 7 (NKJV-R)');
  });

  it('cp4: copied words are quoted once; words already one quotation are not quoted twice', () => {
    expect(quotedPassage('He who believes')).toBe('"He who believes"');
    expect(quotedPassage('"Fear not, little flock"')).toBe('"Fear not, little flock"');
    expect(quotedPassage('\u201CFear not\u201D')).toBe('\u201CFear not\u201D');
    expect(quotedPassage('"Come," He said, "and see"')).toBe('""Come," He said, "and see""');
    expect(quotedPassage('  ')).toBe('');
  });

  it('a sheet names its NKJV verse, or keeps the translation its reference already names', () => {
    expect(sheetReference('John 3:16')).toBe('John 3:16 (NKJV)');
    expect(sheetReference('John 14:6 (KJV)')).toBe('John 14:6 (KJV)');
    expect(sheetReference('')).toBe('');
  });
});

/* cp1 follow-up, Corbin: "It should always append the highlighted section name
   and range and detect what translation is currently selected in settings". */
describe('passageCopy — always ends with where the words are from', () => {
  it('a heading copied alone names its chapter and the Settings translation', () => {
    const body = document.createElement('div');
    body.className = 'chapter-body';
    body.setAttribute('data-copy-key', 'bible:john:7');
    body.innerHTML = '<div class="section-heading">Rivers of Living Water</div>';
    document.body.appendChild(body);
    const h = /** @type {Element} */ (body.firstElementChild);
    expect(/** @type {any} */ (passageCopy(range(h, 0, h, 1))).text).toBe('"Rivers of Living Water"\n\nJohn 7 (NKJV-R)');
  });

  it('a footnote sheet\'s verses keep their numbers apart ("19 For", not "19For") and name themselves', () => {
    const v = document.createElement('div');
    v.className = 'fn-sheet-verse';
    v.setAttribute('data-copy-ref', 'John 3:19-20 (NKJV)');
    v.innerHTML = '<span><span><sup class="verse-sup">19</sup>And this is the condemnation. </span><span><sup class="verse-sup">20</sup>For everyone practicing evil hates the light.</span></span>';
    document.body.appendChild(v);
    expect(/** @type {any} */ (passageCopy(range(v, 0, v, v.childNodes.length))).text)
      .toBe('"19 And this is the condemnation. 20 For everyone practicing evil hates the light."\n\nJohn 3:19-20 (NKJV)');
    // A sheet's one verse is named by its reference alone (cp4).
    const one = document.createElement('div');
    one.setAttribute('data-copy-ref', 'John 3:16 (NKJV)');
    one.innerHTML = '<span><sup class="verse-sup">16</sup>For God so loved the world</span>';
    document.body.appendChild(one);
    expect(/** @type {any} */ (passageCopy(range(one, 0, one, one.childNodes.length))).text)
      .toBe('"For God so loved the world"\n\nJohn 3:16 (NKJV)');
  });

  it('a block whose entry cannot be named still carries its page\'s name', () => {
    const page = document.createElement('div');
    page.className = 'page-wrapper';
    page.setAttribute('data-copy-key', 'letter:the-wide-path');
    page.innerHTML = '<p data-hl-key="letter:unknown-card:3">Hear the Word of The Lord.</p>';
    document.body.appendChild(page);
    const p = /** @type {Element} */ (page.firstElementChild);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, 1))).text)
      .toBe('"Hear the Word of The Lord."\n\nThe Wide Path (Volume Two)\nhttps://www.thevolumesoftruth.com/The_Wide_Path');
  });

  it('a control\'s label inside a sheet is not the passage', () => {
    const v = document.createElement('div');
    v.setAttribute('data-copy-ref', 'John 3:16 (NKJV)');
    v.innerHTML = '<span>For God so loved the world</span><button>Go to John 3:16</button>';
    document.body.appendChild(v);
    expect(/** @type {any} */ (passageCopy(range(v, 0, v, v.childNodes.length))).text).toBe('"For God so loved the world"\n\nJohn 3:16 (NKJV)');
  });

  it('the reader\'s journal gets no page name even inside a named page', () => {
    const page = document.createElement('div');
    page.setAttribute('data-copy-key', 'letter:the-wide-path');
    page.innerHTML = '<p data-hl-key="journal:e1:b1">What I learned today</p>';
    document.body.appendChild(page);
    const p = /** @type {Element} */ (page.firstElementChild);
    const out = /** @type {any} */ (passageCopy(range(p, 0, p, 1)));
    expect(out.text).toBe('What I learned today');
    expect(out.isPublic).toBe(false);
  });
});

/* cp2 (Corbin 2026-09-27): a copy from the Volumes of Truth ends with the
   letter's name AND the closest link to it on thevolumesoftruth.com, so a
   reader pasting it never hunts for the link: the letter's page (or its
   section of a compilation page) and the copied words as a text fragment. */
describe('passageCopy — the link to the passage on thevolumesoftruth.com', () => {
  const SITE = 'https://www.thevolumesoftruth.com/';
  const ABORTION = {
    siteUrl: 'https://answersonlygodcangive.com/Thus_Says_The_Lord_Regarding_Abortion',
    paragraphs: [
      { align: 'justify', text: 'WOE TO THOSE WHO HARM THE LITTLE ONES!' },
      { align: 'justify', text: 'Therefore, thus says The Lord: The murder of the innocent leads to the death of the guilty.' },
      { align: 'right', text: '~ [From “Abortion: Murder of the Innocent” ~ Volume 2]' },
      { align: 'center', text: '✦' },
      { align: 'justify', text: 'Another passage from Pentecost.' },
      { align: 'right', text: '~ [From “Pentecost” ~ Volume 6]' },
    ],
  };
  beforeEach(() => {
    // These pin the quote itself: Highlight the Passage on (cp3; off by default, see below).
    g.StateStore = { get: () => ({ settings: { translation: 'rnkjv', linkHighlight: true } }) };
    const base = g.findEntryContext;
    g.findEntryContext = (/** @type {string} */ id, /** @type {string} */ kind) => ({
      abortion: { kind: 'wtlb', screen: 'answers-entry', collection: 'Answers Only God Can Give', title: 'Thus Says The Lord Regarding Abortion', entry: ABORTION },
      'embracing-the-gift': { kind: 'holy-days', screen: 'holy-days-entry', collection: 'Regarding The Holy Days', title: 'Embracing The Gift', entry: { type: 'wtlb', sourceLabel: 'Words To Live By: Part One' } },
      'purity-ch1': { kind: 'study-letter', screen: 'bible-study-chapter', collection: 'Purity - Bible/Letter Study', title: 'Purity Part One: Purity is Important to God' },
    })[id] || base(id, kind);
  });
  /** @param {string} id @param {string[]} texts */
  function topic(id, texts) {
    const page = document.createElement('div');
    page.innerHTML = texts.map((t, i) => `<p data-hl-key="wtlb:${id}:${i}">${t}</p>`).join('');
    document.body.appendChild(page);
    return page;
  }

  it('a letter: its name, then its page quoting the first and last words; a cut word and a footnote mark are never quoted', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'letter:the-wide-path:4');
    p.innerHTML = 'Beloved, walk the narrow way.<span class="fn-ref">3</span> Few are they who find it.';
    document.body.appendChild(p);
    const out = /** @type {any} */ (passageCopy(range(/** @type {Node} */ (p.firstChild), 1, lastText(p), lastText(p).length)));
    expect(out.body).toBe('eloved, walk the narrow way. Few are they who find it.');
    expect(out.reference).toBe('The Wide Path (Volume Two)');
    // "eloved," is not a word the page has; "way. Few" runs across the site's "[3]".
    expect(out.link).toBe(SITE + 'The_Wide_Path#:~:text=walk%20the%20narrow%20way.,they%20who%20find%20it%2E');
    expect(out.text).toBe('"' + out.body + '"\n\n' + out.reference + '\n' + out.link);
  });

  it('marks left alone past a footnote ("dunghill³...") are not quoted: the quote ends on words', () => {
    const c = document.createElement('div');
    c.setAttribute('data-hl-key', 'letter:the-wide-path:3');
    c.innerHTML = '<div class="poetry-line">He who raises the poor from the dust</div><div class="poetry-line">And lifts the needy out of the dunghill<span class="fn-ref">3</span>...</div>';
    document.body.appendChild(c);
    expect(/** @type {any} */ (passageCopy(range(c, 0, c, c.childNodes.length))).link)
      .toBe(SITE + 'The_Wide_Path#:~:text=He%20who%20raises%20the,out%20of%20the%20dunghill');
  });

  it('the Bible has no page on the site: a verse keeps its reference alone', () => {
    const w = bibleChapter([[16, 'For God so loved the world']], 'john:3');
    const out = /** @type {any} */ (passageCopy(range(w, 0, w, w.childNodes.length)));
    expect(out.link).toBe('');
    expect(out.text).toBe('"For God so loved the world"\n\nJohn 3:16 (NKJV-R)');
  });

  it('a Holy Days entry taken from Words To Live By links to its section there', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'wtlb:embracing-the-gift:0');
    p.textContent = 'Receive the gift.';
    document.body.appendChild(p);
    const out = /** @type {any} */ (passageCopy(range(p, 0, p, 1)));
    expect(out.reference).toBe('Embracing The Gift (Regarding The Holy Days)');
    expect(out.link).toBe(SITE + 'Words_To_Live_By:_Part_One#Embracing_The_Gift:~:text=Receive%20the%20gift%2E');
  });

  it('a Letter Study links its study\'s page; the Matthew Study Bible its page, which holds the PDF, quoting nothing', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'letter:purity-ch1:2');
    p.textContent = 'Blessed are the pure in heart.';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, 1))).link)
      .toBe(SITE + 'Purity_-_Bible/Letter_Study#:~:text=Blessed%20are%20the%20pure%20in%20heart%2E');
    document.body.innerHTML = '';
    const w = document.createElement('div');
    w.innerHTML = '<span class="verse-num">3</span><span data-hl-key="study:matthew-5:3">Blessed are the poor in spirit</span>';
    document.body.appendChild(w);
    expect(/** @type {any} */ (passageCopy(range(w, 0, w, w.childNodes.length))).link)
      .toBe(SITE + 'The_Volumes_of_Truth_New_Testament_Study_Bible_-_The_Book_of_Matthew');
  });

  it('an Answers passage names the letter it is from and links there, never quoting its source line', () => {
    const page = topic('abortion', ABORTION.paragraphs.map((p) => p.text));
    const out = /** @type {any} */ (passageCopy(range(page, 1, page, 3)));
    expect(out.reference).toBe('Abortion: Murder of the Innocent (Volume Two)');
    expect(out.link).toBe(SITE + 'Abortion:_Murder_of_the_Innocent#:~:text=Therefore%2C%20thus%20says%20The,death%20of%20the%20guilty%2E');
  });

  it('words across Answers passages name the topic and link its own page', () => {
    const page = topic('abortion', ABORTION.paragraphs.map((p) => p.text));
    const out = /** @type {any} */ (passageCopy(range(page, 1, page, 5)));
    expect(out.reference).toBe('Thus Says The Lord Regarding Abortion (Answers Only God Can Give)');
    expect(out.link).toBe('https://answersonlygodcangive.com/Thus_Says_The_Lord_Regarding_Abortion#:~:text=Therefore%2C%20thus%20says%20The,Another%20passage%20from%20Pentecost%2E');
  });

  it('a heading or title outside the paragraphs links its letter', () => {
    const page = document.createElement('div');
    page.setAttribute('data-copy-key', 'letter:the-wide-path');
    page.innerHTML = '<h1 class="letter-title">The Wide Path</h1>';
    document.body.appendChild(page);
    const h = /** @type {Element} */ (page.firstElementChild);
    const out = /** @type {any} */ (passageCopy(range(h, 0, h, 1)));
    expect(out.text).toBe('"The Wide Path"\n\nThe Wide Path (Volume Two)\n' + SITE + 'The_Wide_Path#:~:text=The%20Wide%20Path');
  });

  it('cp3: by default the link names the letter alone (a compilation entry, its section); the setting adds the words', () => {
    g.StateStore = { get: () => ({ settings: { translation: 'rnkjv' } }) };
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'letter:the-wide-path:4');
    p.textContent = 'Beloved, walk the narrow way.';
    document.body.appendChild(p);
    const r = range(/** @type {Node} */ (p.firstChild), 0, /** @type {Node} */ (p.firstChild), 29);
    expect(/** @type {any} */ (passageCopy(r)).link).toBe(SITE + 'The_Wide_Path');
    expect(/** @type {any} */ (passageCopy(r, { quote: true })).link).toBe(SITE + 'The_Wide_Path#:~:text=Beloved%2C%20walk%20the%20narrow%20way%2E');
    g.StateStore = { get: () => ({ settings: { translation: 'rnkjv', linkHighlight: true } }) };
    expect(/** @type {any} */ (passageCopy(r)).link).toBe(SITE + 'The_Wide_Path#:~:text=Beloved%2C%20walk%20the%20narrow%20way%2E');
    expect(/** @type {any} */ (passageCopy(r, { quote: false })).link).toBe(SITE + 'The_Wide_Path');
  });

  it('the reader\'s journal never gets a link', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'journal:e1:b1');
    p.textContent = 'What I learned today';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, 1))).link).toBe('');
  });
});
