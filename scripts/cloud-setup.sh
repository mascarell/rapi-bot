#!/usr/bin/env bash
#
# Prepare a bare Ubuntu box to run this repo's gates:
#
#     bunx tsc --noEmit && bun run test:run
#
# Written for Claude Code cloud sandboxes (Ubuntu 24.04, root, ~30 GB disk),
# but it is plain idempotent bash and works on any Debian-ish machine.
#
# Two callers:
#
#   1. The "Setup script" box of a cloud environment at claude.ai/code. That
#      script runs before the repo exists, so paste this file's contents there
#      rather than a path to it. It is cached per environment, so the slow
#      parts below happen roughly once. With no repo to install into it stops
#      after the toolchain, which is the point.
#   2. The SessionStart hook in .claude/settings.json, on every cloud session,
#      where the toolchain is already there and only the install is left.
#
# It deliberately never exits non-zero. A setup script that fails stops the
# session from starting at all, which is worse than a session that starts with
# a diagnosis printed in it.
#
# Local sessions are untouched: the hook checks CLAUDE_CODE_REMOTE first.

set -uo pipefail

say() { printf '[cloud-setup] %s\n' "$*"; }

# Cloud sandboxes run as root and have no sudo; dev machines are the reverse.
if [ "$(id -u)" = "0" ]; then
    SUDO=""
elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
else
    SUDO=""
fi

# ---------------------------------------------------------------------------
# 1. Native build toolchain for @discordjs/opus
#
# @discordjs/opus is a node-gyp addon, so `bun install` compiles it from
# source. The cloud image ships python3 and gcc/clang but not autotools, and
# the failure is a wall of node-gyp output rather than a clear message. This is
# the same list .github/workflows/ci.yml installs.
#
# Note: Ubuntu's `libtool` package installs `libtoolize`, never a `libtool`
# binary, so probe for libtoolize.
# ---------------------------------------------------------------------------
missing=()
for probe in make:make g++:g++ python3:python3 libtoolize:libtool autoconf:autoconf automake:automake; do
    cmd="${probe%%:*}"
    pkg="${probe##*:}"
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$pkg")
done

if [ "${#missing[@]}" -gt 0 ]; then
    say "installing build tools: ${missing[*]}"
    $SUDO apt-get update -qq || say "WARNING: apt-get update failed"
    $SUDO apt-get install -y -qq "${missing[@]}" || say "WARNING: apt-get install failed"
else
    say "build tools already present"
fi

# ---------------------------------------------------------------------------
# 2. Bun
#
# Do NOT use https://bun.sh/install here. The cloud sandbox's default "Trusted"
# egress allowlist does not include bun.sh, so the curl installer the Dockerfile
# uses hangs or 403s. registry.npmjs.org IS allowlisted, so install bun from
# npm instead, and symlink it where non-login shells will find it.
#
# Pinned to 1.2.x to match `bun-version` in .github/workflows/ci.yml. Unpinned
# this installs 1.4.x, which writes a newer bun.lock format — so adding a
# dependency in a sandbox would produce a lockfile CI could then refuse with
# --frozen-lockfile. Bump both together or neither.
# ---------------------------------------------------------------------------
if command -v bun >/dev/null 2>&1; then
    say "bun $(bun --version) already on PATH"
elif [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
    say "bun $(bun --version) found at ~/.bun/bin"
else
    say "installing bun 1.2.x from npm (bun.sh is not on the default egress allowlist)"
    if npm install -g bun@1.2 >/dev/null 2>&1; then
        npm_bin="$(npm prefix -g 2>/dev/null)/bin/bun"
        if [ -x "$npm_bin" ] && [ ! -e /usr/local/bin/bun ]; then
            ln -sf "$npm_bin" /usr/local/bin/bun 2>/dev/null
        fi
        if command -v bun >/dev/null 2>&1; then
            say "bun $(bun --version) installed"
        else
            say "WARNING: bun installed but is not on PATH"
        fi
    else
        say "WARNING: could not install bun — see the npm fallback below"
    fi
fi

# ---------------------------------------------------------------------------
# 3. Skip the Chromium download
#
# puppeteer's postinstall pulls ~1.3 GB of Chromium from
# storage.googleapis.com, which is NOT on the default egress allowlist. Left
# alone it is the most likely reason `bun install` fails in a sandbox, and
# nothing in the test suite needs it — only src/services/bd2PulseScraperService.ts
# does, at runtime. Set this in the environment's variables box too, so it
# applies to installs this script did not run.
#
# If you ever do need the scraper in a cloud session: add
# storage.googleapis.com to a Custom egress list, then
# `bunx puppeteer browsers install chrome`.
# ---------------------------------------------------------------------------
export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-true}"

# ---------------------------------------------------------------------------
# 4. Dependencies
#
# Find the repo without assuming how this script was invoked: pasted into a
# setup box there is no $BASH_SOURCE to work from, and in that case there is
# usually no repo yet either.
# ---------------------------------------------------------------------------
repo_root=""
script_dir="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"

for candidate in "${CLAUDE_PROJECT_DIR:-}" "$PWD" "${script_dir:+$script_dir/..}"; do
    [ -n "$candidate" ] || continue
    if [ -f "$candidate/bun.lock" ]; then
        repo_root="$(cd "$candidate" && pwd)"
        break
    fi
done

if [ -z "$repo_root" ]; then
    say "toolchain ready; no bun.lock found yet, so nothing to install."
    say "That is expected when this runs as an environment setup script —"
    say "the SessionStart hook installs dependencies once the repo is cloned."
    exit 0
fi

cd "$repo_root" || exit 0
say "repo: $repo_root"

stamp="node_modules/.cloud-setup-stamp"
want="$(sha256sum bun.lock | cut -d' ' -f1)"

if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ]; then
    say "dependencies already match bun.lock — nothing to do"
    exit 0
fi

say "installing dependencies"
if command -v bun >/dev/null 2>&1 && bun install --frozen-lockfile; then
    printf '%s' "$want" > "$stamp"
    say "ready: bunx tsc --noEmit && bun run test:run"
    exit 0
fi

# Bun's package fetching is documented as having proxy problems in cloud
# sandboxes. The tests are vitest on the node environment and do not care which
# installer put node_modules there, so fall back rather than leave the box
# unusable. No lockfile is written: this resolves fresh and is a rescue path,
# not the supported install.
say "bun install failed — falling back to npm"
if npm install --no-package-lock --no-audit --no-fund --legacy-peer-deps; then
    say "ready via npm: npx tsc --noEmit && npx vitest run"
    say "NOTE: npm resolved fresh versions. bun.lock was not used; treat any"
    say "      failure here as suspect until it reproduces under bun."
else
    say "FAILED: neither bun nor npm could install dependencies."
    say "Most likely causes, in order:"
    say "  1. egress - set the environment's network access to Full, or add a"
    say "     Custom list including registry.npmjs.org and storage.googleapis.com"
    say "  2. the Chromium download - confirm PUPPETEER_SKIP_DOWNLOAD=true"
    say "  3. node-gyp on @discordjs/opus - re-read section 1 output above"
fi

exit 0
