#!/usr/bin/env python3
"""Generate a simple dark OG image for mwyatt.me.

Run from project root: python3 scripts/make-og.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (10, 10, 13, 255)
FG = (230, 230, 234, 255)
ACCENT = (124, 131, 255, 255)
MUTED = (138, 138, 153, 255)

OUT = Path("public/og-default.png")
OUT.parent.mkdir(parents=True, exist_ok=True)

img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img)

# Find a usable font; fall back to default.
def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Black.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

font_big = load_font(96, bold=True)
font_med = load_font(40)
font_small = load_font(28)

title = "mwyatt.me"
sub = "Build logs, post-mortems, and the levers I used."
tagline = "Mike Wyatt · Infrastructure · Kubernetes in progress"

# Title
bbox = draw.textbbox((0, 0), title, font=font_big)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((W - tw) / 2, 200), title, font=font_big, fill=ACCENT)

# Accent dot row
dot_y = 200 + th + 30
for i, c in enumerate([ACCENT, (94, 234, 212, 255), ACCENT]):
    x = (W / 2) - 60 + i * 60
    draw.ellipse((x - 8, dot_y, x + 8, dot_y + 8), fill=c)

# Subtitle
bbox = draw.textbbox((0, 0), sub, font=font_med)
sw, sh = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((W - sw) / 2, dot_y + 30), sub, font=font_med, fill=FG)

# Tagline at bottom
bbox = draw.textbbox((0, 0), tagline, font=font_small)
tw2, th2 = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((W - tw2) / 2, H - 80), tagline, font=font_small, fill=MUTED)

# Border
draw.rectangle((0, 0, W - 1, H - 1), outline=(35, 35, 44, 255), width=2)

img.convert("RGB").save(OUT, "PNG", optimize=True)
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
