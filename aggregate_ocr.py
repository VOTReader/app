"""Aggregate per-page OCR text files into a single all.txt per study.
Run after each PDF's OCR completes (or any time, idempotent).

Usage: python aggregate_ocr.py
"""
import os
from pathlib import Path

base = Path("C:/Users/corbi/OneDrive/Desktop/VOTReader-studio/_ocr_out")

for study_dir in sorted(base.iterdir()):
    if not study_dir.is_dir():
        continue
    pages = sorted(study_dir.glob("page_*.txt"))
    if not pages:
        continue
    out = study_dir / "all.txt"
    chunks = []
    for p in pages:
        page_num = int(p.stem.split("_")[1])
        text = p.read_text(encoding='utf-8')
        chunks.append(f"\n========== PAGE {page_num + 1} ==========\n\n{text}\n")
    out.write_text("".join(chunks), encoding='utf-8')
    print(f"{study_dir.name}: {len(pages)} pages -> all.txt ({out.stat().st_size:,} bytes)")
