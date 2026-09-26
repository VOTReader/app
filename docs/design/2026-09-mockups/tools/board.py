#!/usr/bin/env python3
"""board.py OUT.png "Label=path" ... : side-by-side comparison board, equal heights, labels on top."""
import sys, glob
from PIL import Image, ImageDraw, ImageFont
def font(sz):
    for p in glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True) + glob.glob('/usr/share/fonts/**/LiberationSans-Bold.ttf', recursive=True):
        return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
out = sys.argv[1]; pairs = [a.split('=', 1) for a in sys.argv[2:]]
H = int(sys.argv[0] and 1400)
ims = []
for label, path in pairs:
    im = Image.open(path).convert('RGB'); w = int(im.width * H / im.height); ims.append((label, im.resize((w, H), Image.LANCZOS)))
pad, top = 28, 70
W = sum(im.width for _, im in ims) + pad * (len(ims) + 1)
board = Image.new('RGB', (W, H + top + pad), (24, 24, 24))
d = ImageDraw.Draw(board); f = font(30); x = pad
for label, im in ims:
    d.text((x, 20), label, fill=(235, 235, 235), font=f)
    board.paste(im, (x, top)); x += im.width + pad
board.save(out, quality=88) if out.endswith('.jpg') else board.save(out)
print(out, board.size)
