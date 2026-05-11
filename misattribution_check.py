"""Find letter-link misattributions in MTAM. Smarter version:
when same fingerprint maps to multiple OCR attributions, the data link is valid
if it matches ANY of those attributions (since same quote can be cited from
multiple letters legitimately).
"""
import re
from pathlib import Path
from collections import defaultdict

base = Path("C:/Users/corbi/OneDrive/Desktop/VOTReader-studio")
ocr = (base / "_ocr_out/mtam/all.txt").read_text(encoding="utf-8")
data_text = (base / "app/src/main/assets/data/bible-studies.js").read_text(encoding="utf-8")

def norm(s):
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s]", "", s.lower())
    return s.strip()

def title_sig(t):
    """Normalize title for comparison: drop punctuation, collapse spaces, lowercase."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t.lower())).strip()

# OCR attributions: fingerprint -> set of titles seen with that fingerprint
ocr_clean = re.sub(r"\s+", " ", ocr)
ocr_pat = re.compile(r'(.{80,160}?)\(An excerpt from\s+["“]([^"”]+)["”]\s*[-–]\s*([^)]+)\)', re.IGNORECASE)
ocr_lookup = defaultdict(set)
for m in ocr_pat.finditer(ocr_clean):
    fp = norm(m.group(1))[-80:]
    title = re.sub(r"\s+", " ", m.group(2)).strip()
    if fp:
        ocr_lookup[fp].add(title_sig(title))
print(f"OCR attribution fingerprints: {len(ocr_lookup)}")

# Data letter-links
excerpt_pat = re.compile(r'"v":\s*"([^"]{40,1500}?)\(An excerpt from\s*"', re.DOTALL)
title_pat = re.compile(r'"letterTitle":\s*"([^"]+)"')

found_pairs = []
for m in excerpt_pat.finditer(data_text):
    text_before = m.group(1)
    end = m.end()
    look = data_text[end:end+800]
    tm = title_pat.search(look)
    if tm:
        found_pairs.append((norm(text_before)[-80:], tm.group(1), m.start()))

print(f"Data excerpt-with-link pairs: {len(found_pairs)}")

# Match: data link is valid if it matches ANY OCR attribution with same fingerprint
matched = 0
mismatched = []
unmatched_ocr = 0
for fp, dtitle, pos in found_pairs:
    if fp in ocr_lookup:
        ocr_titles = ocr_lookup[fp]
        if title_sig(dtitle) in ocr_titles:
            matched += 1
        else:
            # Try fuzzy: substring OR Levenshtein-like prefix match (>=92% common chars)
            d_sig = title_sig(dtitle)
            fuzzy_match = False
            for o_sig in ocr_titles:
                if d_sig in o_sig or o_sig in d_sig:
                    fuzzy_match = True; break
                # Drop final 's' from words (handles "sorrows" vs "sorrow")
                d_alt = re.sub(r"s\b", "", d_sig)
                o_alt = re.sub(r"s\b", "", o_sig)
                if d_alt == o_alt:
                    fuzzy_match = True; break
                # 90%+ char overlap of shorter into longer
                short, long = (d_sig, o_sig) if len(d_sig) <= len(o_sig) else (o_sig, d_sig)
                if short and len(short) / max(len(long), 1) >= 0.9:
                    # Count matching chars in same positions
                    matching = sum(1 for a, b in zip(short, long) if a == b)
                    if matching / len(short) >= 0.92:
                        fuzzy_match = True; break
            if fuzzy_match:
                matched += 1
            else:
                mismatched.append((pos, dtitle, sorted(ocr_titles), fp[-50:]))
    else:
        unmatched_ocr += 1
        if unmatched_ocr <= 15:
            line = data_text[:pos].count(chr(10))+1
            print(f"  UNMATCHED line ~{line}: data link='{dtitle}'  fp=...{fp[-50:]}")

print(f"\nCorrectly attributed (incl. fuzzy/multi-OCR-attribution match): {matched}")
print(f"MISATTRIBUTED: {len(mismatched)}")
print(f"Data excerpts not fingerprint-matched in OCR: {unmatched_ocr}")
print()
print("=== REMAINING MISATTRIBUTIONS ===")
for pos, dt, ots, fp in mismatched[:30]:
    line = data_text[:pos].count(chr(10))+1
    print(f"line ~{line}:")
    print(f"  Data linked to: \"{dt}\"")
    print(f"  OCR attributions for same fingerprint: {ots}")
    print(f"  fingerprint:    ...{fp}")
    print()
