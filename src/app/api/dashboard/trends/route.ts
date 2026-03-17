import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");
  const range = url.searchParams.get("range") === "30d" ? 30 : 7;

  try {
    const params: (number | string)[] = [range];
    let tenantFilter = "";
    if (tenantId) {
      tenantFilter = "AND ds.tenant_id = $2";
      params.push(tenantId);
    }

    const daily = await query(
      `SELECT ds.day::text as day,
        COALESCE(SUM(ds.messages_received), 0)::int as received,
        COALESCE(SUM(ds.messages_sent), 0)::int as sent,
        COALESCE(SUM(ds.tool_calls), 0)::int as tools,
        COALESCE(SUM(ds.errors), 0)::int as errors,
        COALESCE(SUM(ds.estimated_tokens), 0)::int as tokens
      FROM daily_stats ds
      WHERE ds.day >= CURRENT_DATE - ($1 || ' days')::interval
      ${tenantFilter}
      GROUP BY ds.day
      ORDER BY ds.day`,
      params
    );

    // Fill in missing days with zeros
    const days: Record<
      string,
      { day: string; received: number; sent: number; tools: number; errors: number; tokens: number }
    > = {};
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days[key] = { day: key, received: 0, sent: 0, tools: 0, errors: 0, tokens: 0 };
    }
    for (const row of daily.rows) {
      const key = row.day.split("T")[0];
      if (days[key]) {
        days[key] = {
          day: key,
          received: row.received,
          sent: row.sent,
          tools: row.tools,
          errors: row.errors,
          tokens: row.tokens,
        };
      }
    }

    const trend = Object.values(days);

    const totals = trend.reduce(
      (acc, d) => ({
        received: acc.received + d.received,
        sent: acc.sent + d.sent,
        tools: acc.tools + d.tools,
        errors: acc.errors + d.errors,
        tokens: acc.tokens + d.tokens,
      }),
      { received: 0, sent: 0, tools: 0, errors: 0, tokens: 0 }
    );

    return NextResponse.json({ trend, totals, range, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[dashboard/trends] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
