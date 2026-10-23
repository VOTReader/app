/* ═══════════════════════════════════════════════════════════════════════
   srch-topic — THE TOPIC CARD'S PICK (search200 ideas F, 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   A reader who asks a question ("what does the lord say about tithing") is
   asking for a topic, and Answers Only God Can Give is the site's book of
   topics. The card above Best Matches names the Answers topic the engine's
   own results put near the top, with two or three texts the topic quotes
   that the results also found, and only when the pick is sure: a confident
   wrong topic is worse than none (PICKS.md F).

   The pick reads nothing but the engine's results: of the Answers topics
   among them, the one the on-device model is surest of (its cosine,
   `meaning`, which engine.js puts on every result it ranked), wherever the
   words put it: "what happens when we die?" listed keyword verses first and
   the topics that answer it last (the hub walk, 2026-10-22). Its floor was
   set on the open bench cases
   and the hunt bench's questions only (tools/search-bench/topic-floor.mjs):
   the sealed sets were never read.
   ═══════════════════════════════════════════════════════════════════════ */

/* Words that open a question. "do not" and "don't" open a command, not a question ("do not fear"). */
const QUESTION_OPENERS = new Set(['what', 'whats', "what's", 'how', 'why', 'who', 'whom', 'whose', 'where', 'when', 'which',
  'does', 'do', 'did', 'is', 'are', 'was', 'were', 'can', 'could', 'should', 'would', 'will', 'may', 'must', 'am']);

/**
 * A query read as a question: it ends with "?", or opens with a question word and has two words or more
 * ("what is tithing", "can pets go to heaven"); "do not ..." is a command. Pure.
 * @param {string} query
 * @returns {boolean}
 */
export function questionShaped(query) {
  const s = String(query || '').trim().toLowerCase();
  if (!s) return false;
  const words = s.replace(/[‘’]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (/\?\s*$/.test(s)) return words.length > 0;
  if (words.length < 2) return false;
  if ((words[0] === 'do' || words[0] === 'does' || words[0] === 'did') && words[1] === 'not') return false;
  if (words[0] === "don't" || words[0] === 'dont') return false;
  return QUESTION_OPENERS.has(words[0]);
}

/* The model's cosine the topic must reach (tools/search-bench/topic-floor.mjs, 2026-10-22). On the 142 question-shaped
   open cases, 43 had an Answers topic the model ranked: every one at 0.770 or more was right (12), the nearest wrong
   one sat at 0.7655 ("how can anyone know god without first acknowledging him": a topic on capital punishment), and
   the floor keeps 0.01 clear of it: 8 shown, 8 right. Under it the right and wrong picks mix (0.72: 17 right, 9
   wrong), so the hub walk's "what happens when we die?", whose surest topic is Regarding the First Death at 0.72-0.74,
   gets no card yet. */
export const TOPIC_MEANING_FLOOR = 0.775;
/** How many texts the card quotes, at most. */
export const TOPIC_TEXTS = 3;
/** How far down the results a text the topic quotes is looked for. */
export const TOPIC_TEXT_REACH = 30;

/**
 * The Answers topic among the results the model is surest of (the first of equals), with its place and cosine;
 * null when the model ranked none. Pure.
 * @param {Array<{doc:any, meaning?:number}>} results  the engine's, best first
 * @returns {{ entry: any, rank: number, meaning: number } | null}
 */
export function topicCandidate(results) {
  /** @type {{ entry: any, rank: number, meaning: number } | null} */
  let best = null;
  const list = results || [];
  for (let r = 0; r < list.length; r++) {
    const e = list[r];
    if (!e || !e.doc || e.doc.kind !== 'answers' || typeof e.meaning !== 'number') continue;
    if (!best || e.meaning > best.meaning) best = { entry: e, rank: r, meaning: e.meaning };
  }
  return best;
}

/**
 * The topic the card names, or null: a question, an Answers topic among the results, and the model sure of it
 * (its cosine at TOPIC_MEANING_FLOOR or more). Pure.
 * @param {string} query
 * @param {Array<{doc:any, meaning?:number}>} results
 * @returns {{ entry: any, rank: number, meaning: number } | null}
 */
export function pickTopic(query, results) {
  if (!questionShaped(query)) return null;
  const c = topicCandidate(results);
  if (!c) return null;
  return c.meaning >= TOPIC_MEANING_FLOOR ? c : null;
}

/** Lowercase words, accents and punctuation off, in one string with a space either side. */
function plain(/** @type {string} */ s) {
  return ' ' + String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[‘’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
}

/** Words in a row a quote shares with the topic to be one it quotes. */
const QUOTE_RUN = 7;

/**
 * Whether the topic's text quotes a passage: some QUOTE_RUN words of it in a row. `topicPlain` is plain(topic text).
 * @param {string} topicPlain
 * @param {string} passage
 * @returns {boolean}
 */
export function topicQuotes(topicPlain, passage) {
  const w = plain(passage).trim().split(' ').filter(Boolean);
  if (w.length < QUOTE_RUN) return w.length >= 4 && topicPlain.includes(' ' + w.join(' ') + ' ');
  for (let i = 0; i + QUOTE_RUN <= w.length; i += 2) {
    if (topicPlain.includes(' ' + w.slice(i, i + QUOTE_RUN).join(' ') + ' ')) return true;
  }
  return false;
}

/**
 * The card's texts: the results (not the topic, not another Answers topic) whose shown passage the topic quotes, in
 * the results' order, at most TOPIC_TEXTS; `passageOf` gives a result's shown passage (cardPassage). Pure.
 * @param {any} topic  the topic's entry
 * @param {Array<{doc:any}>} results
 * @param {(e:any) => string} passageOf
 * @returns {Array<{ entry: any, passage: string }>}
 */
export function topicTexts(topic, results, passageOf) {
  const tp = plain(topic && topic.doc ? topic.doc.text : '');
  const out = [];
  const seen = new Set();
  const n = Math.min((results || []).length, TOPIC_TEXT_REACH);
  for (let r = 0; r < n && out.length < TOPIC_TEXTS; r++) {
    const e = results[r];
    if (!e || e === topic || !e.doc || e.doc.kind === 'answers') continue;
    const passage = String(passageOf(e) || '').trim();
    if (!passage) continue;
    const key = plain(passage).slice(0, 80);
    if (seen.has(key)) continue;
    if (!topicQuotes(tp, passage)) continue;
    seen.add(key);
    out.push({ entry: e, passage });
  }
  return out;
}
