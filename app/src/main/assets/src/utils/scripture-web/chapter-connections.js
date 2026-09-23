/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/chapter-connections — the Scripture Web as a list (A7)
   Cluster F (esbuild bundle-f.js). Pure.

   A device that cannot draw the web (no WebGL2, or a GPU reset Chrome never
   restores) used to get a dead end: "The web can't be drawn right now", Try
   again, Go back. This is what it gets instead (2026-09-22): the threads the
   Famous view would draw at one chapter, grouped by the verse IN the chapter,
   strongest first inside each group. Each row names the other end and its
   tier (Essential = the strongest cut, the rest Famous). Same data, same
   ranking (pick.js nearbyThreads), just read instead of drawn.
   ═══════════════════════════════════════════════════════════════════════ */

import { arcsTouching, nearbyThreads, chapterRange, refOfVerse } from './pick.js';

/**
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} chapterIndex
 * @returns {{ total:number, groups:Array<{ verse:ReturnType<typeof refOfVerse>,
 *   rows:Array<{ index:number, other:ReturnType<typeof refOfVerse>, tier:'essential'|'famous' }> }> }}
 */
export function chapterConnections(g, chapterIndex) {
  if (!g || !g.chapters || !g.chapters[chapterIndex]) return { total: 0, groups: [] };
  const [lo, hi] = chapterRange(g, chapterIndex);
  const essential = new Set(arcsTouching(g, lo, hi, 'essential', 0));
  /** @type {Map<number, any[]>} */
  const byVerse = new Map();
  let total = 0;
  for (const i of nearbyThreads(g, lo, hi, 'famous', 0)) {
    const a = g.from[i], b = g.to[i];
    const here = a >= lo && a <= hi ? a : b;
    const there = here === a ? b : a;
    if (!byVerse.has(here)) byVerse.set(here, []);
    /** @type {any[]} */ (byVerse.get(here)).push({ index: i, other: refOfVerse(g, there), tier: essential.has(i) ? 'essential' : 'famous' });
    total++;
  }
  const groups = [...byVerse.keys()].sort((x, y) => x - y)
    .map((v) => ({ verse: refOfVerse(g, v), rows: /** @type {any[]} */ (byVerse.get(v)) }));
  return { total, groups };
}

/**
 * Where the list opens: the reader's last Bible chapter when the web knows it,
 * else John 3, else the first chapter.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {string | null | undefined} bookId
 * @param {number | null | undefined} chapterNum
 * @returns {number} chapter index
 */
export function startChapter(g, bookId, chapterNum) {
  const find = (/** @type {any} */ id, /** @type {any} */ num) => {
    const bi = g.books.findIndex((b) => b.id === id);
    return bi < 0 ? -1 : g.chapters.findIndex((ch) => ch[0] === bi && ch[1] === num);
  };
  const mine = bookId ? find(bookId, Number(chapterNum)) : -1;
  if (mine >= 0) return mine;
  const john3 = find('john', 3);
  return john3 >= 0 ? john3 : 0;
}
