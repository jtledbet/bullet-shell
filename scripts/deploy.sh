#!/usr/bin/env bash
# Builds the game and force-pushes dist/ to the gh-pages branch,
# which GitHub Pages serves at https://ledsec.dev/bullet-shell/.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

remote=$(git remote get-url origin)
rev=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cp -r dist/. "$tmp"
touch "$tmp/.nojekyll"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "Deploy $rev"
git -C "$tmp" push -q -f "$remote" gh-pages
echo "Deployed $rev to gh-pages"
