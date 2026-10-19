// @ts-nocheck
/* answers-search — the landing's "What does The Lord say about…" box. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersPlainText, answersFold, buildAnswersIndex, searchAnswers, answersSnippet, TOPIC_SYNONYMS } from './answers-search.js';
import { ANSWERS_SUBJECTS } from './answers-shelves.js';
import { ANSWERS_URL_INDEX } from './answers-url-index.js';

const topic = (id, title, paragraphs) => ({ id, title, paragraphs: paragraphs.map((text) => ({ align: 'justify', text })) });
const FIXTURE = [
  topic('regarding-prayer', 'Regarding Prayer', [
    '_1/2/10_ **_From The Lord, Our God and Savior_**\n_The Word of The Lord Spoken to Timothy_',
    '"Pray without ceasing, for the Lord hears the _humble_ prayer."',
    '~ [From “Prayer” ~ Volume 1]',
    '✦',
    '"Watch and pray{{ref:Matthew 26:41}}; be ready."',
    '~ [From “Watch” ~ Volume 2]',
  ]),
  topic('regarding-pride', 'Regarding Pride', [
    '"The **pride** of man is a stone of stumbling; they will not pray."',
    '~ [From “Pride” ~ Volume 3]',
  ]),
  topic('the-name-of-the-lord', 'The Name of The Lord', [
    '"Speak My name aloud."',
    '~ [From “Proclaim” ~ Volume 7]',
  ]),
];
const INDEX = buildAnswersIndex(FIXTURE);

describe('text domain', () => {
  it('strips {{markers}} and **/_ marks for display', () => {
    expect(answersPlainText('Watch and pray{{ref:Matthew 26:41}}; the _humble_ **one**')).toBe('Watch and pray ; the humble one');
  });
  it('folds without changing length (snippets cut the display text at folded indices)', () => {
    const s = 'Lord’s “Word” AND';
    expect(answersFold(s).length).toBe(s.length);
    expect(answersFold(s)).toBe('lord\'s "word" and');
  });
});

describe('searchAnswers', () => {
  it('a title match is "the topic"; other topics whose passages say it are mentions', () => {
    const r = searchAnswers(INDEX, 'pray');
    expect(r.topics.map((t) => t.entry.id)).toEqual(['regarding-prayer']);
    expect(r.topics[0].hits).toBe(2);
    expect(r.mentions.map((t) => t.entry.id)).toEqual(['regarding-pride']);
    expect(r.mentionPassages).toBe(1);
  });
  it('matches at a word start only', () => {
    expect(searchAnswers(INDEX, 'ray')).toEqual({ words: ['ray'], topics: [], mentions: [], mentionPassages: 0 });
  });
  it('needs every word, anywhere in the same passage', () => {
    const r = searchAnswers(INDEX, 'stone pray');
    expect(r.topics).toEqual([]);
    expect(r.mentions.map((t) => t.entry.id)).toEqual(['regarding-pride']);
  });
  it('does not search the dated header or the attribution line', () => {
    expect(searchAnswers(INDEX, 'timothy').mentions).toEqual([]);
    expect(searchAnswers(INDEX, 'proclaim').mentions).toEqual([]);
  });
  it('lands on the paragraph that holds the word', () => {
    const r = searchAnswers(INDEX, 'watch');
    expect(r.topics).toEqual([]);
    expect(r.mentions[0].firstPara).toBe(4);
  });
  it('a title match whose passages never say the word still carries its opening lines', () => {
    const r = searchAnswers(INDEX, 'name');
    expect(r.topics[0].hits).toBe(1);
    const lord = searchAnswers(INDEX, 'the name of the lord');
    expect(lord.topics[0].leadText).toBe('"Speak My name aloud."');
  });
  it('an empty query is no search', () => {
    expect(searchAnswers(INDEX, '  ')).toBeNull();
  });
  // sweep W31 (2026-10-13): the passages after a topic's last attribution were never searched
  // (regarding-sin, regarding-spiritual-warfare, adultery of the heart); its link sections still are not.
  it('searches the passage after the last attribution, never the links that close a topic', () => {
    const index = buildAnswersIndex([topic('regarding-sin', 'Regarding Sin', [
      '"The wages of sin is death."',
      '~ [From “Wages” ~ Volume 1]',
      '✦',
      '_4/14/10_ **_From YahuShua HaMashiach_**',
      '**_Thus says The Lord YahuShua:_** Why withhold, My son? Why do you suppress that which is revealed?',
      '**From:** Poured Out',
      '**Also See**',
      '• The Holidays of Men Desecrate the Name of The Lord',
      '📖 Grace AND The Law (Bible/Letter Study)',
      'https://www.youtube.com/watch?v=3lbNY--MIvY',
    ])]);
    const r = searchAnswers(index, 'withhold suppress');
    expect(r.mentions.map((t) => t.entry.id)).toEqual(['regarding-sin']);
    expect(r.mentions[0].firstPara).toBe(4);
    for (const q of ['also see', 'holidays desecrate', 'grace law', 'youtube']) expect(searchAnswers(index, q).mentions).toEqual([]);
  });
});

describe('answersSnippet', () => {
  it('marks every word the prefix begins and cuts long text around the first hit', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(12) + 'Pray without ceasing and keep praying. ' + 'Tail words here. '.repeat(12);
    const segs = answersSnippet(long, ['pray'], 60);
    expect(segs[0].text).toBe('…');
    expect(segs[segs.length - 1].text).toBe('…');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['Pray', 'praying']);
  });
  it('a short passage is shown whole', () => {
    const segs = answersSnippet('Watch and pray.', ['pray']);
    expect(segs.map((s) => s.text).join('')).toBe('Watch and pray.');
  });
});

describe('on the real corpus', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'answers.js'), 'utf8');
  const ctx = {};
  runInNewContext(src, ctx);
  const index = buildAnswersIndex(ctx.ANSWERS);
  /* 2026-09-25, improvement sweep n5-02 / n5-07: the box asks "What does The Lord say about…",
     and asking it that way found nothing. */
  const firstTopic = (q) => { const r = searchAnswers(index, q); return r && r.topics.length ? r.topics[0].entry.id : null; };
  it('a question finds its subject: the question words fall away when the full question finds no topic', () => {
    expect(firstTopic('what does the lord say about prayer')).toBe('regarding-prayer');
    expect(firstTopic('is the earth flat')).toBe('regarding-the-flat-earth-theory');
    expect(firstTopic('What does God say about the Sabbath?')).toBe('god-speaks-about-the-sabbath');
    expect(firstTopic('his name in vain')).toBe('god-speaks-regarding-those-who-take-his-name-in-vain');
  });
  it('an exact title keeps its precision (the question words stay when they are the title)', () => {
    expect(firstTopic('day of the lord')).toBe('regarding-the-day-of-the-lord');
    expect(firstTopic('the name of the lord')).toBe('the-name-of-the-lord');
  });
  it("the site's own alternate names and a few everyday words find their topic", () => {
    expect(firstTopic('miracles')).toBe('regarding-healing');                // the site's "Regarding Miracles"
    expect(firstTopic('anti-christ')).toBe('regarding-the-antichrist');     // "Regarding the Anti-Christ"
    expect(firstTopic('original sin')).toBe('regarding-childrens-inheritance-on-earth-and-in-heaven');
    expect(firstTopic('christmas')).toBe('regarding-the-holidays-of-men');
    expect(firstTopic('tithe')).toBe('regarding-tithing');
    expect(firstTopic('10 commandments')).toBe('regarding-the-ten-commandments');
    // …and the passages that say the word are still counted.
    expect(searchAnswers(index, 'christmas').mentions.length).toBeGreaterThan(0);
  });
  it('a long number finds its comma form; a year stays whole', () => {
    expect(firstTopic('144000')).toBe('regarding-the-144-000-witnesses');
    expect(firstTopic('144,000')).toBe('regarding-the-144-000-witnesses');
    expect(searchAnswers(index, '2011').words).toEqual(['2011']);
  });
  it('every synonym names a topic that exists', () => {
    const ids = new Set(ctx.ANSWERS.map((e) => e.id));
    for (const id of Object.keys(TOPIC_SYNONYMS)) expect(ids.has(id), id).toBe(true);
  });

  /* aogcg 1b (brief 3.1): the nine subjects the app filed topics under are retired as a browse
     view (phase 2) and live on as search words: a reader who remembers "The End of This Age" still
     finds its topics. A subject answers only when the query holds its whole name, so one of its
     words alone ("salvation", "lord") still finds only the topics titled with it. */
  it('a subject\'s whole name finds every topic it filed; one of its words alone does not', () => {
    const ids = (q) => searchAnswers(index, q).topics.map((t) => t.entry.id).sort();
    for (const s of ANSWERS_SUBJECTS) {
      expect(ids(s.title), s.title).toEqual(expect.arrayContaining(s.topics));
    }
    expect(ids('what does the lord say about the end of this age')).toEqual(expect.arrayContaining(ANSWERS_SUBJECTS.find((s) => s.id === 'the-end-of-this-age').topics));
    expect(ids('salvation')).toEqual(['regarding-salvation']);
    const words = new Set(ANSWERS_SUBJECTS.flatMap((s) => answersFold(s.title).split(/[^a-z0-9]+/).filter((w) => w.length > 2)));
    for (const w of words) {
      const r = searchAnswers(index, w);
      for (const t of r.topics) {
        const named = [t.entry.title, ...(TOPIC_SYNONYMS[t.entry.id] ? [TOPIC_SYNONYMS[t.entry.id]] : [])]
          .concat(Object.keys(ANSWERS_URL_INDEX).filter((k) => ANSWERS_URL_INDEX[k] === t.entry.id));
        expect(named.some((n) => new RegExp('(^|[^a-z0-9])' + r.words[0]).test(answersFold(n))), `${w} -> ${t.entry.id}`).toBe(true);
      }
    }
  });

  it('"sabbath" finds The Sabbath first, and the other topics that speak of it', () => {
    const r = searchAnswers(index, 'sabbath');
    expect(r.topics.map((t) => t.entry.id)).toEqual(['god-speaks-about-the-sabbath']);
    expect(r.mentions.length).toBeGreaterThan(10);
    expect(r.mentions.every((m) => m.hits > 0 && m.firstPara >= 0)).toBe(true);
  });
});
