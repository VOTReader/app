"""Audit: extract every (excerpt source name) from OCR, check if a corresponding
letter-link exists in bible-studies.js for the same study.
"""
import re
from pathlib import Path

base = Path("C:/Users/corbi/OneDrive/Desktop/VOTReader-studio")
data = (base / "app/src/main/assets/data/bible-studies.js").read_text(encoding='utf-8')

def audit(study_name, ocr_file):
    text = (base / ocr_file).read_text(encoding='utf-8')
    # Pre-collapse newlines/whitespace so wrapped titles match single-line data
    text_collapsed = re.sub(r'\s+', ' ', text)
    pat = re.compile(r'\(?\s*An excerpt from\s+["“]([^"”]+)["”]\s*[-–]?\s*([A-Z][^),.]*?)?\s*[)\.]', re.IGNORECASE)
    sources = pat.findall(text_collapsed)
    pat2 = re.compile(r'(?:From|from)\s+["“]([^"”]+)["”]', re.IGNORECASE)
    extras = pat2.findall(text_collapsed)

    titles = set()
    for t, _ in sources:
        t = re.sub(r'\s+', ' ', t).strip()
        titles.add(t)
    for t in extras:
        t = re.sub(r'\s+', ' ', t).strip()
        if len(t) > 5:
            titles.add(t)

    print(f"=== {study_name} ===")
    print(f"OCR distinct excerpt source titles: {len(titles)}")

    missing = []
    found = 0
    for title in sorted(titles):
        # Search for letterTitle in data
        # Use a flexible search — find letterTitle: "Title" with first 30 chars matching
        key = title[:30].lower()
        # Also check for the letter-link label form
        if f'"letterTitle": "{title}"' in data or f'"letterTitle":"{title}"' in data:
            found += 1
        elif f'"label": "\\"{title}\\""' in data or f'"label":"\\"{title}\\""' in data:
            found += 1
        else:
            # Looser check: title up to 40 chars
            partial = title[:40]
            if partial in data:
                found += 1
            else:
                missing.append(title)

    print(f"Found in data (as letter-link or text): {found} / {len(titles)}")
    print(f"Missing: {len(missing)}")
    if missing:
        for t in missing[:20]:
            print(f"  - {t!r}")
    print()
    return missing

m1 = audit("MTAM", "_ocr_out/mtam/all.txt")
m2 = audit("Lamb of God", "_ocr_out/lamb-of-god/all.txt")
