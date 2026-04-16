#!/usr/bin/env python3
"""Backfill memory_facts from work_entries using Gemini embeddings.

One-shot script. Run on Hetzner EU (has env + network to mc-postgres).
Reads work_entries, embeds title+body via gemini-embedding-001 @ outputDim=1536 (MRL),
inserts into memory_facts with kind='entry-seed' + source_entry_id lineage.

Usage:
  # Inside ~/arkon on Hetzner EU, env loaded from ~/arkon/.env.local
  set -a; source ~/arkon/.env.local; set +a
  python3 scripts/backfill-memory-v2.py --limit 1     # smoke test
  python3 scripts/backfill-memory-v2.py --limit 100   # real batch

Safety:
  - Idempotent via NOT EXISTS check on (source_entry_id, kind='entry-seed')
  - Reads only; deletes nothing
  - --dry-run prints plan without hitting Gemini or writing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from typing import Any

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("[fatal] psycopg2 not installed. run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(2)

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
MODEL = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
DIM = int(os.environ.get("GEMINI_EMBEDDING_DIM", "1536"))

if not DB_URL:
    print("[fatal] DATABASE_URL or POSTGRES_URL must be set", file=sys.stderr)
    sys.exit(2)
if not GOOGLE_API_KEY:
    print("[fatal] GOOGLE_API_KEY must be set", file=sys.stderr)
    sys.exit(2)


def gemini_embed(text: str) -> list[float]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent?key={GOOGLE_API_KEY}"
    payload = json.dumps({"content": {"parts": [{"text": text}]}, "outputDimensionality": DIM}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
                values = data.get("embedding", {}).get("values") or []
                if len(values) != DIM:
                    raise RuntimeError(f"unexpected dim {len(values)} != {DIM}")
                return values
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(0.5 * (2 ** attempt))
                continue
            raise
        except Exception:
            if attempt < 3:
                time.sleep(0.5 * (2 ** attempt))
                continue
            raise
    raise RuntimeError("gemini_embed: exhausted retries")


def build_text(entry: dict[str, Any]) -> str:
    title = (entry.get("title") or "").strip()
    body = (entry.get("body_md") or "").strip()
    parts = [p for p in (title, body) if p]
    return "\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100, help="Max entries to backfill")
    ap.add_argument("--dry-run", action="store_true", help="Plan only; no Gemini calls, no writes")
    ap.add_argument("--tenant", default="transformate", help="Tenant filter")
    args = ap.parse_args()

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Find work_entries that don't yet have an 'entry-seed' memory_fact
    cur.execute(
        """
        SELECT e.id, e.tenant_id, e.owner_agent, e.title, e.body_md, e.category, e.tags, e.related_project, e.created_at
          FROM work_entries e
         WHERE e.tenant_id = %s
           AND NOT EXISTS (
               SELECT 1 FROM memory_facts f
                WHERE f.source_entry_id = e.id
                  AND f.kind = 'entry-seed'
           )
         ORDER BY e.created_at ASC
         LIMIT %s
        """,
        (args.tenant, args.limit),
    )
    pending = cur.fetchall()
    print(f"[plan] {len(pending)} entries to backfill (tenant={args.tenant}, limit={args.limit})")
    if not pending:
        print("[plan] nothing to do")
        return 0
    for e in pending[:5]:
        print(f"  - id={e['id']}  owner={e['owner_agent']}  title={(e['title'] or '')[:60]}")
    if len(pending) > 5:
        print(f"  ... and {len(pending) - 5} more")

    if args.dry_run:
        print("[dry-run] exiting without writes")
        return 0

    inserted = 0
    skipped = 0
    errors = 0
    for e in pending:
        text = build_text(e)
        if not text:
            skipped += 1
            continue
        try:
            vec = gemini_embed(text)
        except Exception as ex:
            print(f"[error] id={e['id']}: {ex}", file=sys.stderr)
            errors += 1
            continue
        meta = {
            "original_category": e.get("category"),
            "tags": e.get("tags") or [],
            "related_project": e.get("related_project"),
            "backfill_source": "work_entries",
            "backfill_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        cur.execute(
            """
            INSERT INTO memory_facts
              (tenant_id, owner_agent, kind, body, metadata, source_entry_id,
               embedding_provider, embedding_dim, embedding)
            VALUES
              (%s, %s, 'entry-seed', %s, %s::jsonb, %s,
               'gemini', %s, %s::vector)
            """,
            (
                e["tenant_id"],
                e["owner_agent"],
                text,
                json.dumps(meta),
                e["id"],
                DIM,
                "[" + ",".join(str(x) for x in vec) + "]",
            ),
        )
        inserted += 1
        if inserted % 10 == 0:
            conn.commit()
            print(f"  [progress] {inserted}/{len(pending)} inserted")
    conn.commit()
    cur.close()
    conn.close()
    print(f"[done] inserted={inserted}  skipped(empty)={skipped}  errors={errors}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
