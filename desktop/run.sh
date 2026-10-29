#!/usr/bin/env bash
# Run Jace Store from source:  ./run.sh   (creates .venv the first time)
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
exec .venv/bin/python -m jacestore "$@"
