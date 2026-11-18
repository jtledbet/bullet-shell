#!/usr/bin/env bash
# Runs the headless-browser checks against a dev server already running on 127.0.0.1:5173.
#
#   bash tests/run.sh              every check
#   bash tests/run.sh coretest     just the ones named
#
# Prints each check's failures (or "ALL PASS"), then a summary. See tests/README.md.
cd "$(dirname "$0")"

if ! curl -s -o /dev/null http://127.0.0.1:5173/; then
  echo "No dev server on 127.0.0.1:5173. Start one first:" >&2
  echo "  npx vite --host 127.0.0.1 --port 5173 --strictPort" >&2
  exit 1
fi

all="basicstest coretest energytest charmtest weapontest rescuetest desktoptest startest cornertest orbtest rotatetest devtest abilitytest tutfixtest traitstest broodtest"
failed=""
for name in ${@:-$all}; do
  echo "== $name"
  rm -rf ".out/$name"
  out=$(node "$name.mjs" "$(pwd -W 2>/dev/null || pwd)/.out/$name" 2>&1)
  echo "$out" | grep -v "^PASS"
  echo "$out" | grep -q "^ALL PASS" || failed="$failed $name"
done

if [ -n "$failed" ]; then
  echo "FAILED:$failed"
  exit 1
fi
echo "Everything passed."
