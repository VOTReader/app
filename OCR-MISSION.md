# Mission: OCR every PDF from thevolumesoftruth.com into this project

Written 2026-08-05 by the Textbook Studio session (Fable 5). Execute this mission in full.
Corbin is watching this terminal and may interject — follow his direction over this file.

Completely OCR every PDF published on thevolumesoftruth.com and save the results into this
project (D:\VOTReader-studio), using the measured multi-leg OCR tactics developed in
D:\Textbooks — and document those tactics here so they persist in this repo.

This is scripture content Corbin cares deeply about. Fidelity is everything: transcribe
verbatim, never paraphrase, never "correct" names or wording. The vault note
`D:\AgentMemory\Faith.md` records that Sacred Name conventions govern scripture work — read it
before writing any prose about the content (transcription itself is verbatim and unaffected).

## Step 0 — inherit the method (read these first, in order)

1. `D:\Textbooks\CLAUDE.md` — sections "The reader bench" and "The pipeline" (the three-check recipe).
2. `D:\Textbooks\docs\CALIBRATION.md` — all seven measurements; the doctrine is "never trust
   one reader; write the assertion that catches the lie."
3. `D:\Textbooks\docs\GEMINI.md` — measured free-tier limits (5 RPM/key/model rolling; obey the
   pool client's pacing) and the titration protocol.
4. This repo's own `CLAUDE.md` — place output and docs where this repo's structure says they belong.

## The reader legs (use all, each in its measured role)

- **PDF text layer** via PyMuPDF (`fitz`, installed): if these PDFs are born-digital, the text
  layer IS the words — deterministic truth for prose. Check per PDF first (`page.get_text()`
  non-empty and sane).
- **claude-haiku-4-5**: default vision reader. Render pages to PNG with
  `fitz get_pixmap(dpi=150)`, spawn Agent-tool subagents with `model: "haiku"` that Read the
  PNGs and return structured inventories. Handles full structured asks.
- **gemini-3.6-flash** via `D:\Textbooks\tools\gemini.py` (keys in `D:\Textbooks\.env`, pooled,
  cached, paced): figures and ITEM-SCOPED PLAIN-TEXT asks only — its decoder collapses on long
  schema-constrained JSON (sixth measurement); never ask it for whole-page JSON. Every 429
  self-logs to the quota ledger.
- **gpt-5.6-luna** via Codex CLI: `codex exec -m gpt-5.6-luna "<prompt>"` (~25–50s/call, 1M
  context) — the decorrelated second opinion from a different lab, and the whole-document leg
  for long-range checks ("list every heading in this whole PDF").
- **You** adjudicate disagreements; escalate to the page image yourself.

## The method

- Cross-check every page: text layer vs at least one vision leg; agreement accepts,
  disagreement gets adjudicated and the VERDICT WRITTEN DOWN in the calibration doc you create.
- Content-independent validators are the load-bearing wall: page-count coverage (no silent
  gaps), per-PDF word/char sanity, heading continuity, count tripwires (ask "how many X"
  separately from "list every X" — mismatch = the reader reporting its own failure).
- Structured output in per-PDF files (clean text per page + a JSON inventory: headings, page
  map, figures/images noted). Fit this repo's conventions.

## Execution

1. Crawl thevolumesoftruth.com and enumerate EVERY PDF (site nav + sitemap; multiple
   volumes/languages if present). Download all into the project (mirrors/ or source-pdfs/ per
   repo conventions).
2. Per PDF: text-layer extraction → vision cross-check sample (every Nth page + every page the
   validators flag) → full vision OCR only where the text layer is absent or bad →
   adjudicated clean output.
3. Document the tactics in this repo (e.g. `docs/OCR-PIPELINE.md`): the legs, their measured
   roles, the limits (state the load-bearing numbers inline; don't make readers cross-repo
   hop), the validators, and a calibration log of every disagreement verdict from THIS corpus.
4. If this is a git repo, commit in sensible increments with clear messages. Log progress as
   you go — Corbin follows along live.
5. Gentle on the machine: the Gemini pool paces itself; one `codex exec` at a time; several
   Haiku subagents at once is fine.

## Final report

PDFs found/downloaded, pages OCR'd, text-layer vs vision split, disagreements adjudicated
(count + the interesting ones), validator catches, where everything landed, what you
documented where.
