#!/usr/bin/env python3
"""
Génère les icônes de l'extension Utiq Detector.

Le design est dérivé du favicon officiel d'utiq-tracker.online
(`icons/favicon.svg`) : carré arrondi + bordure sombre + lettre "U" blanche.
Seule la couleur de fond change selon l'état détecté.

  red   #e03030  -> Utiq détecté
  green #22a060  -> site propre
  gray  #888888  -> état inconnu / analyse en cours

Usage : pip install Pillow && python3 generate_icons.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 32, 48, 128]

# Couleurs de fond par état (le reste du design vient du favicon du site)
COLORS = {
    "red": "#e03030",
    "green": "#22a060",
    "gray": "#888888",
}

BORDER = "#1b1a17"   # bordure sombre, identique au favicon
LETTER = "#ffffff"   # "U" blanche


def load_font(px):
    """Police bold système, avec fallback sur la police par défaut Pillow."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()


def make_icon(color_hex, size):
    # Supersampling x4 pour des bords nets
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.16)          # rx ≈ 10/64 du favicon
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=color_hex)

    # Bordure interne sombre (rect x6 y6 w52 stroke4 dans le favicon)
    inset = int(s * 0.094)
    bw = max(1, int(s * 0.0625))
    d.rounded_rectangle(
        [inset, inset, s - 1 - inset, s - 1 - inset],
        radius=int(s * 0.11),
        outline=BORDER,
        width=bw,
    )

    # Lettre "U" centrée
    font = load_font(int(s * 0.55))
    bbox = d.textbbox((0, 0), "U", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (s - tw) / 2 - bbox[0]
    ty = (s - th) / 2 - bbox[1]
    d.text((tx, ty), "U", font=font, fill=LETTER)

    return img.resize((size, size), Image.LANCZOS)


def make_brand_icons():
    """Décline l'icône de marque officielle (orange) à partir du master fourni
    `../utiq-icon-512.png` -> icon-brand-{16,32,48,128}.png.

    Ces icônes servent d'icône de PAQUET (store, chrome://extensions). L'icône de
    la barre d'outils, elle, change de couleur selon l'état (red/green/gray)."""
    master = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "utiq-icon-512.png")
    if not os.path.exists(master):
        print("  (master utiq-icon-512.png absent — icônes de marque non générées)")
        return
    src = Image.open(master).convert("RGBA")
    for size in SIZES:
        src.resize((size, size), Image.LANCZOS).save(f"icon-brand-{size}.png")
        print(f"  écrit icon-brand-{size}.png")


def main():
    for name, hex_color in COLORS.items():
        for size in SIZES:
            icon = make_icon(hex_color, size)
            out = f"icon-{name}-{size}.png"
            icon.save(out)
            print(f"  écrit {out}")
    make_brand_icons()
    print("Icônes générées.")


if __name__ == "__main__":
    main()
