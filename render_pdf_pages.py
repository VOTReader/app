"""Render PDF pages to JPG images. Skips pages that already exist.

Usage: python render_pdf_pages.py <pdf_path> <out_dir> [start] [end]
"""
import sys, io
from pathlib import Path
import pypdfium2 as pdfium

pdf_path = sys.argv[1]
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

pdf = pdfium.PdfDocument(pdf_path)
n = len(pdf)
start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
end = int(sys.argv[4]) if len(sys.argv) > 4 else n
end = min(end, n)

print(f"Rendering pages {start}..{end-1} of {n} from {pdf_path}")
done = skipped = 0
for i in range(start, end):
    out = out_dir / f"page_{i:04d}.jpg"
    if out.exists() and out.stat().st_size > 1000:
        skipped += 1
        continue
    page = pdf[i]
    bitmap = page.render(scale=180/72)
    pil = bitmap.to_pil()
    pil.save(out, format='JPEG', quality=80)
    page.close()
    bitmap.close()
    done += 1
    if done % 20 == 0:
        print(f"  rendered {done}, skipped {skipped}, current {i+1}/{end}")
pdf.close()
print(f"Done: rendered {done}, skipped {skipped}, total {end-start}")
