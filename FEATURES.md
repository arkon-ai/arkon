# Arkon — Complete Feature List

> 160+ features across governance, monitoring, automation, compliance, and multi-tenancy.

---

## ThreatGuard — Real-Time Threat Detection (28)

### Scanning & Detection
- Credential leak detection — API keys, passwords, bearer tokens, private keys, AWS credentials
- Prompt injection detection — jailbreak attempts, instruction overrides, persona hijacking
- Dangerous command detection — destructive shell commands, reverse shells, unauthorized network access
- Per-message real-time scanning during event ingestion
- Threat severity scoring — Low / Medium / High / Critical
- Threat match detail with matched patterns in JSONB
- Multiple threat classes per event
- Pattern-based regex matching for custom threat classes

### Threat Management
- Event purge with content hash audit trail
- Content redaction — replace sensitive data with `[REDACTED-class]` tags
- False positive dismissal with pattern frequency tracking
- Bulk purge — up to 100 events per request
- Show/hide dismissed toggle
- Full audit trail with dismissed_at, dismissed_by timestamps

### ThreatGuard UI
- Threat overview page with filtering and pagination
- Severity badges — color-coded by level
- Threat class explainers — collapsible plain-English descriptions
- Per-event action menu (Purge / Redact / Dismiss)
- Threat class pills with color coding
- Recommended actions per threat type with one-click buttons
- Threat timeline with expandable details
- Agent security tab with 30-day threat summary
- Critical row styling — red borders, pulsing badges
- Integration with notification channels

---

## Kill Switch — Emergency Agent Control (9)

- Global active run banner with kill button always visible
- Per-agent emergency stop on profile pages
- Quick-kill keyboard shortcut — `Ctrl+Shift+K` from anywhere
- Kill confirmation modal with reason field
- Kill audit logging — who, what, duration, reason
- In-memory active run tracker hydrated from database at startup
- Mobile kill bar — persistent red alert above bottom nav
- Pause / resume operations separate from kill
- SSE broadcast on kill — real-time update to all connected clients

---

## Cost Tracking & Budgeting (24)

### Cost Calculation
- Per-agent cost tracking from daily_stats
- Per-model cost breakdown
- Token-based cost estimation from model_pricing table
- Multi-provider support — Anthropic, OpenAI, NVIDIA, Ollama, and more
- Separate input/output token tracking
- Real-time 24h / 7d / 30d cost display
- Daily burn rate with projected monthly spend
- Cost anomaly detection — flags 2x+ deviation from 7-day average
- Model pricing cache with effective date ranges

### Budget Management
- Daily budget limits per tenant
- Monthly budget limits per tenant
- Budget progress bars with threshold markers and projected limit-hit date
- Configurable alert thresholds (default 80%)
- Empty budget prompt when no limits set
- On-track / warning status display
- Configurable actions on exceed — alert, pause, kill

### Cost Reporting
- Cost overview API with today / 7d / 30d / projections
- Per-agent breakdown by date range
- CSV export — full cost report with per-agent rows and summary
- Cost trend charts
- Cost anomaly alert banners and badges
- Optimization tips — high-cost agents, inactivity, missing budgets

---

## Workflow Builder — Automation Engine (41)

### Framework
- Visual workflow editor — React Flow canvas with drag-and-drop
- Workflow states — Draft / Active / Disabled
- Full CRUD via API
- Required workflow descriptions
- Run history with status and step results
- Shared execution engine (`workflow-engine.ts`)
- Cron-based scheduler (`workflow-scheduler.ts`)
- Step results persistence in JSONB
- Error capture and display per run
- Run count and last_run_at tracking

### Triggers
- Cron triggers — schedule-based execution with cron expressions
- Event triggers — respond to threats, anomalies, budget alerts
- Webhook triggers — unique token per workflow for external integrations
- Manual triggers — on-demand execution via API

### Node Types
- HTTP Request — make HTTP calls with headers, body, method
- Conditional Logic — branch execution based on conditions
- Notification — send to configured channels
- Agent Command — kill, pause, resume agents
- Script — JavaScript execution with context variables

### Templates
- Health Check — server monitoring every 5 minutes
- Threat Auto-Response — auto-respond to detected threats
- Daily Cost Report — generate and send cost summaries
- Client Heartbeat — regular check-ins for client visibility
- Budget Alert — trigger actions when budget exceeded
- New Threat Alert — notify on fresh threat detection
- Template gallery with icons, descriptions, node counts
- Template installation flow — customize, save as Draft or Active
- Blank canvas option
- Node palette tooltips and config help text

### Execution
- Scheduler startup hydration from database
- Automatic cron execution
- Token injection for internal API calls
- Complete audit trail in workflow_runs table
- Duration tracking
- Error handling with retry prevention
- Webhook token generation

### Pre-Built Workflows (active on deploy)
- Health Sweep — every 5 minutes
- Threat Escalation — every 15 minutes
- DFY Heartbeat — every 30 minutes

---

## Anomaly Detection (10)

- 7-day rolling baseline per agent
- Periodic baseline recomputation via cron
- Rate spike detection (>2x baseline)
- Unexpected silence detection for active agents
- Anomaly alert storage with type, level, multiplier
- Acknowledgment to suppress repeat alerts
- Dashboard anomaly banner
- Agent card anomaly badges
- Notification dispatch for anomalies
- Anomaly analytics API

---

## Approval Workflows (8)

- Approval request creation for sensitive actions
- Approval queue with status filtering (Pending / Approved / Rejected / Expired)
- Human-in-the-loop review
- Reviewer notes on approval/rejection
- Time-based expiration
- Target channel and destination routing
- Custom metadata per approval (JSONB)
- Approval notifications

---

## Notifications & Alerts (24)

### In-App
- Notification center — bell icon dropdown in header
- 8 notification types — threat, anomaly, approval, budget, agent_offline, infra_offline, intake, workflow_failure
- 4 severity levels — info, warning, high, critical
- Mark read / mark all read
- Pagination with unread count
- Clickable links to relevant pages
- Client-side polling for real-time updates

### Channels
- Telegram — bot token integration
- Slack — webhook dispatch
- Discord — webhook support
- Email — SMTP-based
- Webhook — generic HTTP POST for custom integrations
- Per-channel configuration via API
- Per-type filtering — toggle which types go to each channel
- Channel enable/disable toggle
- Test message button per channel

### Preferences
- Notification preferences page at `/settings/notifications`
- Preferences API (GET/PUT)
- Per-channel config fields (bot_token, webhook_url, email, etc.)
- 9 notification types selectable per channel
- Database persistence

---

## Infrastructure Monitoring (22)

### Nodes
- Node registration via API
- Node metadata — name, IP, role, OS, SSH user, custom JSONB
- Online/offline status tracking
- Multiple roles — primary, failover, static, DFY client
- Multi-tenant node isolation

### Metrics
- Push-based metrics from remote nodes
- SSH-based collection from central server
- CPU utilization percentage
- Memory — used MB, total MB, percentage
- Disk — used GB, total GB, percentage
- Docker container count
- GPU utilization (when available)
- Custom service port checks
- Tailscale network latency (ms)
- TimescaleDB hypertable with 90-day retention

### UI
- Infrastructure dashboard with node list
- React Flow network topology graph
- Per-node metric cards with sparklines
- Color-coded online/offline badges
- Service status indicators
- Historical metric timeline
- Offline alert notifications

---

## Agent Profiles & Analytics (20)

### Management
- Agent registration with name, framework, metadata
- Agent list view with cards
- 4-tab detail page — Overview / Security / Performance / Activity
- Framework badges (OpenClaw, NemoClaw, Custom)
- Custom metadata (JSONB)
- Last active timestamp
- Unique agent token
- Agent role field

### Analytics
- 30-day cost metric
- 7-day event count
- 30-day threat count badge
- Error rate calculation
- Top tools bar chart
- Recent sessions with message counts
- Message volume chart
- Token usage chart
- Tool call distribution

### Status
- Active/offline status from last_active and subagent_runs
- Threat severity pills
- Recent threats list with severity badges

---

## Dashboard & Visualization (20)

### Main Dashboard
- Natural language status summary — dynamic sentence at top
- Health gauge — circular SVG, color-coded, hover breakdown
- Overview agent cards with badges and metrics
- Real-time activity feed via SSE
- 7-day trend charts (messages, tokens, costs)
- Cost summary grid — 24h / 7d / 30d / projected
- Per-agent daily stats
- ThreatGuard overview with severity badges
- Anomaly alert banner

### UX
- Renamed navigation with subtitles on all 18 items
- MetricTooltip on all stat cards
- 9 section-specific empty states
- Collapsible section descriptions with first-visit auto-expand
- Mobile dashboard with large health gauge and 2x2 tiles
- Mobile stat tile component
- Mobile-optimized recent overview API

### Charts
- Cost trend charts
- Token trend charts
- Recharts-based line/bar visualizations

---

## Mobile & PWA (14)

### Mobile
- Responsive layout with `md:hidden` breakpoints
- Dedicated mobile dashboard view
- Mobile stat tiles
- Mobile kill bar for emergency stop
- Bottom navigation
- Touch-optimized buttons

### PWA
- Service worker v3 — network-first navigation, stale-while-revalidate assets
- Web app manifest with categories and orientation
- Push notifications via VAPID / Web Push API
- Push subscription management
- Browser install prompt
- iOS meta tags — viewport-fit, theme-color, mobile-web-app-capable
- Offline support via service worker cache
- Push handler for background notifications

---

## Compliance & Audit (16)

### Audit Log
- Complete audit trail — actor, action, resource, detail, timestamp
- IP address tracking
- Query API with filtering by action, actor, resource type, date range

### Exports & Purge
- Compliance export to CSV
- Event export with filtering
- Audit log export
- Date range filtering
- GDPR data purge endpoint
- Content hash tracking on purge
- Purge audit trail

---

## MCP Gateway & Proxy (16)

### Server Management
- MCP server registration with config
- Approval workflow for servers
- Server health checks with status tracking
- Per-server gateway enable toggle
- Per-server auth tokens
- Custom config storage (JSONB)

### Proxy
- Proxy endpoint per server
- Request/response logging
- Request and response size tracking
- Duration tracking (ms)
- Error logging for failed requests

### Admin
- Gateway stats API with time range
- Gateway config export for Claude Code integration
- Per-agent server permissions
- MCP gateway management UI
- Rate limiting per server

---

## Client Portal & Multi-Tenancy (11)

### Multi-Tenant
- Complete data isolation per tenant
- tenant_id on all major tables
- Default tenant on fresh install
- Tenant creation via setup wizard
- CASCADE delete for tenant removal

### Client Portal
- Client dashboard at `/client`
- Client agents list
- Client costs view with budget
- Client shell with tenant-specific chrome
- Separate client token auth
- White-label ready (future)

---

## Help & Documentation (13)

### In-App Help
- Help panel — `?` key or icon, slide-out from right
- Contextual help per page
- Help content for 20+ pages
- Searchable glossary with 27 terms
- Alphabetical glossary grouping
- Cross-links from glossary to pages
- Section descriptions on all 13 major pages
- First-visit auto-expand with localStorage persistence

### Docs
- README.md — product overview, architecture, quick start
- INSTALL.md — prerequisites, Docker setup, troubleshooting, production deploy
- QUICKSTART.md — 5-minute getting started
- API.md — 50+ endpoints with types, examples, SDK code
- FEATURES.md — this file

---

## Onboarding & Setup (10)

- First-run detection via tenant setup_completed flag
- Public setup routes (no auth required)
- 5-step setup wizard — account, agent, SDK, first event, what's next
- Org name and admin email configuration
- Agent registration with token generation
- SDK install guide — tabs for curl, Node.js, Python, OpenClaw, NemoClaw
- Real-time event listener with "Send Test Event" button
- Confetti celebration on first event
- Feature discovery grid (6 cards linking to key pages)
- 6-step guided tooltip tour via `?tour=1`

---

## Command Palette & Shortcuts (5)

- Global command palette — `Cmd/Ctrl+K`
- Quick kill — `Ctrl+Shift+K`
- Navigation commands — jump to any page
- Action commands — kill, pause, resume
- Fuzzy search across all commands

---

## Deployment & DevOps (10)

### Docker
- 3-stage Dockerfile with minimal runtime image
- Node 20 Alpine base
- Non-root container user
- Standalone Next.js output
- docker-compose.yml with app + TimescaleDB
- Health checks in compose
- Optimized .dockerignore

### Migrations
- 6 migrations (000–005) for full schema evolution
- Automated migration runner in docker-entrypoint.sh
- Fresh install support — migration 000 creates complete schema

---

## Additional Features

### Benchmarking (10)
- Benchmark runs table per model/prompt
- Model pricing with effective dates
- Latency, token count, cost tracking per run
- Quality scoring
- Benchmark overview and comparison APIs
- Benchmarks UI with comparison charts

### Intake & Lead Management (6)
- Public intake form endpoint
- Submission storage with full_name, email, payload
- Processing status and admin notes
- Intake list API for review
- Intake notifications

### Cron & Scheduled Tasks (8)
- Cron job sync from OpenClaw/NemoClaw
- Schedule parsing with timezone support
- Execution tracking — last_run, status, errors
- Consecutive error counter
- Payload storage and next_run calculation
- Baseline recomputation cron

### Tools Hub (16)
- Central tools page at `/tools`
- Agent control, approvals, tasks, calendar, commands, crons, docs, MCP, intake
- Task reordering API
- Quick commands with status tracking and response capture

### Admin Panel (7)
- System-wide agent management
- Budget administration
- Cron job admin
- Model pricing management
- Tenant management
- Global configuration

### Activity Feed (7)
- Real-time activity stream at `/activity`
- Event type filtering (message, tool_call, error, cron, system, note)
- Threat badges in timeline
- Expandable event details
- Session grouping
- SSE live updates

### Authentication & Security (8)
- Admin token auth (Bearer)
- Per-agent token auth
- CSRF protection
- Cookie-based sessions
- bcrypt password hashing
- Cryptographic token generation
- Per-agent rate limiting
- Public endpoint allowlist

---

## By the Numbers

| Metric | Count |
|--------|-------|
| Total features | 160+ |
| API endpoints | 50+ |
| Database tables | 26 |
| Database migrations | 6 |
| React components | 38+ |
| Library modules | 15+ |
| Workflow templates | 6 |
| Notification types | 8 |
| Notification channels | 5 |
| Help pages | 20+ |
| Glossary terms | 27 |
| Page-specific empty states | 9 |

---

<p align="center">
  <a href="README.md">Back to README</a> · <a href="API.md">API Docs</a> · <a href="INSTALL.md">Install Guide</a>
</p>
