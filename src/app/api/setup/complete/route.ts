import { type NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { withTransaction, type Query } from "@/lib/db";
import { readSetupState, SETUP_LOCK_SQL } from "@/lib/setup-guard";

/**
 * POST /api/setup/complete — public endpoint (only works if setup not yet done)
 * Handles setup wizard completion:
 *   - Step 1: Create org (update tenant name + admin email)
 *   - Step 2: Register first agent, return token
 *   - Step 5: Mark setup as complete
 */
export async function POST(req: NextRequest) {
  const body: SetupBody = await req.json().catch(() => ({}));
  // The state check and the step's write run in ONE transaction under ONE advisory lock (FOLD 1, RULING 4174):
  // two anonymous callers cannot both pass the "no agents yet" check and both mint a first-agent token.
  return withTransaction(async (q) => {
    await q(SETUP_LOCK_SQL);
    return runStep(q, body);
  });
}

type SetupBody = {
  step?: string;
  org_name?: string;
  admin_email?: string;
  agent_name?: string;
  agent_description?: string;
  framework?: string;
};

async function runStep(q: Query, body: SetupBody) {
  // Guard (transformate WI-3991, RULING 4122): this endpoint is public, so it acts ONLY on a fresh
  // install (src/lib/setup-guard.ts). The old guard read only tenant 'default'.setup_completed and
  // never fired where that row is absent.
  const state = await readSetupState(q);
  if (state.locked) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 }
    );
  }

  const { step } = body;

  // Creating the org or the first agent is for an install with no agents yet; once one exists, an
  // anonymous caller must not add, rename or re-key agents.
  if ((step === "account" || step === "agent") && state.hasAgents) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 }
    );
  }

  switch (step) {
    case "account": {
      const { org_name, admin_email } = body;
      if (!org_name || !admin_email) {
        return NextResponse.json(
          { error: "org_name and admin_email are required" },
          { status: 400 }
        );
      }
      await q(
        "UPDATE tenants SET name = $1, admin_email = $2, updated_at = NOW() WHERE id = 'default'",
        [org_name.trim(), admin_email.trim()]
      );
      return NextResponse.json({ ok: true });
    }

    case "agent": {
      const { agent_name, agent_description, framework } = body;
      if (!agent_name) {
        return NextResponse.json(
          { error: "agent_name is required" },
          { status: 400 }
        );
      }

      // Generate a secure API token
      const token = `ark_${randomBytes(24).toString("hex")}`;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const agentId = agent_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Never update, nor return a token for, an EXISTING agent id (the takeover path).
      const existing = await q(
        "SELECT id FROM agents WHERE id = $1 LIMIT 1",
        [agentId]
      );
      if ((existing.rows as Array<{ id: string }>).length > 0) {
        return NextResponse.json(
          { error: "Agent already exists" },
          { status: 409 }
        );
      }
      await q(
        `INSERT INTO agents (id, name, description, framework, token_hash, tenant_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'default', NOW(), NOW())`,
        [
          agentId,
          agent_name.trim(),
          (agent_description || "").trim(),
          (framework || "custom").toLowerCase(),
          tokenHash,
        ]
      );
      return NextResponse.json({
        ok: true,
        agent_id: agentId,
        token,
      });
    }

    case "complete": {
      await q(
        "UPDATE tenants SET setup_completed = TRUE, updated_at = NOW() WHERE id = 'default'"
      );
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }
}
