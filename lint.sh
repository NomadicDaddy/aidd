#!/usr/bin/env bash

# Lint script for AIDD shell scripts
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking aidd.sh..."
bash -n "$SCRIPT_DIR/aidd.sh"

echo "Checking lib/*.sh..."
for f in "$SCRIPT_DIR"/lib/*.sh; do
    if [[ -f "$f" ]]; then
        echo "  Checking $(basename "$f")..."
        bash -n "$f"
    fi
done

echo "All shell scripts passed syntax check!"
