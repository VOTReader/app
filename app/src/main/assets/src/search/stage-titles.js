/* search/stage-titles.js — the titles named: the title typed leads (B1), a title remembered loosely joins (B5).
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.out / ctx.idOf (the results by the words), ctx.p, ctx.wanted, ctx.keyword, ctx.typedTokens, ctx.typedNum,
   ctx.STOP, ctx.titleScore, ctx.runAt, ctx.nearOf, ctx.alignHeld, ctx.docLookup, ctx.matchedTerms, ctx.allowed,
   ctx.fresh, ctx.eng.
   WRITES ctx.typedContent, ctx.named (a title the query names), ctx.admittedDocs / ctx.admittedWhole / ctx.byOwnTitle
   (what the title admission placed), ctx.keptDocs (texts that keep their place), ctx.alignedSo, ctx.landedByTitle /
   ctx.titleTop (the texts a title opens at); re-orders ctx.out and adds the titles admitted to it. */

import { kjvEncode } from './tokenize.js';
import { joinApostropheS, NEAR_PHRASE_MIN, titleLevel, TITLE_LEVEL_LEAD, TITLE_LEAD } from './ranking.js';
import { scoreTitles, admitTitles, swapTitles, stripCollections, titleWords, titleShare } from './titles.js';

/** Place the titles the query names. @param {any} ctx */
export function titlesStage(ctx) {
  const { out, idOf, p, wanted, keyword, typedTokens, typedNum, STOP, titleScore, runAt, nearOf, alignHeld, docLookup, matchedTerms, allowed, fresh } = ctx;
  const { index, docTokens, hasTokenRun, holdsTogether, reshapeDoc, runHolders, termExists, titleToks, titlesNow, tokenPlace, tokenRunAt, typedHeld,
    HEADING_ORIGINALS, ORIGINAL_TIER, QUOTE_NEAR_MIN, RUN_MIN, SWAP_NAMED_SHARE, TITLE_HITS, TITLE_NEARER, TITLE_ORDER_REACH, TITLE_REACH,
    TITLE_REORDER_MIN, VERSE_RUN_HELD } = ctx.eng;
  // A title the query names keeps its place; in a keyword search, a title holding its every word
  // ("144,000"), not one of two ("lord from aforetime" quotes a letter, not "Regarding the Day of The Lord").
  const typedContent = typedTokens.filter((w) => !(STOP && STOP.has(w)));
  const named = (/** @type {any} */ d) => {
    if (!d.title) return false;
    const tt = titleToks(d).all;
    return titleScore(d) > 1 || (keyword && typedContent.length > 0 && typedContent.every((w) => tt.indexOf(w) >= 0));
  };
  /* THE TITLE TYPED LEADS (search200 B1, 2026-10-18). titleMatch scores a title typed whole x3 with its leading
     Regarding/The/A/An left off, so "Fasting" and "Regarding Fasting", "Watchmen" and "The Watchmen" tied, and
     body BM25 chose: the dense Answers topic, or the short Words To Live By entry, led the letter whose title was
     typed (weak-spots T1: 21 of the 52 whole-title sweep failures), and a near title over a richer body beat the
     title typed whole (T3). Among the first TITLE_ORDER_REACH, keyword searches too, the text whose title the query
     is leads. Which, when several are: a lead word typed is a word of the title, so "the gatekeepers" names "The
     Gatekeepers" (titleLevel 4) before "Gatekeepers" (3), and then the original (ORIGINAL_TIER: a letter, then Words
     To Live By, Holy Days, a study, Answers); a lead word left off says nothing (readers drop it: open case t233,
     "true baptism" for the letter "The True Baptism", whose Words To Live By entry is "True Baptism"), so the original
     first, then the title as typed; then the score. A verse first that holds a quote of VERSE_RUN_HELD typed words
     or more as typed keeps its place (T4's default). */
  const levelOf = (/** @type {any} */ d) => {
    if (!d.title || d.kind === 'verse') return 0;
    const t = titleToks(d);
    const read = (/** @type {string[]} */ q) => Math.max(titleLevel(t.all, q), t.own ? titleLevel(t.own, q) : 0);
    return typedNum ? Math.max(read(typedTokens), read(typedNum)) : read(typedTokens);
  };
  let typedTitle = -1;
  if (out.length > 1 && typedTokens.length) {
    const leadTyped = TITLE_LEAD.has(typedTokens[0]) && typedTokens.length > 1;
    let best = 0;
    for (let r = 0; r < Math.min(out.length, TITLE_ORDER_REACH); r++) {
      const lv = levelOf(out[r].doc);
      if (lv < TITLE_LEVEL_LEAD) continue;
      const t = 9 - (ORIGINAL_TIER[out[r].doc.kind] ?? 5);
      // out is in score order, so the first of equal keys is the higher score
      const key = leadTyped ? lv * 10 + t : t * 10 + lv;
      if (key > best) { typedTitle = r; best = key; }
    }
    const f = out[0];
    const verseHolds = f.doc.kind === 'verse' && typedTokens.length >= VERSE_RUN_HELD && hasTokenRun(docTokens(idOf.get(f) || '', f.doc), typedTokens);
    if (typedTitle > 0 && !verseHolds) out.unshift(out.splice(typedTitle, 1)[0]);
  }
  // Two titles the query names, none typed whole: the one it names more nearly leads ("the high holy days" names The Holy Days, not Regarding The Holy Days of God).
  if (typedTitle < 0 && out.length > 1 && out[0].doc.title && !keyword) {
    const tm = (/** @type {any} */ d) => (d.title ? titleScore(d) : 1);
    const t0 = tm(out[0].doc);
    if (t0 > 1) {
      let b = 0;
      let bt = t0;
      for (let r = 1; r < Math.min(out.length, TITLE_REACH); r++) { const t = tm(out[r].doc); if (t > bt + TITLE_NEARER) { b = r; bt = t; } }
      if (b) out.unshift(out.splice(b, 1)[0]);
    }
  }
  /* A TITLE REMEMBERED LOOSELY (search200 B5, 2026-10-18). BM25 reads a title as a field among the body's words: a
     title typed with a word changed in form, a near-synonym, its words reordered, a typo or the collection's name
     beside it ranked under the Answers topics and short entries whose bodies say the words again and again (the tri
     bench's title/hard, 44 of 70), and an Answers section heading, no field at all, was found only by its body. titles.js
     scores every title and heading on its own; the one the query clearly names (admitTitles: its same-titled reprints
     and its series with it, the original first) joins the results wherever BM25 ranked it, or did not. It leads, just
     under a title typed whole (the pass above: titles.js's levels 4 and 3 are B1's) and under the first texts holding
     the typed words as a quote (below: a quote found is no title). A title opens at its start;
     a heading opens on itself, and a text that holds the heading's words in a row is the passage it labels, its
     original: that text comes first, on those words, and the topic second (Corbin, DECISIONS 10-14). */
  /** @type {Set<any>} the docs the admission placed: they keep their place, as a title named does */
  const admittedDocs = new Set();
  /** @type {Set<any>} ...and the quotes held word for word it left above them, and the texts holding the quote with its slips (B4) */
  const keptDocs = new Set();
  /** A text holding the quote, its slips allowed for (B4's tier B). */
  const alignedSo = (/** @type {any} */ e) => alignHeld.has(/** @type {string} */ (idOf.get(e)));
  for (const e of out) if (alignedSo(e)) keptDocs.add(e.doc);
  /** @type {Set<any>} the entries a title named opens where it says (placeStart): the run typed does not move them */
  const landedByTitle = new Set();
  /** @type {Set<any>} ...of them, those opened at their start: the text was asked for, not a passage of it */
  const titleTop = new Set();
  /** whether what was admitted is a title typed whole (titles.js's levels 4 and 3) */
  let admittedWhole = false;
  /** @type {Set<any>} the docs admitted by their own title (a unit, chapter or part), not by a heading inside them */
  const byOwnTitle = new Set();
  /** A text whose body (not its title) holds the typed words in a row: they are a line of it as well as its title. */
  const bodyHolds = (/** @type {any} */ e) => {
    const id = idOf.get(e);
    return id !== undefined && id in runAt && e.doc.kind !== 'verse' && tokenPlace(e.doc.text || '', runAt[id]) >= 0;
  };
  const titleIx = !p.phrase && typedTokens.length ? titlesNow() : null;
  /* Two readings the words alone do not settle (e2e-search). A collection's word taken off a title in another collection
     names no title: "rebuke one" is no Words To Live By "ONE" (Proverbs 19:25 holds both words). And in a word or two, an
     Answers heading gives way to a text its own title names by them: "144,000" is the topic "Regarding the 144,000
     Witnesses", not the heading "The 144,000" in the index of false doctrines. */
  const titledSo = keyword && out.slice(0, TITLE_REACH).some((e) => e.doc.kind !== 'verse' && named(e.doc));
  const admissible = (/** @type {any} */ h) => !(/collection/.test(h.via) && !h.hinted) && !(titledSo && h.kind === 'heading');
  const scored = titleIx ? scoreTitles(wanted, { index: titleIx, limit: TITLE_HITS, known: termExists }) : [];
  /** @type {any[]} */
  const admitted = admitTitles(scored).filter(admissible);
  /* A PHRASE TYPED AS MEANT IS NO TYPO OF A SHORT TITLE (search200 fix1, scope cause 6). The trigram reading (level 1)
     measures the whole title, and in a short "The X of The Lord" title "of the lord" is most of its trigrams: any short
     word in X's place read as a typo of X. A level-1 title is named only when no text but its own holds the typed run
     whole, its lead words aside (runHolders; null when the run is under RUN_MIN or too common to settle it). A typo's
     word is in no text, so a real typo is still read. */
  if (admitted.length && admitted[0].level === 1) {
    let k = 0;
    while (k < typedTokens.length - 1 && TITLE_LEAD.has(typedTokens[k])) k++;
    const runHeld = runHolders(typedTokens.slice(k));
    const mine = new Set(admitted.map((h) => h.docId));
    if (runHeld && [...runHeld.keys()].some((id) => !mine.has(id))) admitted.length = 0;
  }
  /* A TITLE TYPED WITH ONE WORD WRONG (search200 last2, 2026-10-18). "chosen to teach" for the letter "Given to Teach":
     "chosen" is no form, typo or near-synonym of "given", so no title was named and the letter sat fourth, under texts
     holding the typed words far apart (tri bench n275). titles.js swapTitles reads the title's shape where it fits one
     title alone; that title joins as one remembered loosely (level 2) where nothing else names a title (none admitted
     or scored, none named among the first results) and no text but its own holds every typed content word, or a form
     of it, in the typed order within the typed words' length and two (quotesNear's stretch). A short quote one word
     off a title is the quote ("a pillar of salt" is Genesis 19:26, not "A Pillar of Strength"), and a sentence holding
     the typed words with a word of its own between them is that quote with a word dropped; one holding them in another
     order is another sentence (search200 fix1). An Answers section heading is not read so
     (review, 2026-10-18): it titles no text, only a stretch of a topic titled otherwise, which hands the lead to the
     letter the section cites; a heading one word off ("a flood of mercy" for the heading "A Flood of Judgment", the
     word its opposite) put first a letter whose title holds none of the typed words. */
  if (!admitted.length && titleIx) {
    const sw = swapTitles(wanted, { index: titleIx, hits: scored.filter(admissible) }).filter((h) => admissible(h) && h.kind !== 'heading');
    const mine = new Set(sw.map((h) => h.docId));
    const namedElse = () => out.slice(0, TITLE_REACH).some((e) => e.doc.kind !== 'verse' && named(e.doc) && !mine.has(/** @type {string} */ (idOf.get(e)))
      && titleShare(wanted, e.doc.title, { index: titleIx }) >= SWAP_NAMED_SHARE);
    if (sw.length && !namedElse()) {
      const words = [...new Set(sw[0].typed.filter((w) => !titleIx.skip(w) && w[0] !== '#'))];
      if (holdsTogether(words, sw[0].typed.length + 2, mine) === false) admitted.push(...sw);
    }
  }
  if (admitted.length) {
    /** @type {Map<string, any>} */ const entryOf = new Map();
    for (const e of out) entryOf.set(/** @type {string} */ (idOf.get(e)), e);
    /** The text's entry: the one shown, else a new one when the search may show it. */
    const take = (/** @type {string} */ id) => {
      let e = entryOf.get(id);
      if (e) return e;
      const f = docLookup[id] || index().getStoredFields(id);
      if (!f) return null;
      const d = docLookup[id] ? f : { ...f, id };
      if (!allowed(d) || !fresh(d)) return null;
      e = { score: 0, doc: reshapeDoc(d), terms: matchedTerms[id] || [] };
      idOf.set(e, id);
      entryOf.set(id, e);
      return e;
    };
    /** The prose holding a heading's words in a row, the lowest tier first, then the best ranked: {id, place} or null. */
    const headingOriginal = (/** @type {any} */ h) => {
      const run = joinApostropheS(kjvEncode(h.title));
      /** @type {Map<string, number>|null} */ let hold = run.length >= RUN_MIN ? runHolders(run) : null;
      // A heading too short to look for ("Solidified Eternally") that the typed run holds: the texts holding the typed
      // run hold the heading's words too, so they are its candidates, opened on the typed words.
      if (!hold && run.length && tokenRunAt(typedTokens, run) >= 0) {
        hold = new Map();
        for (const id in runAt) hold.set(id, runAt[id]);
      }
      if (!hold || !hold.size) return null;
      let best = null;
      let bestKey = Infinity;
      for (const [id, at] of hold) {
        if (id === h.docId) continue;
        const f = docLookup[id] || index().getStoredFields(id);
        if (!f || !HEADING_ORIGINALS.has(f.kind)) continue;
        const shown = entryOf.get(id);
        const key = ORIGINAL_TIER[f.kind] * 1e7 + (shown ? out.indexOf(shown) : 1e7 - 1);
        if (key < bestKey) { bestKey = key; best = { id, at, f }; }
      }
      if (!best) return null;
      // held in its title alone: opening the text is arriving under the heading
      const c = tokenPlace(best.f.text || '', best.at);
      return { id: best.id, place: c >= 0 ? c : 0 };
    };
    /** @type {Array<{e: any, at: number, title?: boolean}>} each text admitted, where it opens (-1: where its words are), and whether by its title */
    const placed = [];
    const has = (/** @type {any} */ e) => placed.some((x) => x.e === e);
    for (const h of admitted) {
      if (h.kind === 'heading') {
        const o = headingOriginal(h);
        const oe = o && take(o.id);
        if (oe && !has(oe)) placed.push({ e: oe, at: o.place });
      }
      const e = take(h.docId);
      if (!e || has(e)) continue;
      placed.push({ e, at: h.kind !== 'heading' ? 0 : h.start, title: h.kind !== 'heading' });
    }
    /* A title typed whole (titles.js's levels 4 and 3, its collection's name beside it) is named as B1 names one: only a
       verse quoted word for word keeps above it. Prose holding the typed words in a row is then a text citing the title
       by name ("~ From “Sabbath Peace” ~ Words To Live By"), not a quote found. A title remembered loosely (levels 2
       and 1) is weaker than any quote found: a text holding the typed run (RUN_MIN words or more, B3's runAt) keeps above
       it, as a verse quoted keeps above any title ("held them fast" is a verse's words before it names "Hold Fast"). */
    /* A TITLE'S WORDS TYPED IN ANOTHER ORDER ARE THE TITLE TYPED WHOLE (search200 R3, 2026-10-18). Every word of a title
       and no other typed (TITLE_REORDER_MIN or more, a collection's name beside them aside), only their order changed, is
       the title named, as levels 4 and 3 name it: a text holding those words in the typed order holds a line, the title
       being the reader's whole query. A title missing a typed word, or typed with one of its own left out, stays loose. */
    const typedTitle = (() => { const w = titleWords(wanted); const st = stripCollections(w); return st ? st.w : w; })();
    const sortedWords = (/** @type {string[]} */ w) => [...w].sort().join(' ');
    const typedSorted = typedTitle.length >= TITLE_REORDER_MIN ? sortedWords(typedTitle) : '';
    const reordered = (/** @type {any} */ h) => !!typedSorted && h.kind !== 'heading' && sortedWords(titleWords(h.title || '')) === typedSorted;
    const whole = admitted.some((h) => h.level >= TITLE_LEVEL_LEAD || reordered(h));
    admittedWhole = whole;
    /* A COLLECTION'S NAME TYPED BESIDE A TITLE NAMES THE COLLECTION (main CI, 2026-10-22). "regarding israel answers
       only god can give" is the topic "Regarding Israel" typed whole with its collection's name. The collection's own
       front page is titled with that name and opens on it, so it held five of the seven typed words in a row: B4 read
       it as the quote remembered with its slips, kept it as a quote found, and the meaning, sure of the front page, put
       it over the title the reader named (tri n121, after a re-embed). Typed beside a title in it, the collection's
       words name the collection only: a text B4 held that holds the title's own typed words (the collection's taken
       off) nowhere together holds the typed words only by that name, and holds no quote. */
    if (whole && admitted.some((h) => h.hinted && (h.level >= TITLE_LEVEL_LEAD || reordered(h)))) {
      const own = joinApostropheS(kjvEncode(typedTitle.join(' ')));
      for (const e of own.length ? out : []) {
        if (!alignedSo(e) || has(e)) continue;
        if (typedHeld(joinApostropheS(kjvEncode(e.doc.text || '')), own, own.length + 2) >= own.length) continue;
        keptDocs.delete(e.doc);
        alignHeld.delete(/** @type {string} */ (idOf.get(e)));
      }
    }
    /** A text holding the typed words in a row, in its own words (a title holding them is the admission's call). */
    const holdsTyped = (/** @type {any} */ e) => {
      const id = idOf.get(e);
      if (id === undefined) return false;
      if (whole && e.doc.kind !== 'verse') return false;
      if (id in runAt && typedTokens.length >= (whole ? VERSE_RUN_HELD : RUN_MIN)) return e.doc.kind === 'verse' || tokenPlace(e.doc.text || '', runAt[id]) >= 0;
      return typedTokens.length >= VERSE_RUN_HELD && e.doc.kind === 'verse' && hasTokenRun(docTokens(id, e.doc), typedTokens);
    };
    /* A title remembered loosely is weaker than a quote one word off, too: a text a stretch of which holds every typed
       word but one (QUOTE_NEAR_MIN typed or more), and more of them than the title does, is the quote with a word
       dropped or changed, the title a part of it ("love your bless those who curse you" drops a word of Matthew 5:44,
       its middle the title "Bless Those Who Curse You"). A collection's name typed with the title is the title's: a
       letter's first words "Timothy, concerning the Sabbath..." name no collection, but its words are held. */
    const hintWords = (() => { const w = titleWords(wanted); const st = stripCollections(w); return st ? w.length - st.w.length : 0; })();
    const titleHeld = whole || typedTokens.length < QUOTE_NEAR_MIN ? Infinity
      : Math.max(...admitted.map((h) => typedHeld(joinApostropheS(kjvEncode(h.title || '')), typedTokens, typedTokens.length + 2) + (h.hinted ? hintWords : 0)));
    const quotesNear = (/** @type {any} */ e) => {
      if (titleHeld === Infinity || !e.doc.text) return false;
      const n = typedHeld(joinApostropheS(kjvEncode(e.doc.text)), typedTokens, typedTokens.length + 2);
      return n >= typedTokens.length - 1 && n > titleHeld;
    };
    const lead = out.length && levelOf(out[0].doc) >= TITLE_LEVEL_LEAD ? 1 : 0;
    let pos = lead;
    while (pos < out.length && (holdsTyped(out[pos]) || quotesNear(out[pos]))) { keptDocs.add(out[pos].doc); pos++; }
    for (const x of placed) {
      const at = out.indexOf(x.e);
      // a text the typed words were found in word for word is a quote found, ranked as one (its original first)
      if (at >= lead && at < pos) continue;
      if (at < 0 || at >= pos) {
        if (at >= 0) out.splice(at, 1);
        out.splice(pos++, 0, x.e);
      }
      admittedDocs.add(x.e.doc);
      keptDocs.add(x.e.doc);
      if (x.title) byOwnTitle.add(x.e.doc);
      if (x.at < 0) continue;
      // A title typed whole that its body says word for word: the typed words are that line too, and the run landing
      // below opens on it (a remembered sentence that is also its letter's title, the bench's sentence cases).
      if (x.title && whole && bodyHolds(x.e)) continue;
      // A title remembered loosely that its own body says (nearly) as typed: the reader remembered that sentence, which
      // the run landing below opens on ("the mountains will crumble..." is a line of the letter so titled).
      if (x.title && !whole && (nearOf[/** @type {string} */ (idOf.get(x.e))] || 0) >= NEAR_PHRASE_MIN) continue;
      x.e.placeStart = x.at;
      landedByTitle.add(x.e);
      if (x.at === 0 && x.e.doc.title && admitted.some((h) => h.docId === idOf.get(x.e) && h.kind !== 'heading')) titleTop.add(x.e);
    }
  }
  /* A TITLE NAMED OPENS AT THE TITLE (search200 B5, the S22 look of B1-B3). A text found by its title typed whole opened
     where its words sat thickest in the body (use-search matchExcerpt), or on the typed run held deep in it: the reader
     who typed "God Speaks About The Sabbath" landed on the in-text find's fifth place of six, not on the letter's
     title. A title typed whole (B1's levels) or admitted opens at its start (placeStart 0, use-search's landing at the
     top), a heading on itself; the run landing below leaves them. */
  if (typedTokens.length) {
    for (let r = 0; r < Math.min(out.length, TITLE_ORDER_REACH); r++) {
      const e = out[r];
      if (landedByTitle.has(e) || levelOf(e.doc) < TITLE_LEVEL_LEAD || bodyHolds(e)) continue;
      e.placeStart = 0;
      landedByTitle.add(e);
      titleTop.add(e);
    }
  }
  Object.assign(ctx, { typedContent, named, admittedDocs, admittedWhole, byOwnTitle, keptDocs, alignedSo, landedByTitle, titleTop });
}
