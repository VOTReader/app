/* ═══════════════════════════════════════════════════════════════════════
   answers-extras — the words and rules of the AOGCG Extras (final design O5, O6)
   ═══════════════════════════════════════════════════════════════════════
   Pure (no DOM, no store): the screens hand in what they read.

     Saved answers (O5, route answers-saved): the reader's highlights and
     notes on Answers topics (keys wtlb:<topic id>:<paragraph>, which no
     other collection uses for these ids), one group per topic in the
     site's order, each mark in reading order; and the count line the
     landing's Tools row and the screen's lede share.

     Share as a card (O6): the three themes, the 80-word rule (a longer
     passage is refused, never cut), the passage's citation and date, and
     the card's layout on a 1080 x 1350 canvas, measured by whatever
     measures the text (a canvas 2D context in the app, a stub in tests).
   ═══════════════════════════════════════════════════════════════════════ */

import { pl, NBSP, answersSourceParts, answersInlinePieces, answersWordCount } from './answers-browse.js';
import { answersSiteOrder } from './answers-site.js';
import { answersSectionOf } from './answers-sections.js';
import { isMarkKind } from './mark-kinds.js';

/* ── Saved answers ─────────────────────────────────────────────────── */

/**
 * A wtlb paragraph key split into its topic id and paragraph index, or null.
 * @param {string} key
 * @returns {{ id: string, index: number } | null}
 */
export function answersKeyParts(key) {
  const s = String(key || '');
  if (!s.startsWith('wtlb:')) return null;
  const at = s.lastIndexOf(':');
  const index = Number(s.slice(at + 1));
  if (at <= 5 || !Number.isInteger(index) || index < 0) return null;
  return { id: s.slice(5, at), index };
}

/** @type {{ of: any, ids: Set<string> }} */
let _ids = { of: null, ids: new Set() };
/**
 * Whether a key is a paragraph of an Answers topic (ANSWERS ids, built once per corpus array).
 * @param {any[] | null | undefined} entries ANSWERS
 * @param {string} key
 */
export function answersIsTopicKey(entries, key) {
  const k = answersKeyParts(key);
  if (!k || !Array.isArray(entries)) return null;
  if (_ids.of !== entries) _ids = { of: entries, ids: new Set(entries.map((e) => e.id)) };
  return _ids.ids.has(k.id) ? k : null;
}

/**
 * @typedef {{ gid: string, kind: string, index: number, start: number, text: string, note: string }} AnswersSavedItem
 * @typedef {{ entry: any, items: AnswersSavedItem[] }} AnswersSavedTopic
 * @typedef {{ topics: AnswersSavedTopic[], marks: number, notes: number }} AnswersSaved
 */

/**
 * The reader's marks and notes on Answers, one group per topic in the site's order (a page
 * outside the site's menu after them), each in reading order. A mark spanning paragraphs is one
 * item, placed at its first paragraph.
 * @param {any[] | null} entries ANSWERS
 * @param {Record<string, any[]> | null} all AnnotationStore.all()
 * @param {(groupId: string) => string} [noteOf] a note's body (NoteStore)
 * @returns {AnswersSaved}
 */
export function answersSaved(entries, all, noteOf) {
  /** @type {AnswersSaved} */
  const out = { topics: [], marks: 0, notes: 0 };
  if (!Array.isArray(entries) || !entries.length || !all) return out;
  /** @type {Map<string, { gid: string, id: string, kind: string, index: number, start: number, segs: { index: number, start: number, text: string }[] }>} */
  const groups = new Map();
  for (const key of Object.keys(all)) {
    const k = answersIsTopicKey(entries, key);
    if (!k) continue;
    for (const a of all[key] || []) {
      if (!a || !(isMarkKind(a.kind) || a.kind === 'note')) continue;
      const gid = String(a.groupId || a.id);
      const start = a.start || 0;
      let g = groups.get(gid);
      if (!g) { g = { gid, id: k.id, kind: a.kind, index: k.index, start, segs: [] }; groups.set(gid, g); }
      if (k.index < g.index || (k.index === g.index && start < g.start)) { g.id = k.id; g.index = k.index; g.start = start; }
      if (a.kind === 'note') g.kind = 'note';
      g.segs.push({ index: k.index, start, text: String(a.text || '') });
    }
  }
  if (!groups.size) return out;
  const order = answersSiteOrder(entries);
  const pos = new Map(order.map((e, i) => [e.id, i]));
  entries.forEach((e, i) => { if (!pos.has(e.id)) pos.set(e.id, order.length + i); });
  /** @type {Map<string, AnswersSavedTopic>} */
  const byTopic = new Map();
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const g of groups.values()) {
    const segs = g.segs.slice().sort((x, y) => (x.index - y.index) || (x.start - y.start));
    const text = segs.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
    const note = g.kind === 'note' && noteOf ? String(noteOf(g.gid) || '').trim() : '';
    let t = byTopic.get(g.id);
    if (!t) { t = { entry: byId.get(g.id), items: [] }; byTopic.set(g.id, t); }
    t.items.push({ gid: g.gid, kind: g.kind, index: g.index, start: g.start, text, note });
    if (g.kind === 'note') out.notes++; else out.marks++;
  }
  out.topics = [...byTopic.values()].sort((a, b) => (pos.get(a.entry.id) || 0) - (pos.get(b.entry.id) || 0));
  for (const t of out.topics) t.items.sort((x, y) => (x.index - y.index) || (x.start - y.start));
  return out;
}

/**
 * "14 highlights and notes in 6 topics" (the Tools row; the screen's lede adds the order).
 * A highlight, underline or squiggle counts as a highlight. '' when there are none.
 * @param {AnswersSaved} s
 */
export function answersSavedSum(s) {
  const n = s.marks + s.notes;
  if (!n) return '';
  const what = s.marks && s.notes ? n + NBSP + 'highlights and notes' : s.marks ? pl(s.marks, 'highlight') : pl(s.notes, 'note');
  return what + ' in ' + pl(s.topics.length, 'topic');
}

/**
 * Where a paragraph's words come from, in the shape a search hit carries (answersHitSource):
 * the source line that closes its passage and the date its header carries, or on a page of
 * prose (and words outside every passage) the section it sits in.
 * @param {any} item the topic's buildAnswersIndex entry
 * @param {number} index
 * @param {any[] | null} [sections] the topic's sidecar sections
 * @returns {{ index: number, src: number, date: string, sec: string }}
 */
export function answersParaSource(item, index, sections) {
  if (item && !item.prose) {
    for (const p of item.passages) {
      if (p.src === index || p.paras.some((q) => q.index === index)) return { index, src: p.src, date: p.date || '', sec: '' };
    }
  }
  const s = answersSectionOf(sections || null, index);
  return { index, src: -1, date: '', sec: s ? (s.parent || s.section).title || '' : '' };
}

/* ── Share as a card ───────────────────────────────────────────────── */

/** The card's three themes: ground, words and gold (the D3 table; Night is the app's own black). */
export const ANSWERS_CARD_THEMES = Object.freeze([
  { id: 'parchment', label: 'Parchment', bg: '#f7f2e8', text: '#000000', gold: '#7a5c10' },
  { id: 'ink', label: 'Ink', bg: '#ffffff', text: '#000000', gold: '#705c26' },
  { id: 'night', label: 'Night', bg: '#000000', text: '#ece6db', gold: '#d6b35f' },
]);
export const ANSWERS_CARD_MAX_WORDS = 80;
export const ANSWERS_CARD_SITE = 'answersonlygodcangive.com';
export const ANSWERS_CARD_W = 1080;
export const ANSWERS_CARD_H = 1350;

/** A Format B paragraph as the page shows it: its marks out, a cite as "(X)", its line breaks kept. */
export function answersShownText(text) {
  return answersInlinePieces(text).map((p) => (p.br ? '\n' : p.t)).join('').trim();
}

/** The words a card's passage holds, by the daily pool's own count. */
export function answersCardWords(passage) {
  return String(passage || '').split('\n').reduce((n, l) => n + answersWordCount(l), 0);
}

/**
 * @typedef {{ passage: string, cite: string, date: string }} AnswersCard
 */

/**
 * The card for a passage of a topic: its citation is the source line that closes the passage
 * (“Title” · Volume N), else the section and the topic, else the topic; the date its header carries.
 * @param {any} entry
 * @param {any} item the topic's buildAnswersIndex entry
 * @param {number} index the passage's first paragraph
 * @param {string} passage the words, verbatim
 * @param {any[] | null} [sections]
 * @returns {AnswersCard}
 */
export function answersCardFor(entry, item, index, passage, sections) {
  const at = answersParaSource(item, index, sections);
  const p = at.src >= 0 && entry && entry.paragraphs ? entry.paragraphs[at.src] : null;
  const sp = p ? answersSourceParts(p.text) : null;
  const title = entry ? entry.title : '';
  const cite = sp ? sp.title + ' · ' + sp.collection : at.sec && at.sec !== title ? at.sec + ' · ' + title : title;
  return { passage: String(passage || '').trim(), cite, date: at.date };
}

/**
 * Lines that fit `width`: hard breaks kept, words never split (one longer than the line stands alone).
 * @param {string} text
 * @param {number} width
 * @param {(s: string) => number} measure
 * @returns {string[]}
 */
export function answersWrap(text, width, measure) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(' ').filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (line && measure(next) > width) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/**
 * Where everything on the card goes. The passage takes the largest size from 60px down to 24px at
 * which it and the foot fit, centred in the room above the foot.
 * @param {AnswersCard} card
 * @param {(font: string) => (s: string) => number} measurer a measure for a CSS font
 * @param {string} family the app serif (--font-body)
 */
export function answersCardLayout(card, measurer, family) {
  const W = ANSWERS_CARD_W, H = ANSWERS_CARD_H, pad = 96, width = W - 2 * pad;
  const footFont = 'italic 34px ' + family;
  const cite = answersWrap(card.cite, width, measurer(footFont));
  const foot = [];
  let y = H - pad;
  foot.unshift({ text: ANSWERS_CARD_SITE, y, font: '30px ' + family, gold: true });
  y -= 56;
  if (card.date) { foot.unshift({ text: card.date, y, font: footFont, gold: false }); y -= 48; }
  for (let i = cite.length - 1; i >= 0; i--) { foot.unshift({ text: cite[i], y, font: footFont, gold: false }); y -= 48; }
  const rule = y - 16;
  const room = rule - 40 - pad;
  let size = 60, lines = [], lh = 0;
  for (; size >= 24; size -= 2) {
    lh = Math.round(size * 1.45);
    lines = answersWrap(card.passage, width, measurer(size + 'px ' + family));
    if (lines.length * lh <= room) break;
  }
  if (size < 24) size = 24;
  const top = pad + Math.max(0, (room - lines.length * lh) / 2);
  return {
    W, H, pad, size, lh, font: size + 'px ' + family,
    lines: lines.map((text, i) => ({ text, y: top + (i + 1) * lh - Math.round(lh * 0.3) })),
    rule, foot,
  };
}
