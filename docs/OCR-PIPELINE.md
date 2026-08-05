# OCR-PIPELINE.md — reading the thevolumesoftruth.com PDF library

How the 20 PDFs published on thevolumesoftruth.com were pulled into this repo and read, what
each reader is actually good at, which validators are load-bearing, and every disagreement this
corpus produced with the verdict that settled it.

The method is inherited from the Textbook Studio converter at `D:\Textbooks`
(`docs/CALIBRATION.md`, `docs/GEMINI.md`) and re-measured here on this corpus. The load-bearing
numbers are stated inline so nobody has to hop repositories to trust this page.

**Governing doctrine: never trust one reader; write the assertion that catches the lie.**
Every reader available — deterministic and neural alike — has been caught being confidently
wrong on record. A better model improves one run. A validator improves every run that will ever
happen.

**Fidelity rule for this corpus specifically.** This is scripture as far as the repo owner is
concerned. Transcription is verbatim: never paraphrase, never "correct" a name, spelling or
wording, never modernise. Where a reader cannot read something, it says so; it does not guess.
Sacred Name conventions (YAHUWAH, YahuShua, HaMashiach, Ruach HaQodesh) govern any prose
*about* the content — the transcription itself simply reproduces what is printed.

---

## What is in the library

20 PDFs, enumerated from the site's `Main_Page` and independently from `Faqpage` — the two
lists agree exactly, which is the enumeration's own cross-check. All are served from
`trumpetcallofgod.com/pdfs/`. `sitemap.xml` 404s and the directory index is 403, so the two
in-page link lists are the enumeration.

| | |
|---|---|
| PDFs | 20 |
| Pages | 4,439 |
| Words recovered from the text layer | 1,078,128 |
| Download size | ~780 MB (`Garden.pdf` alone is 700 MB) |
| Born-digital, text layer carries the prose | 20 of 20 |
| Books needing the vision leg at scale | 1 (`Garden.pdf`: 96 text pages, 113 illustrations) |
| Image-only pages corpus-wide | 124 (113 of them in `Garden.pdf`) |

The library is deliberately redundant: the seven per-volume PDFs also exist as one combined
volume, as a large-print reflow, and inside a complete-edition book. That redundancy is not a
nuisance — it is the single most valuable validator available here, see **Edition cross-check**
below.

`source-pdfs/MANIFEST.json` records every URL, title, byte count and sha256. The PDFs
themselves are gitignored (780 MB); `tools/vot-pdf-fetch.py` re-downloads them idempotently.

---

## The reader legs and their measured roles

| leg | how it is invoked | what it owns here |
|---|---|---|
| **PDF text layer** (PyMuPDF `fitz`) | `tools/vot-pdf-extract.py` | **Everything textual, on 19 of 20 books.** For a born-digital PDF the text layer is not a degraded guess at the page — it *is* the page. Free, instant, repeatable. |
| **claude-haiku-4-5** | Agent tool, `model: "haiku"`, reads rendered PNGs | **Default vision reader.** Structure and figures. No API key; billed to the Claude Code subscription. Sustains a full structured ask. |
| **gpt-5.6-luna** | `codex exec -m gpt-5.6-luna` (~25–50 s/call) | **Decorrelated second opinion** from a different lab, and the **whole-document leg** — 1M context answers "list every heading in this entire book", which no page-at-a-time reader can attempt. |
| **gemini-3.6-flash** | `D:\Textbooks\tools\gemini.py` (pooled, paced, cached) | Figures and **item-scoped plain-text asks only**. Its decoder collapses on long schema-constrained JSON — bound the OUTPUT, never the input. Measured limit: **5 RPM per key per model**, free tier, rolling 60 s window; the pool paces at 13 s/key. Not needed for this corpus so far. |
| **you (the coordinator)** | Read the page PNG yourself | Adjudicate disagreements; escalate anything the validators flag. |

Rendering for the vision legs: `tools/vot-pdf-render.py`, `fitz get_pixmap(dpi=150)` — the dpi
every measurement in the bench was taken at.

### Division of labour, settled by measurement on this corpus

- The text layer owns the words. On the 19 born-digital books it reproduces the page exactly;
  spot-checked by reading page images directly and by 95 independent vision reads (below).
- Vision owns **what the extractor structurally cannot see**: pages whose words are drawn as
  vector artwork rather than set as type, illustrations, and any page with no text layer at all.
- Nobody is trusted on their own say-so. Silence is not evidence of correctness — the single
  most important lesson carried in from the Textbook bench is a vision model reporting
  `uncertain: []` while dropping two thirds of a page.

---

## The pipeline

```
tools/vot-pdf-fetch.py        20 PDFs -> source-pdfs/ + MANIFEST.json (url, bytes, sha256)
tools/vot-pdf-extract.py      text layer -> _ocr_out/vot/<slug>/page_NNNN.txt, all.txt,
                              inventory.json (page map, per-page chars/words/images, flags)
tools/vot-pdf-render.py       pages -> _ocr_out/vot/<slug>/_images/pNNNN.png at 150 dpi
tools/vot-pdf-crosscheck.py   edition-vs-edition shingle coverage (no model in the loop)
tools/vot-pdf-adjudicate.py   vision sample vs text layer, per-category agreement
```

Output lives under `_ocr_out/vot/`, matching the repo's existing OCR convention
(`_ocr_out/<slug>/page_NNNN.txt` + `all.txt`), and `_ocr_out/` is gitignored as generated
output. The tools, the manifest and this document are what is tracked; the corpus is
reproducible from them.

---

## The validators (the load-bearing wall)

Content-independent, so none of them can be fooled by plausible-looking prose.

1. **Page-count coverage.** Every page `1..page_count` must have a text file. No silent gaps.
2. **Empty / thin / image-only page flags.** Per book, pages with no text, pages far below that
   book's own median char count, and pages carrying images but no text. These are *not* failures
   — they are the worklist for the vision leg.
3. **Edition cross-check** (below). The strongest one available here.
4. **Count tripwires.** Every vision ask carries a self-count: "how many X" asked separately
   from "list every X". A mismatch is the reader reporting its own failure, for free. This is
   what turned "the model gave a short answer" into "the model truncated" on the Textbook bench.
5. **Structural agreement sample.** 95 pages read blind by the vision leg and compared to the
   text layer on first line, last line, line count and non-prose elements.

---

## Edition cross-check — the same words, typeset three ways

`tools/vot-pdf-crosscheck.py`. The site publishes overlapping editions of identical text with
different page geometry and different line breaks. So one deterministic reader can be checked
against another deterministic reader over **100% of pages**, with no model involved and no
sampling. Every 8-token shingle of the smaller edition must appear somewhere in the larger one.

Results (coverage = plain shingle containment; interior = excluding shingles that straddle a
page break, see verdict 2):

| subset | superset | coverage | interior |
|---|---|---|---|
| letters-vol1 … vol7 (each) | letters-vol1_7 | **100.000%** | **100.000%** |
| letters-vol1_7 | Volumes_Book | 99.816% | 99.852% |
| letters-vol1_7 | Volumes1_7_LARGE_PRINT | 99.780% | 99.798% |
| Volumes1_7_LARGE_PRINT | letters-vol1_7 | 99.417% | 99.433% |
| Rebuke | Volumes_Book | 99.515% | 99.711% |
| Flock_Book | Volumes_Book | 98.697% | 99.342% |
| WTLB | WTLB1_2_LARGE_PRINT | 91.557% | 96.356% |
| WTLB2 | WTLB1_2_LARGE_PRINT | 94.139% | 98.706% |
| WTLB | Volumes_Book | 91.796% | 96.684% |
| WTLB2 | Volumes_Book | 93.764% | 99.008% |

**Seven independent per-volume PDFs are 100.000% contained in the combined edition.** That is
a stronger statement about the letters text than any sampling could produce, and it cost one
script and no model calls.

---

## Calibration log — every disagreement and its verdict

### Verdict 1 — contents pages are *supposed* to disagree (2026-08-05)

The first cross-check run reported 99 divergence runs between `letters-vol1_7` and
`Volumes_Book`. **All 99 started on a table-of-contents page.** The same letter titles pointing
at different pagination is not a text difference; it is the edition doing its job.

Adopted: `is_toc_page()` excludes contents pages from the word-coverage comparison and lists
them separately. Volumes coverage 98.804% → **99.816%**.

A second lesson came for free. The first classifier looked for `title ....... 226` on one line
and matched **nothing**, leaving the numbers unchanged — which is the only reason the bug was
noticed. In this corpus the text layer emits the title and its page locator as *separate*
lines, so a contents locator is a line that is nothing but a number or a range. **A validator
that silently matches nothing looks exactly like a validator that found nothing wrong**; the
tell was the coverage figure not moving at all.

### Verdict 2 — a shingle across a page break compares pagination, not words (2026-08-05)

WTLB sat at 91.6% while the letters sat at 99.8%, and the residual runs were small (7–20 words)
and everywhere — the signature of a systematic effect, not lost content.

Cause: a shingle straddling a page break spans the last line of one page, then the running
header and first line of the next. Two editions break pages in different places, so those
shingles can never match. WTLB is poetry at ~70 words a page; the letters are prose at ~240.
The shorter the page, the more page breaks per word, the more straddling shingles.

Adopted: straddling misses are counted separately and an `interior_coverage` reported. WTLB
91.557% → **96.356% interior**, WTLB2 94.139% → **98.706%**. The remaining WTLB residue is
front matter, colophon year differences (2018 vs 2022 printings) and decorative titles
(verdict 4) — not lost text.

### Verdict 3 — an empty text layer is not proof of an empty page (2026-08-05)

`Garden.pdf` is the one book without a usable text layer: 216 pages, median 0 chars, 113 pages
carrying images and no text. The assumption "those are pictures" had to be *proved*, because a
scanned page of prose is indistinguishable from a photograph as far as the extractor is
concerned.

11 Haiku subagents read all 113 image-only pages plus the 5 the extractor called blank, each
asked to transcribe any words it could see. **Result: 118 of 118 confirmed textless.** Garden
alternates full-bleed photographs with text-over-photograph pages, and the text pages extract
verbatim-exact **on the one page checked against its image at the time** (n=1 — an anecdote, not
a measurement; the real number is the fidelity audit below). The text layer told the truth about
which pages carry words.

### Verdict 4 — words drawn as artwork are invisible to the extractor (2026-08-05)

The same ask, pointed at the 11 isolated image-only pages scattered through the *other* books,
came back the other way: **10 of the 11 carry text that the extractor never saw.** They are
title pages and part dividers whose lettering is set as vector artwork rather than as type —
book titles, "PART ONE / TWO / THREE" dividers. The eleventh is an illustration with no words.
None are missed scans of prose.

This is the exact complement of verdict 3, and the pair is the argument for keeping both legs:
the deterministic reader was right about 118 pages and wrong about 10, and only the vision leg
could tell which was which.

### Verdict 5 — decorative titles interleave duplicate glyph runs (2026-08-05)

Chasing WTLB's residue to its worst page surfaced a text-layer artifact: display titles set in
an outlined/shadowed face extract as interleaved doubled fragments (the title's words appear
cut into pieces and repeated). Ordinary body type is unaffected — adjacent-line duplication
across the whole corpus is 45 lines out of 61,000+, confined to title pages in three books.

Consequence: title lines from decorative faces must not be trusted from the text layer; take
them from the vision leg or from the contents page, both of which set the same title in
ordinary type.

### Verdict 6 — a validator that flags its own documented behaviour looks like a finding

94 pages across 19 books were read blind by the vision leg and compared to the text layer on
first line, last line, line count and non-prose elements. The first run scored **15.5%**
all-four-agree, with "missing 1 element" on nearly every page.

None of it was real. 63 of the 70 "missing elements" were **bare page numbers**, which
`vot-pdf-extract.py` deliberately strips as folios. The comparator was reporting the extractor's
own documented behaviour as an omission — and it reads exactly like a genuine finding, at scale,
with a plausible story attached.

The tell was the *shape* of the failure, not any single case: a defect appearing on almost every
page of almost every book is nearly always the checker, not the corpus.

### Verdict 7 — where a line breaks is the typesetter's opinion, not content

Second-largest block of disagreement: the vision leg reports a line as printed, the extractor
reports its own line grouping, so the same sentence begins at a different word. Comparing the
vision's `last_line` against a single extracted line failed on pages where **both readers had
identical text**.

Adopted: compare against the page's head and tail *token windows*, not against one line. The
words are the content; the break point is not. Last-line agreement 75.5% → 85.1%.

### Verdict 8 — the folio is the last line, and it is also a page-identity anchor

`letters-vol7` failed last-line on 5 of 5 sampled pages. Cause: the vision reader named the
**printed page number** as the last line — correctly, since that is what is printed last. The
extractor had moved it to metadata. The same fact explained the systematic +1 line-count offset.

This turned a nuisance into the best validator in the set. The folio is the one part of a page
that says *which page it is*, independently of its content, so:

1. `vot-pdf-extract.py` now **records** the folio per page instead of silently dropping it;
2. it checks **folio continuity** — consecutive pages should differ by one — across the corpus;
3. `vot-pdf-adjudicate.py` uses it as a **page-identity anchor**: a reader quoting a folio
   belonging to a different page was not looking at the page it was asked about.

Corpus-wide continuity: 3,965 pages carry a trusted folio and **9 breaks total**, every one of
them a folio resetting to 1 where front matter ends and the body begins. Overall agreement rose
15.5% → **79.8%**.

### Verdict 9 — a vision batch silently shifted every record by one page

`letters-vol6` disagreed on three sampled pages at once. Escalated to the page images
personally: the extractor was **right on every one**. The vision reader had attributed page 31's
letter-header block to page 21, and page 41's title to page 31 — its records were shifted by one
position in its assigned list.

This is the dangerous failure mode, because every individual field was *plausible and real* —
genuine content from a genuine page, filed against the wrong page. No per-field sanity check can
see it. Only an anchor tied to page identity can, which is verdict 8's second job.

Adopted: any vision ask covering several pages must have the reader read the **printed page
number off each page first**, and must state that carry-over between pages is the failure being
guarded against.

### Verdict 10 — position in the text stream is not position on the page

Chasing the Matthew study bible's last-line failures found the extractor's edge-detection
heuristic reading the wrong lines. Matthew prints a composite running footer, and its text layer
emits those pieces as the **first** lines of the stream. An "is this line near the start or end
of the extracted text" test therefore identifies the wrong lines entirely. The Lamb of God study
shows the same inversion the other way — its title block is printed at the top and emitted last.

Nothing was ever lost — every piece was present on the page, in a different order — but the
heuristic was unsound. Adopted: `edge_lines()` asks **where the ink physically is**, using block
geometry (top/bottom 8% of the page), and running heads are identified by **frequency** — a
string is chrome only if it recurs in that band across ≥30% of the book's pages. Frequency is
content-independent, so it cannot mistake a stray line near a page edge for chrome.

### Verdict 11 — prefer a validator that admits unreliability to a heuristic that guesses

Extending folio detection to composite footers immediately produced 179 folios for Matthew and
**151 continuity breaks**: the rule was picking up chapter numbers. The continuity validator
caught the author's own new heuristic within one run.

The fix was not a cleverer rule. `vot-pdf-extract.py` now **rejects a book's entire folio series**
when it fails to advance by one across the book, records how many it threw away, and reports
`folio_trustworthy: false`. Matthew's 179 guessed folios and the Lamb of God study (which prints
none at all) are excluded; 18 of 20 books keep a trusted series.

A number that is quietly wrong is worse than no number, because everything downstream believes it.

### Verdict 12 — line counting is the weakest of the four signals, and it is kept anyway

Final structural agreement, 95 pages across 19 books:

| signal | agreement |
|---|---|
| first line | 92/95 — **96.84%** |
| last line | 89/95 — **93.68%** |
| no missing element | 91/95 — **95.79%** |
| line count | 81/95 — **85.26%** |
| **all four** | 76/95 — **80.00%** |

Line count is the outlier and the reason is structural: it asks the reader to do *arithmetic
over* the page rather than *read* it. The error is noise, not bias — the vision leg over-counts
on 41 pages, under-counts on 32 and is exact on 22. **11 of the 19 remaining disagreements are
line-count-only**, on pages where first line, last line and every non-prose element agree, i.e.
where the two readers demonstrably hold the same words.

It is kept regardless, at its measured accuracy, for one reason: it is one of the signals that
exposed the `letters-vol6` shift. A weak signal that is honest about being weak still
contributes to a conjunction; the mistake would be to widen its tolerance until it stopped
disagreeing, which would buy a prettier headline number and destroy the only thing it is for.

The five `New_Testament_Study_Bible-Matthew` last-line disagreements are all verdict 10's
stream-versus-page inversion, adjudicated against the page images: every element the vision leg
reported is present in the text layer, in a different position in the stream. No content is
missing from any of them.

### Verdict 13 — the anchor fix, proven RED to GREEN

Verdict 9's remedy was re-run against the same five `letters-vol6` pages, this time with the
reader told to read the printed page number off each page first and warned that carry-over
between pages was the failure being guarded against.

**Folio agreement 5/5 against the extractor's independently recorded folios.** Page 21 came back
with 0 header elements and page 31 with 5 — exactly matching the page images, and exactly
reversing the earlier misattribution. first line, last line and elements now all pass for that
book. The fix is proven, not assumed.

### Verdict 14 — the whole-document leg, and a three-way structural agreement

`gpt-5.6-luna` through the Codex CLI is the only reader here that can hold a whole book at once,
so it gets the ask no page-at-a-time reader can attempt: *how many letters does this book
contain, and list them all*, with the count asked separately from the list as the tripwire.

On Volume Six it answered **31**, listed 31 titles, and its self-check agreed. The repo's own
independently audited app corpus (`volume-six.js`) carries **31** letters numbered contiguously
1–31. Three sources — a different lab's model reading the PDF text layer, that model's own
count tripwire, and this project's separately built data files — agree exactly.

Operational note worth keeping: `codex exec` **blocks on stdin** when run non-interactively.
The first invocation produced nothing for many minutes and looked like a slow model; it was
waiting on input. Always redirect `< /dev/null`.

### Verdict 15 — the fidelity audit that had not been done, and what it found

Everything above measures STRUCTURE. None of it compares a sentence character for character,
and the edition cross-check *cannot*: two editions sharing one extractor bug agree at 100.000%
while both being wrong. Asked directly whether OCR fidelity had been verified, the honest answer
was no. `tools/vot-pdf-fidelity.py` is that missing measurement.

Design, chosen so the number is honest rather than flattering:

- **Random**, seeded (`--seed 20260805`), over all 4,140 text-bearing pages — no minimum length,
  no filtering. The earlier structural sample took every Nth page filtered to >300 chars, which
  quietly excluded thin pages, poetry, contents pages and decorative titles: exactly where the
  known defects live. *A sample that avoids the hard pages measures the easy ones.*
- The reader transcribing each page has **not seen the text layer**, and scoring is done locally
  by `difflib`, so no reader grades its own work.

40 pages, 13 books, first run:

| metric | result |
|---|---|
| character agreement (length-weighted) | 96.041% |
| word agreement (length-weighted) | 94.951% |
| **content agreement, order-insensitive** | **99.840%** |
| pages identical after whitespace/glyph normalisation | 22/40 |

The gap between 94.95% and 99.84% is the whole finding: on **7 pages every single word matched
and only the ORDER differed** — identical word multisets, nothing lost, nothing invented. A raw
sequence score conflates *wrong words* with *right words in the wrong place*, which are entirely
different defects. Both numbers are now reported.

### Verdict 16 — order disagreements had two opposite causes, and only the page settles it

Each order-only page was escalated to the image personally. They did not share a cause:

- **`Volumes1_7_LARGE_PRINT` p51** (14.10% word sequence, 100% content): the extractor's line
  order matches the printed page **exactly**. The page is 32 near-identical lines of the same
  grammatical form, and the *vision reader* shuffled them. Here the deterministic reader is
  right and the model is wrong — so the headline 96% understates extraction fidelity, because
  part of the disagreement is the auditor's own error.
- **`YAHUSHUA_MoreThanaMan` p44** (47.08%, 100% content): a genuine **two-column** page
  (Old Testament prophecy | fulfilled in the New Testament), and the extractor emitted the right
  column's heading before the left column's body. Here the *extractor* is wrong. For this app
  that is a real defect: a prophecy and its fulfilment would render interleaved.

Neither could have been resolved from the score alone. **A disagreement is a question, not a
verdict** — the number tells you where to look, the page tells you who was right.

### Verdict 17 — multi-column pages, detected and fixed

`column_text()` re-emits a page in column order, deliberately conservatively: only when the text
blocks fall into two clean non-overlapping x-clusters that both carry real text, with spanning
blocks (title, intro) placed above. Anything ambiguous keeps the default order, because
reordering a single-column page would be a far worse defect than leaving a rare two-column page
alone.

**214 multi-column pages found corpus-wide — 213 of them in `YAHUSHUA_MoreThanaMan`, nearly half
that book**, plus one in the Lamb of God study. After the fix:

| metric | before | after |
|---|---|---|
| character agreement | 96.041% | **98.498%** |
| word agreement | 94.951% | **97.471%** |
| pages ≥99% char agreement | 31/40 | **33/40** |
| `YAHUSHUA` p44 alone | 47.08% | **98.70%** |

Content agreement was 99.840% before and after, exactly as it should be: no words changed, only
their order. The residual order-only pages are the vision reader's own shuffling on repetitive
pages, not extraction defects.

**Standing caveat, stated plainly: fidelity is 98.5% character agreement on a 40-page random
sample, not 100%, and it has never been claimed as 100%.** The sample gives a corpus estimate,
not a guarantee about any specific page. Anything being promoted into the app should be read
against its page image first.

---

## What the parser learned (durable)

Each of these began as a disagreement on a real page and ended as code, so the lesson survives
the session that found it. All live in `tools/vot-pdf-extract.py` unless noted.

| lesson | where it lives | what it prevents |
|---|---|---|
| Record the folio, never drop it silently | `clean()` returns `(text, folio)` | losing the only content-independent page identifier |
| Folios must advance by one | `flags.folio_breaks` | a page map that has silently gone wrong |
| Reject a folio series that doesn't count | `flags.folio_trustworthy` | plausible wrong numbers propagating downstream |
| Find chrome by geometry, not stream order | `edge_lines()` | mis-identifying header/footer lines (Matthew, Lamb of God) |
| Running heads are proven by frequency | `RUNHEAD_MIN_SHARE` | mistaking a stray edge-adjacent line for chrome |
| Contents pages are excluded, not compared | `is_toc_page()` (crosscheck) | 99 phantom divergence runs |
| Page-straddling shingles measure pagination | `interior_coverage` (crosscheck) | penalising short-page books for being short |
| Compare token windows, not single lines | `judge()` (adjudicate) | scoring typesetting differences as content loss |
| Folio as page-identity anchor | `misaligned_with_page` (adjudicate) | a reader's records shifted onto the wrong pages |
| Bare page numbers aren't missing elements | `judge()` (adjudicate) | the checker flagging its own documented behaviour |
| Multi-page vision asks read the folio first | the ask itself (verdict 13) | per-page records silently shifting onto the wrong page |

Two rules of thumb earned the hard way, worth keeping at the top of any future run:

- **A defect that appears nearly everywhere is nearly always the checker.** Verdict 6 produced
  63 identical "findings" before anyone looked at the shape of the distribution.
- **A validator that silently matches nothing looks exactly like a validator that found nothing
  wrong.** The first contents-page classifier matched zero lines; the only thing that betrayed
  it was a coverage number that did not move.

---

## Reproducing all of it

```bash
python tools/vot-pdf-fetch.py         # 20 PDFs -> source-pdfs/  (idempotent)
python tools/vot-pdf-extract.py       # text layer + inventories + flags
python tools/vot-pdf-crosscheck.py    # edition-vs-edition coverage
python tools/vot-pdf-render.py <pdf> [--every N | --pages a,b,c]
python tools/vot-pdf-adjudicate.py    # vision sample vs text layer
```

Be gentle with the shared resources: the Gemini pool paces itself (13 s/key, 5 RPM/key/model
measured), one `codex exec` at a time, several Haiku subagents at once is fine.
