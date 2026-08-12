"""Gera os assets do site a partir de tools/profile-source.jpg.

Rodar da raiz do repo:  python tools/build-assets.py
Precisa de Pillow.

O accent tambem aparece no index.html e no 404.html. Trocar nos tres.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "profile-source.jpg")
OUT = os.path.join(ROOT, "assets")

BG = (10, 10, 11)
FG = (232, 232, 230)
MUTED = (138, 138, 142)
ACCENT = (30, 200, 224)
BORDER = (42, 42, 46)

src = Image.open(SRC).convert("RGB")
w, h = src.size

# recorte quadrado central: o mesmo que o object-fit:cover ja produzia
side = min(w, h)
square = src.crop(((w - side) // 2, (h - side) // 2,
                   (w - side) // 2 + side, (h - side) // 2 + side))

# 400px = 2x a caixa de 200px em que a foto aparece
profile = square.resize((400, 400), Image.LANCZOS)
profile.save(os.path.join(OUT, "profile.jpg"), "JPEG", quality=82,
             optimize=True, progressive=True)
profile.save(os.path.join(OUT, "profile.webp"), "WEBP", quality=80, method=6)

# ---- card de Open Graph (1200x630) -----------------------------------------
# Space Grotesk e JetBrains Mono nao estao instaladas, entao o card usa as
# fontes do sistema. Nao bate com a tipografia do site.
F = r"C:\Windows\Fonts"
f_name = ImageFont.truetype(os.path.join(F, "segoeuib.ttf"), 84)
f_line = ImageFont.truetype(os.path.join(F, "segoeui.ttf"), 34)
f_mono = ImageFont.truetype(os.path.join(F, "consola.ttf"), 24)

card = Image.new("RGB", (1200, 630), BG)
d = ImageDraw.Draw(card)
card.paste(square.resize((300, 300), Image.LANCZOS), (790, 165))
d.rectangle([790, 165, 1089, 464], outline=BORDER, width=1)
d.text((90, 168), "// sonder", font=f_mono, fill=ACCENT)
d.text((88, 215), "Kauê Prata", font=f_name, fill=FG)
d.text((90, 330), "Backend, data, and systems", font=f_line, fill=(184, 184, 180))
d.text((90, 378), "that make it to production.", font=f_line, fill=(184, 184, 180))
d.text((90, 452), "Python / FastAPI / C / Lua", font=f_mono, fill=MUTED)
d.line([90, 545, 1110, 545], fill=(30, 30, 33), width=1)
d.text((90, 566), "kaueprata.com", font=f_mono, fill=MUTED)
card.save(os.path.join(OUT, "og.jpg"), "JPEG", quality=86, optimize=True)

# ---- favicon ---------------------------------------------------------------
accent_hex = "#%02X%02X%02X" % ACCENT
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="6" fill="#0A0A0B"/>'
    '<path d="M11 7v18M22 7l-8.5 9L22 25" stroke="' + accent_hex + '" stroke-width="2.6" '
    'stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
)
with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8") as fh:
    fh.write(svg)

# ---- apple-touch-icon (desenhado em 4x e reduzido) -------------------------
SS = 4
big = Image.new("RGB", (180 * SS, 180 * SS), BG)
db = ImageDraw.Draw(big)
W2 = int(13 * SS)
for a, b in (((62, 40), (62, 140)), ((124, 40), (76, 90)), ((76, 90), (124, 140))):
    db.line([(a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS)], fill=ACCENT, width=W2)
for pt in ((62, 40), (62, 140), (124, 40), (76, 90), (124, 140)):
    r = W2 // 2
    db.ellipse([pt[0] * SS - r, pt[1] * SS - r, pt[0] * SS + r, pt[1] * SS + r], fill=ACCENT)
big.resize((180, 180), Image.LANCZOS).save(
    os.path.join(OUT, "apple-touch-icon.png"), "PNG", optimize=True)

for n in ("profile.jpg", "profile.webp", "og.jpg", "favicon.svg", "apple-touch-icon.png"):
    print("%-22s %7.1f KB" % (n, os.path.getsize(os.path.join(OUT, n)) / 1024))
