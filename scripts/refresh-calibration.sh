#!/usr/bin/env bash
# Resolve any newly-settled markets and re-score the calibration report.
# Safe to run unattended on a schedule: `arena calibrate` looks up each pending
# prediction, caches settled outcomes durably in results/resolutions.json, and
# reports resolved / pending / failed honestly. See the README "Closing the
# loop" note under the Calibration section.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[calibrate] $(date -u +%Y-%m-%dT%H:%M:%SZ) refreshing calibration..."
npx tsx src/index.ts calibrate "$@"
