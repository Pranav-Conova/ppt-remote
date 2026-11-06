#!/usr/bin/env bash
# Renders the favicon PNGs and the link-preview image into frontend/public
# with headless Chrome (or Edge). Run from anywhere:  bash tools/brand/render.sh
# Set CHROME=/path/to/chrome if it is not found automatically.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
public="$here/../../frontend/public"

chrome="${CHROME:-}"
for c in google-chrome chromium chrome msedge \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -n "$chrome" ] && break
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then chrome="$c"; fi
done
[ -n "$chrome" ] || { echo "Chrome not found; set CHROME=" >&2; exit 1; }

# Chrome on Windows wants native paths for file:// URLs.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

shot() { # shot <html> <out.png> <width> <height> [transparent]
  local bg=()
  [ "${5:-}" = transparent ] && bg=(--default-background-color=00000000)
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    "${bg[@]}" --virtual-time-budget=5000 --window-size="$3,$4" \
    --screenshot="$(native "$2")" "file:///$(native "$1")" >/dev/null 2>&1
  echo "wrote $2"
}

# Icons: the SVG drawn at an exact pixel size. Browser tabs use favicon.svg
# directly; these PNGs are for older browsers and home-screen shortcuts.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
icon() { # icon <size> <out> <square|rounded>
  # square = full-bleed ink behind the rounded tile: iOS and Android apply
  # their own corner mask to home-screen icons.
  local bg=transparent
  [ "$3" = square ] && bg="#0e100f"
  cat >"$tmp/icon.html" <<EOF
<!doctype html><style>html,body{margin:0;background:transparent}
div{width:$1px;height:$1px;background:$bg}
img{display:block;width:100%;height:100%}</style>
<div><img src="file:///$(native "$public/favicon.svg")"></div>
EOF
  shot "$tmp/icon.html" "$2" "$1" "$1" transparent
}

icon 32 "$public/favicon-32.png" rounded
icon 180 "$public/apple-touch-icon.png" square
icon 512 "$public/icon-512.png" square
shot "$here/og-card.html" "$public/og-image.png" 1200 630
