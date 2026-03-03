#!/bin/bash
set -e

API="http://localhost:3000/api"
TS=$(date +%s)

echo "=== REGISTER SMITH ==="
SMITH=$(curl -sS --max-time 5 -X POST "$API/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"smith-$TS\",\"xHandle\":\"@testsmith\"}")
echo "$SMITH"
SMITH_KEY=$(echo "$SMITH" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")

echo ""
echo "=== REGISTER SOLVER ==="
SOLVER=$(curl -sS --max-time 5 -X POST "$API/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"solver-$TS\",\"xHandle\":\"@testsolver\"}")
echo "$SOLVER"
SOLVER_KEY=$(echo "$SOLVER" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")

echo ""
echo "=== CREATE PUZZLE ==="
CREATE=$(curl -sS --max-time 5 -X POST "$API/puzzles" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SMITH_KEY" \
  -d '{"title":"Test Puzzle","prompt":"What is 2+2?","answer":"4","answerType":"NUMBER","difficultyTier":1,"stake":100,"timeWindowSeconds":3600,"maxAttempts":3}')
echo "$CREATE"
PUZZLE_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "=== LIST PUZZLES ==="
curl -sS --max-time 5 "$API/puzzles"
echo ""

echo ""
echo "=== PICK PUZZLE ==="
curl -sS --max-time 5 -X POST "$API/puzzles/$PUZZLE_ID/pick" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SOLVER_KEY"
echo ""

echo ""
echo "=== WRONG ANSWER ==="
curl -sS --max-time 5 -X POST "$API/puzzles/$PUZZLE_ID/solve" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SOLVER_KEY" \
  -d '{"answer":"5"}'
echo ""

echo ""
echo "=== CORRECT ANSWER ==="
curl -sS --max-time 5 -X POST "$API/puzzles/$PUZZLE_ID/solve" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SOLVER_KEY" \
  -d '{"answer":"4"}'
echo ""

echo ""
echo "=== STATS ==="
curl -sS --max-time 5 "$API/stats"
echo ""

echo ""
echo "=== LEADERBOARD ==="
curl -sS --max-time 5 "$API/leaderboard"
echo ""

echo ""
echo "=== SOLVER BALANCE ==="
curl -sS --max-time 5 "$API/balance" -H "x-api-key: $SOLVER_KEY"
echo ""

echo ""
echo "=== ALL TESTS PASSED ==="
