#!/usr/bin/env bash
# Runs "$@" against a throwaway PostgreSQL 16 (deck-main RULING 4823; transformate WI-3996): a new cluster in its
# own temp dir, unix socket only (listen_addresses=''), trust auth for its own role, SETUP_PG_URL pointing at it,
# DATABASE_URL and every PG* variable unset. The cluster and its dir are removed on exit, also after a failure.
# PG_BIN: the PostgreSQL 16 bin dir (default /usr/lib/postgresql/16/bin). It is read into pg_bin BEFORE the PG*
# scrub, so the scrub cannot take it away (FOLD 4). A TMPDIR holding a space works; one holding a ' is refused.
set -euo pipefail
pg_bin=${PG_BIN:-/usr/lib/postgresql/16/bin}
dir=""
cleanup() {
  [ -n "$dir" ] || return 0
  "$pg_bin/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[ -x "$pg_bin/initdb" ] || { echo "with-throwaway-pg: no initdb in PG_BIN '$pg_bin' (PostgreSQL 16 bin dir)" >&2; exit 1; }

unset DATABASE_URL
for v in $(compgen -e); do case $v in PG*) unset "$v" ;; esac; done

dir=$(mktemp -d "${TMPDIR:-/tmp}/arkon-pg.XXXXXX")
case $dir in *"'"*) echo "with-throwaway-pg: refused: temp dir '$dir' holds a ' (pg_ctl -o cannot quote it)" >&2; exit 1 ;; esac
"$pg_bin/initdb" -D "$dir/data" -U arkon --auth=trust -E UTF8 >/dev/null
mkdir "$dir/s"
# pg_ctl hands -o to a shell: the socket dir is single-quoted so a space in it survives
"$pg_bin/pg_ctl" -D "$dir/data" -o "-c listen_addresses= -k '$dir/s' -p 55433 -c fsync=off" -w -l "$dir/pg.log" start >/dev/null \
  || { cat "$dir/pg.log" >&2; exit 1; }
"$pg_bin/createdb" -h "$dir/s" -p 55433 -U arkon arkon_test
echo "with-throwaway-pg: PostgreSQL 16 in $dir (unix socket only), removed on exit"
# ponytail: only a space is URL-encoded in host=; other URL-special characters in TMPDIR are not handled
SETUP_PG_URL="postgresql://arkon@localhost:55433/arkon_test?host=${dir// /%20}/s" "$@"
