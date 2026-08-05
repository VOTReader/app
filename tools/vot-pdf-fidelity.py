#!/usr/bin/env python3
"""Verbatim fidelity audit: a RANDOM sample, compared character by character.

    python tools/vot-pdf-fidelity.py plan --n 40 --seed 20260805
    python tools/vot-pdf-fidelity.py score

Everything else in this pipeline measures STRUCTURE — first line, last line, element presence,
edition-vs-edition shingle coverage. None of it compares a sentence character for character,
and none of it can, because two editions sharing one extractor bug agree perfectly while both
being wrong. This is the missing measurement.

Two design choices that make it an honest number rather than a flattering one:

1. The sample is RANDOM over every text-bearing page in the corpus, seeded for reproducibility.
   The earlier structural sample took every Nth page filtered to >300 chars, which quietly
   excluded thin pages, poetry, contents pages and decorative titles — precisely where the
   known defects live. A sample that avoids the hard pages measures the easy ones.
2. The reader transcribing the page has NOT seen the text layer, and the score is computed
   locally by difflib, so the reader cannot grade its own work.

Reported: character error rate and word error rate per page, plus the corpus figure. A
disagreement is not automatically an extractor defect — it is escalated to the page image.
"""
import argparse
import collections
import difflib
import json
import pathlib
import random
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_ocr_out" / "vot"
PLAN = OUT / "_fidelity-plan.json"
SAMPLE = OUT / "_fidelity-sample"

WS = re.compile(r"\s+")
WORDCH = re.compile(r"[^\W\d_]+", re.UNICODE)


def norm(s: str) -> str:
    """Normalise only what is genuinely not content: whitespace runs and quote/dash glyph
    variants. Case, spelling, punctuation presence and word order all remain significant —
    this is a fidelity check, not a similarity score."""
    s = (s or "").replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace("−", "-")
    s = s.replace(" ", " ")
    return WS.sub(" ", s).strip()


def build_plan(n: int, seed: int) -> dict:
    corpus = json.loads((OUT / "CORPUS.json").read_text(encoding="utf-8"))
    pool = []
    for b in corpus:
        inv = json.loads((OUT / b["slug"] / "inventory.json").read_text(encoding="utf-8"))
        for m in inv["pages"]:
            # every page that carries ANY text is eligible - no minimum, no filtering.
            if m["chars"] > 0:
                pool.append({"book": b["slug"], "page": m["page"], "chars": m["chars"]})
    rng = random.Random(seed)
    picked = rng.sample(pool, min(n, len(pool)))
    picked.sort(key=lambda r: (r["book"], r["page"]))
    plan = {"seed": seed, "n": len(picked), "pool_size": len(pool), "pages": picked}
    PLAN.write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return plan


def score() -> int:
    if not SAMPLE.exists():
        sys.exit(f"no transcriptions at {SAMPLE}")
    rows = []
    for f in sorted(SAMPLE.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for rec in data.get("results", []):
            book = rec["book"]
            # readers sometimes echo the page as a string, or as the padded filename stem
            page = int(str(rec["page"]).lstrip("p").lstrip("0") or "0")
            p = OUT / book / f"page_{page - 1:04d}.txt"
            if not p.exists():
                continue
            truth = norm(p.read_text(encoding="utf-8"))
            got = norm(rec.get("text", ""))
            sm = difflib.SequenceMatcher(None, truth, got, autojunk=False)
            cer = 1 - sm.ratio()
            tw, gw = truth.split(), got.split()
            wr = difflib.SequenceMatcher(None, tw, gw, autojunk=False).ratio()

            # Order-insensitive content agreement. Sequence comparison conflates two very
            # different defects: WORDS THAT ARE WRONG, and words that are right but in a
            # different order. For a page whose text layer emits the running header last
            # though it is printed first, every word is correct and the sequence score
            # collapses. Both numbers are needed: this one says whether the words are right,
            # the sequence one says whether they are in the right order.
            ta = collections.Counter(WORDCH.findall(truth.lower()))
            ga = collections.Counter(WORDCH.findall(got.lower()))
            common = sum((ta & ga).values())
            total = max(sum(ta.values()), 1)
            rows.append({
                "book": book, "page": page,
                "chars_textlayer": len(truth), "chars_vision": len(got),
                "char_agreement": round(sm.ratio(), 5),
                "word_agreement": round(wr, 5),
                "content_agreement": round(common / total, 5),
                "order_only": common / total > 0.995 and wr < 0.99,
                "cer": round(cer, 5),
                "words_textlayer": len(tw), "words_vision": len(gw),
            })
    if not rows:
        sys.exit("no scored pages")

    rows.sort(key=lambda r: r["char_agreement"])
    tot_t = sum(r["chars_textlayer"] for r in rows)
    tot_ok = sum(r["char_agreement"] * r["chars_textlayer"] for r in rows)
    wt = sum(r["words_textlayer"] for r in rows)
    wok = sum(r["word_agreement"] * r["words_textlayer"] for r in rows)

    print(f"verbatim fidelity audit — {len(rows)} randomly sampled pages\n")
    print(f"  character agreement (length-weighted): {tot_ok / tot_t * 100:7.3f}%")
    print(f"  word agreement (length-weighted):      {wok / wt * 100:7.3f}%")
    exact = sum(1 for r in rows if r["char_agreement"] == 1.0)
    print(f"  pages byte-identical after normalisation: {exact}/{len(rows)}")
    print(f"  pages >=99% char agreement: {sum(1 for r in rows if r['char_agreement'] >= 0.99)}"
          f"/{len(rows)}")
    ct = sum(r["content_agreement"] * r["words_textlayer"] for r in rows)
    print(f"\n  CONTENT agreement, order-insensitive:  {ct / wt * 100:7.3f}%")
    print(f"  pages where every word matches but the ORDER differs: "
          f"{sum(1 for r in rows if r['order_only'])}")
    print("\n  worst pages (escalate these to the page image):")
    for r in rows[:10]:
        tag = " ORDER-ONLY" if r["order_only"] else ""
        print(f"    {r['book'][:30]:30} p{r['page']:<5} char {r['char_agreement'] * 100:6.2f}% "
              f"word {r['word_agreement'] * 100:6.2f}% content {r['content_agreement'] * 100:6.2f}%"
              f"  ({r['words_textlayer']}w vs {r['words_vision']}w){tag}")

    (OUT / "FIDELITY.json").write_text(json.dumps({
        "pages": len(rows),
        "char_agreement_weighted": tot_ok / tot_t,
        "word_agreement_weighted": wok / wt,
        "results": rows,
    }, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "score"])
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--seed", type=int, default=20260805)
    a = ap.parse_args()
    if a.cmd == "plan":
        plan = build_plan(a.n, a.seed)
        print(f"sampled {plan['n']} of {plan['pool_size']} text-bearing pages "
              f"(seed {plan['seed']})")
        for r in plan["pages"]:
            print(f"  {r['book'][:34]:34} p{r['page']:<5} {r['chars']:6} chars")
        return 0
    return score()


if __name__ == "__main__":
    return_code = main()
    sys.exit(return_code)
