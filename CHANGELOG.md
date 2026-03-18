# Changelog

All notable changes to Arkon are documented in this file.

---

## [0.1.1] — 2026-03-18

### Brand: Revert Foundation Colors (`1f9a7dd`)
- Reverted all 8 foundation/background colors back to original deep-navy palette across 42 files
  - `#0A0A0C` → `#050510` (background/void)
  - `#1A1A22` → `#0d0d1a` (card/surface)
  - `#22222E` → `#111827` (elevated)
  - `#2E2E3A` → `#1a2a4a` (border)
  - `#3E3E4A` → `#2a3a5a` (border hover)
  - `#E4E4ED` → `#e2e8f0` (text primary)
  - `#8888A0` → `#64748b` (text dim)
  - `#555566` → `#475569` (text muted)
- Chart secondary series colors (`#8888A0`) preserved in analytics and chart components
- CSS variables in `globals.css`, `layout.tsx` theme-color/toaster/fallback all reverted
- Accent `#00D47E`, purple removal, brand assets, meta tags, and README unchanged

### Security: Remove Infrastructure Screenshot
- Deleted `docs/screenshots/20-infrastructure.png` — contained exposed server IPs

---

## [0.1.0] — 2026-03-17

**The Productization Release** — 38 commits, 96 files changed, 10,650 lines added.

Transforms the internal Mission Control tool into Arkon, a standalone, market-ready AI Operations Control Plane. Every feature below was built, deployed to live infrastructure, and verified working.

### Pre-Work: Foundation

#### Remove Hardcoded Infrastructure (`810fff3`)
- Removed all Tailscale IPs, personal references, and hardcoded domain names
- Infrastructure monitoring is now fully database-driven — add/remove servers via API, no code changes needed
- All `mc.transformateai.com` references replaced with `ARKON_BASE_URL` env var
- Migration seed data uses generic `default` tenant instead of personal tenants
- Created comprehensive `.env.example` with 16+ documented variables

### Session 1: Kill Switch & Agent Emergency Controls (`966853a`)
- **Active run tracker** (`src/lib/active-runs.ts`) — in-memory store hydrated from `subagent_runs` table at startup
- **Enhanced kill API** — reason parameter, audit log entry, SSE broadcast, duration tracking
- **Pause/resume endpoints** — `POST /api/tools/agents-live/[id]/pause` and `/resume`
- **ActiveRunBanner** — persistent banner below header when any agent is active, live timer, kill button
- **KillConfirmModal** — confirmation dialog with reason field, shared by all kill entry points
- **QuickKillDialog** — `Ctrl+Shift+K` keyboard shortcut, also in command palette as "Kill Active Agent"
- **Per-agent controls** — kill/pause buttons on agent list cards and agent detail page header
- **Audit log** — kill/pause/resume filters and badge styling

### Session 2: Threat Message Purge (`e047db3`)
- **Purge endpoint** (`POST /api/events/[id]/purge`) — deletes event, logs content hash for audit
- **Redact endpoint** (`POST /api/events/[id]/redact`) — replaces credentials/keys with `[REDACTED-class]`, preserves event for audit trail
- **Dismiss endpoint** (`POST /api/events/[id]/dismiss`) — false positive marking with pattern frequency tracking
- **Bulk purge** (`POST /api/events/bulk-purge`) — purge up to 100 events at once
- **Migration 002** — `dismissed`, `dismissed_at`, `dismissed_by`, `content_redacted` columns + indexes
- **ThreatGuard UI** — per-event 3-dot action menu, checkbox selection with bulk purge toolbar, confirmation modals, toast feedback, show-dismissed toggle, REDACTED/DISMISSED badges

### Session 3: Agent Profile Page (`00dbf18`)
- **Agent detail API** — 30-day cost, threat summary with recent threats, error rate, top tools, last active
- **Overview API** — `threats_30d` and `cost_30d` per agent for list cards
- **Profile page** — 4-tab layout: Overview / Security / Performance / Activity
  - Overview: identity card, message volume chart, recent sessions
  - Security: threat pills, recent threats list with severity badges, link to ThreatGuard
  - Performance: cost chart, token chart, tool calls chart, top tools bar, error rate
  - Activity: event timeline with type filters, threat badges, expandable detail
- **Header** — active/offline status, framework badge (OpenClaw/NemoClaw/Custom), role badge
- **Quick stats row** — cost 30d, messages 7d, threats 30d, error rate, last active
- **Agent list cards** — framework badge, threat count badge, cost metric, active run indicator

### Session 4: Dashboard Clarity & Navigation (`1007b39`)
- **Natural-language status summary** — dynamic sentence at dashboard top summarizing agents, events, threats, cost
- **Health score** (`src/lib/health-score.ts`) — composite 0–100 from four equally-weighted dimensions: agent uptime (25), threat level (25), budget status (25), infrastructure health (25)
- **HealthGauge** — circular SVG gauge with colour coding (green/amber/red) and hover breakdown tooltips
- **MetricTooltip** — reusable `(i)` icon component on all dashboard stat cards
- **EmptyState** — compact variant + 9 section-specific empty states (ThreatGuard, Costs, Workflows, Activity, Infrastructure, Approvals, MCP Gateway, Intake, Agents)
- **Navigation** — renamed sidebar items (Systems→Infrastructure, Analytics→Anomaly Detection), added subtitles to all 18 nav items
- **SectionDescription** — collapsible page description headers with first-visit auto-expand, localStorage persistence. Added to 8 major pages.

### Session 5: Onboarding & Setup Wizard (`f5cee45`)
- **First-run detection** — `/api/setup/status` checks for any tenant with `setup_completed = TRUE`
- **Middleware** — `/setup` and `/api/setup/*` accessible without authentication
- **App-shell** — bypasses shell chrome for `/setup`, redirects to setup if first-run detected
- **Migration 003** — `setup_completed` boolean + `admin_email` columns on tenants table
- **5-step setup wizard** at `/setup`:
  1. Account creation — org name, admin email, password
  2. Register first agent — name, description, framework picker → generates `ark_*` API token
  3. SDK install guide — tabs for curl, Node.js, Python, OpenClaw, NemoClaw with copy buttons
  4. First event listener — real-time polling, "Send Test Event" button, confetti celebration
  5. What's next — 6-card feature grid linking to key pages
- **Guided tour** — 6-step tooltip tour activated by `?tour=1` URL param, targets dashboard, health gauge, agents, ThreatGuard, costs, workflows

### Session 6: ThreatGuard UX Polish (`1318797`)
- **Threat class explainers** — collapsible "What do these mean?" panel with plain-English descriptions for prompt injection, shell commands, and credential leaks
- **Recommended actions per threat** — numbered action list in expanded event view:
  - Credential leak → "Purge immediately" button, rotate credential, check unauthorized use
  - Shell command → review intent, check execution, add to deny list
  - Prompt injection → review source, check behaviour, strengthen guardrails
- **One-click contextual buttons** — Purge (credential_leak), Details (shell_command), Dismiss (prompt_injection)
- **Visual improvements** — critical rows get red border/background tint, pulsing severity badge, coloured threat class pills

### Session 7: Workflow Builder UX & Templates (`0f33112`)
- **Template gallery** — 6 starter workflows: Health Check, Threat Auto-Response, Daily Cost Report, Client Heartbeat, Budget Alert, New Threat Alert
- **Template cards** — icon, description, trigger badge, node count, inline preview
- **Installation flow** — customize name/description, customization hints, Save as Draft / Activate Now
- **Blank Canvas** option for starting from scratch
- **Node palette tooltips** — hover descriptions for all 5 node types
- **Node config panel help text** — explains each node type's purpose and capabilities
- **Workflow description** — now required on creation, shown on list view

### Session 8: Cost Tracking Enhancements (`9a4a05f`)
- **Projected monthly spend** — calculated from daily burn rate, compared to last month (% delta)
- **5-column summary grid** with separate projected monthly card
- **Budget progress bars** — threshold marker, projected limit-hit date, on-track message
- **Empty budget prompt** when no limits are set
- **Cost anomaly detection** — flags agents spending 2x+ their 7-day average
- **AnomalyAlert banner** on overview, anomaly badges on per-agent cards
- **Optimization tips** — collapsible section: high cost/msg, inactive agents, missing budgets, threshold warnings
- **CSV export** — full cost report download with per-agent rows and summary

### Session 9: Notifications & Alert System (`6e10173`–`6613c9e`, 4 commits)
- **Migration 004** — `notifications` + `notification_preferences` tables
- **In-app notification centre** — bell icon in header, dropdown panel, type icons, severity dots, mark read/all read
- **NotificationDropdown** — self-managing component with polling, no prop drilling
- **GET/PATCH /api/notifications** — list and mark read
- **Notification preferences page** at `/settings/notifications` — 5 channels (Telegram, Slack, Discord, Email, Webhook), per-channel enable toggle, config fields, per-type checkboxes (9 notification types), save + test buttons
- **POST /api/notifications/test** — sends real test message to configured channel
- **GET/PUT /api/notifications/preferences** — CRUD for channel config
- **Notification dispatch engine** (`src/lib/notifications.ts`) — `sendNotification()` always creates in-app notification, fans out to enabled channels with type-aware filtering
- **Replaced all hardcoded Telegram alerts** in anomaly-detector, budget-check, intake route
- **8 notification types wired**: threat, anomaly, approval, budget, agent_offline, infra_offline, intake, workflow_failure
- **Settings nav item** added to sidebar Configure group

### Session 10: In-App Help & Documentation (7 commits, `138a997`–`aa1eed9`)
- **Help panel** (`src/components/help-panel.tsx`) — `?` key or help icon → slide-out from right, contextual per page
- **Help content map** — 20+ pages with descriptions, key concepts, common tasks, and tips
- **Searchable glossary** at `/help/glossary` — 27 terms, alphabetical grouping, links to relevant pages
- **SectionDescription** added to all 13 major pages
- **README.md** — product-focused with features, quick start, architecture, agent integration
- **INSTALL.md** — prerequisites, Docker setup, troubleshooting, production deploy with Nginx
- **QUICKSTART.md** — 5-minute, 3-command getting started
- **API.md** — 50+ endpoints with TypeScript types, request/response examples, webhook payloads, Node.js/Python/OpenClaw SDK examples

### Session 11: Mobile & PWA (4 commits, `56bf7e2`–`50778af`)
- **Mobile dashboard** — simplified `md:hidden` layout with large health gauge, 2×2 stat tiles, alerts, recent events, agents
- **MobileDashboardView + MobileStatTile** components, new `/api/dashboard/overview/recent` endpoint
- **HealthGauge** — `size="lg"` prop for mobile
- **Mobile kill switch** — persistent red bar above bottom nav when active run exists (MobileKillBar)
- **PWA** — enhanced manifest (categories, orientation), service worker v3 (network-first navigation, stale-while-revalidate assets, push handler)
- **Migration 005** — `push_subscriptions` table
- **Push notifications** — `/api/push` subscription endpoint, notification engine dispatches web push for critical/warning, VAPID key support, auto-cleanup of expired subscriptions
- **iOS meta tags** — viewport-fit=cover, theme-color, mobile-web-app-capable

### Session 12: Dockerize & Packaging (4 commits, `f822504`–`7a757ce`)
- **Dockerfile** — 3-stage build (deps → build → runtime), `node:20-alpine`, non-root user, standalone Next.js output
- **.dockerignore** — excludes node_modules, .next, .env, tests, docs, git
- **docker-compose.yml** — `arkon` app (port 3000) + `arkon-db` TimescaleDB pg15, managed pgdata volume, health checks on both services
- **docker-entrypoint.sh** — validates `DATABASE_URL`, retries DB connection up to 30s, runs migrations, starts app
- **Migration 000** — base schema creating all 26 tables for fresh installs
- **.env.example** — added `POSTGRES_USER`/`PASSWORD`/`DB` for Docker Compose

### Deploy Fixes (7 commits, `5c83242`–`88d2b28`)

Type errors and runtime issues discovered during live deployment to Hetzner EU:

- `NodeConfig.label` → `.id` in infra collect notification title
- `SectionDescription` — notifications page used wrong prop pattern (title/description instead of children)
- `useRef()` — added missing initial value for React 19 strict mode
- `MobileDashboardView` — fixed breakdown type to match `HealthResult` interface
- `OverviewAgent` interface — added missing `threats_30d` and `cost_30d` fields
- `Uint8Array` → `BufferSource` cast for push subscription
- `web-push` type declaration — prevents build failure when module is not installed
- Setup status API — checks any tenant with `setup_completed=TRUE`, not just hardcoded `default`

---

## Database Migrations

| # | File | Description |
|---|------|-------------|
| 000 | `000_base_schema.sql` | All 26 core tables (fresh install only) |
| 001 | `001_create_tenants.sql` | Multi-tenancy: tenants table, tenant_id on agents/daily_stats/sessions |
| 002 | `002_event_threat_actions.sql` | Event dismissal and content redaction columns |
| 003 | `003_setup_wizard.sql` | setup_completed + admin_email on tenants |
| 004 | `004_notifications.sql` | notifications + notification_preferences tables |
| 005 | `005_push_subscriptions.sql` | push_subscriptions table for web push |

---

## Stats

- **38 commits** across 12 sessions + pre-work
- **96 files changed** — 10,650 lines added, 1,005 lines removed
- **50+ API endpoints**
- **26 database tables**
- **5 numbered migrations** (+ base schema)
- **27 glossary terms**
- **6 workflow templates**
- **9 notification types** across 5 channels
- **13 pages** with section descriptions
- **20+ pages** with contextual help content
