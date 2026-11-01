#!/usr/bin/env bash
# goal-usage — guard the argument-less `cnc goal` contract.
#
# Contract under test: `bin/cnc goal` with NO arguments must REFUSE to dispatch.
# It prints a usage line mentioning `cnc goal` and exits 1 (scripts/goal/dispatch.ts
# calls fail() -> scripts/lib/cli.ts -> process.exit(1)). No team is contacted, no
# flight-log file is written.
#
# This guard PROVES that contract for a command under test:
#   PASS (exit 0) only when the command exits 1 AND its combined stdout+stderr
#                  contains a usage line mentioning `cnc goal`.
#   FAIL (exit 1) on every other outcome: exit 0, any other status (a signal death
#                  is reported by bash as 128+N), or missing usage text.
#
# Usage:
#   bash .github/scripts/goal-usage.sh                  # tests `bin/cnc goal`
#   bash .github/scripts/goal-usage.sh <cmd> [args...]   # tests another command
#
# The argv override replaces the command under test; the command is then run with
# NO arguments of its own. That is how the same guard is pointed at a broken stub
# to prove it is not vacuous.
#
# Bash, zero dependencies, no `|| true` anywhere: every failure must be visible.
set -uo pipefail

# Repo root from this script's own location (.github/scripts -> repo root), the
# same way bin/cnc:4 resolves it.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ "$#" -eq 0 ]; then
  set -- "$ROOT/bin/cnc" goal
fi

label="$*"

out="$( { "$@"; } 2>&1 )"
status=$?

# A usage line = a line that mentions "usage" AND "cnc goal".
usage_line=""
while IFS= read -r line; do
  lower="$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *usage*) ;;
    *) continue ;;
  esac
  case "$lower" in
    *"cnc goal"*) usage_line="$line"; break ;;
  esac
done <<< "$out"

if [ "$status" -ne 1 ]; then
  if [ "$status" -gt 128 ]; then
    printf 'FAIL: goal-usage: %s died from signal %s (status %s), expected exit 1\n' \
      "$label" "$((status - 128))" "$status" >&2
  else
    printf 'FAIL: goal-usage: %s exited %s, expected exit 1\n' "$label" "$status" >&2
  fi
  printf '%s\n' "$out" >&2
  exit 1
fi

if [ -z "$usage_line" ]; then
  printf 'FAIL: goal-usage: %s exited 1 but printed no usage line mentioning "cnc goal"\n' \
    "$label" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi

printf 'ok: goal-usage: %s exited 1 and printed a usage line: %s\n' "$label" "$usage_line"
exit 0
