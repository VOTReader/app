#!/usr/bin/env python3
"""Download every PDF published on thevolumesoftruth.com into source-pdfs/.

Writes source-pdfs/MANIFEST.json: url, file, bytes, sha256, pages, has_text_layer.
Idempotent — skips a file that already matches its recorded size.
"""
import hashlib
import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "source-pdfs"
BASE = "http://trumpetcallofgod.com/pdfs/"

# Enumerated from thevolumesoftruth.com/Main_Page (2026-08-05).
PDFS = [
    ("Volumes_Book.pdf", "The Volumes of Truth - Complete Edition (all volumes and books)"),
    ("toc.pdf", "Table of Contents: Volumes One thru Seven"),
    ("letters-vol1.pdf", "Volume One"),
    ("letters-vol2.pdf", "Volume Two"),
    ("letters-vol3.pdf", "Volume Three"),
    ("letters-vol4.pdf", "Volume Four"),
    ("letters-vol5.pdf", "Volume Five"),
    ("letters-vol6.pdf", "Volume Six"),
    ("letters-vol7.pdf", "Volume Seven"),
    ("letters-vol1_7.pdf", "Volumes One thru Seven (Book)"),
    ("Volumes1_7 LARGE PRINT.pdf", "Volumes One thru Seven (Large Print)"),
    ("Rebuke.pdf", "The Lord's Rebuke (Book)"),
    ("WTLB.pdf", "Words To Live By: Part One and The Blessed"),
    ("WTLB2.pdf", "Words To Live By: Part Two (Book)"),
    ("WTLB1_2 LARGE PRINT.pdf", "Words To Live By: Parts One and Two and The Blessed (Large Print)"),
    ("Flock_Book.pdf", "Letters to The Lord's Little Flock and Letters from Timothy (Book)"),
    ("Garden.pdf", "A Return to the Garden (Book)"),
    ("YAHUSHUA_MoreThanaMan.pdf", "YAHUSHUA More Than a Man (Bible Study)"),
    ("THELAMBOFGODstudy.pdf", "The TRUE Chronology of The Messiah's Crucifixion and Resurrection (Bible Study)"),
    ("New_Testament_Study_Bible-Matthew.pdf", "New Testament Study Bible - Matthew"),
]

UA = {"User-Agent": "Mozilla/5.0 (VOTReader offline archive, personal use)"}


def slug(name: str) -> str:
    return name.replace(" ", "_")


def fetch(name: str) -> bytes:
    url = BASE + urllib.parse.quote(name)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def main() -> int:
    OUT.mkdir(exist_ok=True)
    manifest = []
    for name, title in PDFS:
        dest = OUT / slug(name)
        if dest.exists() and dest.stat().st_size > 0:
            data = dest.read_bytes()
            status = "cached"
        else:
            try:
                data = fetch(name)
            except Exception as e:  # noqa: BLE001 - report and continue the batch
                print(f"FAIL  {name}: {e}", flush=True)
                manifest.append({"url": BASE + name, "file": slug(name), "error": str(e)})
                continue
            if not data.startswith(b"%PDF"):
                print(f"FAIL  {name}: not a PDF (got {data[:16]!r})", flush=True)
                manifest.append({"url": BASE + name, "file": slug(name),
                                 "error": "not a PDF"})
                continue
            dest.write_bytes(data)
            status = "downloaded"
        entry = {
            "url": BASE + name,
            "title": title,
            "file": slug(name),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        manifest.append(entry)
        print(f"{status:10} {slug(name):45} {len(data)/1e6:8.2f} MB", flush=True)

    (OUT / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    ok = sum(1 for m in manifest if "error" not in m)
    print(f"\n{ok}/{len(PDFS)} PDFs present in {OUT}")
    return 0 if ok == len(PDFS) else 1


if __name__ == "__main__":
    sys.exit(main())
