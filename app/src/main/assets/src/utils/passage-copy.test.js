/* passage-copy (cp1) — what a copied passage says and where it is from.
   A reader copied John 7:37-39 and pasted "37On the last day, ..." with no
   reference, then typed "John 7:37-39" by hand. These pin the shape a copy
   takes on every reading surface: a verse per line, its number and a space,
   footnote digits and icons left out, and the reference on the last line. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { passageCopy, passageLabel, passageReference, readingBlocksIn, isVerseKey, translationTag } from './passage-copy.js';

const V37 = 'On the last day, that great day of the feast, YahuShua stood and cried out, saying, “If anyone thirsts, let him come to Me and drink.';
const V38 = 'He who believes in Me, as the Scripture has said, out of his heart will flow rivers of living water.”';
const V39 = 'But this He spoke concerning the Spirit, whom those believing in Him would receive; for the Holy Spirit was not yet given, because YahuShua was not yet glorified.';

const g = /** @type {any} */ (globalThis);

beforeEach(() => {
  g._bookTitle = (/** @type {string} */ id) => ({ john: 'John', psalms: 'Psalms' })[id] || id;
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
    expect(out.text).toBe(`37 ${V37}\n38 ${V38}\n39 ${V39}\nJohn 7:37-39 (NKJV-R)`);
    expect(out.keys).toEqual(['bible:john:7:37', 'bible:john:7:38', 'bible:john:7:39']);
    expect(out.isPublic).toBe(true);
  });

  it('selected from the first WORD of a verse (the number is in the gutter): every line is still numbered', () => {
    bibleChapter([[37, V37], [38, V38], [39, V39]]);
    const start = /** @type {Node} */ (block('bible:john:7:37').firstChild);
    const end = lastText(block('bible:john:7:39'));
    expect(/** @type {any} */ (passageCopy(range(start, 0, end, end.length))).text)
      .toBe(`37 ${V37}\n38 ${V38}\n39 ${V39}\nJohn 7:37-39 (NKJV-R)`);
  });

  it('started mid-verse: that part-verse has no number, the rest do, and the reference still names it', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const start = /** @type {Node} */ (block('bible:john:7:37').firstChild);
    const end = lastText(block('bible:john:7:38'));
    const out = /** @type {any} */ (passageCopy(range(start, V37.indexOf('YahuShua'), end, end.length)));
    expect(out.text).toBe(`${V37.slice(V37.indexOf('YahuShua'))}\n38 ${V38}\nJohn 7:37-38 (NKJV-R)`);
  });

  it('one verse: the words and the reference, no number unless the number itself was selected', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const t = /** @type {Node} */ (block('bible:john:7:38').firstChild);
    expect(/** @type {any} */ (passageCopy(range(t, 0, t, 15))).text).toBe('He who believes\nJohn 7:38 (NKJV-R)');
    const num = /** @type {Node} */ (document.querySelector('#v-38 .verse-num')?.firstChild);
    expect(/** @type {any} */ (passageCopy(range(num, 0, t, 15))).text).toBe('38 He who believes\nJohn 7:38 (NKJV-R)');
  });

  it('a start dropped between the digits of a number still copies the whole number', () => {
    bibleChapter([[37, V37], [38, V38]]);
    const num = /** @type {Node} */ (document.querySelector('#v-37 .verse-num')?.firstChild);
    const end = lastText(block('bible:john:7:38'));
    expect(/** @type {any} */ (passageCopy(range(num, 1, end, end.length))).text.startsWith('37 On the last day')).toBe(true);
  });

  it('numbers: false (Share) gives the words alone, a verse per line, with the reference apart', () => {
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
    expect(/** @type {any} */ (passageCopy(range(start, 0, num38, 2))).text).toBe(`${V37}\nJohn 7:37 (NKJV-R)`);
  });

  it('a range across chapters is named as one: "John 7:53-8:1"', () => {
    const a = bibleChapter([[53, 'And everyone went to his own house.']], 'john:7');
    const b = bibleChapter([[1, 'But Jesus went to the Mount of Olives.']], 'john:8');
    const out = /** @type {any} */ (passageCopy(range(a, 0, b, b.childNodes.length)));
    expect(out.text).toBe('53 And everyone went to his own house.\n1 But Jesus went to the Mount of Olives.\nJohn 7:53-8:1 (NKJV-R)');
  });

  it('footnote digits, note icons and link icons never reach the clipboard', () => {
    bibleChapter([[1, 'In the beginning']]);
    const b1 = block('bible:john:7:1');
    b1.innerHTML = 'In the <mark class="hl-mark">beginning</mark><span class="fn-ref">3</span> was<span class="hl-note-icon" data-hl-key="bible:john:7:1"><svg></svg></span> the Word';
    const out = /** @type {any} */ (passageCopy(range(b1, 0, b1, b1.childNodes.length)));
    expect(out.text).toBe('In the beginning was the Word\nJohn 7:1 (NKJV-R)');
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
    expect(out.text).toBe('Hear the Word of The Lord.\n\nTherefore, turn from this\nWicked way you have chosen!\nThe Wide Path (Volume Two)');
  });

  it('<br> soft breaks (WTLB) are line breaks, not glued words', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'wtlb:faith:2');
    p.innerHTML = 'Take your every thought captive<br><br>That you may be set apart';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, p.childNodes.length))).text)
      .toBe('Take your every thought captive\n\nThat you may be set apart\nFaith (Words To Live By: Part One)');
  });

  it('a verse number inside a quoted poem line gets its space too', () => {
    const c = document.createElement('div');
    c.setAttribute('data-hl-key', 'letter:the-wide-path:3');
    c.innerHTML = '<div class="poem-line"><span class="verse-num">18</span>If anyone adds to these words,</div>';
    document.body.appendChild(c);
    expect(/** @type {any} */ (passageCopy(range(c, 0, c, c.childNodes.length))).text.split('\n')[0]).toBe('18 If anyone adds to these words,');
  });

  it('Hidden Manna is named by its title alone', () => {
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'letter:manna-1:0');
    p.textContent = 'I AM the Bread of Life.';
    document.body.appendChild(p);
    expect(/** @type {any} */ (passageCopy(range(p, 0, p, 1))).text).toBe('I AM the Bread of Life.\nThe Bread of Life');
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
    expect(/** @type {any} */ (passageCopy(all)).text).toBe('1 After these things\nJohn 7:1 (NKJV-R)');
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

  it('the translation is the reader\'s; unknown settings claim nothing; TSOT Matthew is not a translation', () => {
    expect(translationTag('bible:john:3:16')).toBe(' (NKJV-R)');
    g.StateStore = { get: () => ({ settings: { translation: 'kjv' } }) };
    expect(translationTag('bible:john:3:16')).toBe(' (KJV)');
    expect(translationTag('bible:matthew-tsot:5:3')).toBe('');
    expect(translationTag('letter:x:1')).toBe('');
    delete g.StateStore;
    expect(translationTag('bible:john:3:16')).toBe('');
  });
});
