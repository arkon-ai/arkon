#!/usr/bin/env bash
# scripts/check-prod-sharp.sh — prove the production install (Dockerfile:6,
# `npm ci --omit=dev`) still loads the sharp that `next` resolves (transformate WI-3986).
#
# Why this exists: next 16.3 accepts sharp 0.35, so npm hoisted one sharp marked
# devOptional and left its @img/sharp-* native packages dev-only. A full `npm ci`
# (CI, the build stage) hid it; `--omit=dev` dropped the natives and next's image
# optimizer could not load sharp. This copies only the package files into an empty
# dir, installs production deps there, and resizes one PNG through next's sharp.
#
# Exit 0 only when that resize succeeds. Needs the same npm auth as `npm ci`.
set -euo pipefail
HERE=$(dirname "$0"); ROOT=$(cd "$HERE/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$W/"
[ -f "$ROOT/.npmrc" ] && cp "$ROOT/.npmrc" "$W/"
cd "$W"
npm ci --omit=dev --no-audit --no-fund
node "$ROOT/scripts/check-prod-sharp.mjs"
