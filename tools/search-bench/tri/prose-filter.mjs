/* Which candidate lines are not prose a reader would remember (search200, 2026-10-18): make-tri.mjs draws exact and
   misremembered targets only from the lines this lets through. Pure: no corpus, no engine; tested in prose-filter.test.js.
   ─────────────────────────────────────────────────────────────────
   General rules, not a list of bad lines. Each names a KIND of line, judged from its own text, its block's type and
   whether it is its block's whole text; the first rule that fits names the line (the order only decides the name):
     sign-off      a closing block ("For I am The Lord, and I do not change.") or a line opening "Says The Lord..."
     link          a download, PDF, web or link line ("FREE PDF download available, here > ...")
     footer        copyright, contact and page furniture
     note          an editor's note: "*NOTE:", "Note:", "P.S.", a line opening on an asterisk
     glossary      a word and its meaning or its language: "Hebrew: ...", "Strong's", "Devour - to eat", "X means: ..."
     source        a line naming where a passage comes from ("Excerpt from: ...", "(From “Title”)")
     references    a line that is mostly Bible references (3 or more, or under 5 other words), opens on one, or
                   is a quotation closed and then cited
     cross-ref     a line that is mostly the name of another writing: a collection's name and a quoted title
     outline       a numbered or lettered outline point ("b) The rich man has...")
     all-caps      a banner: four letters in five uppercase and no sentence end (a shouted sentence stays: it is prose)
     heading       a heading block; a line with no sentence end in Title Case; a short whole block with no sentence end
   ─────────────────────────────────────────────────────────────────── */

const END = /[.!?…]["'”’)\]*]*\s*$/;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu;
const words = (s) => String(s).match(WORD) || [];
const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'from', 'as', 'into',
  'unto', 'upon', 'than', 'that', 'is', 'are', 'be', 'vs', 'via', 'o']);
/** Share of a line's longer words (4+ letters, not small words) that start with a capital. */
export function titleCaseShare(s) {
  const ws = words(s).filter((w) => w.length >= 4 && !SMALL.has(w.toLowerCase()) && /^\p{L}/u.test(w));
  if (ws.length < 2) return 0;
  return ws.filter((w) => /^\p{Lu}/u.test(w)).length / ws.length;
}
/** Share of a line's letters that are uppercase (0 for a line of under 8 letters). */
export function upperShare(s) {
  const L = String(s).match(/\p{L}/gu) || [];
  if (L.length < 8) return 0;
  return L.filter((c) => /\p{Lu}/u.test(c)).length / L.length;
}
const BOOK = String.raw`(?:[1-3]\s?)?\p{Lu}\p{Ll}+(?:\s(?:of\s)?\p{Lu}\p{Ll}+)?\.?`;
const REF = new RegExp(String.raw`${BOOK}\s+\d{1,3}:\d{1,3}(?:\s?[-–]\s?\d{1,3}(?::\d{1,3})?)?(?:,\s?\d{1,3}(?:[-–]\d{1,3})?)*`, 'gu');
const REF_WORD = /^(?:and|see|also|read|cf|compare|ref|verse|verses|chapter|ch)$/i;
// a quotation closed and then cited ("...let these go their way,” – Mark 14:41")
const CITED_QUOTE = /[”"’]\s*[–—-]\s*\(?(?:[1-3]\s?)?\p{Lu}\p{Ll}+\.?\s+\d{1,3}:\d{1,3}/u;
// a line that opens on a reference ("- Exodus 20:11 Therefore...", "14:11 (from #3 above) ..."): a cited verse or a note on one
const OPENS_ON_REF =/^\W*(?:[-–—•*]\s*)?(?:(?:[1-3]\s?)?\p{Lu}\p{Ll}+\.?\s+)?\d{1,3}:\d{1,3}/u;
// a numbered or lettered outline point: "b) The rich man...", "2) ..."
const OUTLINE = /^\W*(?:\d{1,2}|[a-z]|[ivx]{1,4})\)\s/;
/** Bible references in a line ("Matthew 5:3-12", "1 John 4:8"), and how many other words it holds. */
export function references(s) {
  const refs = String(s).match(REF) || [];
  const rest = words(String(s).replace(REF, ' ')).filter((w) => !/^\d/.test(w) && !REF_WORD.test(w));
  return { n: refs.length, rest: rest.length };
}

const SIGN_OFF = /^\W*[Ss]ays\s+[Tt]he\s+\p{Lu}/u;
const LINK = /\bpdfs?\b|\bdownload(?:s|ed|ing|able)?\b|\bclick(?:ing)?\s+(?:here|on|the)\b|https?:|\bwww\.|\b[\w-]+\.(?:com|org|net|info)\b|\bweb\s?(?:site|page)s?\b|\bbrowser\b|\binternet\s+(?:connection|speed)\b|\bavailable\s+here\b|\bhere\s*>|>\s*$|\blinks?\s+(?:below|above)\b|\bprint(?:able|er)\b/i;
// copyright and contact lines, and lines about the page itself ("see the chart at the end of this study", "please share")
const FOOTER = /©|\bcopyright\b|all rights reserved|\bcontact\s+us\b|back\s+to\s+top|return\s+to\s+(?:top|home)|\bshare\s+this\b|\bsubscribe\b|\bplease\s+share\b|\b(?:see|view)\s+the\s+(?:chart|table|diagram|image|picture|map|graphic)\b|\bat\s+the\s+(?:end|bottom|top)\s+of\s+this\s+(?:study|page|letter|section)\b|\bscroll\s+(?:down|up)\b/i;
const NOTE = /^\W*(?:\*|(?:please\s+)?note\b\s*[:\-–—]|n\.\s?b\.|p\.\s?s\.|editor[’']?s\s+note|author[’']?s\s+note|translator[’']?s\s+(?:note|explanation)|footnote\b|update\s*:)/i;
const GLOSSARY = [
  // "Name[1] means: ...", "Sheol meaning: ..."
  /^\W*\p{L}[\p{L}’'-]*(?:\[\d+\])?\s+(?:means|meaning|signifies)\s*:/iu,
  /\b(?:hebrew|greek|aramaic|chaldean|latin)(?:\s+word)?\s*[:=]\s*\S/i,
  /\bstrong[’']?s\b|\bconcordance\b|\blexicon\b|\btransliterat/i,
  /\b(?:hebrew|greek|aramaic)\s+(?:words?|terms?|manuscripts?|texts?|roots?|nouns?|verbs?)\b/i,
  // a term, a dash, its meaning: "Devour – to eat", "Sheol – Hebrew ..."
  /^\W*[-–—•*]?\s*\p{L}[\p{L}’'-]*(?:\s+\p{L}[\p{L}’'-]*){0,2}\s+[–—=]\s+(?:hebrew|greek|aramaic|meaning|means|lit\b|literally|to\s+\p{L}+,)/iu,
  /^\W*\p{L}[\p{L}’'-]*(?:\s+\p{L}[\p{L}’'-]*){0,2}\s*\((?:hebrew|greek|aramaic|lit\.?|literally)\b/iu,
];
const SOURCE = /^\W*(?:excerpts?\s+(?:taken\s+)?from|taken\s+from|quoted\s+from|source\s*:|from\s*:|\(\s*from\b|\(\s*the\s+volumes\s+of\s+truth\b|from\s+the\s+volumes\s+of\s+truth\b)/i;
const COLLECTION = /\bvolume\s+(?:one|two|three|four|five|six|seven|[1-7])\b|\bwords\s+to\s+live\s+by\b|\bletters\s+from\s+timothy\b|\bthe\s+lord[’']s\s+rebuke\b|\bletters\s+to\s+the\s+lord[’']s\s+little\s+flock\b|\bletter\s+study\b|\bbible\s*\/\s*letter\b|\bthe\s+volumes\s+of\s+truth\b|\bthe\s+letters\b/gi;
/** The quoted stretches of a line: curly pairs, and straight pairs only when its straight quotes balance. */
const quoted = (s) => [...s.matchAll(/“([^“”]{2,})”/g)].map((m) => m[1])
  .concat((s.match(/"/g) || []).length % 2 === 0 ? [...s.matchAll(/"([^"]{2,})"/g)].map((m) => m[1]) : []);
const unquoted = (s) => { let r = s.replace(/“[^“”]{2,}”/g, ' '); if ((r.match(/"/g) || []).length % 2 === 0) r = r.replace(/"[^"]{2,}"/g, ' '); return r; };

// Leads a line carries that are not the remembered words (make-tri strips them before its own stock-opener rule):
// a speaker tag ("[The Lord answered] "), a formula opener ending in a colon even when quoted or led by For/And/So
// ("\"Thus says The Lord God: ", "For thus declares The Lord: ") and a question's or answer's label ("Question asked
// by Timothy: ", "Answer: ").
const SPEAKER = /^["“‘']?\s*\[[^\]]{1,40}\]\s*/;
const THUS = /^["“‘']?\s*(?:(?:for|and|so|therefore|now|yet),?\s+)?thus\s+(?:says|saith|declares|declared|said)\s+the\b[^.:!?]*:\s*/i;
const ASKED = /^["“‘']?\s*(?:(?:this\s+)?question\s+(?:was\s+)?asked\b[^.:!?]*|question|answer|q|a)\s*:\s*/i;
/** The line without those leads: always a suffix of it, so offsets stay true. */
export const stripLead = (s) => String(s).replace(SPEAKER, '').replace(THUS, '').replace(ASKED, '');

/** Is this candidate line not prose? The rule's name, or null for prose.
    ctx.type: its block's type (para, poetry, closing, heading...); ctx.whole: the line is its block's whole text. */
export function nonProse(text, ctx = {}) {
  const s = String(text).trim();
  const type = ctx.type || 'para';
  if (type === 'closing' || type === 'closing-fn' || SIGN_OFF.test(s)) return 'sign-off';
  if (LINK.test(s)) return 'link';
  if (FOOTER.test(s)) return 'footer';
  if (NOTE.test(s)) return 'note';
  if (GLOSSARY.some((re) => re.test(s))) return 'glossary';
  if (SOURCE.test(s)) return 'source';
  const r = references(s);
  if (r.n >= 3 || (r.n >= 1 && r.rest < 5) || OPENS_ON_REF.test(s) || CITED_QUOTE.test(s)) return 'references';
  if (s.match(COLLECTION)) {
    const inQuotes = quoted(s).reduce((a, q) => a + words(q).length, 0);
    const outside = words(unquoted(s).replace(COLLECTION, ' ')).length;
    if (outside < (inQuotes ? 6 : 5)) return 'cross-ref';
  }
  if (OUTLINE.test(s)) return 'outline';
  if (type === 'heading' || type === 'subheading' || type === 'title') return 'heading';
  const ended = END.test(s);
  // A line set in capitals with no sentence end is a banner or a heading. A shouted SENTENCE ("WOE TO ALL WHO REFUSE
  // TO COME OUT!") is the text itself, set in capitals for emphasis: prose, and case folds away in every query.
  if (!ended && upperShare(s) >= 0.8) return 'all-caps';
  if (!ended && (titleCaseShare(s) >= 0.75 || (ctx.whole && !/[:;,—–-]\s*$/.test(s) && words(s).length <= 16))) return 'heading';
  return null;
}
export const RULES = ['sign-off', 'link', 'footer', 'note', 'glossary', 'source', 'references', 'cross-ref', 'outline', 'all-caps', 'heading'];
