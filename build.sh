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
cp -R blocked "$OUT/"
cp -R _locales "$OUT/"
# PNG only (no favicon.svg, no generate_icons.py)
cp icons/*.png "$OUT/icons/"

# Chrome/Brave zip: base manifest (no webRequestBlocking — disallowed in MV3).
( cd "$OUT" && zip -qr -X "../utiq-detector-chrome.zip" . )

# Firefox zip: same files, plus the "webRequestBlocking" permission needed by
# the Firefox Android navigation-blocking feature (ignored on desktop).
FX="dist/utiq-detector-firefox"
cp -R "$OUT" "$FX"
python3 - "$FX/manifest.json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    m = json.load(f)
perms = m.setdefault("permissions", [])
if "webRequestBlocking" not in perms:
    perms.append("webRequestBlocking")
with open(path, "w") as f:
    json.dump(m, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
( cd "$FX" && zip -qr -X "../utiq-detector-firefox.zip" . )

echo "Packages built:"
ls -1 dist/*.zip
echo "Unpacked folder: $OUT/  (Chrome)   |   $FX/  (Firefox)"
