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


function linkWtlbEntries(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i].prevEntry = i > 0 ? { id: arr[i - 1].id, title: arr[i - 1].title } : null;
    arr[i].nextEntry = i < arr.length - 1 ? { id: arr[i + 1].id, title: arr[i + 1].title } : null;
  }
}

function linkPreface(preface, letters) {
  if (!preface || !letters || letters.length === 0) return;
  preface.num = 0;
  preface.isPreface = true;
  preface.nextLetter = { id: letters[0].id, title: letters[0].title };
  letters[0].prevLetter = { id: preface.id, title: preface.title };
}

function resolveVotLetter(vol, letter) {
  if (!letter) return null;
  // Exact vol::letter match first; fall back to "null::letter" for entries
  // whose vol is intentionally null in matthew.js (e.g. standalone-album refs).
  const key = (vol || "null") + "::" + letter;
  return VOT_LETTER_REGISTRY.get(key) || null;
}

function isHiddenManna(n) {
  return !!n && HIDDEN_MANNA_TITLES.has((n.letter || "").trim());
}

