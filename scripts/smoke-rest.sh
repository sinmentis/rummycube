#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://game.shunlyu.com}"
echo "1) games list:"; curl -sS "$BASE/games"; echo
MID=$(curl -sS -X POST "$BASE/games/RummyCube/create" \
  -H 'content-type: application/json' \
  -d '{"numPlayers":2,"setupData":{"timePerTurn":60}}' | sed -E 's/.*"matchID":"([^"]+)".*/\1/')
echo "2) created match: $MID"
echo "3) join seat 0:"; curl -sS -X POST "$BASE/games/RummyCube/$MID/join" \
  -H 'content-type: application/json' \
  -d '{"playerID":"0","playerName":"alice"}'; echo
echo "4) match seats:"; curl -sS "$BASE/games/RummyCube/$MID"; echo
echo "SMOKE OK"
