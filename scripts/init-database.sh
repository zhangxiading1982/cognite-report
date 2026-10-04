#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

npm run db:setup

if [[ "${1:-}" == "--with-test" ]]; then
  npm run db:test:setup
fi
