#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
DZ_NODE="$(command -v node || true)"
if [ -z "$DZ_NODE" ]; then
  DZ_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x .voice-test.local/venv/bin/python ] || [ ! -x "$DZ_NODE" ]; then
  echo 'Сначала установи Python-окружение и Node, как описано в README.md.'
  exit 1
fi
.voice-test.local/venv/bin/python -u scripts/voice-local/server.py &
DZ_AGENT_PID=$!
trap 'kill "$DZ_AGENT_PID" 2>/dev/null || true' EXIT
"$DZ_NODE" node_modules/vite/bin/vite.js --config vite.design.config.ts
