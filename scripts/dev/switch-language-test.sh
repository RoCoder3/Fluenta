#!/usr/bin/env bash
#
# End-to-end language switching over HTTP, against a production build.
#
# The app server and any script that writes to the database cannot both hold a
# connection to the local pglite-socket stand-in, so this alternates: stop the
# server, mutate, start the server, assert. Slow, but it exercises the real
# routing and the real rendered HTML rather than mocking either.
#
#   ./scripts/dev/switch-language-test.sh
#
set -uo pipefail

PORT=${PORT:-3100}
PG_PORT=${PG_PORT:-5433}
DATA_DIR=${DATA_DIR:-./.data/pg-tcp}
export DATABASE_URL="postgres://postgres@127.0.0.1:${PG_PORT}/postgres"
export DATABASE_POOL_MAX=1
export AUTH_SECRET="${AUTH_SECRET:-local-switch-test-secret-long-enough-1234567890}"
export SWITCH_TEST_BASE="http://127.0.0.1:${PORT}"

TSX="npx tsx --conditions=react-server"
FAILURES=0

cleanup() {
  stop_app
  [ -n "${PG_PID:-}" ] && kill "$PG_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

start_app() {
  npx next start -p "$PORT" > /tmp/fluenta-switch-next.log 2>&1 &
  APP_PID=$!
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${PORT}/api/health" > /dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "app server did not become healthy; see /tmp/fluenta-switch-next.log" >&2
  tail -20 /tmp/fluenta-switch-next.log >&2
  return 1
}

stop_app() {
  if [ -n "${APP_PID:-}" ]; then
    kill "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
    APP_PID=""
    # Give the OS a moment to release the database connection.
    sleep 1
  fi
}

run_step() {
  $TSX scripts/dev/switch-language-http-test.ts "$1" || FAILURES=$((FAILURES + 1))
}

# Anything already listening would serve a stale build and produce confusing
# results, so clear both ports before starting.
lsof -ti:"$PORT"    | xargs kill -9 2>/dev/null
lsof -ti:"$PG_PORT" | xargs kill -9 2>/dev/null
sleep 1

echo "Language switching end-to-end"
echo "============================================================"

npx tsx scripts/dev/pg-server.ts "$PG_PORT" "$DATA_DIR" > /tmp/fluenta-switch-pg.log 2>&1 &
PG_PID=$!
sleep 5

npm run db:migrate > /dev/null 2>&1 || { echo "migrate failed" >&2; exit 1; }
npm run db:seed    > /dev/null 2>&1 || { echo "seed failed" >&2; exit 1; }

run_step setup
start_app || exit 1
run_step assert-german

stop_app
run_step switch-ca
start_app || exit 1
run_step assert-needs-onboarding

stop_app
run_step finish-ca
start_app || exit 1
run_step assert-catalan

stop_app
run_step switch-de
start_app || exit 1
run_step assert-german-restored

echo ""
echo "============================================================"
if [ "$FAILURES" -eq 0 ]; then
  echo "all steps passed"
  exit 0
fi
echo "$FAILURES step(s) failed"
exit 1
