import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

/**
 * POST /api/push — Save a push subscription
 * DELETE /api/push — Remove a push subscription
 */

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();
    const { subscription, tenantId } = body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      tenantId?: string;
    };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Default tenant
    const tid = tenantId || "default";

    await query(
      `INSERT INTO push_subscriptions (tenant_id, endpoint, keys_p256dh, keys_auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         keys_p256dh = EXCLUDED.keys_p256dh,
         keys_auth = EXCLUDED.keys_auth,
         user_agent = EXCLUDED.user_agent`,
      [tid, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, req.headers.get("user-agent") ?? null]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push] Error saving subscription:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();
    const { endpoint } = body as { endpoint: string };

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push] Error removing subscription:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
