# Installation Guide

Complete guide to installing and running Arkon.

---

## Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Docker + Docker Compose | v20+ / v2+ | Latest |
| RAM | 2 GB | 4 GB |
| Disk | 5 GB | 20 GB |
| Ports | 3000 (app), 5432 (database) | — |

No Node.js, PostgreSQL, or other dependencies needed — Docker handles everything.

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/arkon.git
cd arkon
```

## Step 2: Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your preferred editor. The required variables are:

```bash
# Database (Docker Compose default — change the password)
DATABASE_URL=postgresql://arkon:your-secure-password@db:5432/arkon

# Admin login passphrase (min 12 characters)
MC_ADMIN_TOKEN=your-admin-passphrase-here

# Agent authentication tokens (tenant:token pairs)
MC_AGENT_TOKENS=default:your-agent-token-here

# Base URL (where Arkon is accessible)
ARKON_BASE_URL=http://localhost:3000

# Session encryption (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here
NEXTAUTH_URL=http://localhost:3000
```

See [.env.example](.env.example) for all optional variables (notifications, gateway integration, infrastructure monitoring).

## Step 3: Start Arkon

```bash
docker compose up -d
```

This starts:
- **arkon** — The application on port 3000
- **db** — TimescaleDB (PostgreSQL) on port 5432

Migrations run automatically on first startup.

## Step 4: Run the Setup Wizard

Open `http://localhost:3000` in your browser. The setup wizard guides you through:

1. **Create your account** — Organization name, admin email, password
2. **Register your first agent** — Name, framework, generates an API token
3. **Install the SDK** — Copy-paste integration code for your framework
4. **Send your first event** — Test button or curl command
5. **Explore** — Quick links to key features

## Step 5: Send Your First Event

Using the token generated during setup:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message_sent",
    "agent": "my-agent",
    "content": "Hello from my agent!",
    "metadata": { "model": "claude-sonnet-4-6", "tokens": 150 }
  }'
```

You should see the event appear on the dashboard within seconds.

## Step 6: Add Server Monitoring (Optional)

To monitor your servers' health, register nodes in Arkon and set up metric reporting.

**Option A: Push-based (recommended)**

Create a reporter script on each server that POSTs metrics to `/api/infra/report`:

```bash
#!/bin/bash
curl -s -X POST https://your-arkon-url/api/infra/report \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"$(hostname)\",
    \"cpu_percent\": $(cat /proc/loadavg | awk '{print $1 * 100 / '$(nproc)'}'),
    \"memory_percent\": $(free | awk '/Mem:/ {printf "%.1f", $3/$2 * 100}'),
    \"disk_percent\": $(df / | awk 'NR==2 {print $5}' | tr -d '%')
  }"
```

Schedule with cron: `* * * * * /path/to/reporter.sh`

**Option B: SSH-based collection**

Configure `MC_CRON_KEY_PATH` in `.env.local` and register nodes with SSH credentials via the API.

---

## Troubleshooting

### Port 3000 or 5432 already in use

```bash
# Check what's using the port
lsof -i :3000
# Or change the port in .env.local and docker-compose.yml
```

### Database connection refused

```bash
# Check the database container is running
docker compose ps
docker compose logs db
```

### Migrations failed

```bash
# Re-run migrations
docker compose exec arkon npx tsx scripts/migrate.ts
# Or check the logs
docker compose logs arkon | grep -i migration
```

### Events not appearing on dashboard

1. Check the agent token matches one in `MC_AGENT_TOKENS`
2. Check the ingest endpoint is reachable: `curl http://localhost:3000/api/health`
3. Check application logs: `docker compose logs arkon -f`

### Reset everything

```bash
docker compose down -v  # removes containers AND database volume
docker compose up -d    # fresh start
```

---

## Upgrading

```bash
git pull origin main
docker compose build
docker compose up -d
```

Migrations run automatically on startup. Your data is preserved in the database volume.

---

## Production Deployment

For production use:

1. **Use a strong `MC_ADMIN_TOKEN`** — this is your login password
2. **Generate a real `NEXTAUTH_SECRET`** — `openssl rand -base64 32`
3. **Put Arkon behind a reverse proxy** (Nginx, Caddy, Traefik) with TLS
4. **Set `ARKON_BASE_URL`** to your public HTTPS URL
5. **Back up the database** — schedule `pg_dump` via cron
6. **Monitor disk usage** — TimescaleDB hypertables grow with event volume

Example Nginx config:

```nginx
server {
    listen 443 ssl;
    server_name arkon.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/arkon.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/arkon.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
