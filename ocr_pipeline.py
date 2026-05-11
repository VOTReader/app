"""
OCR pipeline: PDF -> page images -> Ollama Qwen3 VL -> text.

Usage:
    python ocr_pipeline.py <pdf_path> <output_dir> [start_page] [end_page]

Output:
    <output_dir>/page_NNNN.txt  (one per page)
    <output_dir>/all.json       (aggregated)
    <output_dir>/_progress.json (resume tracking)

Resumable: if a page output file already exists, skip it.
"""
import sys, os, json, time, base64, io
from pathlib import Path
import pypdfium2 as pdfium
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3-vl:8b-instruct"

OCR_PROMPT = """Transcribe ALL the text from this page accurately. Pay attention to:

- Multiple columns (read left column top-to-bottom first, then center, then right)
- Bold, italic, and bold-italic text — preserve emphasis using markdown (**bold**, *italic*)
- Footnote markers like [1], [2], [3] — preserve them inline as [N]
- Scripture references like "Matthew 4:4" or "John 1:1-5" — keep them exactly as shown
- Section headings vs body paragraphs — separate with blank lines
- Page numbers — note "PAGE: N" at the end
- Indented quotes / verses / poetry — preserve line breaks
- Any images — describe with [IMAGE: brief description] in the appropriate position

If the page is mostly blank or appears to be a section divider, output exactly: PAGE_BLANK

If you can't read the page reliably (very poor scan quality), output: PAGE_UNREADABLE followed by what you can make out.

Output ONLY the transcribed text — no explanations, no preamble. Begin transcription:"""


def render_page(pdf, page_idx, dpi=200):
    """Render PDF page to PNG bytes."""
    page = pdf[page_idx]
    bitmap = page.render(scale=dpi/72)
    pil = bitmap.to_pil()
    page.close()
    bitmap.close()
    buf = io.BytesIO()
    pil.save(buf, format='PNG')
    return buf.getvalue()


def ocr_page(image_bytes, retries=2):
    """Send image to Ollama, get OCR text."""
    payload = {
        "model": MODEL,
        "prompt": OCR_PROMPT,
        "stream": False,
        "images": [base64.b64encode(image_bytes).decode('ascii')],
        "options": {"temperature": 0.1, "num_predict": 4096}
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(OLLAMA_URL, json=payload, timeout=300)
            r.raise_for_status()
            return r.json().get('response', '').strip()
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise last_err


def main():
    if len(sys.argv) < 3:
        print("Usage: python ocr_pipeline.py <pdf_path> <output_dir> [start_page] [end_page]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf = pdfium.PdfDocument(pdf_path)
    n_pages = len(pdf)

    start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    end = int(sys.argv[4]) if len(sys.argv) > 4 else n_pages
    end = min(end, n_pages)

    print(f"PDF: {pdf_path}")
    print(f"Total pages: {n_pages}")
    print(f"Range: {start}..{end-1}")
    print(f"Output: {out_dir}")

    progress_file = out_dir / "_progress.json"
    progress = {}
    if progress_file.exists():
        progress = json.loads(progress_file.read_text(encoding='utf-8'))

    for i in range(start, end):
        page_file = out_dir / f"page_{i:04d}.txt"
        if page_file.exists() and progress.get(str(i), {}).get('done'):
            print(f"  [skip] page {i+1}/{end} (already done)")
            continue

        t0 = time.time()
        try:
            img = render_page(pdf, i, dpi=200)
            text = ocr_page(img)
            page_file.write_text(text, encoding='utf-8')
            dt = time.time() - t0
            progress[str(i)] = {"done": True, "len": len(text), "seconds": round(dt, 1)}
            progress_file.write_text(json.dumps(progress, indent=2), encoding='utf-8')
            print(f"  [done] page {i+1}/{end} -> {len(text)}ch in {dt:.1f}s")
        except Exception as e:
            print(f"  [fail] page {i+1}/{end}: {e}")
            progress[str(i)] = {"done": False, "error": str(e)}
            progress_file.write_text(json.dumps(progress, indent=2), encoding='utf-8')

    pdf.close()
    print(f"Done. Progress in {progress_file}")


if __name__ == "__main__":
    main()
