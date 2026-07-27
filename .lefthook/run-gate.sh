#!/usr/bin/env bash
# run-gate.sh — the ONE line of indirection between lefthook and the gates.
# Copy to each adopting repo as `.lefthook/run-gate.sh` (tracked), then:
#   lefthook install
#
# WHY THIS FILE EXISTS (transformate WI-2412, 2026-07-27)
# lefthook v2.1.10 does its OWN variable substitution on `run:` BEFORE any shell sees the
# string, and it is not a shell:
#   ${VAR:-default}  →  substitutes `${VAR` and leaves the literal `:-default` behind
#   $$               →  the PID
#   \$VAR            →  no escape; still substituted
#   $UNSET           →  the empty string, silently
# So the old reference invocation `bash "${CODE_BUILD_SKILL_DIR:-$HOME/...}/panel-gate.sh"`
# ran as `bash ":-$HOME/.../panel-gate.sh"` → **exit 127**. Repos carrying it could not push
# at all, and the obvious unblock (delete the hook) leaves NO repo-side wall — which is how
# the doctrine-v4 "physically gated" layer came to be un-run on those repos.
# The deeper trap: because lefthook expands every `$NAME` from its own environment, NO
# shell-side defaulting of any kind survives inside `run:`. There is no clever quoting. The
# only robust answer is a `run:` line with no `$` in it — hence this shim, where a real bash
# does the resolution.
#
# RESOLUTION ORDER — canonical first, vendored copy as a last resort:
#   1. $CODE_BUILD_SKILL_DIR   — explicit override, always wins
#   2. ~/.claude/skills/code-build — the CANONICAL gates. Preferred, so a gate improvement
#      reaches every repo at once instead of per-repo copies drifting (2026-07-27: vendored
#      copies were 8-16 KB against a 55 KB canonical gate, i.e. missing the manifest
#      ownership gate, the strict-quorum chain and the degrade report).
#   3. a repo-VENDORED copy at the repo root or ./scripts — because some repos vendored the
#      gates deliberately to be self-contained (learnhub, transformate WI-2240). Without
#      this arm, adopting the shim would fail CLOSED on any host that has the repo but not
#      the skill — e.g. a trainee's machine or CI — turning a review improvement into "no
#      HOFMI trainee can push today". A stale wall beats no wall, and it says so out loud.
# FAIL CLOSED only when none of the three resolves: an unresolvable gate is the exact state
# this file exists to stop being silent about, so skipping is not an option.

set -uo pipefail

GATE="${1:-}"
shift || true
# ALLOWLIST, not just non-empty (hofmi-scribe panel, grok CRITICAL). $GATE is interpolated into
# every path join below, so a `run:` line that ever passed `../something` or an absolute fragment
# would make this shim exec an unexpected file that can still pass the marker sniff. The set of
# gates is fixed and tiny; enumerate it rather than sanitising.
case "$GATE" in
  panel-gate.sh|wi-gate.sh) ;;
  *)
    echo "run-gate: PUSH BLOCKED - '$GATE' is not a known gate." >&2
    echo "  Expected exactly one of: panel-gate.sh, wi-gate.sh" >&2
    echo "  (the name is used to build a path, so it is allowlisted, not sanitised)" >&2
    exit 1 ;;
esac

RESOLVED=""
VENDORED=no
OVERRIDDEN=no

_root="$(git rev-parse --show-toplevel 2>/dev/null || printf '.')"
_root_real="$(cd "$_root" 2>/dev/null && pwd -P || printf '%s' "$_root")"

# Does this file actually look like a fleet gate? Applied to EVERY arm, not just the
# vendored one (learnhub panel R2: opus MAJOR, grok MAJOR — convergent). A truncated or
# zero-byte `~/.claude/skills/code-build/panel-gate.sh` is the dangerous case: `bash` on an
# empty file exits 0, so the pre-push wall would report success and let every push through
# in silence. That is a fail-OPEN in the one component whose entire job is to fail closed.
# It is a sanity check against truncation, a stub, or an unrelated same-named file — NOT a
# security boundary; a malicious committer is out of this layer's threat model.
gate_looks_real() {  # <file> -> 0 plausible / 1 no
  [ -s "$1" ] || return 1
  grep -qE 'PANEL-MANIFEST|PANEL_OVERRIDE|BRYNN_WI_OVERRIDE|panel gate v4' "$1" 2>/dev/null
}

# COMPLETENESS, which the marker sniff cannot establish (hofmi-scribe panel, grok CRITICAL --
# and it defeats the reasoning I used to decline this four times). A gate that arrives by
# cp/rsync/cloud-sync/editor-write can be interrupted, leaving a PREFIX that still carries the
# marker strings near the top, parses cleanly, and exits 0 -- so the wall reports every push as
# reviewed when no panel ran. Measured on the 71,345-byte canonical gate: prefixes at 1024, 2048,
# 6144 and 12288 bytes did exactly that (4 of 14 offsets tested).
#
# My earlier refusal argued `git checkout` writes atomically, so the only realistic corruption is
# the zero-byte file that `-s` catches. That is TRUE for a repo-vendored gate and FALSE for the
# primary arm: `~/.claude/skills/code-build` is not populated by this repo's checkout. So the
# check is applied exactly where the risk is -- the override and canonical arms -- and the
# vendored arm is exempt ONLY when git can vouch for the bytes — tracked AND byte-identical to
# HEAD (see below). That scoping means a legitimately committed older copy stays usable offline,
# while a locally-modified or untracked one is held to the same proof as a copy-installed gate.
gate_is_complete() {  # <file> -> 0 complete / 1 truncated-or-unknown
  tail -c 4096 "$1" 2>/dev/null | grep -q 'GATE-END-SENTINEL' || return 1
}
# Two checks, deliberately different in scope:
#   gate_looks_real   - is this plausibly a fleet gate at all (marker strings)?
#   gate_is_complete  - did the whole file arrive (end-of-file sentinel)?
# The completeness check exists because the marker check cannot establish it, and because my
# earlier refusal of it was WRONG: I argued four times that `git checkout` writes atomically so
# the only realistic corruption is the zero-byte file `-s` already catches. That holds for a
# repo-VENDORED gate and not for the primary arm, which is installed by cp/rsync/sync. Measured
# on the 71,345-byte panel-gate.sh, prefixes at 1024/2048/6144/12288 bytes carried the markers,
# parsed, and exited 0 - reporting every push as reviewed with no panel. See gate_is_complete.

# Case-insensitive on Windows, where the same directory is reachable as C:/… and c:/…
# (learnhub panel, opus MINOR) — a case difference would defeat the worktree-containment
# guard below.
path_eq_or_under() {  # <candidate> <root>
  local c="$1" r="$2"
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) c="$(printf '%s' "$c" | tr 'A-Z' 'a-z')"; r="$(printf '%s' "$r" | tr 'A-Z' 'a-z')" ;;
  esac
  [ "$c" = "$r" ] || case "$c" in "$r"/*) return 0 ;; *) return 1 ;; esac
}

# An EXPLICIT override that cannot be honoured is an ERROR, not a reason to quietly use a
# different gate (learnhub panel: sol MAJOR, grok MAJOR). Someone who sets this var has
# stated which wall must run; falling back silently means the push is gated by something
# other than what the operator asked for, and nobody finds out. Fail closed instead.
if [ -n "${CODE_BUILD_SKILL_DIR:-}" ]; then
  _ovr_err=""
  # Trim surrounding whitespace before validating (learnhub panel, opus MINOR): a value
  # picked up from a config file or a here-doc often carries a trailing space or CR, and an
  # untrimmed value fails the absolute-path test for a reason nobody can see.
  _ovr_in="$(printf '%s' "$CODE_BUILD_SKILL_DIR" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  case "$_ovr_in" in
    /*|[A-Za-z]:[/\\]*) ;;
    *) _ovr_err="it is not an absolute path" ;;
  esac
  if [ -z "$_ovr_err" ]; then
    _ovr_real="$(cd "$_ovr_in" 2>/dev/null && pwd -P)" || _ovr_real=""
    if [ -z "$_ovr_real" ]; then _ovr_err="the directory does not exist"
    elif [ ! -f "$_ovr_real/$GATE" ]; then _ovr_err="it holds no '$GATE'"
    else
      # Resolve the GATE FILE, then test containment on that (learnhub panel, sol MAJOR):
      # testing only the directory misses a dir outside the tree whose gate file resolves
      # back inside it. An override pointing at repo content is the one thing it must never
      # do — .envrc, a CI export or a README instruction is enough to set it.
      _ovr_file="$(cd "$(dirname "$_ovr_real/$GATE")" 2>/dev/null && pwd -P)/$(basename "$GATE")"
      if path_eq_or_under "$_ovr_file" "$_root_real"; then
        _ovr_err="it resolves inside the repository being pushed ($_ovr_file)"
      fi
    fi
  fi
  if [ -n "$_ovr_err" ]; then
    echo "run-gate: PUSH BLOCKED — CODE_BUILD_SKILL_DIR is set but unusable: $_ovr_err." >&2
    echo "  value: $CODE_BUILD_SKILL_DIR" >&2
    echo "  An explicit override names the wall that must run; silently using a different" >&2
    echo "  gate would hide that. Fix or unset it." >&2
    exit 1
  fi
  RESOLVED="$_ovr_real/$GATE"; OVERRIDDEN=yes
fi

if [ -n "$RESOLVED" ]; then
  :
elif [ -n "${HOME:-}" ] && [ -f "$HOME/.claude/skills/code-build/$GATE" ]; then
  RESOLVED="$HOME/.claude/skills/code-build/$GATE"
else
  # Vendored fallback, resolved from the REPO ROOT rather than the process CWD. Note this is
  # belt-and-braces for the GATE lookup only: lefthook does run `run:` from the repo root, and
  # it must — the `run:` line names this file relatively, so a different cwd would fail to find
  # the shim at all, before any of its logic ran (panel R4, opus MAJOR: an earlier version of
  # this comment implied otherwise and contradicted itself).
  # A bare filename search would also exec any file that happens to be called panel-gate.sh
  # (learnhub panel, opus MAJOR), so require the file to LOOK like the real gate. This is a
  # sanity check against an unrelated or stub script, NOT a security boundary: a repo that
  # can add a fake gate can equally edit lefthook.yml or this shim, and a malicious
  # committer is explicitly outside this layer's threat model.
  for _c in "$_root/$GATE" "$_root/scripts/$GATE" "$_root/.lefthook/$GATE"; do
    [ -f "$_c" ] || continue
    if gate_looks_real "$_c"; then RESOLVED="$_c"; VENDORED=yes; break; fi
    echo "run-gate: ignoring $_c — it does not look like a fleet gate (no manifest/override markers)." >&2
  done
fi

# ONE sanity check over WHICHEVER arm won, including the canonical skill dir (learnhub panel
# R2: opus MAJOR + grok MAJOR, convergent). Checking only the vendored arm left the dangerous
# case open: a truncated or zero-byte canonical panel-gate.sh makes `bash` exit 0, so the wall
# would report success and pass every push in silence — a fail-OPEN in the one component whose
# whole job is to fail closed.
# The vendored arm is exempt from the completeness check ONLY because git wrote it atomically —
# so verify git actually TRACKS it (opus MAJOR). An untracked file sitting at a vendored path had
# no such guarantee and must be held to the same proof as a copy-installed gate.
# Exemption is bound to the COMMITTED BYTES, not merely to the path being tracked (opus + sol,
# convergent). `ls-files --error-unmatch` proves git knows the path; it says nothing about the
# working-tree contents, so a tracked file that was locally truncated by the same interrupted
# copy this check exists to catch would have inherited the exemption and reopened the fail-open.
# Compare the file's hash to the blob git has for it; any mismatch, or any inability to ask,
# falls through to the completeness proof.
_exempt=no
if [ "$VENDORED" = yes ]; then
  # Compare the file's ACTUAL object hash with the blob HEAD records (sol CRITICAL). An earlier
  # version used `git diff --quiet`, which honours the `assume-unchanged` / `skip-worktree` index
  # bits — so `git update-index --assume-unchanged panel-gate.sh` followed by truncating the file
  # left both diff checks CLEAN, the exemption granted, and a sentinel-free gate EXECUTING.
  # Verified before fixing: the truncated gate ran. Hashes cannot be told to lie.
  _rel="$(git -C "$_root_real" ls-files --full-name -- "$RESOLVED" 2>/dev/null | head -1)"
  if [ -n "$_rel" ]; then
    _head_hash="$(git -C "$_root_real" rev-parse "HEAD:$_rel" 2>/dev/null)" || _head_hash=""
    _wt_hash="$(git -C "$_root_real" hash-object "$RESOLVED" 2>/dev/null)" || _wt_hash=""
    if [ -n "$_head_hash" ] && [ -n "$_wt_hash" ] && [ "$_head_hash" = "$_wt_hash" ]; then
      _exempt=yes
    fi
  fi
fi

if [ -n "$RESOLVED" ] && [ "$_exempt" != yes ] && ! gate_is_complete "$RESOLVED"; then
  echo "run-gate: PUSH BLOCKED - '$RESOLVED' is missing its end-of-file sentinel," >&2
  echo "  which means the copy is INCOMPLETE (interrupted cp/rsync/sync) or predates the" >&2
  echo "  sentinel. A truncated gate can parse and exit 0, reporting a push as reviewed when" >&2
  echo "  no panel ran -- so this refuses rather than trusting it." >&2
  echo "  Fix: re-install the code-build skill so the gate is whole (expect the file to end in" >&2
  echo "  GATE-END-SENTINEL). Do not delete the hook." >&2
  exit 1
fi
if [ -n "$RESOLVED" ] && ! gate_looks_real "$RESOLVED"; then
  echo "run-gate: PUSH BLOCKED — '$RESOLVED' exists but does not look like a fleet gate" >&2
  echo "  (empty, truncated, or not the real script). An unrunnable gate must never read as a" >&2
  echo "  pass: bash on an empty file exits 0, which would silently open the wall." >&2
  exit 1
fi

if [ -z "$RESOLVED" ]; then
  echo "run-gate: PUSH BLOCKED — gate '$GATE' not found." >&2
  echo "  looked in: \$CODE_BUILD_SKILL_DIR, ~/.claude/skills/code-build, ./, ./scripts, ./.lefthook" >&2
  echo "  The code-build skill is missing on this host and this repo vendors no copy." >&2
  echo "  Refusing the push rather than skipping the review wall." >&2
  echo "  Install the skill (or set CODE_BUILD_SKILL_DIR); do not delete the hook." >&2
  exit 1
fi

if [ "$OVERRIDDEN" = yes ]; then
  echo "run-gate: NOTE — CODE_BUILD_SKILL_DIR override in effect; the push gate for this" >&2
  echo "  push is $RESOLVED, not the canonical skill copy." >&2
fi

if [ "$VENDORED" = yes ]; then
  echo "run-gate: NOTE — using this repo's VENDORED $GATE ($RESOLVED); the canonical" >&2
  echo "  code-build skill is not installed on this host, so gate fixes since the copy was" >&2
  echo "  taken are NOT in effect. The wall still runs. Install the skill when you can." >&2
fi

# exec: panel-gate.sh reads git's pre-push ref lines from stdin (its lefthook entry sets
# use_stdin), so the child must inherit this process's stdin directly rather than a copy that
# has already been drained. wi-gate.sh ignores stdin; exec is harmless for it.
exec bash "$RESOLVED" "$@"
