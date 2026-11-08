"""Draws the app icons (two tiles, G and W) into icons/. Run: python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'icons')
os.makedirs(out, exist_ok=True)
FONT = None
for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
    if os.path.exists(p): FONT = p
def draw(size, pad_ratio):
    S = size * 4
    im = Image.new('RGB', (S, S), '#f6f4ef')
    d = ImageDraw.Draw(im)
    pad = S * pad_ratio
    gap = S * 0.04
    tile = (S - 2 * pad - gap) / 2
    y0 = (S - tile) / 2
    font = ImageFont.truetype(FONT, int(tile * 0.62)) if FONT else ImageFont.load_default()
    for i, (ch, col) in enumerate([('G', '#2f8f83'), ('W', '#d9a03f')]):
        x0 = pad + i * (tile + gap)
        d.rounded_rectangle([x0, y0, x0 + tile, y0 + tile], radius=tile * 0.14, fill=col)
        d.text((x0 + tile / 2, y0 + tile / 2), ch, fill='white', font=font, anchor='mm')
    return im.resize((size, size), Image.LANCZOS)
draw(192, 0.10).save(os.path.join(out, 'icon-192.png'))
draw(512, 0.10).save(os.path.join(out, 'icon-512.png'))
draw(512, 0.20).save(os.path.join(out, 'icon-maskable-512.png'))
draw(180, 0.10).save(os.path.join(out, 'apple-touch-icon.png'))
