// @ts-nocheck
/* answers-search — the Answers landing's search box (AOGCG Browse, f06): one group per topic,
   title matches first, then the site's order; never ranked by how many passages say it (U2). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  answersPlainText, answersFold, buildAnswersIndex, answersSearch, answersTitleMatches, answersSnippet,
  answersPlainLines, TOPIC_SYNONYMS,
} from './answers-search.js';
import { ANSWERS_SUBJECTS } from './answers-shelves.js';
import { ANSWERS_URL_INDEX } from './answers-url-index.js';
import { answersSiteOrder } from './answers-site.js';

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
  topic('regarding-watching', 'Regarding Watching', [
    '"Pray, and pray again; pray always."',
    '~ [From “Again” ~ Volume 4]',
    '"Pray in the night."',
    '~ [From “Night” ~ Volume 4]',
    '"Pray at dawn."',
    '~ [From “Dawn” ~ Volume 4]',
  ]),
];
const INDEX = buildAnswersIndex(FIXTURE);
/* The site's order for the fixture: Pride, Watching, Name, Prayer. */
const ORDER = ['regarding-pride', 'regarding-watching', 'the-name-of-the-lord', 'regarding-prayer'];
const OPTS = { pos: (id) => ORDER.indexOf(id) };
const ids = (r) => r.groups.map((g) => g.entry.id);

describe('text domain', () => {
  it('strips {{markers}} and **/_ marks for display', () => {
    expect(answersPlainText('Watch and pray{{ref:Matthew 26:41}}; the _humble_ **one**')).toBe('Watch and pray ; the humble one');
  });
  it('folds without changing length (snippets cut the display text at folded indices)', () => {
    const s = 'Lord’s “Word” AND';
    expect(answersFold(s).length).toBe(s.length);
    expect(answersFold(s)).toBe('lord\'s "word" and');
  });
  it('a prose paragraph\'s lines join with " · " (False Doctrines titles would run together)', () => {
    expect(answersPlainLines('**Another Messiah**\nGod Speaks _About_ the Sabbath')).toBe('Another Messiah · God Speaks About the Sabbath');
  });
});

describe('answersSearch', () => {
  it('title matches come first, then the site\'s order; never by how many passages say it (U2)', () => {
    const r = answersSearch(INDEX, 'pray', OPTS);
    // Prayer is last in the site's order but its title holds the word; Watching says it in all
    // three passages and Pride in one, and Pride still comes first because the site lists it first.
    expect(ids(r)).toEqual(['regarding-prayer', 'regarding-pride', 'regarding-watching']);
    expect(r.groups.map((g) => [g.titleHit, g.n, g.total])).toEqual([[true, 2, 2], [false, 1, 1], [false, 3, 3]]);
  });
  it('the header\'s total is the sum of the groups ("6 matches in 3 topics")', () => {
    const r = answersSearch(INDEX, 'pray', OPTS);
    expect(r.matches).toBe(6);
    expect(r.matches).toBe(r.groups.reduce((s, g) => s + g.n, 0));
  });
  it('matches at a word start only', () => {
    expect(answersSearch(INDEX, 'ray', OPTS)).toEqual({ words: ['ray'], groups: [], matches: 0 });
  });
  it('needs every word, anywhere in the same passage', () => {
    const r = answersSearch(INDEX, 'stone pray', OPTS);
    expect(ids(r)).toEqual(['regarding-pride']);
    expect(r.groups[0].titleHit).toBe(false);
  });
  it('does not search the dated header or the attribution line', () => {
    expect(answersSearch(INDEX, 'timothy', OPTS).groups).toEqual([]);
    expect(answersSearch(INDEX, 'proclaim', OPTS).groups).toEqual([]);
  });
  it('a group lands on the paragraph that holds the word, with its source line and date', () => {
    const r = answersSearch(INDEX, 'watch', OPTS);
    const g = r.groups.find((x) => x.entry.id === 'regarding-prayer');
    expect(g.first).toEqual({ index: 4, src: 5, date: '', sec: '' });
    const first = answersSearch(INDEX, 'humble', OPTS).groups[0].first;
    expect(first).toEqual({ index: 1, src: 2, date: '1/2/10', sec: '' });
  });
  it('a title match whose passages never say it is still listed, with no passages', () => {
    const r = answersSearch(INDEX, 'the name of the lord', OPTS);
    expect(r.groups[0]).toMatchObject({ titleHit: true, n: 0, total: 1, first: null });
    expect(r.groups[0].entry.id).toBe('the-name-of-the-lord');
  });
  it('an empty query is no search', () => {
    expect(answersSearch(INDEX, '  ', OPTS)).toBeNull();
  });
  // sweep W31 (2026-10-13): the passage after a topic's last attribution, closed by its own
  // "From: Poured Out" line, is a passage; the notes and links that close a topic are not.
  it('counts the passage a "From:" line closes after the last attribution, never the closing links', () => {
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
    const r = answersSearch(index, 'withhold suppress');
    expect(ids(r)).toEqual(['regarding-sin']);
    expect(r.groups[0]).toMatchObject({ n: 1, total: 2, first: { index: 4, src: 5, date: '4/14/10', sec: '' } });
    for (const q of ['also see', 'holidays desecrate', 'grace law', 'youtube', 'poured']) expect(answersSearch(index, q).groups, q).toEqual([]);
  });
  it('a page of prose counts its level-1 sections, the Trumpet Call aside', () => {
    const index = buildAnswersIndex([topic('false-doctrines', 'False Doctrines', [
      '**The Catholic Church**', 'The sabbath was changed by men.', '**Holidays**', 'Easter and the sabbath.',
      '**Tithing**', 'A tenth.', '**Be a Part of The Trumpet Call**', 'Share the sabbath.',
    ])]);
    const sections = () => [
      { title: 'The Catholic Church', level: 1, at: 0 }, { title: 'Holidays', level: 1, at: 2 },
      { title: 'Tithing', level: 1, at: 4 }, { title: 'Be a Part of The Trumpet Call', level: 1, at: 6 },
    ];
    const r = answersSearch(index, 'sabbath', { sections });
    expect(r.groups[0]).toMatchObject({ prose: true, n: 2, total: 3, first: { index: 1, src: -1, date: '', sec: 'The Catholic Church' } });
    expect(r.matches).toBe(2);
  });
  it('answersTitleMatches gives the title matches alone, in the site\'s order (shown while the text is searched)', () => {
    expect(answersTitleMatches(INDEX, 'regarding', OPTS).map((g) => g.entry.id)).toEqual(['regarding-pride', 'regarding-watching', 'regarding-prayer']);
    expect(answersTitleMatches(INDEX, '', OPTS)).toEqual([]);
  });
});

describe('answersSnippet', () => {
  it('starts at most 40 characters before the first match, at a word start, with "…" in front; the end is left whole', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(12) + 'Pray without ceasing and keep praying. ' + 'Tail words here. '.repeat(12);
    const segs = answersSnippet(long, ['pray']);
    expect(segs[0].text).toBe('…');
    const text = segs.slice(1).map((s) => s.text).join('');
    expect(long.endsWith(text)).toBe(true);
    expect(text.indexOf('Pray')).toBeLessThanOrEqual(40);
    expect(long[long.length - text.length - 1]).toBe(' ');
    expect(segs[segs.length - 1].text.trimEnd().endsWith('Tail words here.')).toBe(true);
  });
  // f06: the mark is the term itself, at every word it begins ("<mark>Sabbath</mark>s"), as the mockup draws it.
  it('marks the term at every word it begins, not the rest of the word', () => {
    const segs = answersSnippet('Pray without ceasing and keep praying.', ['pray']);
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['Pray', 'pray']);
    expect(segs.map((s) => s.text).join('')).toBe('Pray without ceasing and keep praying.');
  });
  it('a short passage is shown whole', () => {
    const segs = answersSnippet('Watch and pray.', ['pray']);
    expect(segs.map((s) => s.text).join('')).toBe('Watch and pray.');
  });
});

describe('on the real corpus', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const ctx = {};
  runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers.js'), 'utf8'), ctx);
  runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers-meta.js'), 'utf8'), ctx);
  const index = buildAnswersIndex(ctx.ANSWERS);
  const order = new Map(answersSiteOrder(ctx.ANSWERS).map((e, i) => [e.id, i]));
  const opts = { pos: (id) => order.get(id), sections: (id) => (ctx.ANSWERS_META[id] && ctx.ANSWERS_META[id].sections) || null };
  const search = (q) => answersSearch(index, q, opts);
  const titled = (q) => { const r = search(q); return r ? r.groups.filter((g) => g.titleHit).map((g) => g.entry.id) : []; };
  const firstTopic = (q) => titled(q)[0] || null;
  /* 2026-09-25, improvement sweep n5-02 / n5-07: the box asks "What does The Lord say about…",
     and asking it that way found nothing. */
  it('a question finds its subject: the question words fall away when the full question finds no topic', () => {
    expect(firstTopic('what does the lord say about prayer')).toBe('regarding-prayer');
    expect(firstTopic('is the earth flat')).toBe('regarding-the-flat-earth-theory');
    expect(firstTopic('What does God say about the Sabbath?')).toBe('god-speaks-about-the-sabbath');
    expect(firstTopic('his name in vain')).toBe('god-speaks-regarding-those-who-take-his-name-in-vain');
  });
  it('an exact title keeps its precision (the question words stay when they are the title)', () => {
    expect(titled('day of the lord')).toContain('regarding-the-day-of-the-lord');
    expect(titled('the name of the lord')).toContain('the-name-of-the-lord');
  });
  it("the site's own alternate names and a few everyday words find their topic", () => {
    expect(firstTopic('miracles')).toBe('regarding-healing');                // the site's "Regarding Miracles"
    expect(firstTopic('anti-christ')).toBe('regarding-the-antichrist');     // "Regarding the Anti-Christ"
    expect(firstTopic('original sin')).toBe('regarding-childrens-inheritance-on-earth-and-in-heaven');
    expect(firstTopic('christmas')).toBe('regarding-the-holidays-of-men');
    expect(firstTopic('tithe')).toBe('regarding-tithing');
    expect(firstTopic('10 commandments')).toBe('regarding-the-ten-commandments');
    // …and the passages that say the word are still counted.
    expect(search('christmas').groups.filter((g) => !g.titleHit).length).toBeGreaterThan(0);
  });
  it('a long number finds its comma form; a year stays whole', () => {
    expect(firstTopic('144000')).toBe('regarding-the-144-000-witnesses');
    expect(firstTopic('144,000')).toBe('regarding-the-144-000-witnesses');
    expect(search('2011').words).toEqual(['2011']);
  });
  it('every synonym names a topic that exists', () => {
    const all = new Set(ctx.ANSWERS.map((e) => e.id));
    for (const id of Object.keys(TOPIC_SYNONYMS)) expect(all.has(id), id).toBe(true);
  });

  /* aogcg 1b (brief 3.1): the nine subjects the app filed topics under are retired as a browse
     view and live on as search words: a reader who remembers "The End of This Age" still finds
     its topics. A subject answers only when the query holds its whole name, so one of its words
     alone ("salvation", "lord") still finds only the topics titled with it. */
  it('a subject\'s whole name finds every topic it filed; one of its words alone does not', () => {
    const sorted = (q) => titled(q).slice().sort();
    for (const s of ANSWERS_SUBJECTS) {
      expect(sorted(s.title), s.title).toEqual(expect.arrayContaining(s.topics));
    }
    expect(sorted('what does the lord say about the end of this age')).toEqual(expect.arrayContaining(ANSWERS_SUBJECTS.find((s) => s.id === 'the-end-of-this-age').topics));
    expect(sorted('salvation')).toEqual(['regarding-salvation']);
    const words = new Set(ANSWERS_SUBJECTS.flatMap((s) => answersFold(s.title).split(/[^a-z0-9]+/).filter((w) => w.length > 2)));
    for (const w of words) {
      const r = search(w);
      for (const g of r.groups.filter((x) => x.titleHit)) {
        const named = [g.entry.title, ...(TOPIC_SYNONYMS[g.entry.id] ? [TOPIC_SYNONYMS[g.entry.id]] : [])]
          .concat(Object.keys(ANSWERS_URL_INDEX).filter((k) => ANSWERS_URL_INDEX[k] === g.entry.id));
        expect(named.some((n) => new RegExp('(^|[^a-z0-9])' + r.words[0]).test(answersFold(n))), `${w} -> ${g.entry.id}`).toBe(true);
      }
    }
  });

  /* The f06 frame: "73 matches in 22 topics", The Sabbath first (its title), then the site's order. */
  it('"sabbath": 73 matches in 22 topics, The Sabbath first and then the site\'s order', () => {
    const r = search('sabbath');
    expect(r.matches).toBe(73);
    expect(r.groups.map((g) => `${g.entry.id} ${g.n}/${g.total}`)).toEqual([
      'god-speaks-about-the-sabbath 18/19',
      'regarding-another-messiah 1/18',
      'god-speaks-regarding-those-who-take-his-name-in-vain 2/45',
      'god-speaks-regarding-adultery-committed-against-him 1/20',
      'woe-to-those-who 1/52',
      'i-am-calling-you-out 2/41',
      'the-one-who-stays-lets 1/35',
      'i-am-the-lord-i-do-not-change 3/39',
      'regarding-the-birth-pangs 1/9',
      'regarding-prophets-false 1/7',
      'regarding-the-churches-of-men 8/22',
      'regarding-the-catholic-church 4/14',
      'regarding-the-united-church-of-god 1/1',
      'regarding-adding-to-or-taking-away-from-the-word-of-god 3/22',
      'regarding-the-ten-commandments 4/21',
      'regarding-the-holy-days-of-god 4/26',
      'regarding-the-holidays-of-men 1/21',
      'regarding-the-kingdom-and-heaven 3/16',
      'regarding-fasting 2/3',
      'regarding-obedience 3/22',
      'regarding-staying-separate 3/15',
      'false-doctrines-within-the-churches-of-men-regarding 6/46',
    ]);
    expect(r.groups[0].titleHit).toBe(true);
    expect(r.groups.slice(1).every((g) => !g.titleHit && g.n > 0 && g.first && g.first.index >= 0)).toBe(true);
    expect(r.groups[r.groups.length - 1].first.sec).toBe('The Catholic Church');
  });
});
