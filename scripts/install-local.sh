#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${HOME}/Development/dev-archive"

mkdir -p "$(dirname "$DEST")"
mkdir -p "$DEST"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude vault/Repos \
    --exclude vault/.index-state.json \
    --exclude .git \
    "$ROOT/" "$DEST/"
else
  tar -C "$ROOT" \
    --exclude node_modules \
    --exclude vault/Repos \
    --exclude vault/.index-state.json \
    --exclude .git \
    -cf - . | tar -C "$DEST" -xf -
fi

cd "$DEST"
npm install

cat <<EOF

Installed to: $DEST

cd $DEST
npm start

Obsidian → Open folder as vault → ${HOME}/Documents/Development Archive
EOF
