#!/usr/bin/env bash
set -euo pipefail

echo "Running local CI checks: forge test + slither (docker)"

forge test -vv

if command -v docker >/dev/null 2>&1; then
  echo "Running slither in docker (may require docker installed)"
  docker run --rm -v "$(pwd):/src" trailofbits/slither:latest /bin/sh -c "slither /src || true"
else
  echo "Docker not installed — skipping slither. Install docker for static analysis."
fi

echo "CI checks complete"
