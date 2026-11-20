#!/bin/sh
# Quick prose-lint check. Usage: .claude/skills/prose-lint/check.sh [files...]
# Prints lines in the given files (default: the pages' text) that match words the style rules flag.
# A hit is a prompt to look, not an error.
cd "$(dirname "$0")/../../.." || exit 1
files="${*:-index.html */index.html js/*/*.js js/v2/stages/*.js}"
# shellcheck disable=SC2086
grep -nE "\b(their|theirs)\b|\b(is|are) what\b|which is why|\b(pays? for|plunges?|swallowed|pulls? the trigger|lets go|goes by)\b|\b(colour|coloured|centre|metres?|kilometres?|grey|neighbours?|colourless)\b|\b(its)\b.*\b(its)\b" $files \
  | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|/\*)" || true
