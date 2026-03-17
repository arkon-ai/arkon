import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { sendNotification } from "@/lib/notifications";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PATCH",
  "Access-Control-Allow-Headers": "Content-Type",
};

// SEC-3: IP-based rate limiting for public intake endpoint
const ipWindows = new Map<string, { count: number; resetAt: number }>();
const INTAKE_MAX_REQUESTS = 10;  // 10 submissions per window
const INTAKE_WINDOW_MS = 60_000; // 1 minute

function checkIntakeRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = ipWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + INTAKE_WINDOW_MS };
    ipWindows.set(ip, entry);
  }
  entry.count++;
  if (entry.count > INTAKE_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: INTAKE_MAX_REQUESTS - entry.count };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipWindows) {
    if (now > entry.resetAt) ipWindows.delete(ip);
  }
}, 300_000);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  // SEC-3: Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const rateCheck = checkIntakeRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": "60" } }
    );
  }

  try {
    const body = await req.json() as Record<string, unknown>;

    const fullName = (body.full_name as string)?.trim();
    if (!fullName) {
      return NextResponse.json(
        { error: "full_name is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Honeypot field - bots fill this in, real users leave it empty
    const honeypot = (body._hp_email as string) ?? "";
    if (honeypot) {
      // Silently accept but do nothing
      return NextResponse.json(
        { ok: true, id: 0 },
        { status: 201, headers: CORS_HEADERS }
      );
    }

    const email = (body.email as string)?.trim() ?? null;
    const clientLabel = (body.client as string)?.trim() ?? null;
    const submittedAt = (body.submitted_at as string) ?? new Date().toISOString();

    const result = await query(
      `INSERT INTO intake_submissions (full_name, email, client_label, payload, submitted_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [fullName, email, clientLabel, JSON.stringify(body), submittedAt]
    );

    const id = result.rows[0]?.id as number;

    await query(
      `INSERT INTO events (agent_id, session_key, event_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        "system",
        "intake-form",
        "note",
        `New Intake Submission from ${fullName}${email ? ` (${email})` : ""}${clientLabel ? ` -- ${clientLabel}` : ""}`,
        JSON.stringify({ source: "intake-form", intake_id: id, full_name: fullName, email, client: clientLabel }),
      ]
    );

    // Notify via multi-channel dispatch engine (non-blocking)
    void sendNotification({
      tenantId: "default",
      type: "intake",
      severity: "info",
      title: `New intake submission from ${fullName}`,
      body: [
        email ? `Email: ${email}` : null,
        clientLabel ? `Client: ${clientLabel}` : null,
        body.priorities ? `Priorities: ${((body.priorities as string) ?? "").slice(0, 200)}` : null,
      ].filter(Boolean).join("\n"),
      link: "/tools/intake",
      metadata: { intakeId: id, fullName, email, client: clientLabel },
    });

    return NextResponse.json(
      { ok: true, id },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Intake POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const result = await query(
    `SELECT id, full_name, email, client_label, processed, submitted_at,
            payload,
            payload->>'priorities' as priorities,
            payload->>'automation_wish' as automation_wish,
            payload->'channels' as channels,
            payload->>'ssh_comfort' as ssh_comfort,
            payload->>'exec_access' as exec_access
     FROM intake_submissions
     ORDER BY submitted_at DESC
     LIMIT 50`
  );

  return NextResponse.json({ submissions: result.rows, count: result.rowCount });
}

export async function PATCH(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const { searchParams } = req.nextUrl;
  const id = parseInt(searchParams.get("id") ?? "0", 10);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json() as { processed?: boolean; notes?: string };
  await query(
    `UPDATE intake_submissions SET processed = COALESCE($1, processed), notes = COALESCE($2, notes) WHERE id = $3`,
    [body.processed ?? null, body.notes ?? null, id]
  );

  return NextResponse.json({ ok: true });
}
