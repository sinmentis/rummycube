#!/usr/bin/env bash
# Build the production bundle and fail if any console.log or debug render
# markers survived esbuild's drop. Build output dir is build/ (not dist/).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building production bundle..."
npm run build

echo "==> Scanning build/ for forbidden tokens..."
# -F fixed strings, -r recursive, -l list matching files only.
if matches=$(grep -Frl -e "console.log" -e "RENDER BOARD" build/ 2>/dev/null); then
    echo "FAIL: forbidden token(s) found in production bundle:"
    echo "$matches"
    exit 1
fi

echo "PASS: no console.log / RENDER BOARD in build/"
