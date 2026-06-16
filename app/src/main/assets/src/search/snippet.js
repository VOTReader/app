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
  let bestIdx = -1;
  let bestLen = 0;
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i].toLowerCase();
    if (!t) continue;
    const idx = lower.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) { bestIdx = idx; bestLen = t.length; }
  }
  if (bestIdx < 0) return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  const half = Math.max(20, Math.floor((maxLen - bestLen) / 2));
  let start = Math.max(0, bestIdx - half);
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
