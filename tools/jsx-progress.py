#!/usr/bin/env python3
"""Print the count of remaining React.createElement calls.

Tracks JSX conversion progress (Objective Q2): every file converted
from .js to .jsx with createElement calls rewritten as JSX literals
reduces this count. Run via `npm run jsx-progress` between conversion
batches to confirm forward motion -- and record the count in each
Q2.x commit message so the trajectory is visible in `git log`.

Scope: counts only the SOURCE files the conversion will touch:
  - app/src/main/assets/src/**/*.{js,jsx,html}
  - app/src/main/assets/index.html
The compiled bundles in dist/ are excluded (the build re-emits its
own React.createElement calls from JSX -- those don't count as work).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATTERN = re.compile(r'React\.createElement')

def count(p: Path) -> int:
    if p.is_file():
        if p.suffix in {'.js', '.jsx', '.html'}:
            try:
                return len(PATTERN.findall(p.read_text(encoding='utf-8')))
            except OSError:
                return 0
        return 0
    total = 0
    for child in sorted(p.iterdir()):
        total += count(child)
    return total

src_dir = ROOT / 'app' / 'src' / 'main' / 'assets' / 'src'
index_html = ROOT / 'app' / 'src' / 'main' / 'assets' / 'index.html'

src_count = count(src_dir)
html_count = count(index_html)
total = src_count + html_count

print("React.createElement remaining:")
print(f"  src/ (modules):  {src_count:>6}")
print(f"  index.html:      {html_count:>6}")
print(f"  total:           {total:>6}")
