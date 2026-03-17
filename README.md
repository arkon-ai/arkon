# Arkon

**The AI Operations Control Plane.**

Monitor, govern, and manage your AI agents from a single dashboard. Best with [OpenClaw](https://openclaw.io) and NemoClaw. Works with anything.

---

## What It Does

Arkon gives solo AI builders and small agencies complete visibility, cost control, and governance over every agent they run — without the enterprise overhead.

- **Real-Time Dashboard** — Health score, event stream, cost tracking, and agent status at a glance
- **ThreatGuard** — Scans every message for prompt injection, dangerous commands, and credential leaks. Purge, redact, or dismiss with one click
- **Kill Switch** — Emergency stop any agent instantly via UI, keyboard shortcut (Ctrl+Shift+K), or API
- **Cost Tracking** — Per-agent, per-model spend with budget limits, projections, anomaly detection, and optimization tips
- **Workflow Automation** — Visual node-based builder with 6 starter templates (health checks, threat response, cost reports, and more)
- **Approval Workflows** — Require human approval before agents perform sensitive actions
- **Infrastructure Monitoring** — Server health, CPU/memory/disk metrics, service status for every node
- **MCP Gateway** — Proxy and secure your agents' access to external tools via the Model Context Protocol
- **Multi-Tenant** — Isolate data per client or organization. Built for agencies running multiple client agents
- **Notifications** — Telegram, Slack, Discord, email, webhook, and in-app. Per-channel, per-type configuration

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/your-org/arkon.git
cd arkon
cp .env.example .env.local
# Edit .env.local with your database URL and admin token

# 2. Start with Docker
docker compose up -d

# 3. Open the setup wizard
open http://localhost:3000
```

The setup wizard walks you through creating your account, registering your first agent, and sending your first event.

See [INSTALL.md](INSTALL.md) for detailed installation instructions or [QUICKSTART.md](QUICKSTART.md) for the 5-minute version.

## Architecture

- **Framework:** Next.js 16 (App Router)
- **Database:** TimescaleDB (PostgreSQL with time-series extensions)
- **Auth:** Token-based (admin token + per-agent ingest tokens)
- **Deployment:** Docker Compose (single `docker compose up`)

```
src/
├── app/           # Next.js pages and API routes (50+ endpoints)
├── components/    # React components (dashboard, agents, security, workflows, etc.)
├── lib/           # Core logic (workflow engine, threat scanner, anomaly detector, notifications)
└── hooks/         # React hooks (active runs, polling)
migrations/        # SQL migration files (TimescaleDB)
```

## Agent Integration

Arkon works with any agent framework. Send events to the ingest API:

```bash
curl -X POST https://your-arkon-url/api/ingest \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message_sent",
    "agent": "my-agent",
    "content": "Hello from my agent!",
    "metadata": { "model": "claude-sonnet-4-6", "tokens": 150 }
  }'
```

Native integrations:
- **OpenClaw** — Add the ingest URL and token to `openclaw.json`
- **NemoClaw** — Same configuration pattern as OpenClaw
- **Custom** — Any framework that can make HTTP POST requests

See [API.md](API.md) for the full API reference.

## Configuration

All configuration is via environment variables. See [.env.example](.env.example) for every variable with descriptions and defaults.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL/TimescaleDB connection string |
| `MC_ADMIN_TOKEN` | Yes | Admin passphrase for login and API access |
| `MC_AGENT_TOKENS` | Yes | Comma-separated `tenant:token` pairs for agent auth |
| `ARKON_BASE_URL` | Yes | Public URL where Arkon is accessible |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |

## Documentation

- [INSTALL.md](INSTALL.md) — Full installation guide with prerequisites and troubleshooting
- [QUICKSTART.md](QUICKSTART.md) — Get running in 5 minutes
- [API.md](API.md) — Complete API reference with types and examples
- In-app help — Press `?` on any page for contextual help
- [Glossary](/help/glossary) — Searchable reference for all Arkon terminology

## License

MIT

## Contributing

Contributions are welcome. Please open an issue to discuss your idea before submitting a PR.
