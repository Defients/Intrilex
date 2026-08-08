#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
for start in 0 100 200 300 400; do
  INTRILEX_SKIP_BUILD=1 node scripts/private-choice-authority-campaign.mjs 100 "$start"
done
node scripts/merge-private-choice-campaign.mjs 500 100
