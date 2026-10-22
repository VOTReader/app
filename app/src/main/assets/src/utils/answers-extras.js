/* ═══════════════════════════════════════════════════════════════════════
   answers-extras — the words and rules of the AOGCG Extras (final design O5)
   ═══════════════════════════════════════════════════════════════════════
   Pure (no DOM, no store): the screens hand in what they read.

     Saved answers (O5, route answers-saved): the reader's highlights and
     notes on Answers topics (keys wtlb:<topic id>:<paragraph>, which no
     other collection uses for these ids), one group per topic in the
     site's order, each mark in reading order; and the count line the
     landing's Tools row and the screen's lede share.

   ═══════════════════════════════════════════════════════════════════════ */

import { pl, NBSP } from './answers-browse.js';
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
