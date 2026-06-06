#!/usr/bin/env python3
"""Generate a minimal favicon.ico for mwyatt.me (32x32, dark with accent m)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path("public/favicon.ico")
OUT.parent.mkdir(parents=True, exist_ok=True)

BG = (10, 10, 13, 255)
ACCENT = (124, 131, 255, 255)

img = Image.new("RGBA", (32, 32), BG)
draw = ImageDraw.Draw(img)

# Draw a chunky 'm' centered.
candidates = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
]
font = None
for p in candidates:
    if Path(p).exists():
        try:
            font = ImageFont.truetype(p, 22)
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()

bbox = draw.textbbox((0, 0), "m", font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (32 - tw) / 2 - bbox[0]
y = (32 - th) / 2 - bbox[1]
draw.text((x, y), "m", font=font, fill=ACCENT)

# Save as multi-size ICO
img.save(OUT, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
