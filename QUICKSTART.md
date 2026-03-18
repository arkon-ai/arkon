# Quick Start

Get Arkon running in 5 minutes. Three commands, one agent, one test event.

---

## 1. Start Arkon

```bash
git clone https://github.com/arkon-ai/arkon.git && cd arkon
cp .env.example .env
docker compose up -d
```

Edit `.env` first — at minimum set `MC_ADMIN_TOKEN` to a passphrase you'll remember.

## 2. Run the Setup Wizard

Open **http://localhost:3000** in your browser.

The wizard walks you through:
- Creating your admin account
- Registering your first agent (generates an API token)
- Choosing your integration method

Save the API token — you'll need it in the next step.

## 3. Send a Test Event

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "message_sent", "agent": "my-agent", "content": "Hello world!"}'
```

Go back to the dashboard — your event appears in the activity feed.

---

## What You'll See

After the test event:
- **Dashboard** shows 1 agent, 1 event, health score
- **Activity** page shows the event with timestamp and type badge
- **Agents** page shows your agent card with last-active status

## What's Next

| Want to... | Go to... |
|-----------|----------|
| Connect a real agent | [API.md](API.md) — full integration guide |
| Set up threat detection | ThreatGuard page — automatic, starts scanning on first event |
| Track costs | Costs page — add `tokens` and `model` to event metadata |
| Automate operations | Workflows page — start with a template |
| Monitor servers | [INSTALL.md](INSTALL.md#step-6-add-server-monitoring-optional) — push-based reporting |
| Set budget alerts | Admin Panel — configure budget limits per tenant |
| Get notifications | Settings > Notifications — add Telegram, Slack, Discord, email, or webhook |

## Adding Token & Model Data

To get cost tracking working, include `tokens` and `model` in your event metadata:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message_sent",
    "agent": "my-agent",
    "content": "Processed customer request",
    "metadata": {
      "model": "claude-sonnet-4-6",
      "tokens": 1250,
      "input_tokens": 800,
      "output_tokens": 450
    }
  }'
```

## Need Help?

- Press **?** on any page in Arkon for contextual help
- See [INSTALL.md](INSTALL.md) for the full installation guide
- See [API.md](API.md) for the complete API reference
