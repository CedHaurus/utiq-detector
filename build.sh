#!/usr/bin/env bash
# Build the Utiq Detector extension packages.
#   dist/utiq-detector/                 -> "unpacked" folder (Brave/Chrome: Load unpacked)
#   dist/utiq-detector-chrome.zip       -> unzip for Brave/Chrome
#   dist/utiq-detector-firefox.zip      -> loadable as-is in Firefox (temporary add-on)
#
# Includes ONLY the runtime files (no .py scripts, no .md, no 512 master, etc.).

set -euo pipefail
cd "$(dirname "$0")"

OUT="dist/utiq-detector"
rm -rf dist
mkdir -p "$OUT/icons"

# Runtime files
cp manifest.json background.js content.js "$OUT/"
cp -R popup "$OUT/"
cp -R _locales "$OUT/"
# PNG only (no favicon.svg, no generate_icons.py)
cp icons/*.png "$OUT/icons/"

# Zips (from inside the folder so manifest.json sits at the zip root)
( cd "$OUT" && zip -qr -X "../utiq-detector-chrome.zip"  . )
( cd "$OUT" && zip -qr -X "../utiq-detector-firefox.zip" . )

echo "Packages built:"
ls -1 dist/*.zip
echo "Unpacked folder: $OUT/"
