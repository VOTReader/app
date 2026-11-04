/* ═══════════════════════════════════════════════════════════════════════
   answers-question-day — one Answers question a day for the Today card
   ═══════════════════════════════════════════════════════════════════════
   Reads only ANSWERS_TITLES (answers-url-index.js), the id -> title index
   that already ships in bundle-d for the letters' Answers links, so the
   Today card draws its question with no corpus fetch and no parse: the
   2.5 MB answers.js is fetched only when the reader taps the question.

   The rule (the corpus has no "is a question" field, so it is written out):
   - the site titles a topic it answers with one of four lead words,
     "Regarding …", "God Speaks About …", "God Speaks Regarding …" or "Thus
     Says The Lord Regarding …", and each reads as "What does The Lord say
     about …?". "God Rebukes …" is a rebuke, not an answer, and the other
     titles ("THERE IS NO OTHER", "Parables", "Woe to Those Who...") name a
     page, not a subject;
   - the subject after the lead is a plain name: no parenthesis ("Prophets
     (True)", "(Rapture)", "(Genesis 9:20-27)" are the site's labels, not
     words a reader would ask) and not itself a question ("What is an
     Abomination…", "Who Killed…" would read "about What is…");
   - it opens to real content: a quote with its source line. The one title
     that passes the first two and is only a "See:" list of other pages
     (Regarding The Trinity) is named in SEE_ONLY; answers-question-day.test.js
     holds that list to the corpus both ways (every question opens to a
     sourced quote, and SEE_ONLY is exactly the ones that do not), so a
     regenerated corpus that empties or fills a page fails the build.
   The site's words are kept: the subject is the title less its lead, as
   written ("the Days of Noah", "The Trinity").

   The day: the local calendar day (answersDayNumber, the same day number the
   Answers landing's excerpt uses), stepped through the pool by a stride that
   shares no factor with its length, so neighbouring topics do not follow one
   another and every question comes round once per cycle. The same question
   all day, on every device, and the next one after local midnight.

   Pure: no DOM, no React.
   ═══════════════════════════════════════════════════════════════════════ */

import { ANSWERS_TITLES } from './answers-url-index.js';
import { answersDayNumber } from './answers-browse.js';

/** The lead words a question topic opens with, longest first ("Thus Says The Lord Regarding" before "Regarding"). */
export const QUESTION_LEADS = Object.freeze(['Thus Says The Lord Regarding ', 'God Speaks Regarding ', 'God Speaks About ', 'Regarding ']);

/** Question titles whose page holds no quote, only "See:" links to others (held to the corpus by the test). */
export const SEE_ONLY = Object.freeze(['regarding-the-trinity']);

/** What every question opens with. */
export const QUESTION_LEAD_IN = 'What does The Lord say about';

/**
 * The subject a title asks about, or '' when the title is not a question topic.
 * "Regarding the Days of Noah" -> "the Days of Noah"; "God Rebukes New Age Spirituality" -> ''.
 * @param {unknown} title
 */
export function answersQuestionSubject(title) {
  const t = String(title || '');
  const lead = QUESTION_LEADS.find((l) => t.startsWith(l));
  if (!lead) return '';
  const rest = t.slice(lead.length).trim();
  if (!rest || rest.includes('(') || rest.includes(')')) return '';
  const first = rest.split(' ')[0].toLowerCase();
  if (first === 'what' || first === 'who') return '';
  return rest;
}

/**
 * Every question topic, in the corpus's own order: { id, subject }.
 * @param {Record<string, string> | null | undefined} titles id -> title (ANSWERS_TITLES)
 * @returns {{ id: string, subject: string }[]}
 */
export function answersQuestionPool(titles) {
  /** @type {{ id: string, subject: string }[]} */
  const out = [];
  if (!titles || typeof titles !== 'object') return out;
  for (const id of Object.keys(titles)) {
    if (SEE_ONLY.includes(id)) continue;
    const subject = answersQuestionSubject(titles[id]);
    if (subject) out.push({ id, subject });
  }
  return out;
}

function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

/** The stride through a pool of `n`: the first of a few primes that shares no factor with it (1 for tiny pools). */
export function questionStride(n) {
  for (const s of [37, 41, 43, 47, 53]) if (n > s && gcd(s, n) === 1) return s;
  return 1;
}

/**
 * Today's question, or null for an empty pool.
 * @param {{ id: string, subject: string }[]} pool
 * @param {Date} date
 */
export function answersQuestionOfDay(pool, date) {
  if (!pool || !pool.length) return null;
  const n = pool.length;
  const k = ((answersDayNumber(date) * questionStride(n)) % n + n) % n;
  const q = pool[k];
  return { id: q.id, subject: q.subject, text: QUESTION_LEAD_IN + ' ' + q.subject + '?' };
}

let _pool = /** @type {{ id: string, subject: string }[] | null} */ (null);

/** The pool from the shipped title index, built once (nothing to fetch). [] where the index is missing. */
export function shippedQuestionPool() {
  if (!_pool) _pool = answersQuestionPool(typeof ANSWERS_TITLES === 'object' ? ANSWERS_TITLES : null);
  return _pool;
}
