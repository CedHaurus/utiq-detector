#!/usr/bin/env python3
"""
Generate the Utiq Detector extension icons.

The design is derived from the official utiq-tracker.online favicon
(`icons/favicon.svg`): rounded square + dark border + white "U" letter.
Only the background color changes depending on the detected state.

  red   #e03030  -> Utiq detected
  green #22a060  -> clean site
  gray  #888888  -> unknown / analysis in progress

Usage: pip install Pillow && python3 generate_icons.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 32, 48, 128]

# Background colors per state (the rest of the design comes from the site favicon)
COLORS = {
    "red": "#e03030",
    "green": "#22a060",
    "gray": "#888888",
}

BORDER = "#1b1a17"   # dark border, identical to the favicon
LETTER = "#ffffff"   # white "U"


def load_font(px):
    """Bold system font, falling back to Pillow's default font."""
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
    # 4x supersampling for crisp edges
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.16)          # rx ≈ 10/64 of the favicon
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=color_hex)

    # Inner dark border (rect x6 y6 w52 stroke4 in the favicon)
    inset = int(s * 0.094)
    bw = max(1, int(s * 0.0625))
    d.rounded_rectangle(
        [inset, inset, s - 1 - inset, s - 1 - inset],
        radius=int(s * 0.11),
        outline=BORDER,
        width=bw,
    )

    # Centered "U" letter
    font = load_font(int(s * 0.55))
    bbox = d.textbbox((0, 0), "U", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (s - tw) / 2 - bbox[0]
    ty = (s - th) / 2 - bbox[1]
    d.text((tx, ty), "U", font=font, fill=LETTER)

    return img.resize((size, size), Image.LANCZOS)


def make_brand_icons():
    """Derive the official brand icon (orange) from the provided master
    `../utiq-icon-512.png` -> icon-brand-{16,32,48,128}.png.

    These are the PACKAGE icons (store, chrome://extensions). The toolbar icon,
    on the other hand, changes color depending on the state (red/green/gray)."""
    master = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "utiq-icon-512.png")
    if not os.path.exists(master):
        print("  (master utiq-icon-512.png missing — brand icons not generated)")
        return
    src = Image.open(master).convert("RGBA")
    for size in SIZES:
        src.resize((size, size), Image.LANCZOS).save(f"icon-brand-{size}.png")
        print(f"  wrote icon-brand-{size}.png")


def main():
    for name, hex_color in COLORS.items():
        for size in SIZES:
            icon = make_icon(hex_color, size)
            out = f"icon-{name}-{size}.png"
            icon.save(out)
            print(f"  wrote {out}")
    make_brand_icons()
    print("Icons generated.")


if __name__ == "__main__":
    main()
