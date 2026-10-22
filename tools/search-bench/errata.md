# The 500's errata

Corrections to the 500 bench (`cases.json`, `targets.json`) after it froze, each with the judges' reasons. A rule change
lives in `rules.mjs` (its header names the errata) and applies to every set; a case correction keeps the retired query
in the case's `retired` field. The tri bench's errata are in `tri/judgment.md`, except the sealed2 panel's tri cases
(2026-10-22, below), which are logged here with the 500's.

## 2026-10-19: the b500 review

Two judges per open miss, a reader judge and an answer judge, saw the case, its target and what led, not the engine
(D:/Swarm/lanes/search200/out/b500/DIGEST.md and its journal). Two of the 19 open misses were flawed cases (t360,
t401), and one disputed miss (t043) showed a gap in the rules.

- **t043, rule change: PARALLEL** (Matthew 9:38; query "ask god who owns the harvest to send more workers into it").
  Luke 10:2 holds the verse word for word. Reader judge: "Luke 10:2 says the same thing almost word for word". Answer
  judge: "Luke 10:2 is a parallel the rules could accept, but the first hit is the letter, not Luke." Both call Luke
  10:2 a fair answer. The rule: a verse holding a verse target's whole text answers it as a near member, as a near copy
  does, and the target stays the original (`rules.mjs` PARALLEL, `classes.mjs` parallels). Three limits:
  - a verse of fewer than 8 words is a formula with no one parallel;
  - a two-verse target is the pair, which no one verse says (counter-case cB07);
  - a query naming the verse (its book, or its chapter and verse) asks for that verse alone. The hunt's refwords
    family types them, as in "isaiah 38 1 set your house in order", where 2 Kings 20:1 holds the same words.

  The case's query is unchanged. t043 still misses, because Volume Four letter 22 leads. Its class is now the verse,
  its Matthew Study twin and Luke 10:2. Across the sets the rule widens one open case of the 500 (t043), no open tri
  case, five hunt cases (ref2-66, sco2-08, sco2-38, sco2-43, tit-80) and no counter-case. No case's result changes.

## 2026-10-22: the sealed2 panel (both benches)

After fix2, 37 sealed cases still failed on origin/main `b8c4c30e6`: the 500's held t171 t256 t270 t366 t418 t452 t498
and fresh f001 f016 f017 f035 f038 f047-f051 f058 f059 f061 f062 f064 f070 f075 f077 f091 f094 f096 f099 f100, and the
tri's held e215 e301 n032 n335 n377 and fresh m274 n291 (D:/Swarm/lanes/search200/out/sealed2/failing.json). Two
judges read each one: the case, its target, its notes and the engine's top five. Being read, all 37 are OPEN now and
can never again count as a blind measure. Each sits in its bench's open file (`cases.json`, `tri/cases.json`) with
`held: false`, `set: "unsealed"`, `origin: "unsealed 2026-10-22"`, `unsealedFrom` (held or fresh) and `panel` (judge 1 /
judge 2). The bench scores them on a line of their own, so the open 400 and 600 stay comparable. The sealed splits are
smaller until the writers' replacements come: the 500's held 93 and fresh 77, and the tri's held 175 and fresh 88.

Where both judges call a case errata, its class is corrected below. The query never changes. A rule change is in
`rules.mjs`/`classes.mjs`, and a case's own correction is in its `errata` field (`also`: full members, `near`: near
members, `drop`: removed; `classes.mjs` classOf). Where both judges call the case valid, it stays as written: the
engine's miss is real. Where they split, the case also stays as written, with a `note`, and nobody drops it.

### Errata applied (both judges: errata)

- **f001, rule change: PARALLEL reads the KJV wording** for a KJV-variant query (Nehemiah 7:66; query "forty and two
  thousand three hundred and threescore"). Old class: Nehemiah 7:66 alone. New class: Nehemiah 7:66, with Ezra 2:64 as
  a near member. Judge 1: "The query holds only the number, and two verses state it identically in the KJV. Nothing in
  the query can pick Nehemiah over Ezra". Judge 2: "Ezra 2:64 holds it in identical KJV wording, so no reader can mean
  one verse over the other. PARALLEL misses the pair only because NKJV reorders the opening words." Both judges proposed
  widening PARALLEL to the KJV wording. Judge 1 limited it to a KJV-variant case. Judge 2 went wider, to "or the same
  words in another order". Only the part both proposed is applied (`classes.mjs` parallels, `c.variant === 'kjv'`).
  Of the open sets it widens no other case.
- **f062** (wtlb2 It Is Time; "proclaim the acceptable year of the lord and the day of vengeance"). Old: the It Is Time
  class (v2 original, wtlb2, Answers, Luke 4:19 near). New: the same, plus Isaiah 61:2 as a near member
  (`errata.near`). Judge 1: "Isaiah 61:2 holds the whole query word for word ... and the letter is quoting it". Judge 2:
  "The query is Isaiah 61:2's own words ... The verse misses the NEAR QUOTE measure only because of its tail".
- **f064 and f091, rule change: QUOTED BLOCK.** A block target's sentence that quotes a verse now gives that verse as
  a near member, by the same tests a sentence target uses (word for word, 80% of 3-grams, NEAR QUOTE). Before this,
  `versesQuoted` and `versesNear` ran only at level `sentence`.
  - f064 (wtlb2 Labor of Love block 0; "the part where your own measure of judgment comes back to you"). Old: the WTLB
    entry alone. New: plus Matthew 7:2 (Matthew Study and plain) as a near member. The block rewords the verse too
    loosely for NEAR QUOTE, so the case names it (`errata.near`). Judge 1: "The gist describes only the closing
    quotation ... which is Matthew 7:2 ... the source text and a better answer." Judge 2: "The gist describes only that
    verse, so a reader typing it wants Matthew 7:2 as much as the WTLB block."
  - f091 (More Than a Man ch22 block 4; "the part where accusers repay love with hatred and prayer"). Old: the chapter
    and its Lamb of God reprint. New: plus Psalm 109:2, 109:3 and 109:4 as near members (the rule). Judge 1: "The block
    is nothing but Psalm 109:2-4 quoted ... the leading verse is the source and at least an equal answer." Judge 2:
    "The gist describes exactly that verse, so Psalm 109:4 leading is a right answer."
  - Where the judges differ: judge 1 would make the verses full members, as a sentence target's are. Judge 2 says near
    members, and that is what was applied. A near member can only add passes: the block stays the original, so no case
    that passes today can start failing. In the open sets the rule widens five of the 500's block cases (t315 t348
    t441 t443 t475) and no tri or hunt case.
- **t256** (v4 Workers in the Field; "the first harvest shall be lowly and the second plentiful of the refined"). Old:
  the v4 letter and its Answers reprints. New: plus v7 The Sword Comes as a near member (`errata.near`). Judge 1: "It
  falls just short of NEAR COPY (78%) only because the target's 'Again, I say to you' is counted. A human judge would
  accept either." Judge 2: "it answers the query as well as the target."
- **t418** (Answers, What Is an Abomination to The Lord; "the holidays of men are an abomination to the lord"). Old:
  the heading, its cited V2 Transgression (sectioned) and answers/false-doctrines-within-the-churches-of-men-regarding.
  New: without the False Doctrines page (`errata.drop`). Judge 1: "The miss comes only from the class treating a False
  Doctrines link-list page as a reprint that must be shown". Judge 2: "it is an index of links, not a reprint". Judge 2
  also proposed a rule: a "The Truth: <heading>" link line should not make a page a holder. Judge 1 did not propose it,
  so it is not applied.
- **t452** (Grace AND The Law ch5, title; "grace and the law bible study"). Old: chapter 5. New: any chapter, ch1 to ch7
  (`errata.also`). Judge 1: "names only the study and nothing of chapter 5's title ... The leading chapter 7 answers it
  exactly as well." Judge 2: "Nothing in the query points at chapter 5, so ch7 leading is as right as ch5."
- **e215** (tri; wtlb1 I Know My Own; "judge no more by human standards, discern by right standards,"). Old: v4 From
  Betrayal to Victory as the tier-0 original (the 80% 3-gram holder rule), plus wtlb1 and three Answers pages. New: v4
  and its two Answers reprints (Regarding Judas Iscariot, Regarding the Mistranslation...) are near members. The
  original is wtlb1, with Regarding the True Church as its reprint (`errata.near`). Judge 1: "V4 'From Betrayal to
  Victory' is a different letter (Judas) with a variant line, 'stop judging' ... so the engine's correct lead was scored
  as 'reprint leads original'." Judge 2: "v4 says 'stop judging by human standards', a different sentence that only
  clears the 80% 3-gram holder bar ... so v4 is not its original."

### Split or unfair: kept open as written, with a note

- **f038** (judge 1 errata, judge 2 unfair; "dwell in you like a flame of fire"). Judge 1: flock/Discord holds the span
  word for word, so either letter answers. Judge 2: the query cannot ask for the v7 letter over Discord; rewrite it on the
  target's own run.
- **f048** (valid, unfair; "why ignore gods commands just because jesus died for you"). Judge 1: only this sentence joins
  'in the name of grace' with 'Him crucified'. Judge 2: the idea recurs in at least five letters outside the class.
- **f058** (errata, unfair; "the prophet hananiah"). Judge 1: add Jeremiah 28:5, which holds the phrase. Judge 2: the
  slip lands on Bible wording (the n002 precedent); rewrite it.
- **f059** (errata, valid; "remember me at passover"). Judge 1: V2 letter 4 ("keep the Passover in remembrance of Me")
  is as good. Judge 2: "remember me" carries the title's distinctive words; a real miss at rank 10.
- **f070** (valid, unfair; "people who follow and love gods son will be saved"). Judge 1: only this Blessed line and
  its V3 original hold the love-and-obey line. Judge 2: a stock idea with no hook (John 3:36, John 14:21).
- **t171** (errata, unfair; "god will do whatever he planned by his own will"). Judge 1: any of four letters holding
  'the counsel of My own will' answers (and the engine still misses, since V7 God's Will is none of them). Judge 2: no
  paraphrase can pick this letter; drop it.
- **n291** (tri; valid, unfair; "opposing god"). Judge 1: a plain synonym; no other title means 'Against God'. Judge 2:
  the slip leaves only 'god', a concept search (the n201 precedent).
- **n032** (tri; errata, unfair; "worthless idols"). Judge 1: add Jonah 2:8 and Jeremiah 18:15, which hold the words.
  Judge 2: the slip lands on Bible wording (the n002 precedent); rewrite it.
- **n335** (tri; errata, unfair; "gifts of spirit"). Judge 1: add the 1 Corinthians 12 named-passage card (as n029,
  n250). Judge 2: a stock topic no half-remembered form can tie to the WTLB entry (as n047).
- **n377** (tri; unfair, valid; "the trumpet blast of god"). Judge 1: 'The Trumpet Call of God' heads at least five
  letters and is the ministry's own name. Judge 2: an honest one-word slip; the class takes every holder, and none
  reaches the top 10.

### Valid misses (both judges: valid), open as written

f016 f017 f035 f047 f049 f050 f051 f061 f075 f077 f094 f096 f099 f100 t270 t366 t498 (the 500), m274 e301 (tri). These
are the engine's misses to fix with general rules.
