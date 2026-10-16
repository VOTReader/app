/* answers-facts.js - Answers Only God Can Give in v2 (mw10; design dz17, pictures 2g-2l; v2-gaps 16): what main's
   AnswersHome, CommandmentSheet, AnswersResults, AnswersSubject and AnswersAZ (ui/screens/AnswersHome.jsx) show, read
   through main's own filing (utils/answers-shelves.js) and search (utils/answers-search.js), so every word, count and
   order is main's. The topics are ANSWERS (src/data/answers.js), which loads on its own (corpus.js askAnswersCorpus). */
import {
  ANSWERS_COMMANDMENTS, ANSWERS_SUBJECTS, answersCommandmentTopics, answersPassageCount, answersShortTitle,
  answersSortKey, answersIndexLetter, isAttribution, answersSubjectById, answersFiledUnder,
} from '../utils/answers-shelves.js';
import { buildAnswersIndex, searchAnswers, answersSnippet } from '../utils/answers-search.js';

const g = /** @type {any} */ (globalThis);

/** What a list of Answers mentions shows before main's "n more topics" (AnswersResults MENTIONS_SHOWN). */
export const MENTIONS_SHOWN = 8;

/** The topics once the Answers corpus has landed, else null. @returns {any[] | null} */
export function answersEntries(gl = g) {
  return Array.isArray(gl.ANSWERS) && gl.ANSWERS.length ? gl.ANSWERS : null;
}

/** Where topic `id` opens: its page, as Answers topics open everywhere in v2 (search-facts.js hitRoute). */
export function topicRoute(entries, id) {
  const e = (entries || []).find((x) => x && x.id === id);
  return e && e.num ? { place: 'letter', collection: 'answers', n: e.num } : null;
}

/** "1 topic", "3 topics" (and the same for passages). @param {number} n @param {string} one */
const count = (n, one) => (n === 1 ? '1 ' + one : n + ' ' + one + 's');

/** main's byPassagesDesc: most passages first, then A-Z. */
function byPassagesDesc(a, b) {
  return answersPassageCount(b) - answersPassageCount(a) || answersSortKey(a.title).localeCompare(answersSortKey(b.title));
}

/** main's tileExamples: up to two of a subject's most-spoken topics, short and free of their own commas or dots. */
function tileExamples(topics) {
  const ranked = topics.slice().sort(byPassagesDesc).map((e) => answersShortTitle(e.title));
  const fit = ranked.slice(0, 5).filter((t) => t.length <= 22 && !/,|\.\.\.|…/.test(t)).slice(0, 2);
  return fit.length ? fit : ranked.slice(0, 1);
}

/**
 * The Answers home (2g, 2h): the Ten Commandments in two columns (I-V, VI-X), each row's aria as main's Tablet says it,
 * then main's nine subjects with their counts and examples, then Every Topic, A-Z.
 * @param {any[]} entries
 */
export function answersHome(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const cmds = ANSWERS_COMMANDMENTS.map((c) => {
    const n = answersCommandmentTopics(entries, c.n).length;
    return { n: c.n, numeral: c.numeral, label: c.label, aria: 'Commandment ' + c.numeral + ': ' + c.label + '. ' + count(n, 'topic') };
  });
  const subjects = ANSWERS_SUBJECTS.map((s) => {
    const topics = s.topics.map((id) => byId.get(id)).filter(Boolean);
    return { id: s.id, t: s.title, s: topics.length + ' topics · ' + tileExamples(topics).join(', ') + '…' };
  });
  return { left: cmds.slice(0, 5), right: cmds.slice(5), subjects, all: 'All ' + entries.length + ' in one list' };
}

/** One topic as a list row: its short title, the site's full title when `full` and different, its passages. */
function topicRow(e, full = false, n = answersPassageCount(e)) {
  const t = answersShortTitle(e.title);
  return { id: e.id, t, s: full && t !== e.title ? e.title : '', n };
}

/**
 * The commandment sheet (2i; main's CommandmentSheet): "The Sixth Commandment", the short label, the verse with the
 * quotation marks books.js carries dropped, its reference, then the topics filed under it, most passages first.
 * null for a number that is no commandment. @param {any[]} entries @param {number} n
 */
export function commandmentSheet(entries, n) {
  const c = ANSWERS_COMMANDMENTS.find((x) => x.n === n);
  if (!c) return null;
  const topics = answersCommandmentTopics(entries, c.n).slice().sort(byPassagesDesc);
  const total = topics.reduce((a, e) => a + answersPassageCount(e), 0);
  return {
    n: c.n, numeral: c.numeral, overline: 'The ' + c.ordinal + ' Commandment', label: c.label, ref: c.ref,
    verse: c.verse.replace(/^“/, '').replace(/”$/, ''),
    topicsLabel: count(topics.length, 'topic'), passages: total > 0 ? total + ' passages' : '',
    rows: topics.map((e) => topicRow(e, true)),
  };
}

/** "Commandment VI": what Back says on a topic opened from commandment `n`'s sheet (main's onOpenTopic from). */
export function commandmentName(n) {
  const c = ANSWERS_COMMANDMENTS.find((x) => x.n === Number(n));
  return c ? 'Commandment ' + c.numeral : '';
}

/** main's attributionAfter: "From “Pentecost” ~ Volume 6" for the passage at paragraph `from`. */
function attributionAfter(entry, from) {
  const paras = (entry && entry.paragraphs) || [];
  for (let i = Math.max(0, from); i < paras.length; i++) {
    const t = paras[i] && paras[i].text;
    if (isAttribution(t)) return t.replace(/^~ \[/, '').replace(/\]$/, '');
  }
  return '';
}

/** The words a topic opens at: paragraph `i`'s text as the page's landing reads it (search-landing.js squashB). */
function landingText(entry, i) {
  const p = i >= 0 && entry && entry.paragraphs ? entry.paragraphs[i] : null;
  return p && p.text ? String(p.text).replace(/\{\{[^}]+\}\}/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/** One index per corpus (main builds it once per screen; v2's pages come and go, so it is kept with the entries). */
const indexes = new WeakMap();
function indexOf(entries) {
  let ix = indexes.get(entries);
  if (!ix) { ix = buildAnswersIndex(entries); indexes.set(entries, ix); }
  return ix;
}

/**
 * The Answers search as typed (2j; main's AnswersResults over searchAnswers): null under 2 letters. THE TOPIC (or Topics)
 * the words name, the first with main's snippet and its source; then the other topics whose passages speak of it ("11 more
 * passages, across 8 topics"; with no topic named, "Spoken of in" / "n passages"); `empty` when nothing does. Each row's
 * `at` is the passage the topic opens at, `words` the words marked there.
 * @param {any[]} entries @param {string} query
 */
export function answersResults(entries, query) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const r = searchAnswers(indexOf(entries), q);
  if (!r) return null;
  const { topics, mentions, mentionPassages, words } = r;
  if (!topics.length && !mentions.length) return { q, words, empty: true, topics: [], mentions: [] };
  return {
    q, words, empty: false,
    topicsLabel: topics.length === 1 ? 'The topic' : 'Topics',
    topics: topics.map((t, i) => {
      const n = answersPassageCount(t.entry);
      const snipText = t.firstText || t.leadText;
      const snipPara = t.firstPara >= 0 ? t.firstPara : t.leadPara;
      return {
        id: t.entry.id, t: t.short,
        where: [answersFiledUnder(t.entry), n > 0 ? count(n, 'passage') : ''].filter(Boolean).join(' · '),
        snippet: i === 0 && snipText ? answersSnippet(snipText, words) : null,
        source: i === 0 && snipPara >= 0 ? attributionAfter(t.entry, snipPara) : '',
        at: landingText(t.entry, t.firstPara),
      };
    }),
    mentionsLabel: topics.length ? 'Also spoken of in' : 'Spoken of in',
    summary: (mentionPassages === 1 ? '1 passage' : mentionPassages + ' ' + (topics.length ? 'more ' : '') + 'passages')
      + ', across ' + count(mentions.length, 'topic'),
    mentions: mentions.map((m) => ({ ...topicRow(m.entry, false, m.hits), at: landingText(m.entry, m.firstPara) })),
  };
}

/** "3 more topics": main's button past the first eight mentions; '' when they all show. @param {number} n */
export function moreTopicsWords(n) {
  const more = n - MENTIONS_SHOWN;
  return more > 0 ? more + ' more ' + (more === 1 ? 'topic' : 'topics') : '';
}

/** A subject's page (2k; main's AnswersSubject): its topics most passages first. null for an id this build lacks. */
export function answersSubject(entries, id) {
  const s = answersSubjectById(id);
  if (!s) return null;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const topics = s.topics.map((x) => byId.get(x)).filter(Boolean).sort(byPassagesDesc);
  const total = topics.reduce((a, e) => a + answersPassageCount(e), 0);
  return { id: s.id, title: s.title, lede: topics.length + ' topics · ' + total + ' passages', rows: topics.map((e) => topicRow(e)) };
}

/** A subject's title, or '' (what Back says on a topic opened from it). @param {string} id */
export function subjectTitle(id) {
  const s = answersSubjectById(id);
  return s ? s.title : '';
}

/**
 * Every Topic, A-Z (2l; main's AnswersAZ): A-Z by main's sort key (a leading "The" or "A" ignored), numbers under '#',
 * each group with its letter; the jump row holds only the letters that have a topic.
 * @param {any[]} entries
 */
export function answersAZ(entries) {
  const sorted = entries.slice().sort((a, b) => answersSortKey(a.title).localeCompare(answersSortKey(b.title)));
  /** @type {Array<{ letter: string, rows: ReturnType<typeof topicRow>[] }>} */
  const groups = [];
  for (const e of sorted) {
    const L = answersIndexLetter(e.title);
    if (!groups.length || groups[groups.length - 1].letter !== L) groups.push({ letter: L, rows: [] });
    groups[groups.length - 1].rows.push(topicRow(e));
  }
  const total = entries.reduce((a, e) => a + answersPassageCount(e), 0);
  return { lede: entries.length + ' topics · ' + total + ' passages', groups };
}
