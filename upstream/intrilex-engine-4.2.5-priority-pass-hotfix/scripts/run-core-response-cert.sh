#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
rm -f reports/core-response-segment-*.json
for start in $(seq 0 5 495); do
  INTRILEX_SKIP_BUILD=1 INTRILEX_SEGMENT=1 node scripts/core-response-campaign.mjs 5 "$start"
done
node scripts/merge-core-response-campaign.mjs
rm -f reports/core-response-segment-*.json
