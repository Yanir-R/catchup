#!/usr/bin/env bash
# Release gate: validates the mod, runs its tests, and runs the scan. Needs Claude Code on the PATH.
set -u
cd "$(dirname "$0")/.." || exit 2
failed=0

printf '\n== validate\n'
report=$(claude plugin validate . 2>&1) || failed=1
printf '%s\n' "$report"

# The README says the mod keeps the summary in memory only. The validator lists every capability the code
# calls, so this ties that claim to a check: no state, no store, no file, no network, no process.
printf '\n== memory only\n'
if ! printf '%s\n' "$report" | grep -q 'calls:'; then
  echo "FAIL: the validate report has no 'calls:' line, so the check cannot run"
  failed=1
elif printf '%s\n' "$report" | grep -E 'state (reads|writes)|declares state|calls:.*\$\.(state|store|fs|http|process|env)\.' >/dev/null; then
  echo "FAIL: the mod uses state, the store, files, the network or a process. Update the README privacy text or remove it."
  printf '%s\n' "$report" | grep -E 'state (reads|writes)|declares state|calls:' 
  failed=1
else
  echo "ok: no state, store, file, network or process calls"
fi

printf '\n== test\n'
claude plugin test . || failed=1

printf '\n== scan\n'
bash scripts/scan.sh || failed=1

echo
if [ "$failed" -eq 0 ]; then echo "RELEASE CHECK PASSED"; else echo "RELEASE CHECK FAILED"; fi
exit "$failed"
