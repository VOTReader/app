# The 500's errata

Corrections to the 500 bench (`cases.json`, `targets.json`) after it froze, each with the judges' reasons. A rule change
lives in `rules.mjs` (its header names the errata) and applies to every set; a case correction keeps the retired query
in the case's `retired` field. The tri bench's errata are in `tri/judgment.md`.

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
