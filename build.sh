#!/usr/bin/env bash
# Construit les paquets de test de l'extension Utiq Detector.
#   dist/utiq-detector/                 -> dossier "non empaqueté" (Brave/Chrome : Load unpacked)
#   dist/utiq-detector-chrome.zip       -> à dézipper pour Brave/Chrome
#   dist/utiq-detector-firefox.zip      -> chargeable tel quel dans Firefox (temporary add-on)
#
# N'inclut QUE les fichiers d'exécution (pas les scripts .py, .md, le master 512, etc.).

set -euo pipefail
cd "$(dirname "$0")"

OUT="dist/utiq-detector"
rm -rf dist
mkdir -p "$OUT/icons"

# Fichiers d'exécution
cp manifest.json background.js content.js "$OUT/"
cp -R popup "$OUT/"
cp -R _locales "$OUT/"
# Uniquement les PNG (pas favicon.svg ni generate_icons.py)
cp icons/*.png "$OUT/icons/"

# Zips (depuis l'intérieur du dossier pour que manifest.json soit à la racine du zip)
( cd "$OUT" && zip -qr -X "../utiq-detector-chrome.zip"  . )
( cd "$OUT" && zip -qr -X "../utiq-detector-firefox.zip" . )

echo "Paquets générés :"
ls -1 dist/*.zip
echo "Dossier non empaqueté : $OUT/"
