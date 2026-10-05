#!/usr/bin/env bash
# Runs "$@" against a throwaway PostgreSQL 16 (deck-main RULING 4823; transformate WI-3996): a new cluster in its
# own temp dir, unix socket only (listen_addresses=''), trust auth for its own role, SETUP_PG_URL pointing at it,
# DATABASE_URL and every PG* variable unset. The cluster and its dir are removed on exit, also after a failure.
# PG_BIN: the PostgreSQL 16 bin dir (default /usr/lib/postgresql/16/bin).
set -euo pipefail
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
dir=$(mktemp -d "${TMPDIR:-/tmp}/arkon-pg.XXXXXX")
cleanup() {
  "$PG_BIN/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

unset DATABASE_URL
for v in $(compgen -e); do case $v in PG*) unset "$v" ;; esac; done

"$PG_BIN/initdb" -D "$dir/data" -U arkon --auth=trust -E UTF8 >/dev/null
mkdir "$dir/s"
"$PG_BIN/pg_ctl" -D "$dir/data" -o "-c listen_addresses= -k $dir/s -p 55433 -c fsync=off" -w -l "$dir/pg.log" start >/dev/null \
  || { cat "$dir/pg.log" >&2; exit 1; }
"$PG_BIN/createdb" -h "$dir/s" -p 55433 -U arkon arkon_test
echo "with-throwaway-pg: PostgreSQL 16 in $dir (unix socket only), removed on exit"
SETUP_PG_URL="postgresql://arkon@localhost:55433/arkon_test?host=$dir/s" "$@"
