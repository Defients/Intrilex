#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
npm run build
rm -f reports/core-advanced-segment-*.json reports/core-advanced-authority-stress-500.json
for start in 0 100 200 300 400; do INTRILEX_SKIP_BUILD=1 INTRILEX_SEGMENT=1 node scripts/core-advanced-campaign.mjs 100 "$start"; done
node scripts/merge-core-advanced-campaign.mjs
