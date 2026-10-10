#!/usr/bin/env bash
# Scans the folder for things that must not ship: home directory paths, email addresses, secret-shaped
# strings, stray files, and (optionally) your own list of private words.
# Prints file and line only, never the matched text, so a real secret is not echoed into a log.
# Needs only bash, grep, find and sed. CI runs it on every push and pull request.
#
# Optional: keep a list of private words (names, project names, ticket prefixes) OUTSIDE this repository,
# one regular expression per line, in ~/.config/catchup/private-terms.txt (or the file named by
# CATCHUP_PRIVATE_TERMS). It is scanned too. It is never part of the project, and .gitignore keeps it out.
set -u
cd "$(dirname "$0")/.." || exit 2
failed=0

# scan LABEL REGEX [ALLOWED_REGEX]: lines matching REGEX, minus lines matching ALLOWED_REGEX, minus generated files.
scan() {
  local label="$1" regex="$2" allowed="${3:-}" hits
  hits=$(grep -rIn -E "$regex" . 2>/dev/null | grep -v -e '^\./\.claude-plugin/types/' -e '^\./scripts/scan\.sh:' -e '^\./scripts/release-check\.sh:' -e '^\./\.git/' || true)

  if [ -n "$allowed" ]; then
    hits=$(printf '%s\n' "$hits" | grep -v -E "$allowed" || true)
  fi

  hits=$(printf '%s\n' "$hits" | cut -d: -f1,2 | sed '/^$/d')

  if [ -n "$hits" ]; then
    printf 'FOUND %s:\n%s\n' "$label" "$hits"
    failed=1
  else
    printf 'none: %s\n' "$label"
  fi
}

scan "home directory paths" '(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\)'
scan "email addresses (example.com, example.org, example.net and GitHub noreply are allowed)" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' '@example\.(com|org|net)|@users\.noreply\.github\.com'
scan "secret-shaped strings" 'AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._~+/=-]{16,}'

stray=$(find . \( -name '.DS_Store' -o -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name '*.log' -o -name '*private-terms*' \) -not -path './.git/*' -not -path './.claude-plugin/types/*' | head)
if [ -n "$stray" ]; then printf 'FOUND stray files:\n%s\n' "$stray"; failed=1; else echo "none: stray files"; fi

terms="${CATCHUP_PRIVATE_TERMS:-$HOME/.config/catchup/private-terms.txt}"
if [ -f "$terms" ]; then
  hits=$(grep -rIn -i -E -f "$terms" . 2>/dev/null | grep -v -e '^\./\.claude-plugin/types/' -e '^\./\.git/' | cut -d: -f1,2 || true)
  if [ -n "$hits" ]; then printf 'FOUND private terms from your list:\n%s\n' "$hits"; failed=1; else echo "none: private terms from your list"; fi
else
  echo "skipped: no private-terms list at $terms"
fi

echo
if [ "$failed" -eq 0 ]; then echo "SCAN PASSED"; else echo "SCAN FAILED"; fi
exit "$failed"
