/* ===================================================================
   Boot-time letter cross-linking — wires prevEntry/nextEntry/prevLetter/nextLetter + helpers
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - linkWtlbEntries (Answers: the site's order)
   - linkPreface
   - resolveVotLetter
   - isHiddenManna
   =================================================================== */


import { ANSWERS_MAIN_PAGE_ID } from '../utils/answers-shelves.js';
import { answersSiteNav } from '../utils/answers-site.js';

// Answers chains in the SITE's order (utils/answers-site.js, AOGCG Topic stage, U3), not the array's:
// its Main Page is appended LAST (c72) so no topic's paragraph index moves, yet the site reads it
// first (Main Page -> THERE IS NO OTHER), and Flat Earth hands on to the False Doctrines index.
export function linkWtlbEntries(arr) {
  if (arr.some((e) => e && e.id === ANSWERS_MAIN_PAGE_ID)) { linkSiteOrder(arr); return; }
  for (let i = 0; i < arr.length; i++) {
    arr[i].prevEntry = i > 0 ? { id: arr[i - 1].id, title: arr[i - 1].title } : null;
    arr[i].nextEntry = i < arr.length - 1 ? { id: arr[i + 1].id, title: arr[i + 1].title } : null;
  }
}

function linkSiteOrder(arr) {
  const byId = new Map(arr.map((e) => [e.id, e]));
  const ref = (id) => { const e = id ? byId.get(id) : null; return e ? { id: e.id, title: e.title } : null; };
  for (const e of arr) {
    const nav = answersSiteNav(arr, e.id);
    e.prevEntry = nav ? ref(nav.prev) : null;
    e.nextEntry = nav ? ref(nav.next || (nav.proceed && nav.proceed.id)) : null;
  }
}

export function linkPreface(preface, letters) {
  if (!preface || !letters || letters.length === 0) return;
  preface.num = 0;
  preface.isPreface = true;
  preface.nextLetter = { id: letters[0].id, title: letters[0].title };
  letters[0].prevLetter = { id: preface.id, title: preface.title };
}

export function resolveVotLetter(vol, letter) {
  if (!letter) return null;
  // Exact vol::letter match first; fall back to "null::letter" for entries
  // whose vol is intentionally null in matthew.js (e.g. standalone-album refs).
  const key = (vol || "null") + "::" + letter;
  return VOT_LETTER_REGISTRY.get(key) || null;
}

export function isHiddenManna(n) {
  return !!n && HIDDEN_MANNA_TITLES.has((n.letter || "").trim());
}

