#!/usr/bin/env bash
# Release gate: validates the mod, runs its tests, and runs the scan. Needs Claude Code on the PATH.
set -u
cd "$(dirname "$0")/.." || exit 2
failed=0

printf '\n== validate\n'
claude plugin validate . || failed=1

printf '\n== test\n'
claude plugin test . || failed=1

printf '\n== scan\n'
bash scripts/scan.sh || failed=1

echo
if [ "$failed" -eq 0 ]; then echo "RELEASE CHECK PASSED"; else echo "RELEASE CHECK FAILED"; fi
exit "$failed"
