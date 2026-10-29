"""Draw the app icon (green rounded square with a "J" and a shopping-bag handle) and
save icon.png / icon.ico / icon.icns into jacestore/assets.  python packaging/make_icons.py [font.ttf]"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "jacestore" / "assets"
S = 1024
font_path = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/noto/NotoSans-Black.ttf"

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# body: vertical green gradient, rounded like the website's tiles
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
top, bottom = (110, 240, 160), (34, 165, 89)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((64, 150, S - 64, S - 64), radius=190, fill=255)
img.paste(grad, (0, 0), mask)
# bag handle
d.arc((300, 40, S - 300, 380), start=180, end=360, fill=(15, 17, 21, 255), width=58)
d.line((300 + 29, 210, 300 + 29, 250), fill=(15, 17, 21, 255), width=58)
d.line((S - 300 - 29, 210, S - 300 - 29, 250), fill=(15, 17, 21, 255), width=58)
# J
font = ImageFont.truetype(font_path, 600)
box = d.textbbox((0, 0), "J", font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((S - w) / 2 - box[0] - 10, 150 + (S - 150 - 64 - h) / 2 - box[1]), "J", font=font, fill=(15, 17, 21, 255))

OUT.mkdir(parents=True, exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save(OUT / "icon.png")
img.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.save(OUT / "icon.icns")
print("icons written to", OUT)
