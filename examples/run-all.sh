#!/usr/bin/env bash
# Build every numbered example. Does NOT start apps (each needs its own nats-server).
# Exits non-zero on first build failure.
set -euo pipefail

cd "$(dirname "$0")"

shopt -s nullglob
examples=([0-9]*/)
shopt -u nullglob

if [[ ${#examples[@]} -eq 0 ]]; then
  echo "no examples yet — nothing to build"
  exit 0
fi

failed=0
for ex in "${examples[@]}"; do
  echo "=== ${ex%/} ==="
  pushd "$ex" >/dev/null

  if [[ -f package.json ]]; then
    npm install --silent --no-audit --no-fund
    npm run build --silent
    echo "OK: $ex"
  else
    echo "SKIP: $ex (no package.json)"
  fi

  popd >/dev/null
done

exit "$failed"
