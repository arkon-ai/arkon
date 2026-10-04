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
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$W/"
[ -f "$ROOT/.npmrc" ] && cp "$ROOT/.npmrc" "$W/"
cd "$W"
npm ci --omit=dev --no-audit --no-fund
node -e '
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));
sharp({ create: { width: 64, height: 64, channels: 4, background: "#3366ff" } })
  .png().toBuffer()
  .then((png) => sharp(png).resize(16, 16).png().toBuffer({ resolveWithObject: true }))
  .then(({ info }) => {
    if (info.width !== 16 || info.height !== 16) throw new Error("resize gave " + info.width + "x" + info.height);
    console.log("prod sharp OK", sharp.versions.sharp, "libvips", sharp.versions.vips, process.platform, process.arch);
  })
  .catch((e) => { console.error("prod sharp FAILED:", e.message); process.exit(1); });
'
