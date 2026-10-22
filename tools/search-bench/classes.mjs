/* The benchmark's EQUIVALENCE CLASSES, shared by search-bench.mjs and the tri bench's gates (tri/check-tri.mjs).
   ─────────────────────────────────────────────────────────────────
   Moved here from search-bench.mjs (search200, 2026-10-18) so a collision screen and the bench judge "the target's
   class" by one definition. The rules are search-bench.mjs's header §2-3; the pure parts are rules.mjs (tested). One
   rule was added with the tri bench (PLAN 1.6, fixed before any tri run): titleNorm also files a study chapter under
   its chapter title alone (rules.mjs titleForms), so a title target links it by its short title.
   ─────────────────────────────────────────────────────────────────── */
import { unitKey, norm } from './corpus.mjs';
import { heldShare, recurring, nearCopy, nearQuote, titleForms, parallelHolds, namesVerse } from './rules.mjs';

/**
 * @param {{ D: any[], B: any[], KJV: any }} corpus  buildDocs('nkjv'), blocks(), kjvVerses()
 */
export function makeClasses({ D, B, KJV }) {
  const g = /** @type {any} */ (globalThis);
  // ── unit tables ──
  const unitBlocks = {};
  for (const b of B) (unitBlocks[b.uk] || (unitBlocks[b.uk] = [])).push(b);
  const unitDoc = {};
  for (const d of D) { const k = unitKey(d); if (!unitDoc[k]) unitDoc[k] = d; }
  const TIER = (uk) => {
    const col = uk.slice(0, uk.indexOf('/'));
    if (col === 'bible' || col === 'matthew-study') return 0;
    if (/^(v[1-7]|timothy|flock|rebuke)$/.test(col)) return 0;
    if (col === 'wtlb1' || col === 'wtlb2' || col === 'blessed') return 1;
    if (col === 'holydays') return 2;
    if (col === 'bible-studies') return 3;
    return 4; // answers
  };
  const proseKeys = Object.keys(unitBlocks);
  const proseNorm = proseKeys.map((k) => norm(unitBlocks[k].map((b) => b.text).join(' ')));
  /** Units holding the sentence: word for word, or a near copy holding 80% of its word 3-grams (search-plan.md §3). */
  const holders = (sentence) => {
    const n = norm(sentence); const w = n.trim().split(' ');
    const grams = []; for (let i = 0; i + 3 <= w.length; i++) grams.push(' ' + w.slice(i, i + 3).join(' ') + ' ');
    const probes = w.length >= 5 ? [0, (w.length - 5) >> 1, w.length - 5].map((i) => ' ' + w.slice(i, i + 5).join(' ') + ' ') : [n];
    const out = [];
    proseNorm.forEach((t, i) => {
      if (t.includes(n)) { out.push(proseKeys[i]); return; }
      if (grams.length < 4) return;
      // ...in one place: the 3-grams around a probe's hit, not anywhere in a long letter ("and follow me" is in most).
      for (const p of probes) for (let at = t.indexOf(p); at >= 0; at = t.indexOf(p, at + 1)) {
        const win = t.slice(Math.max(0, at - n.length), at + p.length + n.length);
        if (grams.filter((g) => win.includes(g)).length >= 0.8 * grams.length) { out.push(proseKeys[i]); return; }
      }
    });
    return out;
  };
  // A prose sentence that quotes Scripture has the verse as its original (a study or Answers line
  // that is Luke 23:15 word for word): verses whose text holds the sentence, or that it holds whole.
  const verseNorm = D.filter((d) => d.kind === 'verse').map((d) => [unitKey(d), norm(d.text)]);
  // ...in the KJV wording too (a study quotes 1 John 5:3 as "His commandments are not grievous").
  for (const [book, chs] of Object.entries(KJV)) for (const [ch, vs] of Object.entries(chs)) for (const v of vs) verseNorm.push(['bible/' + book + ':' + ch + ':' + v.n, norm(v.text)]);
  for (let i = verseNorm.length - 1; i >= 0; i--) if (verseNorm[i][1].split(' ').length < 8) verseNorm.splice(i, 1);
  // ...with His name restored too: a study quotes Luke 7:9 as "When YahuShua heard these things".
  const named = (t) => t.replace(/ (?:yahushua|yeshua|yahshua|yahusha|yeshu) /g, ' jesus ').replace(/ (?:yahushua|yeshua|yahshua|yahusha|yeshu) /g, ' jesus ');
  // ...or as a near copy, the same 80%-of-3-grams rule as a prose holder, either way round (a study quotes Acts 20:16 as
  // "for he hurried" where the KJV has "for he hasted"; a sentence holds a verse with a word changed). sr11, 2026-10-15.
  const verseWords = verseNorm.map(([, t]) => t.trim().split(' '));
  const verseGrams = new Map();
  verseWords.forEach((w, i) => { for (let j = 0; j + 3 <= w.length; j++) { const g = w[j] + ' ' + w[j + 1] + ' ' + w[j + 2]; const a = verseGrams.get(g); if (!a) verseGrams.set(g, [i]); else if (a[a.length - 1] !== i) a.push(i); } });
  /** verse index -> how many of the words' distinct 3-grams it holds */
  const sharedGrams = (w) => {
    const shared = new Map();
    for (const g of new Set(w.slice(0, -2).map((x, j) => x + ' ' + w[j + 1] + ' ' + w[j + 2]))) for (const i of verseGrams.get(g) || []) shared.set(i, (shared.get(i) || 0) + 1);
    return shared;
  };
  const versesQuoted = (sentence) => {
    const n = named(norm(sentence));
    const out = new Set(verseNorm.filter(([, t]) => t.includes(n) || n.includes(t)).map(([k]) => k));
    const w = n.trim().split(' ');
    const shared = sharedGrams(w);
    for (const [i, k] of shared) if (k >= 4 && (heldShare(w, verseWords[i]) >= 0.8 || heldShare(verseWords[i], w) >= 0.8)) out.add(verseNorm[i][0]);
    return [...out];
  };
  /** PARALLEL (rules.mjs, errata 2026-10-19): the other verses holding verse `uk`'s whole text (Luke 10:2 for Matthew
      9:38), looked for among the verses holding its first 3-gram. */
  const parallels = (uk) => {
    const own = matthewTwin(uk);
    const d = own.map((k) => unitDoc[k]).find(Boolean) || unitDoc[uk];
    if (!d) return [];
    const n = norm(d.text);
    const w = n.trim().split(' ');
    const at = w.length >= 3 ? verseGrams.get(w[0] + ' ' + w[1] + ' ' + w[2]) || [] : [];
    return [...new Set(at.filter((i) => parallelHolds(n, verseNorm[i][1])).map((i) => verseNorm[i][0]))]
      .filter((k) => !matthewTwin(k).some((t) => own.includes(t) || t === uk));
  };
  // A unit's title, and a study chapter's chapter title alone (rules.mjs titleForms).
  const titleNorm = {};
  for (const k of proseKeys) for (const f of titleForms(unitBlocks[k][0].title, k.startsWith('bible-studies/'))) { const t = norm(f); const a = titleNorm[t] || (titleNorm[t] = []); if (!a.includes(k)) a.push(k); }
  const matthewTwin = (uk) => {
    const m = /^(?:bible\/matthew(?:-plain)?|matthew-study\/matthew):(\d+):(\d+)$/.exec(uk);
    return m ? ['bible/matthew-plain:' + m[1] + ':' + m[2], 'matthew-study/matthew:' + m[1] + ':' + m[2]] : [uk];
  };

  // CONTAINMENT (rules.mjs): the texts holding 80% of a whole-text target asked for by its subject. Candidates first: texts holding 80% of its
  // distinct words found in under a tenth of the texts, then the 3-gram window rule on those.
  const proseWords = proseNorm.map((t) => t.trim().split(' '));
  const wordUnits = new Map();
  proseWords.forEach((ws, i) => { for (const x of new Set(ws)) { const a = wordUnits.get(x); if (a) a.push(i); else wordUnits.set(x, [i]); } });
  const containers = (uk) => {
    const at = proseKeys.indexOf(uk);
    if (at < 0) return [];
    const rare = [...new Set(proseWords[at])].filter((x) => wordUnits.get(x).length < proseKeys.length / 10);
    const n = new Map();
    for (const x of rare) for (const i of wordUnits.get(x)) if (i !== at) n.set(i, (n.get(i) || 0) + 1);
    return [...n].filter(([i, k]) => k >= 0.8 * rare.length && heldShare(proseWords[at], proseWords[i]) >= 0.8).map(([i]) => proseKeys[i]);
  };
  /** Texts holding the sentence with a word or two changed (rules.mjs NEAR COPY), looked for at its two rarest words. */
  const nearCopies = (sentence) => {
    const w = norm(sentence).trim().split(' ');
    const stop = g.VotSearchData.STOP_WORDS_TRIMMED;
    const rare = [...new Set(w)].filter((x) => wordUnits.has(x)).sort((a, b) => wordUnits.get(a).length - wordUnits.get(b).length).slice(0, 2);
    const out = new Set();
    for (const x of rare) for (const i of wordUnits.get(x)) if (!out.has(proseKeys[i]) && nearCopy(w, proseWords[i], stop, x)) out.add(proseKeys[i]);
    return out;
  };
  /** NEAR QUOTE (rules.mjs, errata 2026-10-18): verses the sentence holds, or that hold it, with a word or two changed
      ("given you" / "given to you", "shall find" / "will find"), among those sharing 4+ of its 3-grams. */
  const versesNear = (sentence) => {
    const w = named(norm(sentence)).trim().split(' ');
    const stop = g.VotSearchData.STOP_WORDS_TRIMMED;
    const rank = (x) => (wordUnits.get(x) || []).length;
    const out = [];
    for (const [i, k] of sharedGrams(w)) if (k >= 4 && nearQuote(w, verseWords[i], stop, rank)) out.push(verseNorm[i][0]);
    return out;
  };
  /* AN ANSWERS HEADING OVER ONE CITED EXCERPT (sr11, 2026-10-15). A topic labels a passage it reprints with a heading of
     its own words ("The Religions of Men Are an Abomination to The Lord" heads three passages of "The Truth Absolute" ~
     Volume 3), and the citation closing the section names the text it comes from. That text is the heading's original
     (Corbin, DECISIONS 10-14: the original first, the reprint second). The section runs to the next ✦; one text cited. */
  const CITE_LINE = /^~\s*\[From\s*[“"](.+)[”"]\s*~\s*(.+?)\]\s*$/;
  const CITE_COL = { "the lord's rebuke": 'rebuke', 'words to live by: part one': 'wtlb1', 'words to live by: part two': 'wtlb2',
    "letters to the lord's little flock": 'flock', 'letters from timothy': 'timothy', 'the blessed': 'blessed' };
  /** The text a heading's section reprints and that section's passages (normalized), or null. */
  function sectionOf(c) {
    const bl = unitBlocks[c.uk] || [];
    const at = bl.findIndex((b) => b.idx === c.blockIdx);
    // a heading: a short block of its own
    if (at < 0 || c.sentence.length > 160 || bl[at].text.trim() !== c.sentence.trim()) return null;
    const cites = new Set();
    const parts = [];
    for (let i = at + 1; i < bl.length && bl[i].text.trim() !== '✦'; i++) {
      const m = CITE_LINE.exec(bl[i].text.trim());
      if (m) cites.add(norm(m[1]) + '|' + m[2].trim().toLowerCase().replace(/[’‘]/g, "'"));
      else parts.push(bl[i].text);
    }
    if (cites.size !== 1) return null;
    const [t, vol] = [...cites][0].split('|');
    const v = /^volume (\d)$/.exec(vol);
    const col = v ? 'v' + v[1] : CITE_COL[vol];
    const keys = (titleNorm[t] || []).filter((k) => k.startsWith(col + '/'));
    return keys.length === 1 ? { key: keys[0], text: norm(parts.join(' ')) } : null;
  }
  const isVerseKey = (k) => /^(bible|matthew-study)\//.test(k);
  const isLetterKey = (k) => /^(v[1-7]|timothy|flock|rebuke)\//.test(k);

  /** The target's equivalence class, the tier its original sits in, and whether it has one original at all. */
  function classOf(c) {
    const members = new Set();
    /** members a heading target names by their own title: opening one is arriving under the heading */
    const titled = new Set();
    /** @type {Map<string, string>} the text a heading's section reprints -> the section's passages (sectionOf) */
    const sectioned = new Map();
    /** members holding the sentence with a word or two changed: they answer it, and are no original of it */
    const near = new Set();
    if (c.level === 'verse') {
      for (const k of matthewTwin(c.uk)) members.add(k);
      // a merged Bible misquote (tri bench): two adjacent verses, either of them answers (rules.mjs pairHolds)
      if (c.uk2) for (const k of matthewTwin(c.uk2)) members.add(k);
      // ...one verse: a verse holding it whole says it too, as a near member (rules.mjs PARALLEL); a pair has none,
      // and a query naming the verse asks for it alone
      else if (!namesVerse(norm(c.q || ''), c.ref)) for (const k of parallels(c.uk)) for (const t of matthewTwin(k)) if (!members.has(t)) { members.add(t); near.add(t); }
      return { members, titled, sectioned, near, best: 0, recurring: false };
    }
    if (c.level === 'unit') {
      members.add(c.uk);
      for (const k of titleNorm[norm(c.title)] || []) members.add(k);
      // ...by its subject, any copy of it answers; a title names its own text (same-titled reprints above)
      if (c.style === 'unitgist') for (const k of containers(c.uk)) members.add(k);
    } else {
      for (const k of holders(c.sentence)) members.add(k);
      for (const k of nearCopies(c.sentence)) if (!members.has(k)) { members.add(k); near.add(k); }
      if (c.level === 'sentence') {
        for (const k of versesQuoted(c.sentence)) for (const t of matthewTwin(k)) members.add(t);
        // ...and one it quotes with a word or two changed answers it too, as a near member (rules.mjs NEAR QUOTE)
        for (const k of versesNear(c.sentence)) for (const t of matthewTwin(k)) if (!members.has(t)) { members.add(t); near.add(t); }
      }
      // An Answers heading that cites a letter ("Excerpt from: Let All in the Earth Be Brought into...") has that letter as its original.
      const cited = /^excerpt from:\s*(.+)$/i.exec(c.sentence.trim());
      if (cited) for (const k of titleNorm[norm(cited[1])] || []) members.add(k);
      // So does a heading that is a text's own title, with or without a note after it ("Stop Lying to Your Children
      // (Regarding Santa, the Easter Bunny...)" heads the Words To Live By entry the topic reprints under it).
      const head = norm(c.sentence.trim().replace(/\s*\([^()]*\)$/, ''));
      if (head.trim().split(' ').length >= 3) for (const k of titleNorm[head] || []) if (k !== c.uk) { members.add(k); titled.add(k); }
      // And a heading over one cited excerpt has the text it cites.
      const sec = c.col === 'answers' ? sectionOf(c) : null;
      if (sec && sec.key !== c.uk) { members.add(sec.key); sectioned.set(sec.key, sec.text); }
      members.add(c.uk);
    }
    // The text a heading's section cites answers it as well, but does not outrank the heading: its words are the topic's own.
    return { members, titled, sectioned, near, best: Math.min(...[...members].filter((k) => !sectioned.has(k) && !near.has(k)).map(TIER)), recurring: recurring(members, isVerseKey, isLetterKey) };
  }

  return { unitBlocks, unitDoc, TIER, proseKeys, proseNorm, proseWords, wordUnits, holders, verseNorm, versesQuoted, versesNear, titleNorm,
    matthewTwin, containers, nearCopies, sectionOf, isVerseKey, isLetterKey, classOf, CITE_LINE };
}
