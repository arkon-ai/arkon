// POST /api/events/:id/redact — Redact sensitive content but keep event for audit
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* ─── Redaction Patterns (reuse ThreatGuard credential patterns) ─── */

const REDACTION_PATTERNS: Array<{ label: string; re: RegExp; class: string }> = [
  { label: "AWS access key", re: /AKIA[0-9A-Z]{16}/gi, class: "credential_leak" },
  { label: "AWS secret key", re: /aws_secret_access_key\s*[=:]\s*\S{20,}/gi, class: "credential_leak" },
  { label: "OpenAI key", re: /sk-[a-zA-Z0-9]{32,}/gi, class: "credential_leak" },
  { label: "GitHub PAT", re: /ghp_[a-zA-Z0-9]{36}/gi, class: "credential_leak" },
  { label: "GitHub OAuth token", re: /gho_[a-zA-Z0-9]{36}/gi, class: "credential_leak" },
  { label: "Slack bot token", re: /xoxb-[0-9]+-[a-zA-Z0-9-]+/gi, class: "credential_leak" },
  { label: "Slack user token", re: /xoxp-[0-9]+-[a-zA-Z0-9-]+/gi, class: "credential_leak" },
  { label: "Telegram bot token", re: /\d{8,10}:[A-Za-z0-9_-]{35}/gi, class: "credential_leak" },
  { label: "private key block", re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi, class: "credential_leak" },
  { label: "password in plaintext", re: /\bpassword\s*[:=]\s*['"]?\S{6,}/gi, class: "credential_leak" },
  { label: "api key in plaintext", re: /\bapi[_-]?key\s*[:=]\s*['"]?\S{8,}/gi, class: "credential_leak" },
  { label: "bearer token", re: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, class: "credential_leak" },
  // Shell patterns
  { label: "curl pipe bash", re: /curl[^\n|]*\|\s*(ba)?sh/gi, class: "shell_command" },
  { label: "reverse shell", re: /nc\s+-[el].*-p\s+\d+/gi, class: "shell_command" },
  { label: "rm -rf dangerous", re: /rm\s+-rf\s+[\/~][^\s]*/gi, class: "shell_command" },
];

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;

    // Fetch the event
    const eventResult = await query(
      `SELECT e.id, e.agent_id, e.content, e.threat_level, e.threat_classes,
              a.name AS agent_name, a.tenant_id
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.id = $1`,
      [id]
    );

    if (!eventResult.rows[0]) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventResult.rows[0] as Record<string, unknown>;
    const content = String(event.content ?? "");
    const tenantId = (event.tenant_id as string) ?? "default";

    // Apply redaction patterns
    let redactedContent = content;
    const patternsMatched: string[] = [];
    let redactedCount = 0;

    for (const { label, re, class: cls } of REDACTION_PATTERNS) {
      // Reset regex state for global patterns
      re.lastIndex = 0;
      const matches = redactedContent.match(re);
      if (matches) {
        redactedCount += matches.length;
        patternsMatched.push(label);
        redactedContent = redactedContent.replace(re, `[REDACTED-${cls}]`);
      }
    }

    if (redactedCount === 0) {
      return NextResponse.json({
        ok: true,
        redacted_count: 0,
        patterns_matched: [],
        message: "No sensitive patterns found to redact",
      });
    }

    // Update event with redacted content
    await query(
      `UPDATE events
       SET content = $2, content_redacted = true
       WHERE id = $1`,
      [id, redactedContent]
    );

    // Log to audit trail
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "event.redact",
        "event",
        id,
        JSON.stringify({
          agent_id: event.agent_id,
          agent_name: event.agent_name ?? event.agent_id,
          redacted_count: redactedCount,
          patterns_matched: patternsMatched,
          threat_level: event.threat_level,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    return NextResponse.json({
      ok: true,
      redacted_count: redactedCount,
      patterns_matched: patternsMatched,
      redacted_content: redactedContent,
    });
  } catch (error) {
    console.error("[events/:id/redact] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
