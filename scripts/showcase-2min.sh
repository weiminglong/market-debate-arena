#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/showcase-2min.sh [--fast|--live]

Modes:
  --fast  Run the guaranteed 2-minute stage flow (default).
  --live  Run one real live showcase debate, then history.

Examples:
  bash scripts/showcase-2min.sh
  bash scripts/showcase-2min.sh --live
EOF
}

MODE="fast"
if [[ $# -gt 0 ]]; then
  case "$1" in
    --fast)
      MODE="fast"
      ;;
    --live)
      MODE="live"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[preflight] Checking Surf auth..."
surf auth >/dev/null

if [[ "$MODE" == "live" ]]; then
  echo "[demo] Running live showcase debate (this can take a few minutes)..."
  npx tsx src/index.ts --showcase --agent-runtime cursor --markets 1
else
  echo "[demo] Running fast 2-minute showcase flow..."
  npx tsx src/index.ts --showcase --agent-runtime cursor --mock --markets 1
fi

echo "[demo] Showing strategy/history snapshot..."
npx tsx src/index.ts --history

if [[ "$MODE" == "fast" ]]; then
  cat <<'EOF'

Tip: Pre-run live evidence before going on stage:
  bash scripts/showcase-2min.sh --live
EOF
fi
