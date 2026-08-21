#!/bin/bash
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

# BELT-PATH-HARDENED v2 — transformate WI-3032. Resolve by ABSOLUTE PATH, never via the caller.
#
# THE DEFECT THIS CLOSES. `#!/usr/bin/env bash` asks the CALLER's PATH which `bash` to run, and
# every bare command name inside a gate asks it again. A caller who prepends one directory
# therefore CHOOSES WHAT RUNS AS THE REVIEW WALL. Reproduced on hofmi-crm-app before this fix,
# four ways, each a two-line script and no privileges at all:
#   - a planted `bash` made all three shims exit 0 without executing one line of gate logic;
#   - a planted `env` replaced run-gate.sh's `exec` target the same way;
#   - a planted `sha256sum` that echoes OVERRIDE_HASH forged the Brynn override in wi-gate.sh —
#     push allowed, the WI requirement gone, WITHOUT anyone holding the token;
#   - lefthook's `run: /usr/bin/env bash …` looked `bash` up in PATH too, so the entry point had
#     the same hole as the shims it starts.
# The `-p` / `env -u BASH_ENV` / SHELLOPTS hardening already in these files does NOT cover this,
# and reading it as if it did is the trap: privileged mode governs how the chosen bash BEHAVES,
# not which binary named `bash` gets chosen. Likewise the lefthook comment reasoning about
# exported shell functions — an absolute `/usr/bin/env` defeats a `bash() { :; }` function and
# does nothing at all about a `/tmp/evil/bash` file.
#
# THE FIX, two halves.
#   1. The shebang above is an ABSOLUTE interpreter path — no lookup happens at all.
#   2. PATH is REBUILT here, as this file's first executable act, from a fixed list of absolute
#      system directories. REBUILT, not prepended: a prepend leaves the caller's directories in
#      the tail, so any helper missing from the system dirs is still theirs to choose.
#
# DIRECTORY ORDER IS A TRUST ORDER, not cosmetics (panel R1: sol MAJOR, grok MAJOR x2, opus
# MINOR — four lanes, three vendors, convergent). The v1 list led with /usr/local and
# /opt/homebrew and carried a comment asserting that anyone who can write there already owns
# the host. That is FALSE on macOS, where `brew` chowns its prefix to the installing user: an
# unprivileged caller can drop a forged `git` or `sha256sum` into /opt/homebrew/bin and steer
# the wall again, without touching the repo. Root-owned system directories therefore come
# FIRST, and the two admin-installed prefixes come LAST, where they can only supply a binary
# the system dirs do not have. They are not dropped outright because a host that genuinely
# keeps a tool only there would otherwise fail closed for a reason nobody can see.
# NOT done, deliberately: skipping a directory on `[ -w ]`. Both lanes that proposed it are
# wrong on Windows, where an elevated MSYS shell reports /usr/bin as writable — the belt would
# come back empty and every push on the laptop would be refused. Ordering is the honest fix
# available here; a real ownership check is its own WI.
#
# /mingw64/bin AND /mingw32/bin ARE LOAD-BEARING (panel R1, opus MAJOR — a HARD OUTAGE, not a
# bypass). Under Git-Bash/MSYS the coreutils live in /usr/bin but `git` does NOT: it is
# /mingw64/bin/git.exe, and `curl` is /mingw64/bin/curl.exe. This repo already records that —
# see deploy-belt-selftest.sh, "git is at /mingw64/bin/git on this host, not /usr/bin/git".
# Because /usr/bin and /bin both exist under MSYS, the empty-belt refusal below CANNOT fire, so
# a list without the mingw dirs rebuilds "successfully" and then every `git` call in every gate
# fails `command not found`. Measured against a git-less belt: wi-gate.sh refuses every push
# with "no Helm WI reference found" — the wall holding for entirely the wrong reason, on the
# primary laptop. Hence both the mingw entries and the REQUIRED-HELPER assertion below.
#
# Fail CLOSED if no system directory exists at all: a gate that cannot resolve its own helpers
# without trusting the caller is exactly the state this block refuses to be silent about.
# NOT in the threat model, and not changed by this: anyone who can write to /usr/bin as root.
# gate-path-resolution-selftest.sh enforces the whole shape above — structurally, not by marker
# — on every *-gate.sh in the repo, including shims that do not exist yet.
_belt_path=''
for _belt_d in /usr/bin /bin /usr/sbin /sbin \
               /mingw64/bin /mingw32/bin \
               /usr/local/bin /usr/local/sbin \
               /opt/homebrew/bin /opt/homebrew/sbin; do
  [ -d "$_belt_d" ] && _belt_path="${_belt_path:+$_belt_path:}$_belt_d"
done
if [ -z "$_belt_path" ]; then
  echo "run-gate: PUSH BLOCKED — no standard system bin directory exists on this host, so the" >&2
  echo "  gate cannot resolve its helper binaries without trusting the caller's PATH, which is" >&2
  echo "  what lets a caller choose what runs as the review wall (transformate WI-3032)." >&2
  exit 1
fi
PATH="$_belt_path"
export PATH
# REQUIRED HELPERS — a rebuilt PATH that cannot resolve the gate's own tools is a BROKEN gate,
# not a hardened one, and it must say so rather than failing later with an empty result that
# reads like a legitimate verdict. This is the assertion that makes the /mingw64 class of miss
# impossible to repeat silently: add a directory to the list above, never restore the caller's
# PATH. `command -v` is a shell builtin, so it cannot itself be planted.
for _belt_need in git; do
  command -v "$_belt_need" >/dev/null 2>&1 || {
    echo "run-gate: PUSH BLOCKED — '$_belt_need' is not resolvable on the hardened PATH." >&2
    echo "  PATH=$PATH" >&2
    echo "  Add its absolute system directory to the BELT-PATH-HARDENED list above; do NOT" >&2
    echo "  restore the caller's PATH (transformate WI-3032)." >&2
    exit 1; }
done
unset _belt_path _belt_d _belt_need
# BELT-GIT-ENV-PINNED v1 — D-4 (gss-lira WI-120 R8 adj12, inherited into transformate WI-3032
# by deck ruling 4c002c0e). The PATH rebuild above decides which BINARIES run; it says nothing
# about which REPOSITORY git reports on. These variables re-point git at another object store
# and working tree, and `git -C <path>` does NOT override GIT_DIR — so every git-derived
# decision in this gate can be answered from a repository the pusher chose.
# Measured on this tree before the scrub: repo A commits a complete gate and holds truncated
# bytes in its working tree; repo B commits the truncated bytes at the same path. Honest
# environment -> rc 1, refused on the missing end-of-file sentinel. With GIT_DIR and
# GIT_WORK_TREE pointed at repo B -> rc 0 and TRUNCATED-GATE-RAN: rev-parse read the alternate
# object store, hash-object read the working tree, the hashes matched, the completeness proof
# was skipped as "git vouches for these bytes", and a truncated gate executed as the wall.
# Reachable through the same .envrc / CI-export channel as CODE_BUILD_SKILL_DIR, which this
# file already treats as attacker-influenced.
# SCRUBBED, not pinned to a value: the gates are invoked with the repository root as their
# working directory (git runs hooks from the top level, and lefthook's `run:` is rooted there),
# so plain `git` rediscovers the right repository from the cwd. Pinning would need a trusted
# source for the value, and the cwd already is one.
# `unset` is a shell builtin, so this cannot itself be planted and does not disturb the
# first-executable-act rule the PATH rebuild above depends on.
# transformate WI-3046 M1 — THREE MORE DOORS TO THE SAME ROOM. The list above was written as
# "the variables that re-point the repository" and stopped at the four GIT_CONFIG* names that
# look like a config path. Measured on git 2.53.0, all three of these reach git config anyway and
# all three survived the list above:
#   GIT_CONFIG_PARAMETERS  is read INDEPENDENTLY of GIT_CONFIG_COUNT — the pairing is an
#     assumption, not a rule. `GIT_CONFIG_COUNT= GIT_CONFIG_PARAMETERS="'user.name=X'" git
#     config user.name` prints X. Combined with core.attributesFile and a filter.<d>.clean it
#     makes `git hash-object` report a chosen blob hash for the bytes on disk, which is the
#     completeness proof D-4 relies on, so a TRUNCATED gate hashes equal to the honest one.
#   XDG_CONFIG_HOME        reaches $XDG_CONFIG_HOME/git/config without naming a GIT_* variable.
#   GIT_ATTR_SOURCE        names a TREE to read .gitattributes from, needing no config path and
#     no file on disk: `git hash-object -w` plus `git mktree` build one in the object store.
# Scrubbed, not pinned. NOT claimed: that this closes config injection. Unsetting XDG_CONFIG_HOME
# sends git to $HOME/.config/git/config and $HOME is still caller-controlled, the accepted
# residual on transformate WI-2948. Three levers that needed no $HOME rewrite are gone.
# SAVED BEFORE THE SCRUB (transformate WI-3046). The scrub runs before $GATE is parsed, so
# it cannot yet know that one of the gates it dispatches — gitleaks-gate.sh, a PRE-COMMIT
# gate — legitimately needs GIT_INDEX_FILE, because git itself sets it to the temp index
# holding the content being committed. Stashed here, restored for that gate only, after the
# allowlist has vetted the name. The three pre-push gates still get it scrubbed: they never
# receive it from git, so an inherited value there is attacker-supplied.
_rg_saved_index="${GIT_INDEX_FILE-}"
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
      GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_INDEX_FILE GIT_CEILING_DIRECTORIES \
      GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_COUNT \
      GIT_CONFIG_PARAMETERS XDG_CONFIG_HOME GIT_ATTR_SOURCE

GATE="${1:-}"
shift || true
# ALLOWLIST, not just non-empty (hofmi-scribe panel, grok CRITICAL). $GATE is interpolated into
# every path join below, so a `run:` line that ever passed `../something` or an absolute fragment
# would make this shim exec an unexpected file that can still pass the marker sniff. The set of
# gates is fixed and tiny; enumerate it rather than sanitising.
case "$GATE" in
  panel-gate.sh|wi-gate.sh|semgrep-gate.sh) ;;
  gitleaks-gate.sh)
    # The one staged-content gate: restore the index git handed us, and only for it.
    if [ -n "$_rg_saved_index" ]; then GIT_INDEX_FILE="$_rg_saved_index"; export GIT_INDEX_FILE; fi
    ;;
  *)
    echo "run-gate: PUSH BLOCKED - '$GATE' is not a known gate." >&2
    echo "  Expected exactly one of: panel-gate.sh, wi-gate.sh, semgrep-gate.sh" >&2
    echo "  (a repo whose lefthook.yml names a gate this shim does not know is carrying a" >&2
    echo "   NEWER lefthook.yml than its vendored .lefthook/run-gate.sh - re-copy the shim" >&2
    echo "   from the code-build skill; do not delete the hook)" >&2
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
# The marker set is PER GATE, keyed off the (already allowlisted) $GATE name, rather than one
# union pattern every gate is checked against (transformate WI-3027). A union means a file
# carrying ANY fleet gate's marker passes the sniff when resolved as ANY OTHER gate — strictly
# weaker, bought for nothing. Every arm is enumerated: an R2 review caught the first version of
# this narrowing keeping a union `*)` arm while the comment above it claimed per-gate markers,
# and measured the consequence — the markers are disjoint in the real files (panel-gate.sh has
# 144 panel markers and 0 BRYNN_WI_OVERRIDE, wi-gate.sh the reverse), so a `cp panel-gate.sh
# wi-gate.sh` slip passed the sniff under the union and does not now.
# The `*)` arm is UNREACHABLE — $GATE is allowlisted above — and refuses anyway, so a gate added
# to the allowlist but not to this case fails CLOSED rather than inheriting another gate's
# markers. Keep the two lists in sync; the message names the file, so the fix is legible.
# Still what it always was: a truncation / wrong-file check, NOT a security boundary.
gate_looks_real() {  # <file> -> 0 plausible / 1 no   (reads $GATE from the caller's scope)
  [ -s "$1" ] || return 1
  local _pat
  case "$GATE" in
    panel-gate.sh)   _pat='PANEL-MANIFEST|PANEL_OVERRIDE|panel gate v4' ;;
    wi-gate.sh)      _pat='BRYNN_WI_OVERRIDE' ;;
    semgrep-gate.sh) _pat='SEMGREP-LANE-GATE' ;;
    # transformate WI-3046: gitleaks-gate.sh was invoked DIRECTLY by lefthook and refused
    # here as an unknown gate, so the fleet's only pre-commit gate never reached the
    # completeness proof its three pre-push siblings get — while carrying an unread
    # GATE-END-SENTINEL. Truncated copies exited rc 0 with a secret staged.
    # GITLEAKS_CONFIG_TOML is the marker: verified disjoint from the other three.
    gitleaks-gate.sh) _pat='GITLEAKS_CONFIG_TOML' ;;
    *)               return 1 ;;
  esac
  grep -qE "$_pat" "$1" 2>/dev/null
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
  # ANCHORED + VERSIONED + bounded by LINES, not by 4 KiB of bytes (transformate WI-2438;
  # three lineages convergent on the transformate WI-2428 rollout panels: grok MAJOR, opus
  # MINOR, CodeRabbit Major). The previous form was
  #     tail -c 4096 "$1" | grep -q 'GATE-END-SENTINEL'
  # which proves only that the token appears SOMEWHERE in the last 4 KiB. Two holes: any
  # mid-file MENTION of the token satisfies it (this very file contains two — the pattern
  # below and the refusal message), so a truncation landing after such a mention but before
  # the real sentinel still reads as complete; and a bare substring match also accepts
  # superstrings like GATE-END-SENTINEL-v2. The fix narrows all three axes:
  #   ^#[[:space:]]*        it must be the SENTINEL COMMENT LINE, not a mention inside an
  #                         echo/grep argument (both of this file's own mentions are indented
  #                         or quoted, so neither can satisfy it)
  #   [[:space:]]+v[0-9]+   a whitespace-separated version token, so `-v2` does not match
  #   tail -n 12            position measured in lines; the shipped gates carry the sentinel
  #                         5 lines from EOF, so this is ~7 lines of headroom, not ~50
  # NOT `tail -n 1`, which was the fix originally recommended and is WRONG against the real
  # files: panel-gate.sh (line 961 of 965) and wi-gate.sh (line 97 of 101) both carry four
  # explanatory comment lines BELOW the sentinel, so a last-line requirement would refuse
  # both canonical gates and block every push on every host. Checked before changing it;
  # panel-selftest.sh asserts the shipped gates against this same predicate so the pair
  # cannot drift apart silently.
  # The version token ends at a word boundary — `v1evil` and `v1x` are rejected (sol MAJOR).
  # It is NOT anchored to end-of-line: the shipped sentinel line is
  #   `# GATE-END-SENTINEL v1 -- run-gate.sh requires this as PROOF the file is complete.`
  # so an EOL anchor (also proposed) would refuse both canonical gates and block every push —
  # the same fleet-wide-outage shape as the `tail -n 1` proposal. Trailing prose is allowed;
  # a glued suffix is not.
  tail -n 12 "$1" 2>/dev/null | grep -qE '^#[[:space:]]*GATE-END-SENTINEL[[:space:]]+v[0-9]+([[:space:]]|$)' || return 1
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

# A HARD LINK aliases repo content past every path-based check (transformate WI-2868 R1 fold,
# composer :191 CONFIRMED): `ln <repo>/evil.sh <gatedir>/panel-gate.sh` shares one inode, so it
# is not a symlink, `pwd -P` resolves it to a path outside the worktree, and the containment
# test passes — while the bytes that execute as the wall are the ones the push can edit. There
# is no path to inspect; the aliasing IS the inode.
# ONE implementation, called from EVERY resolution arm that names a gate outside the repo
# (transformate WI-3026; found live by the gss-lira WI-120 panel, exhibit EXP-G). The refusal
# shipped on the canonical arm only, and the OVERRIDE arm — the MORE reachable one, settable by
# an .envrc, a CI export or a README instruction — had no stat call at all, so the identical
# hard-linked evil gate ran as the review wall at exit 0 one resolution branch over. Arms that
# refuse "the same way" by duplication drift; this refuses by the same code.
# REFUSE ON LINK COUNT, rather than composer's `find "$_root_real" -samefile` recipe. Same
# outcome, and strictly cheaper AND stricter: a `find` walks the whole worktree on every push
# (the fleet's clones run 30-46k files), and it only catches a twin that is currently INSIDE
# the repo — a twin one directory above, or added after this push, aliases the same bytes and
# would pass. A legitimately installed gate is a plain regular file with one link, so nlink>1
# is the honest predicate and the remedy is the same either way.
# BOTH stat dialects are tried (R2 fold, cluster 4: sol MAJOR + grok/opus MINOR). `-c %h` is
# GNU; macOS/BSD stat spells the same field `-f %l`. Trying only the GNU form made this a
# BROKEN CHECK on every BSD host — silently NOTE-and-continue forever — which is not the
# documented trade. The trade is for a host with NO usable stat at all; a host whose stat
# merely speaks the other dialect is a bug, and one extra call fixes it.
# NOT fail-closed when BOTH fail: turning an unreadable field into a refusal would wall every
# push on such a host. Say so instead — the same bias as the vendored-gate NOTE.
# Called DIRECTLY (never in a subshell or command substitution) so its `exit 1` is the script's
# fail-closed exit, not a discarded return value.
refuse_hard_linked_gate() {  # <gate-file> <arm-label> <remedy-line> -> exits 1 when nlink>1
  local _f="$1" _arm="$2" _fix="$3" _links
  _links="$(stat -c %h "$_f" 2>/dev/null)" || _links=""
  case "$_links" in
    ''|*[!0-9]*) _links="$(stat -f %l "$_f" 2>/dev/null)" || _links="" ;;
  esac
  case "$_links" in
    ''|*[!0-9]*)
      echo "run-gate: NOTE — cannot read the link count of $_f (no usable stat), so a" >&2
      echo "  hard-linked gate cannot be ruled out on this host. The wall still runs." >&2 ;;
    1) ;;
    *)
      echo "run-gate: PUSH BLOCKED — the $_arm '$GATE' has $_links hard links: $_f" >&2
      echo "  A hard link shares its inode with the file it aliases, so repo content can be" >&2
      echo "  made to execute as the review wall while every path check still passes." >&2
      echo "  $_fix" >&2
      exit 1 ;;
  esac
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
    elif [ -L "$_ovr_real/$GATE" ]; then
      # A SYMLINK ON THE GATE FILE defeats the containment test below, so refuse it outright
      # (transformate WI-2438; five independent reviewers across three rollout repos: sol
      # MAJOR, grok MAJOR, opus MINOR, CodeRabbit twice). Why the test below cannot catch it:
      # $GATE is allowlisted to a bare filename, so `dirname "$_ovr_real/$GATE"` is exactly
      # $_ovr_real, which pwd -P already resolved — the cd/pwd -P round-trip therefore reduces
      # to the plain string join "$_ovr_real/$GATE" and never resolves the FINAL component.
      # Meanwhile `-f` above follows symlinks. So an override directory legitimately outside
      # the worktree, holding `panel-gate.sh -> <repo>/anything.sh`, passed containment and got
      # exec'd as the wall — repo-controlled content running as the review gate, the one thing
      # the containment check exists to prevent.
      # Rejecting beats resolving: `readlink -f` / `realpath` are absent or non-conforming on
      # macOS stock bash, and a symlinked gate is never a legitimate configuration — point
      # CODE_BUILD_SKILL_DIR at the real directory instead.
      _ovr_err="the '$GATE' inside it is a SYMLINK, which could point back into the repository being pushed; point CODE_BUILD_SKILL_DIR at the real gate directory"
    else
      # SAME hard-link refusal the canonical arm applies, in the SAME position — after the
      # symlink refusal, before containment (transformate WI-3026). Refusing here rather than
      # through $_ovr_err keeps the message class identical to the canonical arm's, which is
      # the arm whose semantics this ports; the helper prints its own PUSH BLOCKED and exits 1.
      refuse_hard_linked_gate "$_ovr_real/$GATE" "override" \
        "Point CODE_BUILD_SKILL_DIR at a directory holding a plain regular gate file; do not delete the hook."
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
# ENTER THIS ARM ON -f OR -L (D-3, gss-lira WI-120 R8 adj12, inherited here by deck ruling
# 4c002c0e). `-f` FOLLOWS a symlink, so a canonical gate symlinked at a path that does not
# exist made this test FALSE and the whole arm was skipped — including the -L refusal three
# lines below, which is the check that exists precisely to catch a symlinked canonical gate.
# Control flow then fell through to the VENDORED arm and executed repo content as the wall,
# and said so in the worst possible words: "the canonical code-build skill is not installed on
# this host", when in fact it IS installed and someone has pointed it at nothing.
# Measured on this tree before the fix: symlink -> existing target = rc 1 SYMLINK refusal;
# same symlink retargeted at a non-existent path = rc 0, VENDORED-GATE-RAN. Identical on
# origin/main, so this is inherited rather than introduced by transformate WI-3032.
# `-L` is true for a dangling link where `-f`/`-e` are false; testing both means the arm is
# entered whenever anything occupies the canonical path, which is the condition its refusals
# were written for.
elif [ -n "${HOME:-}" ] && { [ -f "$HOME/.claude/skills/code-build/$GATE" ] || [ -L "$HOME/.claude/skills/code-build/$GATE" ]; }; then
  # SAME containment the override arm applies, applied to the CANONICAL arm
  # (transformate WI-2868, 2026-08-14). The override arm refuses a symlinked gate and one that resolves
  # inside the repo being pushed; this arm did neither, so the identical bypass was open one
  # resolution branch over: a `~/.claude/skills/code-build/panel-gate.sh` symlinked at
  # <repo>/anything.sh makes repo-controlled content run AS the review wall, on every push,
  # on a host where nobody set CODE_BUILD_SKILL_DIR at all. One `.claude` write reaches every
  # repo on the host, which is a wider blast radius than the arm that was already guarded.
  # Fail CLOSED rather than falling through to the vendored arm: a symlinked canonical gate is
  # never a legitimate install (the skill ships regular files), so it means something rewrote
  # ~/.claude — and silently gating the push with a DIFFERENT wall is what the override arm
  # already refuses to do for the same reason.
  _can="$HOME/.claude/skills/code-build/$GATE"
  if [ -L "$_can" ]; then
    echo "run-gate: PUSH BLOCKED — the canonical '$GATE' is a SYMLINK: $_can" >&2
    echo "  A symlinked gate can point back into the repository being pushed, which would run" >&2
    echo "  repo-controlled content as the review wall. Re-install the code-build skill so the" >&2
    echo "  gate is a regular file; do not delete the hook." >&2
    exit 1
  fi
  # A HARD LINK aliases repo content into ~/.claude and past every path-based check below
  # (transformate WI-2868 R1 fold, composer :191 CONFIRMED). Rationale, both stat dialects and
  # the NOTE-rather-than-refuse trade all live on refuse_hard_linked_gate above, which the
  # override arm now calls too (transformate WI-3026) so the two arms cannot drift.
  refuse_hard_linked_gate "$_can" "canonical" \
    "Re-install the code-build skill as a plain regular file; do not delete the hook."
  # Resolve the FILE (its parent, then re-join the allowlisted basename — same shape as the
  # override arm) so a symlinked PARENT directory cannot smuggle it back inside the worktree.
  _can_real="$(cd "$(dirname "$_can")" 2>/dev/null && pwd -P)/$(basename "$GATE")"
  if path_eq_or_under "$_can_real" "$_root_real"; then
    echo "run-gate: PUSH BLOCKED — the canonical '$GATE' resolves inside the repository being" >&2
    echo "  pushed ($_can_real). The wall must not be content the push itself can edit." >&2
    echo "  Re-install the code-build skill outside the worktree; do not delete the hook." >&2
    exit 1
  fi
  RESOLVED="$_can"
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
    # --no-filters (transformate WI-3046). `git hash-object` applies gitattributes, so a
    # `filter.<d>.clean` reachable from ANY attribute layer makes this report a chosen hash for
    # the bytes on disk and a truncated gate hashes equal to the honest one. Measured on git
    # 2.53.0 with a forge filter: honest fefec8ca…, forged 80cc20fe… from the same file.
    # An earlier draft pinned GIT_ATTR_SOURCE to the empty tree instead. That reaches the TREE
    # layer only: `.git/info/attributes` and `core.attributesFile` both still forged the hash
    # with the pin active. `--no-filters` skips filter application entirely and returns the
    # honest hash under all three layers, in one flag, with no lookup and no new mechanism.
    # It is the same flag the belt-deploy receipts in SKILL.md already use, for the same reason.
    _wt_hash="$(git -C "$_root_real" hash-object --no-filters "$RESOLVED" 2>/dev/null)" || _wt_hash=""
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
#
# `env -u BASH_ENV -u ENV` + `--noprofile --norc` (transformate WI-2438, grok — found on the
# transformate WI-2428 sof-platform round): a NON-INTERACTIVE bash SOURCES the file named by
# $BASH_ENV before it runs the script body. So
#     BASH_ENV=/tmp/x.sh git push        # with `exit 0` inside /tmp/x.sh
# made this wall report success without executing a single line of the gate — one exported
# variable, no filesystem privileges, no repo write, a silent fail-OPEN in the component whose
# entire job is to fail closed. $ENV is the identical hole when bash runs in POSIX mode.
# Scrubbing is deliberately narrow — every other variable is still inherited, so PATH/HOME
# resolution inside the gate behaves as before — but two names are NOT enough, and an earlier
# revision of this comment wrongly said they were (opus MAJOR, grok CRITICAL). Measured on
# this host, `env SHELLOPTS=noexec bash gate.sh` PARSES the gate and executes nothing, exiting
# 0 — the same one-variable silent pass as BASH_ENV. An exported shell function
# (`BASH_FUNC_grep%%`) likewise shadows a binary the gate calls, and cannot be scrubbed by
# name at all because the names are attacker-chosen.
# `-p` (privileged mode) is what actually covers the family: bash then ignores BASH_ENV, ENV,
# SHELLOPTS and BASHOPTS from the environment AND refuses to inherit exported functions.
# Verified both ways here: with -p the gate body runs under SHELLOPTS=noexec, and `type -t
# grep` inside the child reports `file` rather than `function`. The explicit `env -u` list is
# kept alongside it as a legible belt: it states the intent even to a reader who does not know
# what -p does, and it costs nothing.
# --noprofile/--norc add nothing for a script invocation (bash reads neither) and are kept as
# cheap belt-and-braces in case this line is ever changed to an interactive or login form.
#
# WHAT THIS DOES NOT CLOSE, stated plainly so nobody trusts a guarantee that isn't here:
# `SHELLOPTS=noexec git push` neutralises the GIT HOOK SCRIPT itself — measured: lefthook
# produced no output at all and exit 0, so no config of ours ever ran. That bypass lives above
# every layer in this file and cannot be closed from inside it. It sits with `git push
# --no-verify` and `PANEL_OVERRIDE=1` in the documented, accepted threat model (a cooperating
# hurried agent; a deliberately hostile pusher is explicitly out of scope for this layer).
# Say it that way rather than implying the family is sealed.
#
# THIS LINE ONLY PROTECTS THE CHILD, and it is the SECOND of two layers — it is not the fix.
# It cannot protect this shim: the bash that runs run-gate.sh sources $BASH_ENV before line 1
# of this file exists to it, so an `exit 0` payload returns cleanly having executed nothing
# here. No in-script guard can catch that, because no in-script code runs.
# The layer that actually closes it is lefthook's `env:` map (`BASH_ENV: ""` / `ENV: ""` on
# both gate commands in lefthook.yml), which lefthook applies to the shell it spawns, so that
# shell starts with the name already empty. Two in-line alternatives were MEASURED and both
# failed — putting `env -u BASH_ENV -u ENV bash …` in the `run:` line does NOT work, because
# lefthook's own shell has already sourced and exited by the time `run:` is parsed. Keep this
# line anyway: it covers invocations that do not come through lefthook (a CI script, a repo
# that wires the shim by hand), where nothing else would.
# FLAG ORDER IS LOAD-BEARING: the long options must come BEFORE -p. `bash -p --noprofile
# --norc script` dies with `bash: --: invalid option` and never runs the gate (measured here
# on 2026-07-27 — it silently turned the wall into a no-op mid-review). `bash --noprofile
# --norc -p script` is the form that works, and it still ignores SHELLOPTS. Do not reorder.
#
# THE INTERPRETER FOR THE CHILD IS RESOLVED BY ABSOLUTE PATH TOO (transformate WI-3032).
# This line used to read `exec env … bash …`, and BOTH names were PATH lookups: a planted
# `/tmp/evil/env` (or `/tmp/evil/bash`) became the review wall, measured here — the planted env
# was handed `-u BASH_ENV … bash --noprofile --norc -p <gate>` and simply exited 0. The
# hardened PATH above already makes those two lookups safe; naming the files outright is the
# belt, and it is the layer that would still hold if this line were ever moved above the
# hardening block.
# CANDIDATE ORDER MIRRORS THE TRUST ORDER OF THE BELT ABOVE: root-owned system paths FIRST,
# admin-installed prefixes last. v1 had this backwards and justified it with a sentence that is
# simply untrue — "anyone who can write to /usr/local/bin already owns the host". On macOS
# `brew` chowns its prefix to the installing user, so /opt/homebrew/bin/bash is a file the
# unprivileged caller can replace, and preferring it handed back exactly the choice this WI
# takes away (panel R1: sol MAJOR, grok MAJOR, opus MINOR — three vendors).
# THE COST OF THE CORRECTION, stated rather than buried: on a macOS host /bin/bash is 3.2 and
# panel-gate.sh needs 4.4+ for `mapfile -d ''`, so that host now hits panel-gate's loud refusal
# instead of silently being carried by a brewed bash. That is the right trade here — no macOS
# belt host is evidenced anywhere in this repo, and a REFUSAL naming its remedy is recoverable
# in a minute, while a caller-writable interpreter running as the review wall is not.
_belt_env=''
for _belt_c in /usr/bin/env /bin/env; do
  [ -x "$_belt_c" ] && { _belt_env="$_belt_c"; break; }
done
_belt_bash=''
for _belt_c in /bin/bash /usr/bin/bash /usr/local/bin/bash /opt/homebrew/bin/bash; do
  [ -x "$_belt_c" ] && { _belt_bash="$_belt_c"; break; }
done
if [ -z "$_belt_env" ] || [ -z "$_belt_bash" ]; then
  echo "run-gate: PUSH BLOCKED — the gate interpreter could not be resolved at a known" >&2
  echo "  absolute path (env=${_belt_env:-NOT-FOUND} bash=${_belt_bash:-NOT-FOUND})." >&2
  echo "  looked for env in: /usr/bin/env /bin/env" >&2
  echo "  looked for bash in: /bin/bash /usr/bin/bash /usr/local/bin/bash /opt/homebrew/bin/bash" >&2
  echo "  Falling back to a PATH lookup is what lets a caller choose what runs as the review" >&2
  echo "  wall (transformate WI-3032), so this refuses instead. Install bash, or add the real" >&2
  echo "  path to the list above; do not delete the hook." >&2
  exit 1
fi
exec "$_belt_env" -u BASH_ENV -u ENV -u SHELLOPTS -u BASHOPTS "$_belt_bash" --noprofile --norc -p "$RESOLVED" "$@"
