#!/usr/bin/env bash
set -euo pipefail
case "$#:${1-}" in
  0:|1:--fixture) ;;
  *) echo 'Usage: bash rebuild/ads/run_dry_run.sh [--fixture]' >&2; exit 2 ;;
esac
ads_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ads_repo"
node rebuild/ads/prepare_handoff.cjs "$@"
node rebuild/ads/build_preview.cjs
node --check rebuild/test-artifacts/ad-grants/google-ads-audit.js
python .github/scripts/ad_grants_issue_plan.py --prepared "$@" > rebuild/test-artifacts/ad-grants/handoff/issue-plan.json
node rebuild/ads/prepare_handoff.cjs --finalize "$@"
