/* ═══════════════════════════════════════════════════════════════════════
   answers-ranked — the Answers box, ranked by the main search engine
   ═══════════════════════════════════════════════════════════════════════
   The landing's "What does The Lord say about…" box matched on its own
   (answers-search.js: every word in one passage, title matches first, then
   the site's order). Measured on every topic title and section heading typed
   the ways a reader asks (tools/answers-questions, search200 h8 2026-11-04),
   the main engine kept to the Answers collection put the right topic first
   about twice as often (856 of 1148 against 477, top 3: 919 against 598; the
   hunt bench's 43 Answers questions: 38 against 13). So the box asks the
   engine when its index is ready, and keeps answers-search.js for the rest:
   the counts under a topic, the source line, the snippet's marks, and the
   whole search while the index is still building.

   The engine ranks whole topics; a topic opens where the search screen's
   excerpt anchor would land (use-search.js excerptAnchor: the place the
   engine names, else the excerpt the typed words cut), as a paragraph index.
   The group it returns has answersSearch's shape, so the screen draws it the
   same way. Pure: the engine is passed in (window.VotSearchMini in the app).
   ═══════════════════════════════════════════════════════════════════════ */

import { answersSearch, answersPlainText, answersFold, QUESTION_WORDS } from './answers-search.js';
import { excerptLanding } from './excerpt-landing.js';
import { isTrumpetSection } from './answers-shelves.js';

/** What the engine is asked for: a whole collection fits (122 topics). */
const LIMIT = 400;

/**
 * Can the engine answer now? Its index is built for the data loaded (isCurrent: a search would not start a
 * build, which takes seconds on a phone): until then the box searches on its own.
 * @param {any} E window.VotSearchMini
 */
export function answersEngineReady(E) {
  try { return !!(E && typeof E.search === 'function' && typeof E.isCurrent === 'function' && E.isCurrent()); } catch { return false; }
}

/** A topic's paragraphs as plain text, for landing an excerpt (built once per entry). */
const _plain = new WeakMap();
function plainParas(entry) {
  let v = _plain.get(entry);
  if (!v) { v = (entry.paragraphs || []).map((p) => answersPlainText(p && p.text)); _plain.set(entry, v); }
  return v;
}

/** The typed words that carry the question (the box's own reading: QUESTION_WORDS out), folded. */
function coreWords(query) {
  const ws = answersFold(query).split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  const core = ws.filter((w) => !QUESTION_WORDS.has(w));
  return core.length ? core : ws;
}

/**
 * The paragraph a hit opens on: the engine's named place, else the excerpt the typed words cut
 * (use-search.js excerptAnchor), landed in the topic's paragraphs. -1: the topic's top.
 * @param {any} E @param {any} hit @param {string[]} terms
 */
function landingOf(E, hit, terms) {
  const doc = hit.doc;
  const text = String(doc.text || '');
  const texts = plainParas(hit.entry);
  let ex = '';
  if (typeof hit.placeStart === 'number' && hit.placeStart >= 0 && hit.placeStart < text.length) {
    if (hit.placeStart === 0) return -1;
    ex = text.slice(hit.placeStart, hit.placeStart + 48);
  } else if (typeof E.matchExcerpt === 'function') {
    const extra = (hit.terms || []).filter((t) => terms.indexOf(t) < 0);
    ex = (terms.length ? E.matchExcerpt(text, terms, undefined, extra) : '') || (extra.length ? E.matchExcerpt(text, terms.concat(extra)) : '');
  }
  if (!ex) return -1;
  return excerptLanding(ex, texts, terms.concat(hit.terms || [])).index;
}

/**
 * The passage (or, on a page of prose, the category) holding paragraph `at`: the hit's source line.
 * @returns {{ index: number, src: number, date: string, sec: string }}
 */
function firstAt(t, at, opts) {
  if (t.prose) {
    const tops = ((typeof opts.sections === 'function' && opts.sections(t.entry.id)) || []).filter((s) => s.level === 1 && !isTrumpetSection(s));
    let sec = '';
    for (const s of tops) if (s.at <= at) sec = s.title;
    return { index: at, src: -1, date: '', sec };
  }
  const psg = t.passages.find((p) => p.paras.some((q) => q.index === at));
  return { index: at, src: psg ? psg.src : -1, date: (psg && psg.date) || '', sec: '' };
}

/**
 * The box's search through the engine, kept to the Answers collection: one group per topic in the engine's
 * order, each opening where its excerpt lands, with answersSearch's counts where its words hold. Null when the
 * engine cannot answer (an error, a search called off): the caller shows answersSearch's own groups.
 * @param {any} E window.VotSearchMini
 * @param {ReturnType<typeof import('./answers-search.js').buildAnswersIndex>} index
 * @param {string} query
 * @param {{ pos?: (id: string) => number, sections?: (id: string) => any[] | null, signal?: any }} [opts]
 *   no edition is named: the engine searches the index it has (every edition indexes Answers the same)
 * @returns {Promise<null | { words: string[], groups: any[], matches: number, ranked: true }>}
 */
export async function answersRankedSearch(E, index, query, opts) {
  const o = opts || {};
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const r = await E.search(q, { scope: { volumeId: 'answers' }, limit: LIMIT, perVolume: LIMIT, signal: o.signal });
  if (!r || r.error || r.aborted || (o.signal && o.signal.aborted)) return null;
  const byId = new Map((index || []).map((t) => [t.entry.id, t]));
  const box = answersSearch(index, q, o);
  const boxBy = new Map(((box && box.groups) || []).map((g) => [g.entry.id, g]));
  const terms = coreWords(q);
  const groups = [];
  const seen = new Set();
  for (const h of r.results || []) {
    const d = h && h.doc;
    if (!d || d.volumeId !== 'answers' || seen.has(d.letterId)) continue;
    const t = byId.get(d.letterId);
    if (!t) continue;
    seen.add(d.letterId);
    const at = landingOf(E, { ...h, entry: t.entry }, terms);
    const b = boxBy.get(t.entry.id);
    const pos = typeof o.pos === 'function' ? o.pos(t.entry.id) : 0;
    groups.push({
      entry: t.entry, n: b ? b.n : 0, total: b ? b.total : (t.prose ? 0 : t.passages.length), titleHit: !!(b && b.titleHit), prose: !!t.prose,
      first: at >= 0 ? firstAt(t, at, o) : null, pos: Number.isFinite(pos) ? pos : 1e6,
    });
  }
  return { words: terms, groups, matches: groups.reduce((s, g) => s + g.n, 0), ranked: true };
}
