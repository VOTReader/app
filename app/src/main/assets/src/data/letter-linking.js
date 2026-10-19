/* ===================================================================
   Boot-time letter cross-linking — wires prevEntry/nextEntry/prevLetter/nextLetter + helpers
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - linkWtlbEntries
   - linkPreface
   - resolveVotLetter
   - isHiddenManna
   =================================================================== */


// Entries that sit outside their collection's array-order chain: the Answers
// Main Page is appended LAST to ANSWERS (c72) so no topic's paragraph index
// moves, and must not become the orphan topic's Next (aogcg phase 1a; the
// site's own order, Main Page -> THERE IS NO OTHER, comes with answersSiteOrder).
const UNCHAINED_ENTRY_IDS = new Set(['answers-main-page']);

export function linkWtlbEntries(arr) {
  const chain = arr.filter((e) => !UNCHAINED_ENTRY_IDS.has(e.id));
  for (const e of arr) {
    if (UNCHAINED_ENTRY_IDS.has(e.id)) { e.prevEntry = null; e.nextEntry = null; }
  }
  for (let i = 0; i < chain.length; i++) {
    chain[i].prevEntry = i > 0 ? { id: chain[i - 1].id, title: chain[i - 1].title } : null;
    chain[i].nextEntry = i < chain.length - 1 ? { id: chain[i + 1].id, title: chain[i + 1].title } : null;
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

