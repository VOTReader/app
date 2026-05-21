/* ═══════════════════════════════════════════════════════════════════════
   VerseWithNumbers — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function VerseWithNumbers({ text, refStr }) {
  const segments = splitIntoVerses(text, refStr);
  if (!segments) {
    // Single-verse ref — strip ALL Unicode superscript digits so a data
    // regression (stray ¹ ² ³ in the middle of verse text) never renders
    // as a plain white character.
    const cleaned = (text || "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, "");
    return /*#__PURE__*/React.createElement("span", null, cleaned);
  }
  return (/*#__PURE__*/
    React.createElement("span", null,
    segments.map((seg, i) => /*#__PURE__*/
    React.createElement("span", { key: i }, /*#__PURE__*/
    React.createElement("sup", { className: "verse-sup" }, seg.vNum),
    seg.text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, ''), i < segments.length - 1 ? " " : ""
    )
    )
    ));

}

/* Shared tap-through button used in footnote sheet + list. Receives a link
   descriptor {collection, letterTitle, excerpt?}; onActivate resolves it. */
/* A note-type footnote frequently carries BOTH a `text` that is just a
   pointer — e.g.  See: "Some Letter Title"  /  Also read: 'X' — AND a
   `link` whose letterTitle IS that same title. The InAppLinkButton
   already renders the title (under an "Open in App" eyebrow), so showing
   the note text too prints the title twice in one footnote (the duplicate
   the user sees). ~100 footnotes across the corpus author this pointer
   style; it isn't bad data (the note is legitimate prose), it's a
   presentation concern: never show the same title twice in one footnote.
   Detect the PURE-pointer case — text is only a lead-in phrase plus the
   linked title, nothing else — and suppress the redundant text. Notes
   that add real commentary beyond the title are left untouched. */
export function _fnTextRedundantWithLink(text, link) {
  if (!text || !link || !link.letterTitle) return false;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const payload = String(text)
    .replace(/^\s*(see also|also see|also read|see)\s*:?\s*/i, '')
    .trim()
    .replace(/^["“‘']+/, '')
    .replace(/["”’'.\s]+$/, '');
  return norm(payload) === norm(link.letterTitle);
}
