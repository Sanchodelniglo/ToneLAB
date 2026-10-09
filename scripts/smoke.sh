#!/bin/bash
# Browser smoke test: node scripts/check-precache.mjs, then headless Chrome runs scripts/smoke.html.
# Needs Google Chrome (set CHROME to override) and python3. Exits 1 on any FAIL.
cd "$(dirname "$0")/.." || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
node scripts/check-precache.mjs || exit 1
LOG=$(mktemp); PROFILE=$(mktemp -d)
python3 -m http.server 8765 >"$LOG" 2>&1 & SERVER=$!
"$CHROME" --headless=new --autoplay-policy=no-user-gesture-required --user-data-dir="$PROFILE" \
  --virtual-time-budget=20000 --dump-dom http://localhost:8765/scripts/smoke.html >/dev/null 2>&1 & BROWSER=$!
for _ in $(seq 1 40); do sleep 1; grep -q "__result" "$LOG" && break; done
kill $BROWSER $SERVER 2>/dev/null
RESULT=$(grep -o "GET /__result[^ ]*" "$LOG" | python3 -c "import sys,urllib.parse;[print(urllib.parse.unquote(l.split('?',1)[1])) for l in sys.stdin]")
rm -rf "$LOG" "$PROFILE"
echo "$RESULT"
[ -n "$RESULT" ] && ! echo "$RESULT" | grep -q FAIL
