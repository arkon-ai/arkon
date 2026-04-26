#!/usr/bin/env node
/**
 * memory_facts decay sweep — WI-076.
 *
 * Recomputes `memory_facts.decay_score` per row using the half-life formula:
 *
 *   score = importance × 0.5 ^ (age_days / half_life_days)
 *
 * Implementation lives server-side as `memory_facts_apply_decay()` (see
 * migrations/022_memory_facts_decay_index.sql). This script is the cron
 * driver — it picks up the env, calls the SQL function, snapshots
 * before/after, optionally prunes stale rows, and writes one audit_log row
 * per run.
 *
 * v1 of memory_facts has no dedicated `importance` column — pinned rows act
 * as importance=2.0 (immune to decay) and everything else as importance=1.0.
 * The SQL function encapsulates that mapping so callers don't need to know.
 *
 * Apply (destructive prune) is double-guarded:
 *   --apply CLI flag  AND  MEMORY_DECAY_MODE=apply env var
 * Without both, no DELETE statement is issued; the script only logs the
 * candidate list. The decay-score UPDATE always runs (it's not destructive).
 *
 * Logs go to stdout AND `/home/warden/logs/memory-decay.log` (override via
 * MEMORY_DECAY_LOG_PATH). Set MEMORY_DECAY_LOG_PATH= (empty) to disable file
 * logging — useful for tests.
 *
 * Usage:
 *   node scripts/memory-decay.mjs                    # dry-run, default 30d
 *   MEMORY_DECAY_MODE=apply node scripts/memory-decay.mjs --apply
 *   MEMORY_HALF_LIFE_DAYS=60 node scripts/memory-decay.mjs
 *
 * Env:
 *   DATABASE_URL              postgres connection string (required)
 *   MEMORY_HALF_LIFE_DAYS     half-life in days (default 30)
 *   MEMORY_DECAY_THRESHOLD    prune-below score (default 0.05)
 *   MEMORY_DECAY_MODE         "apply" to enable destructive prune; anything
 *                             else (incl. unset) is dry-run for prune
 *   MEMORY_DECAY_LOG_PATH     log file path (default
 *                             /home/warden/logs/memory-decay.log; empty to
 *                             disable file logging)
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const HALF_LIFE_DAYS = Number(process.env.MEMORY_HALF_LIFE_DAYS || 30);
const PRUNE_THRESHOLD = Number(process.env.MEMORY_DECAY_THRESHOLD || 0.05);
const MODE_ENV = (process.env.MEMORY_DECAY_MODE || 'dry-run').toLowerCase();
const APPLY_FLAG = process.argv.includes('--apply');
const DESTRUCTIVE = APPLY_FLAG && MODE_ENV === 'apply';

const LOG_PATH =
  process.env.MEMORY_DECAY_LOG_PATH === undefined
    ? '/home/warden/logs/memory-decay.log'
    : process.env.MEMORY_DECAY_LOG_PATH;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[memory-decay] DATABASE_URL is required');
  process.exit(2);
}

if (!Number.isFinite(HALF_LIFE_DAYS) || HALF_LIFE_DAYS <= 0) {
  console.error(`[memory-decay] MEMORY_HALF_LIFE_DAYS invalid: ${HALF_LIFE_DAYS}`);
  process.exit(2);
}

if (!Number.isFinite(PRUNE_THRESHOLD) || PRUNE_THRESHOLD <= 0) {
  console.error(`[memory-decay] MEMORY_DECAY_THRESHOLD invalid: ${PRUNE_THRESHOLD}`);
  process.exit(2);
}

// File-log handle (best-effort: if the dir is missing, fall back to stdout-only).
let logStream = null;
let logStreamClosed = false;
if (LOG_PATH) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
    // Attach an error listener so write-after-end / disk errors don't become
    // uncaught exceptions and clobber the real stack trace.
    logStream.on('error', (err) => {
      logStreamClosed = true;
      console.error(`[memory-decay] log stream error: ${err.message}`);
    });
  } catch (err) {
    console.error(`[memory-decay] could not open log file ${LOG_PATH}: ${err.message}`);
  }
}

const ts = () => new Date().toISOString();
const log = (msg) => {
  const line = `${ts()} [memory-decay] ${msg}`;
  console.log(line);
  if (logStream && !logStreamClosed) logStream.write(line + '\n');
};

async function countPruneCandidates(client) {
  // Total count of would-prune rows. Always run regardless of mode so dry-run
  // surfaces the real candidate count (uncapped — matches the unbounded
  // DELETE in prune()).
  const { rows } = await client.query(
    `SELECT count(*)::int AS n
       FROM memory_facts
      WHERE pinned = false
        AND decay_score < $1`,
    [PRUNE_THRESHOLD],
  );
  return rows[0].n;
}

async function prune(client) {
  const { rowCount } = await client.query(
    `DELETE FROM memory_facts
       WHERE pinned = false
         AND decay_score < $1`,
    [PRUNE_THRESHOLD],
  );
  return rowCount;
}

async function sampleRows(client, limit = 5) {
  const { rows } = await client.query(
    `SELECT id, tenant_id, kind, pinned,
            round(decay_score::numeric, 6) AS decay_score,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, created_at))) / 86400.0 AS age_days
       FROM memory_facts
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

async function writeAudit(client, detail) {
  // audit_log columns: actor, action, resource_type, resource_id, detail, ip_address, tenant_id
  await client.query(
    `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, tenant_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      'cron:memory-decay',
      DESTRUCTIVE ? 'memory_facts.decay.apply' : 'memory_facts.decay.dry_run',
      'memory_facts',
      'all',
      JSON.stringify(detail),
      'system',
    ],
  );
}

async function main() {
  const startedAt = Date.now();
  log(`mode=${DESTRUCTIVE ? 'APPLY' : 'dry-run'} half_life_days=${HALF_LIFE_DAYS} threshold=${PRUNE_THRESHOLD}`);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  let rowsUpdated = 0;
  let pruneCandidates = 0;
  let rowsDeleted = 0;
  let rowCountBefore = 0;
  let rowCountAfter = 0;
  let scoreSummary = null;
  let beforeSample = [];
  let afterSample = [];

  try {
    const before = await client.query('SELECT count(*)::int AS n FROM memory_facts');
    rowCountBefore = before.rows[0].n;
    log(`row_count_before=${rowCountBefore}`);

    beforeSample = await sampleRows(client, 5);
    log(`before_sample=${JSON.stringify(beforeSample)}`);

    // Wrap decay UPDATE, optional prune DELETE, and audit INSERT in a single
    // transaction so the audit row can't be lost mid-flight (e.g. crash
    // between the apply and the audit write would otherwise leave decayed
    // state with no record of why).
    let txOpen = false;
    try {
      await client.query('BEGIN');
      txOpen = true;

      // Set-based sweep — see migrations/022_memory_facts_decay_index.sql.
      const sweep = await client.query(
        'SELECT memory_facts_apply_decay($1::double precision, NULL) AS updated',
        [HALF_LIFE_DAYS],
      );
      rowsUpdated = sweep.rows[0].updated;
      log(`rows_updated=${rowsUpdated}`);

      const summary = await client.query(`
        SELECT round(min(decay_score)::numeric, 6) AS min,
               round(avg(decay_score)::numeric, 6) AS avg,
               round(max(decay_score)::numeric, 6) AS max,
               count(*) FILTER (WHERE pinned)::int AS pinned_count
          FROM memory_facts
      `);
      scoreSummary = summary.rows[0];
      log(`distribution min=${scoreSummary.min} avg=${scoreSummary.avg} max=${scoreSummary.max} pinned=${scoreSummary.pinned_count}`);

      afterSample = await sampleRows(client, 5);
      log(`after_sample=${JSON.stringify(afterSample)}`);

      pruneCandidates = await countPruneCandidates(client);
      log(`prune_candidates=${pruneCandidates} (threshold=${PRUNE_THRESHOLD})`);

      if (DESTRUCTIVE) {
        rowsDeleted = await prune(client);
        log(`pruned=${rowsDeleted}`);
      } else {
        log(`prune_dry_run: would delete ${pruneCandidates} rows`);
      }

      const after = await client.query('SELECT count(*)::int AS n FROM memory_facts');
      rowCountAfter = after.rows[0].n;
      log(`row_count_after=${rowCountAfter}`);

      const elapsedMs = Date.now() - startedAt;
      await writeAudit(client, {
        mode: DESTRUCTIVE ? 'apply' : 'dry-run',
        half_life_days: HALF_LIFE_DAYS,
        prune_threshold: PRUNE_THRESHOLD,
        rows_updated: rowsUpdated,
        prune_candidates: pruneCandidates,
        rows_deleted: rowsDeleted,
        row_count_before: rowCountBefore,
        row_count_after: rowCountAfter,
        score_distribution: scoreSummary,
        before_sample: beforeSample,
        after_sample: afterSample,
        elapsed_ms: elapsedMs,
      });

      await client.query('COMMIT');
      txOpen = false;
      log(`audit_log row written; elapsed_ms=${elapsedMs}`);
    } catch (txErr) {
      if (txOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error(`[memory-decay] rollback failed: ${rollbackErr.message}`);
        }
      }
      throw txErr;
    }
  } finally {
    await client.end();
    // NOTE: do not close logStream here — the .catch() handler below still
    // needs to write the fatal-error line. Stream is closed by the success
    // path below or the catch handler.
  }
}

main()
  .then(() => {
    if (logStream && !logStreamClosed) {
      logStreamClosed = true;
      logStream.end();
    }
  })
  .catch((err) => {
    const line = `${ts()} [memory-decay] fatal: ${err.message}`;
    console.error(line);
    if (logStream && !logStreamClosed) {
      logStream.write(line + '\n');
      logStreamClosed = true;
      logStream.end();
    }
    process.exit(1);
  });
