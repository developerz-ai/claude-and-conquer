#!/usr/bin/env bash
# changelog-notes — print the CHANGELOG.md section for a release tag.
#
# Usage:
#   bash .github/scripts/changelog-notes.sh <tag> [changelog]
#
#   <tag>        a v-prefixed semver tag, e.g. v0.1.0 or v0.2.0-rc.1
#   [changelog]  path to the changelog (default: CHANGELOG.md)
#
# The changelog follows Keep a Changelog, so the section for tag v0.1.0 is the
# heading "## [0.1.0]" (optionally followed by " - <date>"). The section body is
# everything after that heading up to the next "## " heading or the first
# link-reference definition ("[0.1.0]: https://..."), with leading and trailing
# blank lines trimmed.
#
# Exit status:
#   0  the section exists and has content; it is printed on stdout
#   1  the section is missing, or is empty / whitespace-only
#   2  bad usage: wrong argument count, a tag that is not v<semver>, or an
#      unreadable changelog
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: changelog-notes.sh <tag> [changelog]" >&2
  exit 2
fi

tag="$1"
changelog="${2:-CHANGELOG.md}"

if ! printf '%s\n' "$tag" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "error: '$tag' is not a v-prefixed semver tag (expected e.g. v0.1.0)" >&2
  exit 2
fi
if [ ! -r "$changelog" ]; then
  echo "error: cannot read $changelog" >&2
  exit 2
fi

version="${tag#v}"

notes="$(awk -v heading="## [${version}]" '
  function is_heading(line) {
    if (index(line, heading) != 1) return 0
    rest = substr(line, length(heading) + 1)
    return rest == "" || substr(rest, 1, 1) == " "
  }
  !found && is_heading($0) { found = 1; next }
  found && /^## / { exit }
  found && /^\[[^]]+\]:/ { exit }
  found { print }
  END { if (!found) exit 3 }
' "$changelog")" || {
  echo "error: $changelog has no section '## [${version}]' for tag $tag" >&2
  exit 1
}

# Trim leading and trailing blank lines.
notes="$(printf '%s\n' "$notes" | awk 'NF { started = 1 } started' | awk '
  { lines[NR] = $0 }
  END {
    last = NR
    while (last > 0 && lines[last] ~ /^[[:space:]]*$/) last--
    for (i = 1; i <= last; i++) print lines[i]
  }
')"

if [ -z "${notes//[[:space:]]/}" ]; then
  echo "error: the '## [${version}]' section of $changelog is empty" >&2
  exit 1
fi

printf '%s\n' "$notes"
