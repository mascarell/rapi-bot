#!/usr/bin/env bash
#
# SessionStart hook, wired up in .claude/settings.json.
#
# A Claude Code cloud session gets a fresh VM with the repo cloned and
# node_modules absent, so the gates cannot run until something installs them.
# This makes that happen before the first turn instead of halfway through it.
#
# Local sessions exit on the next line and are completely unaffected — nothing
# in this repo's hooks touches a developer's own machine.

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

bash "$(dirname -- "${BASH_SOURCE[0]:-$0}")/cloud-setup.sh"

# cloud-setup.sh never fails on purpose, but be explicit: a non-zero
# SessionStart hook can stop the session from starting.
exit 0
