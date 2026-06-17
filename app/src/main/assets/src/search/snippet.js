/* ═══════════════════════════════════════════════════════════════════════
   search/snippet.js — result snippet + highlight-span generation
   ═══════════════════════════════════════════════════════════════════════
   Pure text helpers consumed by the result cards. Both are archaic-aware: a
   "you" query centers/highlights "thee"/"thou"/"ye" in the displayed verse.
   Ported verbatim from the FlexSearch engine.
   ═══════════════════════════════════════════════════════════════════════ */

import { expandArchaicTerms } from './tokenize.js';

/**
 * Extract a ~maxLen-char excerpt centered on the first matched term.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [maxLen=180]
 * @returns {string}
 */
export function snippet(text, terms, maxLen) {
  maxLen = maxLen || 180;
  if (!text) return '';
  if (!terms || !terms.length) {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }
  const expanded = expandArchaicTerms(terms);
  const lower = text.toLowerCase();
  // Collect EVERY occurrence of every matchable term (capped for long bodies).
  const occ = [];
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i].toLowerCase();
    if (t.length < 2) continue;
    let idx = lower.indexOf(t);
    while (idx >= 0 && occ.length < 400) {
      occ.push({ idx, len: t.length, term: t });
      idx = lower.indexOf(t, idx + t.length);
    }
  }
  if (!occ.length) return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  occ.sort((a, b) => a.idx - b.idx);
  // Pick the maxLen-wide window covering the MOST DISTINCT query terms — the
  // passage where the query words actually cluster (the remembered phrase), not
  // the first stray hit of one common word. Ties resolve to the earliest window.
  let bestStart = occ[0].idx;
  let bestCount = 0;
  let bestSpan = occ[0].len;
  for (let s = 0; s < occ.length; s++) {
    const winStart = occ[s].idx;
    const seen = Object.create(null);
    let count = 0;
    let spanEnd = winStart + occ[s].len;
    for (let e = s; e < occ.length && (occ[e].idx + occ[e].len) <= winStart + maxLen; e++) {
      if (!seen[occ[e].term]) { seen[occ[e].term] = true; count++; }
      spanEnd = occ[e].idx + occ[e].len;
    }
    if (count > bestCount) { bestCount = count; bestStart = winStart; bestSpan = spanEnd - winStart; }
  }
  // Center the matched span within maxLen.
  const pad = Math.max(0, Math.floor((maxLen - bestSpan) / 2));
  let start = Math.max(0, bestStart - pad);
  const end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);
  let clip = text.slice(start, end);
  if (start > 0) clip = '…' + clip;
  if (end < text.length) clip = clip + '…';
  return clip;
}

/**
 * Split text into {text, hit} spans for rendering — hit spans get <mark>.
 * @param {string} text
 * @param {string[]} terms
 * @returns {Array<{text:string, hit:boolean}>}
 */
export function highlightSpans(text, terms) {
  if (!text) return [{ text: '', hit: false }];
  if (!terms || !terms.length) return [{ text, hit: false }];
  const expanded = expandArchaicTerms(terms);
  const tokens = [];
  for (let i = 0; i < expanded.length; i++) {
    const t = (expanded[i] || '').trim().toLowerCase();
    if (t && t.length >= 2) tokens.push(t);
  }
  if (!tokens.length) return [{ text, hit: false }];
  const esc = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  esc.sort((a, b) => b.length - a.length); // longer first
  let re;
  try { re = new RegExp('(' + esc.join('|') + ')', 'gi'); } catch { return [{ text, hit: false }]; }
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
