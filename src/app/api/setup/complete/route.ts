import { type NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { query } from "@/lib/db";

/**
 * POST /api/setup/complete — public endpoint (only works if setup not yet done)
 * Handles setup wizard completion:
 *   - Step 1: Create org (update tenant name + admin email)
 *   - Step 2: Register first agent, return token
 *   - Step 5: Mark setup as complete
 */
export async function POST(req: NextRequest) {
  // Guard: only allow if setup is not yet complete
  const check = await query(
    "SELECT setup_completed FROM tenants WHERE id = 'default' LIMIT 1"
  );
  const rows = check.rows as Array<{ setup_completed: boolean }>;
  if (rows.length > 0 && rows[0].setup_completed) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { step } = body;

  switch (step) {
    case "account": {
      const { org_name, admin_email } = body;
      if (!org_name || !admin_email) {
        return NextResponse.json(
          { error: "org_name and admin_email are required" },
          { status: 400 }
        );
      }
      await query(
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

      // Check if agent already exists (idempotent for retry)
      const existing = await query(
        "SELECT id FROM agents WHERE id = $1 LIMIT 1",
        [agentId]
      );
      if ((existing.rows as Array<{ id: string }>).length > 0) {
        // Update the token
        await query(
          "UPDATE agents SET token_hash = $1, name = $2, description = $3, framework = $4, updated_at = NOW() WHERE id = $5",
          [
            tokenHash,
            agent_name.trim(),
            (agent_description || "").trim(),
            (framework || "custom").toLowerCase(),
            agentId,
          ]
        );
      } else {
        await query(
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
      }

      return NextResponse.json({
        ok: true,
        agent_id: agentId,
        token,
      });
    }

    case "complete": {
      await query(
        "UPDATE tenants SET setup_completed = TRUE, updated_at = NOW() WHERE id = 'default'"
      );
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }
}
