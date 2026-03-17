# Screenshots Needed

Post-deployment task: capture screenshots from the live Arkon instance to add to documentation and in-app help. Do this after Session 12 (Docker + GitHub push) when the app is running with real or realistic demo data.

**Tip:** Use a consistent browser window size (1280x800 for desktop, 390x844 for mobile). Dark theme screenshots will match the app's aesthetic.

---

## README.md

| # | Screenshot | Description | Insert After |
|---|-----------|-------------|-------------|
| 1 | **Hero screenshot** | Full dashboard with health gauge, stats, activity — the "money shot" | Title/tagline, before "What It Does" |
| 2 | **ThreatGuard view** | Threat list with severity badges, action buttons | Optional: feature highlights section |
| 3 | **Workflow builder** | Canvas with connected nodes (use a template like Health Check) | Optional: feature highlights section |

## INSTALL.md

| # | Screenshot | Description | Insert After |
|---|-----------|-------------|-------------|
| 4 | **Setup wizard — Step 1** | Account creation form (org name, email, password) | "Step 4: Run the Setup Wizard" |
| 5 | **Setup wizard — Step 2** | Register agent form with framework picker | Step 4 |
| 6 | **Setup wizard — Step 3** | SDK install tabs (showing curl/Node/Python) | Step 4 |
| 7 | **Setup wizard — Step 4** | "Listening for first event" state + confetti celebration | Step 4 |
| 8 | **Setup wizard — Step 5** | "What's next" feature grid | Step 4 |
| 9 | **Dashboard after first event** | Dashboard showing 1 agent, 1 event, health score | "Step 5: Send Your First Event" |

## QUICKSTART.md

| # | Screenshot | Description | Insert After |
|---|-----------|-------------|-------------|
| 10 | **Setup wizard landing** | First screen of the setup wizard | "2. Run the Setup Wizard" |
| 11 | **Dashboard with test event** | Dashboard showing the test event arrived | "What You'll See" |
| 12 | **Activity feed with event** | Activity page showing the test event with type badge | "What You'll See" |

## API.md

| # | Screenshot | Description | Insert After |
|---|-----------|-------------|-------------|
| 13 | **Ingest response in terminal** | Terminal showing a successful curl + JSON response | "POST /api/ingest" example |

## In-App Help Panel (help-content.ts)

These aren't screenshots embedded in help content (the panel is text-only), but could be added as a future enhancement if we add image support to the help panel:

| # | Screenshot | Description | For Page |
|---|-----------|-------------|----------|
| 14 | **Health gauge close-up** | Gauge with hover tooltip showing breakdown | Dashboard help |
| 15 | **Agent profile page** | Full profile with tabs (Overview/Security/Performance/Activity) | Agents help |
| 16 | **ThreatGuard with actions** | Expanded threat event showing recommended actions + purge button | ThreatGuard help |
| 17 | **Cost overview** | Costs page with projections, budget bar, anomaly badges | Costs help |
| 18 | **Workflow template gallery** | Template picker with 6 templates | Workflows help |
| 19 | **Notification preferences** | Settings page with channel config and type checkboxes | Notifications help |
| 20 | **Infrastructure topology** | Node grid/graph showing server statuses | Infrastructure help |
| 21 | **MCP Gateway stats** | Gateway dashboard with request counts and latency | MCP Gateway help |
| 22 | **Approval queue** | Approvals list with pending items and action buttons | Approvals help |

## Glossary Page (/help/glossary)

| # | Screenshot | Description | Insert After |
|---|-----------|-------------|-------------|
| 23 | **Glossary search** | Glossary page with search active, showing filtered results | Optional: linked from README docs section |

## Mobile / PWA (Session 11 — if applicable)

| # | Screenshot | Description | Notes |
|---|-----------|-------------|-------|
| 24 | **Mobile dashboard** | Phone-sized dashboard view | For README or PWA section |
| 25 | **Mobile kill switch bar** | Bottom bar with agent name and STOP button | For README or PWA section |

---

## How to Capture

1. Deploy Arkon via Docker on the Dell or Hetzner EU
2. Run through the setup wizard (capture each step)
3. Register 2-3 demo agents with realistic names
4. Send ~50 test events with varied types (messages, tool calls, errors)
5. Include at least one event that triggers each threat class
6. Set a budget limit so the budget bar shows progress
7. Create a workflow from a template
8. Add 1-2 infrastructure nodes
9. Capture each screenshot at the specified browser size
10. Save to `docs/screenshots/` in the repo (add to .gitignore if large, or compress to <200KB each)

## Priority

- **Must-have (before GitHub launch):** #1 (hero), #4-9 (setup wizard), #11 (dashboard)
- **Nice-to-have:** Everything else — adds polish but the docs work without them
