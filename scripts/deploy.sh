#!/usr/bin/env bash
# Builds the game and publishes it to the gh-pages branch, which GitHub Pages serves.
#
#   npm run deploy        -> https://ledsec.dev/bullet-shell/        (live)
#   npm run deploy:next   -> https://ledsec.dev/bullet-shell/next/   (preview, to try before going live)
#
# Each deploy is a normal (not forced) commit on gh-pages, so every earlier deploy can be put
# back. Other folders there are left alone: a live deploy keeps /proto/ and /next/.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-live}"
case "$target" in
  live | next) ;;
  *) echo "usage: scripts/deploy.sh [live|next]" >&2; exit 1 ;;
esac

npm run build
rev=$(git rev-parse --short HEAD)
version=$(node -p "require('./package.json').version")

# A temporary checkout of gh-pages. Commits there use this repo's own git identity.
tmp=$(mktemp -d)
cleanup() { git worktree remove --force "$tmp" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
git fetch -q origin gh-pages
git worktree add -q -B gh-pages "$tmp" origin/gh-pages

if [ "$target" = live ]; then
  find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git ! -name proto ! -name next -exec rm -rf {} +
  cp -r dist/. "$tmp"
  touch "$tmp/.nojekyll"
else
  rm -rf "$tmp/next"
  mkdir "$tmp/next"
  cp -r dist/. "$tmp/next"
fi

git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
  echo "Nothing changed on $target (v$version, $rev)"
  exit 0
fi
git -C "$tmp" commit -q -m "Deploy v$version $rev to $target"
git -C "$tmp" push -q origin gh-pages
echo "Deployed v$version ($rev) to $target"
