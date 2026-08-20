#!/bin/bash
# gitleaks-gate.sh — the staged-secret scan, run so the CALLER cannot neuter it.
# D-5 (gss-lira WI-120 R8 adj12, inherited into transformate WI-3032 by deck ruling 4c002c0e).
#
# THE DEFECT. The lane used to be `run: /usr/bin/env gitleaks git --staged --redact --no-banner`.
# gitleaks reads $GITLEAKS_CONFIG, so one exported variable pointing at an allow-all recipe turns
# the scan into a pass. Measured on this host, gitleaks 8.21.2, a staged AWS key and GitLab
# token: the shipped command returns rc 1 "leaks found: 1"; the same command with
# GITLEAKS_CONFIG at an allow-all TOML returns rc 0 "no leaks found". No --no-verify, no hook
# edit, nothing in the trail — the commit simply passes and the secret goes in.
#
# WHY A COMMITTED WRAPPER AND NOT A lefthook `env:` ENTRY. lefthook can SET a variable but not
# UNSET one: `GITLEAKS_CONFIG: ""` in the env: map exports an EMPTY value, and gitleaks treats
# an empty config path as "no override" on some paths and as an unreadable file on others — a
# behaviour that depends on the version, which is not a control. A wrapper can `unset`, which is
# a shell builtin and cannot itself be planted.
#
# WHY THE BINARY IS RESOLVED ABSOLUTELY. The original lane called `/usr/bin/env gitleaks`, and
# `env` is absolute precisely so its job can be to look `gitleaks` up in the CALLER's PATH — the
# transformate WI-3032 defect, on the lane whose whole purpose is to be trustworthy. A planted
# `gitleaks` that exits 0 fakes a clean scan exactly as a planted `sha256sum` forged the Brynn
# override. Named candidates, first one wins.
# RESIDUAL, stated: /usr/local/bin is root-owned 0755 on the Linux belt hosts (it is where
# gitleaks actually lives here) but is writable by the installing user under Homebrew on macOS.
# It is kept because removing it would leave no candidate at all on this fleet, and the panel
# adjudicated that removing the admin prefixes outright is the wrong instrument. The ordering
# below prefers the root-owned locations, so /usr/local is reached only when nothing else has it.

set -uo pipefail

# BELT-PATH-HARDENED v2 — transformate WI-3032. Resolve by ABSOLUTE PATH, never via the caller.
# `#!/usr/bin/env bash` asks the CALLER's PATH which `bash` to run, and every bare command name
# inside a gate asks it again, so a caller who prepends one directory chooses what runs as the
# wall. The shebang above is absolute; PATH is rebuilt here, as this file's first executable act,
# from a fixed allowlist of absolute system directories. Root-owned directories lead; the
# admin-installed prefixes trail, because `brew` chowns its prefix to the calling user on macOS.
# /mingw64 and /mingw32 are present because Git-Bash keeps `git` there and not in /usr/bin.
_belt_path=''
for _belt_d in /usr/bin /bin /usr/sbin /sbin \
               /mingw64/bin /mingw32/bin \
               /usr/local/bin /usr/local/sbin \
               /opt/homebrew/bin /opt/homebrew/sbin; do
  [ -d "$_belt_d" ] && _belt_path="${_belt_path:+$_belt_path:}$_belt_d"
done
if [ -z "$_belt_path" ]; then
  echo "gitleaks-gate: COMMIT BLOCKED — no standard system bin directory exists on this host, so" >&2
  echo "  the gate cannot resolve its helper binaries without trusting the caller's PATH, which is" >&2
  echo "  what lets a caller choose what runs as the review wall (transformate WI-3032)." >&2
  exit 1
fi
PATH="$_belt_path"
export PATH
# REQUIRED HELPERS — a rebuilt PATH that cannot resolve the gate's own tools is a BROKEN gate,
# not a hardened one, and it must say so rather than failing later in a way that reads like a
# clean scan. `command -v` is a shell builtin, so it cannot itself be planted.
for _belt_need in git; do
  command -v "$_belt_need" >/dev/null 2>&1 || {
    echo "gitleaks-gate: COMMIT BLOCKED — '$_belt_need' is not resolvable on the hardened PATH." >&2
    echo "  PATH=$PATH" >&2
    echo "  Add its absolute system directory to the BELT-PATH-HARDENED list above; do NOT" >&2
    echo "  restore the caller's PATH (transformate WI-3032)." >&2
    exit 1; }
done
unset _belt_path _belt_d _belt_need

# BELT-GIT-ENV-PINNED v1 — D-4. The PATH rebuild decides which BINARIES run; it says nothing
# about which REPOSITORY git reports on. GIT_DIR and GIT_WORK_TREE re-point git at another object
# store and working tree, and `git -C` does not override them — so a staged-content scan can be
# answered from a repository the committer chose. Scrubbed rather than pinned: hooks run with the
# repository root as their working directory, so plain `git` rediscovers the right repository.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
      GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CEILING_DIRECTORIES \
      GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_COUNT \
      GIT_CONFIG_PARAMETERS XDG_CONFIG_HOME GIT_ATTR_SOURCE

# THE SCRUB THIS FILE EXISTS FOR. GITLEAKS_CONFIG is the documented override; the others are the
# same lever under different names across 8.x, scrubbed together so a version bump cannot quietly
# reopen the hole. Unset, never set-to-empty: an empty value is a value, and what gitleaks does
# with one has changed between releases.
unset GITLEAKS_CONFIG GITLEAKS_CONFIG_TOML GITLEAKS_BASELINE_PATH GITLEAKS_ENABLE_UPLOAD

_gl_bin=''
for _gl_c in /usr/bin/gitleaks /bin/gitleaks /usr/local/bin/gitleaks /opt/homebrew/bin/gitleaks; do
  [ -x "$_gl_c" ] && { _gl_bin="$_gl_c"; break; }
done
if [ -z "$_gl_bin" ]; then
  # ABSENT IS NOT CLEAN. The predecessor lane ended in `|| echo <message>`, so a missing binary
  # exited 0 and lefthook drew a green tick beside a scan that never happened — the same shape
  # transformate WI-3027 fixed for semgrep. Refuse, and name the remedy.
  echo "gitleaks-gate: COMMIT BLOCKED — gitleaks is not installed at any absolute path this gate" >&2
  echo "  trusts (/usr/bin, /bin, /usr/local/bin, /opt/homebrew/bin)." >&2
  echo "  NO secret scan ran on these staged changes. Install gitleaks system-wide; a per-user" >&2
  echo "  copy is deliberately not trusted, because this gate BLOCKS on a missing scan and a" >&2
  echo "  scanner the committer can rewrite would let a forged clean result through." >&2
  exit 1
fi

for _gl_v in $(compgen -e); do
  case "$_gl_v" in
    PATH|GIT_INDEX_FILE) ;;
    *) unset "$_gl_v" ;;
  esac
done
unset _gl_v
exec "$_gl_bin" git --staged --redact --no-banner "$@"
# GATE-END-SENTINEL v1 -- run-gate.sh requires this as PROOF the file is complete.
# Do not remove, and keep it LAST.
