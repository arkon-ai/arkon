import { query, type Query } from "@/lib/db";

/**
 * First-run setup lock (transformate WI-3991, deck-main RULING 4122).
 *
 * /api/setup/complete is public by necessity (no account exists yet on a first run), so it may act
 * ONLY on a genuinely fresh install: the migrations' bootstrap rows and nothing else. A fresh DB holds
 * tenant 'default' (migrations/001) and agent 'system' (migrations/024). Anything beyond that means the
 * install is in use, and an anonymous caller must not touch it. Before this lock the only guard was
 * "tenant 'default' has setup_completed", which never fires where no 'default' row exists (prod), and
 * step 'agent' re-keyed any existing agent and returned its new token.
 * Any user row also means the install is in use: no migration seeds one (FOLD 1, RULING 4174).
 */
export type SetupState = {
  /** No step may run: the install is set up or in use. */
  locked: boolean;
  /** An agent other than the bootstrap 'system' row exists (steps 'account' and 'agent' refuse). */
  hasAgents: boolean;
};

/**
 * Held for the whole setup transaction so the state check and the first-agent insert are one step: a second
 * caller waits here and then reads the committed state (FOLD 1, RULING 4174). A transaction-level advisory lock,
 * because a fresh install may lack the 'default' tenant row a row lock would need.
 */
export const SETUP_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('arkon.setup.first-run'))";

export async function readSetupState(q: Query = query): Promise<SetupState> {
  const result = await q(
    `SELECT
       (SELECT COUNT(*) FROM tenants WHERE id = 'default')::int AS default_tenants,
       (SELECT COUNT(*) FROM tenants WHERE id <> 'default' OR setup_completed = TRUE)::int AS other_tenants,
       (SELECT COUNT(*) FROM agents WHERE id <> 'system')::int AS agents,
       (SELECT COUNT(*) FROM users)::int AS users`
  );
  const row = result.rows[0] as { default_tenants: number; other_tenants: number; agents: number; users: number } | undefined;
  // fail closed: no answer is "locked"
  if (!row) return { locked: true, hasAgents: true };
  return {
    locked: row.default_tenants === 0 || row.other_tenants > 0 || row.users > 0,
    hasAgents: row.agents > 0,
  };
}
