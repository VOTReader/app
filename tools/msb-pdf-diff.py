#!/usr/bin/env python3
"""The Matthew Study Bible against its official PDF, note by note.

    python tools/msb-pdf-diff.py                     # source-pdfs/New_Testament_Study_Bible-Matthew.pdf
    python tools/msb-pdf-diff.py --fetch             # download the live PDF first (says if it changed)
    python tools/msb-pdf-diff.py --text-dir DIR      # read page transcripts DIR/pNNNN.txt instead (vision leg)
    python tools/msb-pdf-diff.py path/to/other.pdf

Tim revises this PDF (more Volumes of Truth references, corrected cites). vot-app-vs-pdf.py counts
words and cannot see a note filed under the wrong chapter or naming the wrong letter, so this tool
lines the two up STRUCTURALLY, chapter by chapter:

  vot     every "The Volumes of Truth:" row (ref, collection, letter, excerpt) vs matthew.js votNotes
  sot     the "The Scriptures of Truth:" cites and notes vs chapter.scriptures
  links   the "Also see online:" / "See online:" addresses vs chapter.links
  verses  the verse text, letters and digits only

Differences already examined are listed in KNOWN with the reason, so a run prints only what is new.
Exit 1 when anything new differs. The PDF's own text layer is clean (an InDesign export): pdftotext
gives one paragraph per line; PyMuPDF is the fallback. No OCR is needed.

First run 2026-10-20 (PDF of 2025-12-02): 627 notes on each side, verse text identical; six fixes
landed in c73 (see HISTORY.md). Vision leg, same day: every page rendered with fitz at 150 dpi
(_ocr_out/vot/New_Testament_Study_Bible-Matthew/_haiku55/png/), eight Haiku 5.5 subagents (Agent tool,
model haiku, medium effort, about 24 pages each, ~12 min) transcribed them to _haiku55/text/pNNNN.txt
(OCR-MISSION.md's recipe). Their reading agreed with the text layer on all 627 rows, every cite, link and
verse (letters and digits compared), and --text-dir on it reports the same 0 new differences.
"""
import argparse, hashlib, json, pathlib, re, shutil, subprocess, sys, unicodedata, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "source-pdfs" / "New_Testament_Study_Bible-Matthew.pdf"
URL = "https://trumpetcallofgod.com/pdfs/New_Testament_Study_Bible-Matthew.pdf"
DATA = ROOT / "app" / "src" / "main" / "assets" / "src" / "data" / "matthew.js"

REF = re.compile(r"^(\d+:\d+(?:\s*[-–]\s*\d+(?::\d+)?)?(?:,\s*\d+(?::\d+)?(?:\s*[-–]\s*\d+(?::\d+)?)?)*)\s+(.*)$")
FOOTER = re.compile(r"^(CHAPTER \d+|MATTHEW|\d{1,3})$")
URLS = re.compile(r"https?://\S+")

# The corpus's title for a letter the PDF names another way (same letter).
TITLE_ALIASES = {
    "I Am Calling You Out: Part One": "I Am Calling You Out! (Part 1)",
    "I Am Calling You Out! Part Two: Come Out of the Churches of Men and I Will Receive You! Says The Lord":
        "I Am Calling You Out! (Part 2)... Come Out of the Churches of Men and I Will Receive You! Says The Lord",
    "I Am Calling You Out! Part Two Come Out of the Churches of Men and I Will Receive You! Says The Lord":
        "I Am Calling You Out! (Part 2)... Come Out of the Churches of Men and I Will Receive You! Says The Lord",
}
# Topic labels the PDF prints before a row ("22:11 wedding garment: ...").
LABELS = ("wedding garment:",)

# (chapter, address) -> why the app does not carry a link the PDF prints.
KNOWN_LINKS = {
    (5, "thevolumesoftruth.com/the_blessed"):
        "the app links the same compilation by its page name, The_Blessed:_More_Declarations_of_Blessedness",
}

# (chapter, PDF ref, letter) -> why the app differs from the PDF on purpose.
KNOWN = {
    (5, "5:17", "Let The Law Be Written in Your Heart"):
        "PDF says 'Words To Live By'; the letter is in Part Two (wtlb-two.js), which the app names",
    (16, "16:27", "To the Church Who Dwells in the Midst Of and Sits Upon Seven Hills"):
        "PDF misprints Volume Three; the letter and this excerpt are in Volume Two (as 1:18-21 and 6:7 say)",
    (25, "24:14-30", "The Way of The Lord Is Equal"):
        "PDF misprints 24:14-30 inside chapter 25; the app files it as 25:14-30 (parable of the talents)",
}


def key(s):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKC", s or "").lower())


def extract(pdf):
    if shutil.which("pdftotext"):
        out = subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), "-"], capture_output=True, check=True)
        return out.stdout.decode("utf-8")
    import fitz  # PyMuPDF
    with fitz.open(pdf) as d:
        return "\n".join(p.get_text() for p in d)


def parse(text):
    chapters, cur, section = {}, None, None
    for raw in text.replace("\f", "\n").split("\n"):
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^Matthew Chapter (\d+)$", s)
        if m:
            cur = {"verses": [], "sot": [], "vot": [], "online": []}
            chapters[int(m.group(1))] = cur
            section = "verses"
            continue
        if cur is None or FOOTER.match(s):
            continue
        while True:
            for head, name in (("The Scriptures of Truth:", "sot"), ("The Volumes of Truth:", "vot"),
                               ("Also see online:", "online")):
                if s.startswith(head):
                    section, s = name, s[len(head):].strip()
                    break
            else:
                break
        if not s:
            continue
        if section == "vot" and not REF.match(s) and cur["vot"]:
            cur["vot"][-1] += " " + s  # a row continued across a page break
        else:
            cur[section].append(s)
    return chapters


def load_app():
    js = ("const s=require('fs').readFileSync(process.argv[1],'utf8');"
          "process.stdout.write(JSON.stringify(new Function(s+';return MATTHEW;')()));")
    out = subprocess.run(["node", "-e", js, str(DATA)], capture_output=True, check=True)
    return {c["num"]: c for c in json.loads(out.stdout.decode("utf-8"))["chapters"]}


def pdf_row(line):
    ref, rest = REF.match(line).groups()
    rest = re.sub(r"\((?:continued on the (?:next|following) page)\)", "", rest)
    rest = re.sub(r"See online:.*$", "", rest)  # its address may hold a space ("..._Out! Part_Two")
    rest = URLS.sub("", rest).strip()
    for lab in LABELS:
        if rest.lower().startswith(lab):
            rest = rest[len(lab):].strip()
    for alias, title in TITLE_ALIASES.items():
        rest = rest.replace(alias, title)
    return ref, rest


def app_row(n):
    vol, letter = n.get("vol"), n.get("letter") or ""
    head = letter if (not vol or vol.strip().lower() == letter.strip().lower()) else vol + ", " + letter
    return head, n.get("excerpt") or ""


def diff_vot(pdf, app):
    problems, pending = [], {c: list(app[c].get("votNotes") or []) for c in app}
    for ch, c in pdf.items():
        for line in c["vot"]:
            ref, rest = pdf_row(line)
            kr = key(rest)
            hit = None
            for cand_ch in (ch, ch - 1, ch + 1):
                for n in pending.get(cand_ch, []):
                    head, ex = app_row(n)
                    kh, ke = key(head), key(ex)
                    # equal, or the PDF gives only the title (a "See online" row) and the app adds an excerpt
                    if kr == kh + ke or (kr == kh and ke) or (kr.startswith(kh) and kr[len(kh):] == ke):
                        hit = (cand_ch, n)
                        break
                if hit:
                    break
            if hit and key(hit[1]["ref"]) == key(ref) and hit[0] == ch:
                pending[hit[0]].remove(hit[1])
                continue
            letter = (hit[1]["letter"] if hit else None) or ""
            known = next((v for (kc, kref, kl), v in KNOWN.items()
                          if kc == ch and key(kref) == key(ref) and kl in line), None)
            if hit:
                pending[hit[0]].remove(hit[1])
            if known and (not hit or hit[0] == ch):
                continue
            if hit:
                problems.append(f"vot ch{ch} {ref}: app has it as ch{hit[0]} {hit[1]['ref']} ({letter})")
            else:
                problems.append(f"vot ch{ch} PDF row not in app: {line[:220]}")
    # rows the PDF does not explain: compare what is left after a looser pass
    for ch, left in pending.items():
        for n in left:
            hint = next((v for (kc, kref, kl), v in KNOWN.items() if kl == n.get("letter")), None)
            if not hint:
                problems.append(f"vot ch{ch} app row not in PDF: {n['ref']} {n.get('vol')}, {n.get('letter')}")
    return problems


def diff_sot(pdf, app):
    problems = []
    for ch, c in pdf.items():
        p = URLS.sub("", " ".join(c["sot"]))
        items = app[ch].get("scriptures") or []
        a = " ".join(x["ref"] + " " + x["cite"] for x in items)
        # the app splits "11:13-14 Malachi 4:4-6 These verses..." into a cite and a note under one ref
        merged = " ".join(x["cite"] if i and x["ref"] == items[i - 1]["ref"] else x["ref"] + " " + x["cite"]
                          for i, x in enumerate(items))
        if key(p) not in (key(a), key(merged)):
            kp, ka = key(p), key(a)
            i = next((i for i in range(min(len(kp), len(ka))) if kp[i] != ka[i]), min(len(kp), len(ka)))
            problems.append(f"sot ch{ch}: first difference at ...{kp[max(0, i - 30):i + 50]} (PDF) vs "
                            f"...{ka[max(0, i - 30):i + 50]} (app)")
    return problems


def diff_links(pdf, app):
    norm = lambda u: re.sub(r"^https?://(www\.)?", "", u).rstrip(".,;)").lower()
    problems = []
    for ch, c in pdf.items():
        # a Volumes of Truth row's "See online" address is the letter, which the app opens in-app
        core = {norm(u) for u in URLS.findall(" ".join(c["online"] + c["sot"]))}
        every = core | {norm(u) for u in URLS.findall(" ".join(c["vot"]))}
        a = {norm(x["url"]) for x in app[ch].get("links") or []}
        missing = {u for u in core - a if (ch, u) not in KNOWN_LINKS}
        if missing:
            problems.append(f"links ch{ch}: in the PDF, not the app: {sorted(missing)}")
        if a - every:
            problems.append(f"links ch{ch}: in the app, not the PDF: {sorted(a - every)}")
    return problems


def diff_verses(pdf, app):
    problems = []
    for ch, c in pdf.items():
        if key(" ".join(c["verses"])) != key(" ".join(f"{v['n']} {v['text']}" for v in app[ch]["verses"])):
            problems.append(f"verses ch{ch}: text differs")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pdf", nargs="?", default=str(PDF))
    ap.add_argument("--fetch", action="store_true", help="download the live PDF over source-pdfs/ first")
    ap.add_argument("--text-dir", help="use page transcripts DIR/pNNNN.txt (e.g. a vision read) instead of the PDF")
    args = ap.parse_args()
    pdf = pathlib.Path(args.pdf)
    if args.fetch:
        old = hashlib.sha256(pdf.read_bytes()).hexdigest() if pdf.exists() else None
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=60).read()
        new = hashlib.sha256(data).hexdigest()
        print(f"live PDF {len(data):,} B sha256 {new[:16]} - " + ("UNCHANGED" if new == old else "NEW VERSION"))
        if new != old:
            pdf.write_bytes(data)
    if args.text_dir:
        pages = sorted(pathlib.Path(args.text_dir).glob("p*.txt"))
        text = "\n".join(f.read_text(encoding="utf-8") for f in pages)
    else:
        text = extract(pdf)
    pdf_ch, app = parse(text), load_app()
    n_pdf = sum(len(c["vot"]) for c in pdf_ch.values())
    n_app = sum(len(c.get("votNotes") or []) for c in app.values())
    print(f"chapters PDF {len(pdf_ch)} / app {len(app)}; Volumes of Truth rows PDF {n_pdf} / app {n_app}")
    problems = diff_vot(pdf_ch, app) + diff_sot(pdf_ch, app) + diff_links(pdf_ch, app) + diff_verses(pdf_ch, app)
    for p in problems:
        print(" ", p)
    print(f"{len(problems)} new difference(s); {len(KNOWN) + len(KNOWN_LINKS)} known and explained in KNOWN")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
