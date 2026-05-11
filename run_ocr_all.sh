#!/bin/bash
# Run OCR on all 3 study PDFs sequentially. Each is resumable.
# Usage: bash run_ocr_all.sh
# Total estimated time: ~24 hours at ~128s/page on Qwen3 VL 8b.
# Safe to interrupt and re-run — pipeline skips already-done pages.
set -e
cd "$(dirname "$0")"

DOWNLOADS="/c/Users/corbi/CrossDevice/Pixel 9 Pro/storage/Download"

echo "=== Lamb of God (34 pages, ~1.2h) ==="
python ocr_pipeline.py "$DOWNLOADS/THELAMBOFGODstudy.pdf" _ocr_out/lamb-of-god

echo "=== MTAM (450 pages, ~16h) ==="
python ocr_pipeline.py "$DOWNLOADS/YAHUSHUA_MoreThanaMan.pdf" _ocr_out/mtam

echo "=== Matthew Study Bible (189 pages, ~6.7h) ==="
python ocr_pipeline.py "$DOWNLOADS/New_Testament_Study_Bible-Matthew.pdf" _ocr_out/matthew-sb

echo "=== Aggregating all studies ==="
python aggregate_ocr.py

echo "=== ALL OCR COMPLETE ==="

echo "=== ALL OCR COMPLETE ==="
