#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/showcase-2min.sh [--fast|--live] [--runtime <cursor|claude>] [--verbose]

Modes:
  --fast     Run the guaranteed 2-minute stage flow (default, simulated data, fully offline).
  --live     Run stronger live evidence (markets=3, generations=4), then optimization report.

Options:
  --runtime  Agent runtime to use (default: claude; live mode only).
             claude runs with bash allowlisted to surf; cursor grants
             unrestricted shell (--force) — use only with trusted inputs.
  --verbose  Pass -v to the arena run for more details
  --help     Show this help message

Examples:
  bash scripts/showcase-2min.sh
  bash scripts/showcase-2min.sh --live
  bash scripts/showcase-2min.sh --live --runtime cursor --verbose
EOF
}

MODE="fast"
RUNTIME="claude"
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast)
      MODE="fast"
      shift
      ;;
    --live)
      MODE="live"
      shift
      ;;
    --runtime)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --runtime" >&2
        usage
        exit 1
      fi
      RUNTIME="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=1
      shift
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
done

if [[ "$RUNTIME" != "cursor" && "$RUNTIME" != "claude" ]]; then
  echo "Unsupported runtime: $RUNTIME (expected: cursor or claude)" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[preflight] Missing required command: $1" >&2
    exit 1
  fi
}

echo "[preflight] Verifying required CLIs..."
require_cmd npx
# Fast mode is fully offline (mock data, no agents) — only live mode needs
# surf and an agent runtime.
if [[ "$MODE" == "live" ]]; then
  npx tsx src/index.ts doctor --agent-runtime "$RUNTIME"
fi

ARENA_ARGS=(--showcase --agent-runtime "$RUNTIME")
if [[ "$VERBOSE" -eq 1 ]]; then
  ARENA_ARGS+=(-v)
fi

ARENA_OK=1
if [[ "$MODE" == "live" ]]; then
  echo "[demo] Running live showcase evidence (markets=3, generations=4)..."
  npx tsx src/index.ts run "${ARENA_ARGS[@]}" --markets 3 --generations 4 || ARENA_OK=0
else
  echo "[demo] Running fast 2-minute stage flow (mock, markets=2, generations=3)..."
  npx tsx src/index.ts run "${ARENA_ARGS[@]}" --mock --markets 2 --generations 3 || ARENA_OK=0
fi

if [[ "$ARENA_OK" -eq 0 ]]; then
  echo "[demo] Arena run failed — showing the latest saved report instead." >&2
fi

echo "[demo] Showing optimization report..."
npx tsx src/index.ts report

if [[ "$ARENA_OK" -eq 0 ]]; then
  exit 1
fi
