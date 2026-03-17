# API Reference

Complete reference for the Arkon API. All endpoints return JSON.

---

## Authentication

Arkon uses two types of tokens:

### Admin Token

Used for dashboard access and management endpoints. Set via `MC_ADMIN_TOKEN` in `.env.local`.

```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Or via cookie (`mc_auth`) for browser sessions. CSRF protection requires `x-csrf-token` header for state-changing requests.

### Agent Token

Used for event ingestion. Set via `MC_AGENT_TOKENS` in `.env.local` as comma-separated `tenant:token` pairs.

```
Authorization: Bearer YOUR_AGENT_TOKEN
```

### Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Description of what went wrong"
}
```

Common status codes: `401` (unauthorized), `400` (bad request), `404` (not found), `429` (rate limited), `500` (server error).

---

## Event Ingestion

### POST /api/ingest

Send events from your agents to Arkon. This is the primary integration point.

**Auth:** Agent token

**Request body:**

```typescript
{
  event_type: "message_received" | "message_sent" | "tool_call" | "error" | "cron" | "system" | "note";
  direction?: "inbound" | "outbound";
  session_key?: string;          // Group events into sessions
  channel_id?: string;           // Source channel (telegram, discord, etc.)
  sender?: string;               // Who sent the message
  content?: string;              // Message content (auto-scanned by ThreatGuard)
  metadata?: {
    model?: string;              // Model name (e.g., "claude-sonnet-4-6")
    tokens?: number;             // Total token count
    input_tokens?: number;       // Input tokens
    output_tokens?: number;      // Output tokens
    tool_name?: string;          // For tool_call events
    [key: string]: unknown;      // Any additional metadata
  };
  token_estimate?: number;       // Token count (alternative to metadata.tokens)
  timestamp?: string;            // ISO 8601 (defaults to server time)
}
```

**Response (201):**

```json
{
  "ok": true,
  "id": 12345,
  "created_at": "2026-03-17T10:30:00.000Z",
  "threat": {
    "level": "none" | "low" | "medium" | "high" | "critical",
    "classes": ["prompt_injection", "shell_command", "credential_leak"],
    "matches": 0
  }
}
```

**Rate limit:** Per-agent, returns `429` with `retryAfterSeconds: 60` when exceeded.

**Example:**

```bash
curl -X POST https://your-arkon-url/api/ingest \
  -H "Authorization: Bearer default:your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "message_sent",
    "content": "Processed customer request about billing",
    "metadata": {
      "model": "claude-sonnet-4-6",
      "tokens": 1250,
      "input_tokens": 800,
      "output_tokens": 450,
      "channel": "telegram"
    }
  }'
```

---

## Dashboard

### GET /api/dashboard/overview

Overview data for the main dashboard — agents, today's stats, tenants.

**Auth:** Admin token

**Response:**

```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "my-agent",
      "metadata": {},
      "created_at": "2026-03-01T00:00:00Z",
      "tenant_id": "default",
      "last_active": "2026-03-17T10:30:00Z",
      "events_24h": 47,
      "events_7d": 312,
      "events_total": 2100,
      "tokens_24h": 125000,
      "threats_30d": 2,
      "cost_30d": 12.50
    }
  ],
  "todayStats": [
    {
      "agent_id": "uuid",
      "tenant_id": "default",
      "received": 23,
      "sent": 24,
      "tools": 8,
      "errors": 1,
      "tokens": 62000
    }
  ],
  "tenants": [
    { "id": "default", "name": "Default", "domain": null, "plan": "free", "created_at": "2026-03-01T00:00:00Z" }
  ],
  "timestamp": "2026-03-17T10:30:00Z"
}
```

### GET /api/dashboard/trends?range=7d

Trend data over time.

**Auth:** Admin token
**Query params:** `range` (7d | 30d), `tenant_id` (optional)

### GET /api/dashboard/activity

Recent activity events.

**Auth:** Admin token

### GET /api/dashboard/agent/[id]

Detailed agent profile data — 30d cost, threats, error rate, top tools, recent sessions.

**Auth:** Admin token

---

## Security / ThreatGuard

### GET /api/security/overview

Threat events with filtering and pagination.

**Auth:** Admin token
**Query params:** `threat_class`, `severity`, `agent_id`, `limit`, `offset`, `show_dismissed` (bool)

### POST /api/events/[id]/purge

Permanently delete a threat event.

**Auth:** Admin token

**Response:**

```json
{
  "purged": true,
  "content_hash": "sha256...",
  "audit_logged": true
}
```

### POST /api/events/[id]/redact

Replace sensitive content with `[REDACTED-class]` placeholders.

**Auth:** Admin token

**Response:**

```json
{
  "redacted": true,
  "patterns_matched": ["credential_leak"],
  "redacted_count": 2
}
```

### POST /api/events/[id]/dismiss

Mark a threat as a false positive.

**Auth:** Admin token

### POST /api/events/bulk-purge

Purge multiple events at once (max 100).

**Auth:** Admin token
**Body:** `{ "ids": [1, 2, 3] }`

---

## Agents

### GET /api/admin/agents

List all registered agents.

**Auth:** Admin token

### POST /api/admin/agents

Register a new agent.

**Auth:** Admin token
**Body:**

```json
{
  "name": "my-new-agent",
  "tenant_id": "default",
  "metadata": {
    "framework": "openclaw",
    "description": "Customer support agent"
  }
}
```

### Agent Control

### POST /api/tools/agents-live/[id]/kill

Emergency stop an active agent run.

**Auth:** Admin token
**Body:** `{ "reason": "optional explanation" }`

### POST /api/tools/agents-live/[id]/pause

Pause an active agent run.

**Auth:** Admin token

### POST /api/tools/agents-live/[id]/resume

Resume a paused agent run.

**Auth:** Admin token

### GET /api/active-runs

List all currently active agent runs.

**Auth:** Admin token

---

## Costs

### GET /api/costs/overview

Cost summary — today, 7d, 30d, projections, anomalies.

**Auth:** Admin token

### GET /api/costs/by-agent

Per-agent cost breakdown.

**Auth:** Admin token
**Query params:** `range` (7d | 30d), `tenant_id`

### GET /api/costs/by-model

Per-model cost breakdown.

**Auth:** Admin token
**Query params:** `range` (7d | 30d)

---

## Workflows

### GET /api/workflows

List all workflows.

**Auth:** Admin token
**Query params:** `status` (active | draft | disabled | all), `tenant_id`

### POST /api/workflows

Create a new workflow.

**Auth:** Admin token
**Body:**

```json
{
  "name": "Health Check",
  "description": "Monitor servers every 5 minutes",
  "status": "draft",
  "trigger_type": "cron",
  "trigger_config": { "expression": "*/5 * * * *" },
  "nodes": [],
  "edges": [],
  "tenant_id": "default"
}
```

### GET /api/workflows/[id]

Get workflow details including nodes and edges.

**Auth:** Admin token

### PATCH /api/workflows/[id]

Update a workflow.

**Auth:** Admin token

### DELETE /api/workflows/[id]

Delete a workflow.

**Auth:** Admin token

### POST /api/workflows/[id]/run

Manually trigger a workflow run.

**Auth:** Admin token

### GET /api/workflows/[id]/runs

List run history for a workflow.

**Auth:** Admin token

---

## Notifications

### GET /api/notifications

List notifications for the current tenant.

**Auth:** Admin token
**Query params:** `unread_only` (bool), `limit` (max 100), `offset`

**Response:**

```json
{
  "notifications": [
    {
      "id": 1,
      "type": "threat",
      "severity": "high",
      "title": "Credential leak detected",
      "body": "Agent 'my-agent' exposed an API key in output",
      "link": "/security",
      "read": false,
      "created_at": "2026-03-17T10:30:00Z"
    }
  ],
  "unread_count": 3
}
```

### PATCH /api/notifications

Mark notifications as read.

**Auth:** Admin token
**Body:** `{ "ids": [1, 2, 3] }` or `{ "all": true }`

### GET /api/notifications/preferences

Get notification channel configuration.

**Auth:** Admin token

### PUT /api/notifications/preferences

Save notification channel configuration.

**Auth:** Admin token
**Body:**

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "config": { "bot_token": "...", "chat_id": "..." },
      "types": ["threat", "anomaly", "budget"]
    },
    "slack": {
      "enabled": false,
      "config": { "webhook_url": "" },
      "types": []
    }
  }
}
```

### POST /api/notifications/test

Send a test notification to a configured channel.

**Auth:** Admin token
**Body:** `{ "channel": "telegram" }`

---

## Infrastructure

### GET /api/infra/nodes

List all monitored infrastructure nodes.

**Auth:** Admin token

### POST /api/infra/nodes

Register a new infrastructure node.

**Auth:** Admin token

### GET /api/infra/nodes/[id]

Get node details and recent metrics.

**Auth:** Admin token

### POST /api/infra/report

Push metrics from a node (used by reporter scripts).

**Auth:** Admin token
**Body:**

```json
{
  "hostname": "my-server",
  "cpu_percent": 45.2,
  "memory_percent": 62.1,
  "disk_percent": 38,
  "services": [
    { "name": "openclaw", "port": 18789, "status": "running" }
  ]
}
```

### POST /api/infra/collect

Trigger SSH-based metric collection for remote nodes.

**Auth:** Admin token + `CRON_SECRET`

---

## Approvals

### GET /api/tools/approvals

List approval requests.

**Auth:** Admin token
**Query params:** `status` (pending | approved | rejected | expired | all), `limit`

### PATCH /api/tools/approvals/[id]

Approve or reject a request.

**Auth:** Admin token
**Body:** `{ "status": "approved" | "rejected", "reviewer_note": "optional" }`

---

## Compliance

### GET /api/compliance/audit-log

Search the audit log.

**Auth:** Admin token
**Query params:** `action`, `actor`, `resource_type`, `from`, `to`, `limit`, `offset`

### GET /api/compliance/export

Export data as CSV.

**Auth:** Admin token
**Query params:** `type` (audit_log | events), `from`, `to`, `format` (csv)

### POST /api/compliance/purge

GDPR data purge for a specific entity.

**Auth:** Admin token
**Body:** `{ "entity_type": "agent" | "tenant", "entity_id": "uuid" }`

---

## Benchmarks

### GET /api/benchmarks/overview

Performance metrics for all agents.

**Auth:** Admin token

### GET /api/benchmarks/compare

Side-by-side comparison of selected agents.

**Auth:** Admin token
**Query params:** `agents` (comma-separated IDs)

---

## MCP Gateway

### GET /api/mcp/gateway/stats

Gateway usage statistics.

**Auth:** Admin token
**Query params:** `range` (1h | 24h | 7d)

### GET /api/mcp/gateway/config

Export gateway configuration (e.g., for Claude Code integration).

**Auth:** Admin token
**Query params:** `format` (claude-code)

### POST /api/mcp/proxy/[serverId]

Proxy a request to an MCP server.

**Auth:** Admin token

---

## Client Portal

### GET /api/client/dashboard

Dashboard data for the authenticated client tenant.

**Auth:** Client token (via cookie)

### GET /api/client/agents

List agents for the authenticated client tenant.

**Auth:** Client token

### GET /api/client/costs

Cost data for the authenticated client tenant.

**Auth:** Client token

---

## Intake

### GET /api/intake

List client intake form submissions.

**Auth:** Admin token

### POST /api/intake

Submit a new intake form (public endpoint).

**Body:**

```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "priorities": "Cost reduction, better response time",
  "automation_wish": "Auto-respond to support tickets",
  "channels": ["telegram", "discord"]
}
```

---

## Setup

### GET /api/setup/status

Check if initial setup has been completed.

**Auth:** None (public)

**Response:** `{ "needs_setup": true | false }`

### POST /api/setup/complete

Complete the setup wizard.

**Auth:** None (only works when `needs_setup` is true)

---

## Health

### GET /api/health

Health check endpoint.

**Auth:** None (public)

**Response:** `{ "status": "ok", "timestamp": "2026-03-17T10:30:00Z" }`

---

## Webhook Payloads

When Arkon sends notifications to webhook channels, the payload format is:

```json
{
  "type": "threat" | "anomaly" | "approval" | "budget" | "agent_offline" | "infra_offline" | "intake" | "workflow_failure",
  "severity": "info" | "warning" | "high" | "critical",
  "title": "Short description",
  "body": "Detailed message",
  "link": "/security",
  "timestamp": "2026-03-17T10:30:00Z",
  "metadata": {}
}
```

---

## SDK Examples

### Node.js

```javascript
const ARKON_URL = "https://your-arkon-url";
const TOKEN = "default:your-agent-token";

async function sendEvent(eventType, content, metadata = {}) {
  const res = await fetch(`${ARKON_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: eventType,
      content,
      metadata,
    }),
  });
  return res.json();
}

// Usage
await sendEvent("message_sent", "Hello from my agent!", {
  model: "claude-sonnet-4-6",
  tokens: 150,
});
```

### Python

```python
import requests

ARKON_URL = "https://your-arkon-url"
TOKEN = "default:your-agent-token"

def send_event(event_type: str, content: str, metadata: dict = None):
    return requests.post(
        f"{ARKON_URL}/api/ingest",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        json={
            "event_type": event_type,
            "content": content,
            "metadata": metadata or {},
        },
    ).json()

# Usage
send_event("message_sent", "Hello from my agent!", {
    "model": "claude-sonnet-4-6",
    "tokens": 150,
})
```

### OpenClaw Configuration

Add to your `openclaw.json`:

```json
{
  "hooks": {
    "ingest_url": "https://your-arkon-url/api/ingest",
    "ingest_token": "default:your-agent-token"
  }
}
```
