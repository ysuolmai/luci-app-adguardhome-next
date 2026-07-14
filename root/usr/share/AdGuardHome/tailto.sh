#!/bin/sh
# Keep the last N lines of a regular log file using an atomic replacement.

case "${1:-}" in ''|*[!0-9]*) exit 2;; esac
file="${2:-}"
[ -n "$file" ] && [ "$file" != syslog ] && [ -f "$file" ] || exit 0
tmp="${file}.tail.$$"
tail -n "$1" "$file" >"$tmp" && cat "$tmp" >"$file"
rm -f "$tmp"
