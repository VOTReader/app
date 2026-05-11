"""Programmatic gap detection: pick distinctive phrases from OCR, search the data file.
Reports which OCR pages have phrases NOT present in the data file.
"""
import re, sys
from pathlib import Path

def normalize(s):
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def extract_distinctive_phrases(page_text, min_words=8):
    """Extract sentences of >=min_words from a page.
    Strip leading verse numbers so "20 But while he thought..." becomes "But while he thought..."
    (matthew.js stores verses with the number in a separate `n` field, not inline).
    """
    out = []
    for line in page_text.split("\n"):
        line = line.strip()
        if not line: continue
        if line.startswith("PAGE_") or line.startswith("PAGE:"): continue
        if line.startswith("==="): continue
        if line.startswith("[IMAGE:"): continue
        # Skip table-of-contents-style lines (number then heading text only)
        if re.match(r"^\d+(-\d+)?\s+[A-Z]", line) and len(line.split()) < 12:
            continue
        # Split on sentence boundaries
        for s in re.split(r"(?<=[.!?])\s+", line):
            # Strip leading verse number if present ("20 But while..." -> "But while...")
            s = re.sub(r"^\d+\s+", "", s)
            words = s.split()
            if len(words) >= min_words:
                out.append(s)
    return out

def gap_check(ocr_dir, data_file, study_name):
    data = Path(data_file).read_text(encoding="utf-8")
    data_norm = normalize(data)
    ocr_pages = sorted(Path(ocr_dir).glob("page_*.txt"))

    pages_with_gaps = []
    total_phrases = 0
    missing_phrases = 0

    for page in ocr_pages:
        text = page.read_text(encoding="utf-8")
        if "PAGE_BLANK" in text or len(text.strip()) < 50:
            continue
        phrases = extract_distinctive_phrases(text)
        total_phrases += len(phrases)
        page_missing = []
        for ph in phrases:
            ph_norm = normalize(ph)
            # Take first 60 chars as the search key (phrases get tokenized differently in JSON)
            search_key = ph_norm[:60]
            if search_key and search_key not in data_norm:
                page_missing.append(ph[:80])
                missing_phrases += 1
        if page_missing:
            pages_with_gaps.append((page.stem, page_missing[:3]))  # max 3 examples per page

    print(f"=== {study_name} ===")
    print(f"OCR pages: {len(ocr_pages)}")
    print(f"Phrases checked: {total_phrases}")
    print(f"Missing phrases: {missing_phrases} ({100*missing_phrases/max(total_phrases,1):.1f}%)")
    print(f"Pages with at least one missing phrase: {len(pages_with_gaps)}")
    if pages_with_gaps:
        print("Sample gaps:")
        for page, missing in pages_with_gaps[:8]:
            print(f"  {page}:")
            for m in missing:
                print(f"    - \"{m}...\"")
    print()

base = Path("C:/Users/corbi/OneDrive/Desktop/VOTReader-studio")
gap_check(base/"_ocr_out/mtam", base/"app/src/main/assets/data/bible-studies.js", "MTAM")
gap_check(base/"_ocr_out/lamb-of-god", base/"app/src/main/assets/data/bible-studies.js", "Lamb of God")
gap_check(base/"_ocr_out/matthew-sb", base/"app/src/main/assets/data/matthew.js", "Matthew Study Bible")
