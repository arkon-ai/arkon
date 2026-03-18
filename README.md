<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/readme-banner-light.png">
    <img alt="Arkon — AI Governance Platform" src=".github/assets/readme-banner-dark.png" width="100%">
  </picture>
</p>

<p align="center">
  <strong>AI Governance Platform</strong> — Monitor your agents. Detect threats. Track costs. Build workflows.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="https://arkonhq.com">Website</a> ·
  <a href="https://demo.arkonhq.com">Live Demo</a> ·
  <a href="INSTALL.md">Full Install Guide</a> ·
  <a href="API.md">API Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/version-0.1.0-green" alt="Version" />
  <img src="https://img.shields.io/badge/docker-compose%20up-green" alt="Docker" />
</p>

---

## Why I Built This

I was running AI agents via OpenClaw — building automations, managing infrastructure, doing real work. And things kept going wrong.

My agent leaked API credentials five times. Not because I forgot to set rules — I made it rule number one, in bold, in the system prompt, in the soul file, everywhere I could put it. Didn't matter. Passwords, API keys, tokens — they kept showing up in chat logs and channel messages. I had an agent with access to a database containing thousands of people's personal records and payment details. One leaked credential and all of that is exposed.

Then my agent burned through $20 of API credits in thirty minutes using a model I explicitly told her not to use. I had no alert, no spending cap, no visibility — I found out after the money was gone. Another time, she started modifying config files I told her not to touch. I told her to stop. She didn't stop. She broke the environment. I spent two hours fixing what took her thirty seconds to destroy.

I went looking for tools to solve this. What I found: enterprise platforms at $50,000/year with per-seat pricing, developer tracing tools that show you what happened but can't stop anything, and observability dashboards that are read-only — you watch the fire, but nobody hands you the extinguisher.

So I built Arkon. A kill switch I can hit the moment an agent goes rogue. Threat detection that catches credential leaks before they leave the dashboard. Cost tracking that alerts me before the bill spirals. Workflow automation that responds to incidents without waiting for me to notice. Everything I needed, in one place, at a price that doesn't require a Fortune 500 budget.

**I'm not the only one with this problem.** If you're running AI agents in production — for yourself, for clients, for your team — you've felt some version of this. Arkon is the tool I wish existed when I started.

<p align="center">
  <img src="docs/assets/arkon-dashboard.png" alt="Arkon Dashboard" width="800" />
  <br/>
  <em>The Arkon dashboard — real-time governance, threat detection, and cost control for your entire AI operation.</em>
</p>

---

## Features

### ThreatGuard — Real-Time Threat Detection

Every message your agents send and receive is scanned for three classes of threats:

- **Credential leaks** — API keys, passwords, bearer tokens, private keys, AWS credentials
- **Prompt injection** — jailbreak attempts, instruction overrides, persona hijacking
- **Dangerous commands** — destructive shell commands, reverse shells, unauthorized network access

Threats are scored by severity (low — critical), surfaced instantly, and can trigger automated responses via workflows. This isn't after-the-fact logging — it's real-time interception.

### Kill Switch — Stop Your Agent in One Click

When your agent is going off the rails, you need a big red button — not an API call buried in documentation.

- **Global banner** — persistent alert when any agent has an active run, with a kill button always visible
- **Per-agent emergency stop** — prominent on every agent's profile page
- **Keyboard shortcut** — `Ctrl+Shift+K` to open the quick-kill dialog from anywhere
- **Confirmation + audit** — every kill is logged with who stopped it, what was running, and why

### Cost Tracking — Know What You're Spending Before It's Too Late

Track spending across every agent, every model, every provider — in real time.

- **Daily burn rate** with projected monthly spend
- **Per-agent and per-model breakdown** — see exactly which agent is costing what
- **Budget limits** — set daily and monthly caps per tenant
- **Cost anomaly alerts** — get notified when spending deviates from baseline
- **Multi-provider support** — Anthropic, OpenAI, NVIDIA Nemotron, Ollama, and more

### Workflow Builder — Automate Your Response

A visual workflow builder with drag-and-drop nodes. No code required.

- **Cron triggers** — run on a schedule (health checks every 5 minutes, daily cost reports)
- **Event triggers** — respond to threats, anomalies, or budget alerts automatically
- **Webhook triggers** — integrate with any external system
- **Built-in actions** — HTTP requests, conditional logic, notifications, agent commands
- **Templates** — pre-built workflows for common scenarios (threat auto-response, health sweeps, budget alerts)

**No other tool in this category has a workflow builder.** Not LangSmith. Not Langfuse. Not Helicone. Not Portkey. This is unique to Arkon.

### Everything Else

| Feature | What It Does |
|---------|-------------|
| **Anomaly Detection** | Rolling 7-day baselines per agent. Alerts on rate spikes and unexpected silence. |
| **Approval Workflows** | Human-in-the-loop for sensitive agent operations. Queue, review, approve/reject. |
| **MCP Gateway Proxy** | Register, proxy, and log traffic to MCP servers. Per-server auth and rate limiting. |
| **Multi-Tenant** | Manage multiple clients from one instance. Per-tenant budgets, agents, and data isolation. |
| **Audit Log** | Complete event history — who did what, when, to which agent. GDPR purge included. |
| **Compliance Export** | Export events, costs, agents, and audit logs to JSON/CSV with date filters. |
| **Benchmarking** | Compare agent performance across models — tokens, latency, cost efficiency. |
| **Infrastructure Monitoring** | Server health, Docker status, GPU metrics, network latency — all from the dashboard. |
| **Live Activity Feed** | Real-time event stream via SSE. See what your agents are doing right now. |
| **160+ features total** | [See the full feature list](FEATURES.md) |

---

## Quick Start

Three commands. Two minutes. A running Arkon instance.

```bash
git clone https://github.com/arkon-ai/arkon.git
cd arkon
docker compose up -d
```

Open `http://localhost:3000` — the setup wizard walks you through creating your account, registering your first agent, and sending your first event.

**Send a test event:**

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -d '{
    "event_type": "message_sent",
    "agent": "my-agent",
    "content": "Hello from my first agent",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 150
  }'
```

See it appear on your dashboard in real time.

**Requirements:** Docker and 2GB RAM. That's it.

For the full installation guide with environment configuration, troubleshooting, and upgrade instructions, see [INSTALL.md](INSTALL.md).

---

## Best With OpenClaw & NemoClaw. Works With Anything.

Arkon was built on OpenClaw and has first-class integration with the OpenClaw/NemoClaw ecosystem. If you're running NemoClaw (NVIDIA's enterprise wrapper around OpenClaw, announced at GTC 2026), Arkon is the governance layer that sits on top.

**But Arkon is not locked to any framework.** Anything that can send an HTTP POST can report to Arkon:

| Framework | Integration |
|-----------|-------------|
| **OpenClaw / NemoClaw** | Native — built-in gateway integration, agent control, health checks |
| **CrewAI** | SDK — `pip install arkon-sdk` (coming soon) |
| **AutoGen** | SDK — `pip install arkon-sdk` (coming soon) |
| **LangChain / LangGraph** | SDK — `npm install @arkon/sdk` (coming soon) |
| **Custom agents** | REST API — `POST /api/ingest` with any HTTP client |
| **n8n / Make / Zapier** | Webhook triggers — send events via HTTP node |

---

## Why Arkon Instead of X?

| | Arkon | RunLayer | LangSmith | Langfuse | Helicone | Portkey |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Agent monitoring | Y | Y | Y | Y | Y | Y |
| Threat detection | Y | - | - | - | - | partial |
| **Workflow builder** | **Y** | - | - | - | - | - |
| **Infrastructure monitoring** | **Y** | - | - | - | - | - |
| **Multi-tenant** | **Y** | - | - | - | - | - |
| Approval workflows | Y | - | - | - | - | - |
| Budget limits | Y | - | - | - | - | partial |
| MCP proxy | Y | - | - | - | - | - |
| Anomaly detection | Y | - | - | - | partial | - |
| Self-hosted option | Y | - | - | Y | - | - |
| **No per-seat pricing** | **Y** | - | - | - | - | - |
| **Price** | **Free / $97mo** | **$50K+/yr** | **$39/seat/mo** | **Free / $29mo** | **$79/mo** | **5.5% fee** |

---

## Pricing

### Self-Hosted: Free Forever

The full Arkon platform, self-hosted, MIT licensed. 3 agents, 1 server, all features. No feature gates — just usage limits that grow with you.

```bash
docker compose up -d
```

### Arkon Cloud

For teams that want managed hosting, more capacity, and zero ops overhead.

| | Operator | Agency |
|---|---|---|
| **Price** | $97/mo | $297/mo |
| **Users** | Unlimited — no per-seat pricing | Unlimited |
| **Agents** | 20 | Unlimited |
| **Servers** | 5 | Unlimited |
| **Multi-tenant** | - | Y |
| **Client portal** | - | Y |
| **White-label** | - | Y |
| **Support** | Email | Priority |

**Founding members:** The first 10 customers get the Operator tier at **$47/month, locked in forever.** [Claim your spot](https://arkonhq.com/founding)

**Migration Intensive:** Want help configuring your instance and migrating from your current setup? **$497 one-time** — a 60-minute call where we set everything up together. [Book yours](https://arkonhq.com/migrate)

---

## Architecture

```
+--------------------------------------------------+
|                  Arkon Dashboard                  |
|   (Next.js · React · Recharts · React Flow)      |
+--------------------------------------------------+
|                   API Layer                       |
|  Ingest · ThreatGuard · Workflows · MCP Proxy    |
+--------------------------------------------------+
|                  TimescaleDB                      |
|  Events · Agents · Costs · Audit · Baselines     |
+--------------------------------------------------+
        ^               ^               ^
        |               |               |
   +----+-----+   +-----+-------+   +---+-----+
   | Agent 1  |   |   Agent 2   |   | Agent N |
   | OpenClaw |   |  NemoClaw   |   | Custom  |
   +----------+   +-------------+   +---------+
```

---

## Contributing

Arkon is open source and contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Where we want contributions:**
- Integrations and SDK adapters (CrewAI, AutoGen, LangChain)
- ThreatGuard detection patterns
- Workflow node types
- Documentation and tutorials
- Bug reports and testing across environments

**Where we maintain control:**
- Core governance engine
- Billing and multi-tenant architecture
- Security-critical code paths

---

## Community

- [GitHub Discussions](https://github.com/arkon-ai/arkon/discussions) — questions, ideas, show & tell
- [Issues](https://github.com/arkon-ai/arkon/issues) — bug reports and feature requests
- [arkonhq.com](https://arkonhq.com) — website and cloud platform
- [@arkonhq](https://x.com/arkonhq) — updates and AI ops insights

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>From the Greek <em>arche</em> — the original authority, the source from which order flows.</strong>
</p>

<p align="center">
  Built by <a href="https://x.com/brynnbendixen">Brynn Bendixen</a> — because guardrails in a prompt aren't governance.
</p>
