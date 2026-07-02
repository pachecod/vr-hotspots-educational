#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node sync-flat-pages-into-config.js
node validate-playground-bundle.js
OUT="../newhouse60th-playground-bundle.zip"
rm -f "$OUT"
zip -r "$OUT" . \
  -x "*.DS_Store" \
  -x "README.md" \
  -x "sync-*" \
  -x "package-*" \
  -x "validate-*"
echo "Created $OUT ($(du -h "$OUT" | awk '{print $1}'))"
