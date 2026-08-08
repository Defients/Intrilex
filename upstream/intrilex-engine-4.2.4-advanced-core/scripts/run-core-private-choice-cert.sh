#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -f reports/core-private-choice-segment-*.json
for start in 0 100 200 300 400; do INTRILEX_SKIP_BUILD=1 INTRILEX_SEGMENT=1 node scripts/core-private-choice-campaign.mjs 100 "$start"; done
node scripts/merge-core-private-choice-campaign.mjs
