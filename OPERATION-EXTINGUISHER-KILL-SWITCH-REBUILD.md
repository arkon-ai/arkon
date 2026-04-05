# Arkon Agent Kill Switch — Complete Rebuild Plan

> **Codename:** Operation Extinguisher
> **Priority:** CRITICAL — Must complete before live deployment
> **Prerequisite:** Current testing phase must finish first
> **Date:** 2026-04-04

---

## Context: What We Found and Why This Matters

During live testing on 2026-04-04, Brynn attempted to activate the Arkon kill switch to stop Lumina (the OpenCLAW agent on HOFMI-EU-OPEN) from downloading unauthorized content. **The kill switch appeared to succeed in the UI but did absolutely nothing to the agent.** Lumina kept running.

Investigation revealed **three compounding failures**:

### Failure 1: Environment Variable Name Mismatch
The kill-agent route (`src/app/api/gateway/kill-agent/route.ts`) reads `process.env.GATEWAY_URL` and `process.env.GATEWAY_TOKEN`. But `.env.local` on Hetzner EU defines `NEXT_PUBLIC_GATEWAY_URL` and `GATEWAY_AUTH_TOKEN`. Both resolve to empty strings at runtime, causing the code to silently fall into "event-only" mode — it logs a kill event to the database (making the UI show success) but never contacts the gateway.

### Failure 2: Non-Existent HTTP Endpoint
Even with correct env vars, the route sends `POST {GATEWAY_URL}/api/system-event`. This endpoint **returns 404** on the OpenCLAW gateway. It does not exist. OpenCLAW v2026.4.2 uses **WebSocket RPC** for control operations, not REST HTTP.

### Failure 3: No Agent Framework Registry
The `agents` table stores human operators (Brynn, Matt), not AI agents. There's no `framework` column, no `gateway_url` per agent, no adapter pattern. The kill-agent route has one hardcoded path for all agents with no way to know HOW to kill different agent types. The code comment says "For agents on other frameworks (NemoClaw, Hermes, etc.), sends a generic kill event" — but this is aspirational, not implemented.

### Impact
**The kill switch — Arkon's flagship safety feature — has never actually killed an agent.** All 6 kill attempts in the audit log show `kill_method: "event-only"`. This is a critical gap that must be fixed before any live deployment, especially before Paperclip integration where Arkon governs multiple autonomous agent companies.

---

## Research Findings: How Each Agent Framework Handles Termination

### OpenCLAW (v2026.4.2) — ACTIVE, PRIMARY
- **Protocol:** WebSocket RPC via `openclaw gateway call`
- **Kill Method:** `sessions.abort` (requires session `key`) — aborts the active run on a specific session
- **Reset Method:** `sessions.reset` (requires session `key`) — wipes session history
- **List Method:** `sessions.list` — returns all sessions with status, keys, token counts
- **Nuclear Option:** `openclaw gateway stop` (CLI) or `systemctl --user stop openclaw-gateway` (systemd)
- **Limitations:** `sessions.abort` is per-session only. No `abort-all` or agent-level bulk abort. To kill everything, must iterate all running sessions or stop the entire gateway.
- **Confirmed Working:** Tested `sessions.abort` on HOFMI-EU-OPEN — returns `{"ok": true, "status": "no-active-run"}` for idle sessions.

### NemoClaw (NVIDIA Enterprise) — ROADMAP
- **Protocol:** CLI-based (`nemoclaw stop`)
- **Kill Method:** CLI command, falls back to PID kill if unclean shutdown
- **Status:** Alpha software, APIs may change
- **Arkon Integration:** Likely similar to OpenCLAW (same underlying framework)

### CrewAI — ROADMAP
- **Protocol:** Python SDK only
- **Kill Method:** **No built-in kill API.** Only `max_execution_time` timeout on agents. `future.cancel()` only works if task hasn't started.
- **Critical Issue:** Orphaned threads — timeout doesn't actually stop running threads
- **Arkon Integration:** Would need a wrapper service with a REST kill endpoint, or process-level SIGTERM

### AutoGen (Microsoft) — ROADMAP
- **Protocol:** Python SDK with `TerminationCondition` classes
- **Kill Method:** `ExternalTermination` — programmatic control from outside the run. Also `MaxMessageTermination`, `TokenUsageTermination`, `TimeoutTermination`
- **Status:** Most robust termination system of all frameworks
- **Arkon Integration:** Would need a sidecar/wrapper that exposes ExternalTermination via REST

### LangChain / LangGraph — ROADMAP
- **Protocol:** Python/JavaScript SDK
- **Kill Method:** `interrupt()` — pauses execution, returns control to caller. Requires checkpointer.
- **Critical Issue:** `runs.cancel` from SDK throws interrupt but does NOT actually cancel the run. True cancellation is an open feature request.
- **Arkon Integration:** Would need interrupt + state cleanup, not a clean kill

### n8n — ACTIVE (on Hetzner EU)
- **Protocol:** REST API
- **Kill Method:** `/api/v1/executions/{id}/stop` exists but requires cookie auth (not API key). Deletion works but is destructive.
- **Status:** Stop/cancel API is incomplete and unreliable
- **Arkon Integration:** Would need cookie-based auth or direct Docker exec

### Paperclip — PLANNED (next major integration)
- **Protocol:** REST API + Adapter system
- **Architecture:** Arkon sits ABOVE Paperclip as governance layer
- **Agent Statuses:** active, idle, running, error, paused, **terminated**
- **Board Oversight:** Humans can pause/resume/terminate agents
- **Adapters:** 10 built-in (Claude Local, Codex Local, OpenClaw Gateway, Hermes, Process, HTTP, etc.)
- **Kill Mechanism:** Not explicitly documented. Process adapter has `timeoutSec`. No explicit abort/cancel/kill hooks in adapter interface.
- **Key Insight:** Paperclip is an orchestrator, not a runtime. Killing a Paperclip agent means: (1) set agent status to "terminated" via Paperclip API, (2) kill the underlying runtime via the appropriate adapter protocol (OpenCLAW, Claude CLI, process SIGTERM, etc.)
- **Arkon Integration:** Must implement a TWO-LAYER kill: Paperclip agent termination + underlying runtime kill

---

## Documentation Plan

### NEW: `AGENT-FRAMEWORK-INTEGRATION.md` (project root)
The **single source of truth** for how Arkon connects to every agent framework. Sections:

1. **Framework Registry** — table of all supported frameworks with protocol, kill method, auth requirements
2. **Kill Protocol Reference** — exact commands/API calls per framework
3. **Configuration Requirements** — env vars, tokens, URLs needed per framework
4. **Agent Registration Checklist** — MANDATORY before adding any new agent type:
   - [ ] How does the agent start?
   - [ ] How does the agent stop gracefully?
   - [ ] How do you force-kill the agent?
   - [ ] What protocol does it speak? (REST, WebSocket, CLI, SDK)
   - [ ] What authentication is needed?
   - [ ] How do you verify the agent is actually dead?
   - [ ] What is the nuclear fallback?
5. **Paperclip Two-Layer Kill** — how to terminate orchestrated agents (Paperclip status + runtime kill)
6. **Adapter Pattern** — how the kill-agent route selects the right protocol per framework

### UPDATE: `API.md`
- Add `POST /api/gateway/kill-agent` documentation (currently missing entirely)
- Add `POST /api/gateway/stop-gateway` documentation (new endpoint)
- Document env var requirements: `GATEWAY_URL`, `GATEWAY_TOKEN` (server-side, NOT `NEXT_PUBLIC_*`)
- Document failure modes and what "event-only" means
- Add framework-specific notes

### UPDATE: `FEATURES.md`
- Expand Kill Switch section from 9 features to include:
  - Framework-aware kill routing (OpenCLAW WS-RPC, NemoClaw CLI, Process SIGTERM, HTTP callback)
  - Nuclear gateway stop (full service shutdown)
  - Two-layer Paperclip kill (orchestrator + runtime)
  - Kill verification (confirm agent is actually dead)
  - Bulk kill-all across all sessions

### UPDATE: `ARKON-TESTING-PLAN.md`
- Add new section: **Framework Integration Tests**
  - Test kill switch actually reaches the gateway (not just "event-only")
  - Test each framework's kill protocol end-to-end
  - Test kill verification (is the agent actually dead after kill?)
  - Test fallback to gateway stop when session abort fails
  - Test two-layer Paperclip kill chain

### UPDATE: `README.md`
- Update Kill Switch section to mention framework-aware routing
- Add note about nuclear gateway stop capability

---

## Build Phases

### Phase 1: Fix Environment Variables (Server Config — No Git)
**What:** Add `GATEWAY_URL` and `GATEWAY_TOKEN` to `~/arkon/.env.local` on Hetzner EU
**Where:** SSH to `brynn@100.108.57.71`, edit `~/arkon/.env.local`
**Why:** Immediate unblock — makes the kill route actually attempt the gateway call
**Files:** `~/arkon/.env.local` (server-only, not in git)

### Phase 2: Rewrite Kill-Agent Route (Code Change — Git Required)
**What:** Replace the REST HTTP `/api/system-event` call with WebSocket RPC `sessions.abort`
**Where:** `src/app/api/gateway/kill-agent/route.ts`
**Why:** The current endpoint doesn't exist on OpenCLAW. The gateway uses WebSocket RPC.
**Implementation approach:**
1. Use `GATEWAY_URL` + `GATEWAY_TOKEN` to connect to the OpenCLAW gateway WS endpoint
2. Call `sessions.list` to find all sessions with `status: "running"` for the target agent
3. For each running session, call `sessions.abort` with the session `key`
4. Return per-session results to the UI (which sessions were aborted, which had no active run)
5. Fall back to "event-only" if gateway unreachable (but log it as a WARNING, not success)

**Key decision:** How to invoke WS-RPC from the Next.js route:
- **Option A:** Shell exec `openclaw gateway call sessions.abort --params '...'` via SSH to HOFMI-EU-OPEN (simple, works now, adds SSH dependency)
- **Option B:** Implement a lightweight WebSocket RPC client that speaks the OpenCLAW gateway protocol (cleaner, no SSH, but more code)
- **Option C:** Add a thin REST proxy on the OpenCLAW server that wraps the WS-RPC calls (separate deployment)
- **Recommended: Option A** for immediate fix, then migrate to Option B for production

### Phase 3: Nuclear Gateway Stop Endpoint (Code Change — Git Required)
**What:** New endpoint `POST /api/gateway/stop-gateway` that executes `openclaw gateway stop` via SSH
**Where:** New file `src/app/api/gateway/stop-gateway/route.ts`
**Why:** `sessions.abort` is per-session. When you need everything dead NOW, you need the nuclear option.
**Implementation:**
1. Owner-only access (not even admin — this is destructive)
2. SSH to gateway host, execute `openclaw gateway stop`
3. Verify gateway is actually down (probe health endpoint, expect failure)
4. Log to audit trail with `action: "gateway.emergency_stop"`
5. UI: **"Nuclear Gateway Stop"** button — explicitly labelled with "nuclear" language for OpenCLAW instances
   - Distinct from per-session kill (which aborts individual runs)
   - Visual treatment: amber/black or hazard-stripe styling, separate from the red kill button
   - Placed in a dedicated "Nuclear Options" section (not alongside regular kill)
   - Requires double-confirmation ("Type STOP to confirm")
   - Shows which OpenCLAW gateway instance will be stopped (hostname, IP, session count)

6. **Restart Gateway** endpoint (`POST /api/gateway/restart-gateway`) — complementary to nuclear stop
   - Owner-only access
   - Executes `systemctl --user restart openclaw-gateway.service` via SSH
   - Verifies gateway is back up via health probe (waits 4s, then checks)
   - Returns agent count on successful restart
   - UI: Restart button in floating kill switch "Gateway Control" section + in nuclear stop result screen

**Phase 1+2 Status (completed 2026-04-05):**
- Env vars added to `.env.local` on Hetzner EU
- Kill-agent route rewritten to use SSH exec `sessions.abort` (Option A)
- Live tested: `method: "gateway-ssh"`, aborted 2/2 running sessions
- SSE broadcast added on kill

**Phase 3 Status (completed 2026-04-05):**
- Nuclear stop endpoint live-tested: stopped gateway, `verified_down: true`, destroyed 142 sessions + 10 agents
- Restart endpoint live-tested: `verified_up: true`, 10 agents loaded
- Full stop→restart cycle verified end-to-end
- UI: NuclearGatewayStopModal with 4-phase flow (preflight→confirm→executing→result)
- UI: Gateway Control section in floating kill switch (Nuclear Stop + Restart side by side)
- UI: RestartGatewayButton in nuclear stop result screen
- SSE broadcast added on kill

**Phase 4 Status (completed 2026-04-05):**
- Full WS-RPC protocol reverse-engineered from live gateway source (no public docs existed)
- Ed25519 device identity implemented (keypair generation, v3 auth payload, signature)
- Device paired and approved on HOFMI-EU-OPEN gateway (one-time operation per Arkon instance)
- `ws-rpc-client.ts` — full OpenCLAW protocol v3 client (connect, challenge-response, device auth, RPC calls)
- `adapter.ts` — KillAdapter interface, AgentConnectivityConfig type, resolveConnectivityConfig()
- `openclaw-ws-adapter.ts` — WS-RPC adapter (health, listSessions, killSession, killAll)
- `openclaw-ssh-adapter.ts` — SSH exec fallback adapter (retained for nuclear ops)
- `noop-adapter.ts` — fallback for unknown frameworks
- `index.ts` — adapter factory (ws-rpc → ssh → local → noop routing)
- `kill-agent/route.ts` — refactored to use adapter system (resolves from agent metadata JSONB)
- `probe/route.ts` — new wizard endpoint (validates gateway connectivity, returns agents/sessions/channels)
- `.env.local` updated: `GATEWAY_WS_URL=ws://100.90.212.53:18789`
- Live tested: Probe returns 10 agents, 188 sessions, 3 channels. Kill aborts sessions via WS-RPC.
- All files deployed to `~/arkon/` on Hetzner EU. Git commit pending.

**Phase 4b Status (COMPLETE 2026-04-05):**
- Framework integration research COMPLETE — 11 frameworks evaluated (see `AGENT-FRAMEWORK-INTEGRATION-RESEARCH.md`)
- Architecture revised: single data-driven wizard with framework config schema (not separate screens per framework)
- `framework-configs.ts` — 13 framework configs (OpenCLAW, Paperclip, LangGraph, n8n, AutoGen, Dify, OpenHands, Haystack, Semantic Kernel, CrewAI, Flowise, Custom) with types, helpers
- `wizard-shell.tsx` — wizard chrome (progress bar, step routing, nav, auto-skip logic)
- `framework-step.tsx` — Step 1: framework selection dropdown grouped by status, kill capability badges
- `tenant-step.tsx` — Step 2: tenant assignment, auto-fetches from `/api/tenants`, auto-selects single tenant
- `location-step.tsx` — Step 3: local/remote/unsure with auto-config and copy-paste helper commands
- `address-step.tsx` — Step 4: IP/hostname + port, auto-probe with 800ms debounce, green/red indicator, troubleshooting panel
- `tls-step.tsx` — Step 5: conditional (OpenCLAW only), TLS explanation, enable commands, SHA-256 fingerprint, Tailscale Serve alternative
- `auth-step.tsx` — Step 6: dynamic label per framework, masked input with show/hide, find/set commands
- `test-step.tsx` — Step 7: big green Test Connection button, calls `/api/gateway/probe` with discover, agent checkboxes, device pairing, kill capability warnings
- `naming-step.tsx` — Step 8: display name + tags per agent, bulk tag apply for multi-agent
- `emergency-step.tsx` — Step 9: conditional, SSH host/user/key form with test button, skip option
- `summary-step.tsx` — Step 10: review card with masked token, Save & Connect, writes to agents table via `/api/agents/register`
- `probe/route.ts` — multi-framework probe: OpenCLAW (HTTP + SSH fallback), REST frameworks with per-framework health paths, agent discovery, SSH test mode
- `register/route.ts` — saves agent connectivity config to agents table metadata JSONB, audit log, broadcasts event
- `src/app/agents/add/page.tsx` — full 10-step wizard wired
- Build: clean, zero errors. Route `/agents/add` live on Hetzner EU.
- PM2 restarted, verified online.

**Phase 7: COMPLETE (2026-04-05)** — Kill verification + UI confirmation. Pushed to GitHub `7122a99`.

**Phase 7 Deploy & Live Test (2026-04-06):**
- Deployed to Hetzner EU after fixing 5 TypeScript build errors and 2 behavioral bugs (7 commits: `ccd058b`→`04010fa`)
- **Nuclear stop LIVE TESTED**: SIGTERM at 00:43:39 SAST, systemd restart 12s later, audit `verified_down: true`
- **Kill verification LIVE TESTED**: Modal shows full 4-phase flow → **Confirmed Dead** (green shield), audit `verified_dead: true`
- Key fixes: (1) verification now considers abort results not just session status, (2) modal no longer unmounts mid-verification, (3) error handling prevents stuck "killing" state
- Changelog: `changelogs/ARKON-EXTINGUISHER-DEPLOY-TEST-2026-04-06.md`

**Remaining: Phase 5 (Paperclip adapter — blocked on API docs), Phase 6 (documentation — low priority)**

### Phase 4: Agent Framework Registry + WS-RPC Adapter (Schema + Code — Git Required)

> **IMPORTANT ARCHITECTURE DECISION (2026-04-05):** Phase 4 was expanded after
> reviewing production requirements. The SSH-based kill (Phase 2 Option A) works
> but requires SSH key setup on every target. The long-term approach uses **direct
> WebSocket RPC** to the OpenCLAW gateway — requires only URL + token, no SSH.
> SSH is retained ONLY for nuclear stop/restart (OS-level systemctl commands).

**Prerequisites — Research the OpenCLAW WS-RPC protocol:**
- Use Firecrawl to scrape OpenCLAW gateway documentation
- Reverse-engineer the WebSocket message format from the `openclaw gateway call` CLI
- Document the exact handshake, auth, request/response schema for:
  - `sessions.list`, `sessions.abort`, `sessions.reset`, `health`
- Test a raw WebSocket connection from Node.js to `ws://100.90.212.53:18789`

**What:** Add per-agent connectivity config, build WS-RPC adapter as the primary
kill protocol, refactor SSH adapter as fallback for nuclear ops only.

**Where:**
- Database migration: add gateway connectivity columns to agents table
- `src/lib/kill-adapters/` — adapter registry with per-framework implementations
- `src/app/api/gateway/kill-agent/route.ts` — refactor to use adapter lookup
- Agent registration UI / setup wizard — collect connectivity config

**Three Kill Protocols for OpenCLAW:**

| Protocol | When | Config Needed |
|----------|------|--------------|
| `ws-rpc` (DEFAULT) | Any network-reachable gateway | Gateway URL + token |
| `ssh` | Fallback if WS port blocked; required for nuclear stop/restart | SSH host + user + key |
| `local` | Arkon and OpenCLAW on same machine | Just the gateway port |

**Per-Agent Connectivity Config (stored in agents table metadata):**
```json
{
  "framework": "openclaw",
  "kill_protocol": "ws-rpc",
  "gateway_url": "ws://100.90.212.53:18789",
  "gateway_token": "af940a...",
  "gateway_port": 18789,
  "ssh_host": "100.90.212.53",
  "ssh_user": "brynn"
}
```

**Implementation:**

1. **Research WS-RPC protocol** (FIRST — blocks everything else)
   - Scrape OpenCLAW docs via Firecrawl
   - Capture WebSocket traffic from `openclaw gateway call`
   - Build and test a minimal Node.js WS-RPC client

2. **Build adapters:**
   - `openclaw-ws-adapter.ts` — Direct WebSocket RPC (NEW, primary)
   - `openclaw-ssh-adapter.ts` — Refactored from Phase 2 code (fallback + nuclear ops)
   - `openclaw-local-adapter.ts` — Direct CLI exec (same-machine)
   - `process-adapter.ts` — SIGTERM/SIGKILL via SSH
   - `http-adapter.ts` — REST callback to agent's kill endpoint
   - `noop-adapter.ts` — Fallback for unknown frameworks (event-only with WARNING)

3. **Adapter interface:**
   ```typescript
   interface KillAdapter {
     kill(agentId: string, sessionKey?: string, reason?: string): Promise<KillResult>;
     killAll(agentId: string, reason?: string): Promise<KillResult[]>;
     verifyDead(agentId: string): Promise<boolean>;
   }
   ```

4. **Database migration:** Add connectivity columns to agents table metadata

5. **Agent registration flow (setup wizard update):**
   - Step 1: Pick framework (OpenCLAW, CrewAI, etc.)
   - Step 2: Gateway connection — URL + token, [Test Connection] button
   - Step 3: Service control (optional) — SSH config for nuclear stop/restart
   - Connection test validates before saving

6. **Kill-agent route refactor:** Look up agent → get connectivity config → select adapter → execute

7. **Backwards compatibility:** Current env vars (`GATEWAY_SSH_HOST`, `GATEWAY_SSH_USER`)
   remain as fallback default for agents without per-agent config.

**Current state (env vars) → per-agent config migration path:**
- Existing Lumina agent: auto-populate from env vars on first access
- New agents: must provide connectivity config during registration
- Kill route: check agent config first, fall back to env vars

### Phase 4b: Agent Registration Wizard — Gateway Connection Setup (UI — Git Required)

> **CRITICAL UX DECISION (2026-04-05):** The WS-RPC adapter is useless if users
> can't configure it. The wizard IS the product — the adapter is just plumbing.
> This phase MUST ship alongside Phase 4 before any customer deployment.
>
> **ARCHITECTURE REVISION (2026-04-05):** After framework integration research
> (see `AGENT-FRAMEWORK-INTEGRATION-RESEARCH.md`), the wizard is redesigned as a
> **single data-driven wizard** with a framework config schema — NOT separate
> screens per framework. A dropdown selects the framework; all subsequent screens
> dynamically adapt their fields, defaults, helper text, and validation based on
> the selected framework's config schema. Zero framework-specific React components.

**Assumption:** Anyone installing Arkon already has agents running. The wizard
doesn't set up agents — it **connects Arkon to existing agents**.

**Where:**
- `src/app/agents/add/page.tsx` — **NEW** — multi-step agent registration wizard
- `src/app/api/gateway/probe/route.ts` — **EXISTS** — gateway auto-detection (deployed Phase 4)
- `src/components/agents/wizard/` — **NEW** — wizard step components (framework-agnostic)
- `src/lib/gateway/framework-configs.ts` — **NEW** — framework config schema registry

---

#### Core Architecture: Framework Config Schema

The wizard is driven by a **framework config schema** — a data object per framework that
controls what the wizard shows. No framework-specific React components needed.

```typescript
// src/lib/gateway/framework-configs.ts

interface FrameworkConfig {
  id: string;
  label: string;
  icon: string;                          // Framework logo/icon
  description: string;                   // One-line description
  status: 'supported' | 'beta' | 'coming-soon';

  // Connection
  defaultPort: number;
  protocol: 'ws-rpc' | 'rest' | 'websocket' | 'grpc';
  authType: 'token' | 'api-key' | 'bearer' | 'none';
  tlsRequired: boolean;                  // Show TLS setup screen?
  tlsSupported: boolean;                 // Can the framework do TLS?

  // Probe
  probeEndpoint: string;                 // API route on Arkon to call
  probeMethod: 'ws-rpc' | 'rest-get' | 'rest-post';

  // Which wizard steps to show
  steps: WizardStep[];                   // Ordered list of steps to render

  // Dynamic field config per step
  fields: {
    address?: { label: string; placeholder: string; helper: string };
    port?: { label: string; default: number; helper: string };
    token?: { label: string; helper: string; findCommand?: string; setCommand?: string };
    tls?: { explanation: string; enableCommand?: string; fingerprintCommand?: string };
    ssh?: { explanation: string };
  };

  // Helper commands shown in the UI (copy-paste)
  helperCommands: Record<string, string>;

  // Kill capabilities (from research)
  killCapability: 'full' | 'partial' | 'none';
  killMethod: string;                    // Human-readable description

  // Dashboard link (if framework has its own web UI)
  dashboardUrl?: string;                 // Template: "http://{host}:{port}/"
  dashboardLabel?: string;               // e.g., "OpenClaw Control", "n8n Editor"
}

type WizardStep =
  | 'framework'      // Always first — dropdown selection
  | 'tenant'         // Tenant/org assignment (NEW)
  | 'location'       // Same machine / different machine / not sure
  | 'address'        // IP/hostname + port input
  | 'tls'            // TLS setup (skipped if !tlsRequired)
  | 'token'          // Auth token/API key input
  | 'test'           // Test connection + discover agents
  | 'naming'         // Name/tag imported agents (NEW)
  | 'pairing'        // Device pairing approval (OpenCLAW-specific, auto-detected)
  | 'emergency'      // SSH for nuclear stop/restart (optional)
  | 'summary';       // Review & save
```

#### Framework Registry (11 frameworks from research)

```typescript
const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {

  openclaw: {
    id: 'openclaw',
    label: 'OpenCLAW',
    icon: 'claw',
    description: 'AI agent gateway with WS-RPC protocol',
    status: 'supported',
    defaultPort: 18789,
    protocol: 'ws-rpc',
    authType: 'token',
    tlsRequired: true,
    tlsSupported: true,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'ws-rpc',
    steps: ['framework', 'tenant', 'location', 'address', 'tls', 'token', 'test', 'naming', 'emergency', 'summary'],
    fields: {
      address: {
        label: 'Gateway Address',
        placeholder: '100.90.212.53',
        helper: 'On the gateway server, run: `openclaw gateway status` — look for the **Listening:** line',
      },
      port: { label: 'Gateway Port', default: 18789, helper: 'Default: 18789' },
      token: {
        label: 'Gateway Token',
        helper: 'This is the shared secret that lets Arkon authenticate with the gateway.',
        findCommand: "openclaw gateway call config.get --params '{\"path\":\"gateway.auth.token\"}' --json",
        setCommand: "openclaw gateway call config.set --params '{\"path\":\"gateway.auth.token\",\"value\":\"<choose-a-strong-token>\"}'",
      },
      tls: {
        explanation: 'Your gateway needs a secure connection. Enabling TLS secures BOTH the Arkon connection AND the gateway dashboard.',
        enableCommand: "openclaw gateway call config.set --params '{\"path\":\"gateway.tls.enabled\",\"value\":true}'\nopenclaw gateway restart",
        fingerprintCommand: 'openclaw gateway status',
      },
      ssh: { explanation: 'SSH access enables Arkon to stop/restart the entire gateway in emergencies.' },
    },
    helperCommands: {
      findAddress: 'openclaw gateway status',
      checkRunning: 'systemctl --user status openclaw-gateway.service',
    },
    killCapability: 'full',
    killMethod: 'WS-RPC sessions.abort per session, gateway stop for nuclear',
    dashboardUrl: 'http://{host}:{port}/',
    dashboardLabel: 'OpenClaw Control',
  },

  paperclip: {
    id: 'paperclip',
    label: 'Paperclip',
    icon: 'paperclip',
    description: 'Multi-agent company orchestration platform',
    status: 'beta',
    defaultPort: 3100,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'Paperclip Server Address',
        placeholder: 'localhost',
        helper: 'The IP or hostname where Paperclip is running.',
      },
      port: { label: 'Server Port', default: 3100, helper: 'Default: 3100' },
      token: {
        label: 'API Key',
        helper: 'Bearer token for Paperclip API authentication.',
        findCommand: 'Check your Paperclip .env file for PAPERCLIP_API_KEY',
      },
    },
    helperCommands: { findAddress: 'Check your Paperclip deployment config' },
    killCapability: 'full',
    killMethod: 'REST DELETE /api/agents/:id (terminate) + PATCH (pause/resume). Two-layer: Paperclip status + underlying runtime kill.',
    dashboardUrl: 'http://{host}:{port}/',
    dashboardLabel: 'Paperclip Dashboard',
  },

  langgraph: {
    id: 'langgraph',
    label: 'LangGraph',
    icon: 'langgraph',
    description: 'Stateful agent workflow platform (LangChain)',
    status: 'beta',
    defaultPort: 2024,
    protocol: 'rest',
    authType: 'none',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'LangGraph Server Address',
        placeholder: 'localhost',
        helper: 'The IP or hostname where LangGraph Server is running.',
      },
      port: { label: 'Server Port', default: 2024, helper: 'Default: 2024' },
      token: {
        label: 'API Key (optional)',
        helper: 'Required if LangGraph Server has auth enabled. Check your deployment config.',
      },
    },
    helperCommands: { findAddress: 'Check your LangGraph Server or LangSmith deployment' },
    killCapability: 'full',
    killMethod: 'REST POST /threads/{id}/runs/{run_id}/cancel with interrupt or rollback action. Bulk cancel via POST /runs/cancel.',
  },

  n8n: {
    id: 'n8n',
    label: 'n8n',
    icon: 'n8n',
    description: 'Workflow automation platform',
    status: 'beta',
    defaultPort: 5678,
    protocol: 'rest',
    authType: 'api-key',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'n8n Instance Address',
        placeholder: 'n8n.transformateai.com',
        helper: 'Your n8n instance URL or IP address.',
      },
      port: { label: 'Port', default: 5678, helper: 'Default: 5678 (may differ behind reverse proxy)' },
      token: {
        label: 'API Key',
        helper: 'Generate in n8n: Settings → API → Create API Key',
        findCommand: 'n8n Settings → API → Create API Key',
      },
    },
    helperCommands: { findAddress: 'Check your n8n deployment or reverse proxy config' },
    killCapability: 'partial',
    killMethod: 'Can deactivate workflows (prevent new runs) but cannot stop running executions via public API. Internal API workaround available.',
    dashboardUrl: 'http://{host}:{port}/',
    dashboardLabel: 'n8n Editor',
  },

  autogen: {
    id: 'autogen',
    label: 'AutoGen / AG2',
    icon: 'autogen',
    description: 'Multi-agent conversation framework (Microsoft)',
    status: 'beta',
    defaultPort: 8081,
    protocol: 'websocket',
    authType: 'none',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'AutoGen Studio Address',
        placeholder: 'localhost',
        helper: 'The IP or hostname where AutoGen Studio is running.',
      },
      port: { label: 'Studio Port', default: 8081, helper: 'Default: 8081' },
    },
    helperCommands: { findAddress: 'Check your AutoGen Studio startup config' },
    killCapability: 'full',
    killMethod: 'WebSocket {"type":"stop"} message to running run. SDK: ExternalTermination.set(). gRPC: worker.stop().',
  },

  dify: {
    id: 'dify',
    label: 'Dify',
    icon: 'dify',
    description: 'LLM app development platform',
    status: 'beta',
    defaultPort: 443,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'Dify Instance Address',
        placeholder: 'dify.example.com',
        helper: 'Your Dify instance URL (self-hosted or cloud.dify.ai).',
      },
      port: { label: 'Port', default: 443, helper: 'Default: 443 (HTTPS) or 80 (HTTP)' },
      token: {
        label: 'App API Key',
        helper: 'Each Dify app has its own API key. Found in: App → API Access → API Key',
        findCommand: 'Dify Dashboard → Your App → API Access → API Key',
      },
    },
    helperCommands: { findAddress: 'Check your Dify deployment or use cloud.dify.ai' },
    killCapability: 'full',
    killMethod: 'REST POST /v1/chat-messages/{task_id}/stop or /v1/workflows/tasks/{task_id}/stop (streaming mode only).',
  },

  openhands: {
    id: 'openhands',
    label: 'OpenHands',
    icon: 'openhands',
    description: 'AI software development agent',
    status: 'beta',
    defaultPort: 3000,
    protocol: 'rest',
    authType: 'api-key',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'OpenHands Server Address',
        placeholder: 'localhost',
        helper: 'Your OpenHands server URL.',
      },
      port: { label: 'Port', default: 3000, helper: 'Default: 3000' },
      token: {
        label: 'Session API Key',
        helper: 'X-Session-API-Key for OpenHands Cloud, or Bearer token for self-hosted.',
      },
    },
    helperCommands: {},
    killCapability: 'full',
    killMethod: 'SDK conversation.close() / REST DELETE /api/conversations/{id}. Pause via SDK only (not REST yet).',
  },

  haystack: {
    id: 'haystack',
    label: 'Haystack',
    icon: 'haystack',
    description: 'Pipeline-based AI framework (deepset)',
    status: 'coming-soon',
    defaultPort: 1416,
    protocol: 'rest',
    authType: 'none',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'Hayhooks Server Address',
        placeholder: 'localhost',
        helper: 'Where Hayhooks is running.',
      },
      port: { label: 'Port', default: 1416, helper: 'Default: 1416' },
    },
    helperCommands: { findAddress: 'hayhooks status' },
    killCapability: 'partial',
    killMethod: 'POST /undeploy removes pipeline but cannot cancel in-flight runs.',
  },

  'semantic-kernel': {
    id: 'semantic-kernel',
    label: 'Semantic Kernel',
    icon: 'microsoft',
    description: 'Microsoft agent framework (.NET/Python/Java)',
    status: 'coming-soon',
    defaultPort: 0,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'Agent Service Endpoint',
        placeholder: 'your-endpoint.azure.com',
        helper: 'Azure AI Agent Service endpoint, or your custom REST wrapper URL.',
      },
      token: {
        label: 'API Key / Bearer Token',
        helper: 'Azure AI Agent Service key, or your custom wrapper auth token.',
      },
    },
    helperCommands: {},
    killCapability: 'partial',
    killMethod: 'Azure: POST /threads/{id}/runs/{id}/cancel. Self-hosted: CancellationToken or SignalDispatcher SIGKILL.',
  },

  crewai: {
    id: 'crewai',
    label: 'CrewAI',
    icon: 'crewai',
    description: 'Multi-agent orchestration framework',
    status: 'coming-soon',
    defaultPort: 8000,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'CrewAI Enterprise URL',
        placeholder: 'your-crew.app.crewai.com',
        helper: 'Your deployed crew URL from CrewAI Enterprise (AMP).',
      },
      token: {
        label: 'Bearer Token',
        helper: 'CrewAI Enterprise API token for your deployed crew.',
      },
    },
    helperCommands: {},
    killCapability: 'none',
    killMethod: 'No native kill API. Process-level SIGTERM only. Enterprise API has no cancel endpoint.',
  },

  flowise: {
    id: 'flowise',
    label: 'Flowise',
    icon: 'flowise',
    description: 'Visual LLM flow builder',
    status: 'coming-soon',
    defaultPort: 3000,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'location', 'address', 'token', 'test', 'naming', 'summary'],
    fields: {
      address: {
        label: 'Flowise Server Address',
        placeholder: 'localhost',
        helper: 'Where Flowise is running.',
      },
      port: { label: 'Port', default: 3000, helper: 'Default: 3000' },
      token: {
        label: 'API Key (optional)',
        helper: 'Flowise API key if authentication is enabled.',
      },
    },
    helperCommands: {},
    killCapability: 'none',
    killMethod: 'No kill API. No execution tracking. Read-only monitoring only.',
  },

  custom: {
    id: 'custom',
    label: 'Custom / Other',
    icon: 'custom',
    description: 'HTTP callback or process-level control',
    status: 'supported',
    defaultPort: 0,
    protocol: 'rest',
    authType: 'bearer',
    tlsRequired: false,
    tlsSupported: false,
    probeEndpoint: '/api/gateway/probe',
    probeMethod: 'rest-get',
    steps: ['framework', 'tenant', 'address', 'token', 'test', 'naming', 'emergency', 'summary'],
    fields: {
      address: {
        label: 'Agent Server Address',
        placeholder: 'your-agent-host.com',
        helper: 'The IP or hostname where your agent is running.',
      },
      port: { label: 'Port', default: 0, helper: 'The port your agent\'s API listens on' },
      token: {
        label: 'Auth Token / API Key',
        helper: 'Authentication credential for your agent\'s API.',
      },
      ssh: { explanation: 'SSH enables process-level kill (SIGTERM) as a fallback.' },
    },
    helperCommands: {},
    killCapability: 'partial',
    killMethod: 'HTTP callback to user-provided kill endpoint, or SSH + SIGTERM.',
  },
};
```

---

#### Wizard Flow (Revised — 10 Dynamic Steps)

The wizard renders a **subset** of these steps based on `config.steps` for the selected framework:

**Step 1 — Framework Selection (always shown):**
- Dropdown menu with all 12 frameworks grouped by status:
  - **Supported:** OpenCLAW, Custom
  - **Beta:** Paperclip, LangGraph, n8n, AutoGen, Dify, OpenHands
  - **Coming Soon:** Haystack, Semantic Kernel, CrewAI, Flowise (greyed out)
- Each option shows: icon, name, one-line description, kill capability badge (full/partial/none)
- Selecting a framework loads its config and determines which steps appear

**Step 2 — Tenant Assignment (NEW — shown for all):**
- Dropdown: select tenant/organization (e.g., "Transformate", "HOFMI")
- Auto-selects if only one tenant exists
- Required — every agent must belong to a tenant

**Step 3 — Agent Location:**
- Three plain-English options (labels adapt per framework):
  - A) "Same machine as Arkon" → auto-configures `ws://127.0.0.1:{defaultPort}`, skip to Test
  - B) "Different machine on my network" → continue to Address
  - C) "I'm not sure" → shows framework-specific helper command
- Helper command pulled from `config.helperCommands.findAddress`

**Step 4 — Address & Port:**
- IP/hostname input with placeholder from `config.fields.address.placeholder`
- Port input pre-filled from `config.defaultPort` (editable — not hardcoded)
- Helper text from `config.fields.address.helper`
- Auto-probes on input with green/red indicator
- Troubleshooting panel if unreachable (generic: running? firewall? Tailscale IP?)

**Step 5 — Secure Connection / TLS (conditional — only if `config.tlsRequired`):**
- Currently only shown for OpenCLAW
- Plain-English explanation from `config.fields.tls.explanation`
- Copy-paste commands from `config.fields.tls.enableCommand`
- SHA256 fingerprint input from `config.fields.tls.fingerprintCommand`
- [Check Again] button
- Tailscale Serve alternative path

**Step 6 — Authentication (conditional — only if `config.authType !== 'none'`):**
- Label adapts: "Gateway Token" (OpenCLAW), "API Key" (n8n, Dify), "Bearer Token" (Paperclip)
- Helper text from `config.fields.token.helper`
- Copy-paste find command from `config.fields.token.findCommand` (if exists)
- Copy-paste set command from `config.fields.token.setCommand` (if exists)
- Masked input with show/hide toggle

**Step 7 — Test Connection & Discover Agents:**
- Big green [Test Connection] button
- Calls `config.probeEndpoint` with collected config
- Shows results adapted per framework:
  - OpenCLAW: gateway name, version, agents, sessions, channels
  - Paperclip: company name, agents with statuses
  - LangGraph: assistants, active threads/runs
  - n8n: active workflows, recent executions
  - Others: health status + whatever the probe returns
- Kill capability warning if `config.killCapability === 'partial'` or `'none'`:
  - partial: "⚠ Arkon can monitor this agent but has limited control capabilities"
  - none: "⚠ This framework does not support remote kill. Arkon can monitor only."
- **Device Pairing (auto-detected, OpenCLAW only):**
  If probe returns `pairing_required`, shows inline guidance:
  "Your Arkon instance needs approval on the gateway. Open Gateway Dashboard →
  Devices/Instances → Approve 'arkon-{hostname}'"
  [Open Gateway Dashboard] button + [Retry Connection] button
- **Dashboard Link** (if `config.dashboardUrl` defined):
  "Open {config.dashboardLabel}" link to `http://{host}:{port}/`
- Agent selection: "Which agents do you want to manage?" → checkboxes

**Step 8 — Agent Naming & Tagging (NEW):**
- For each selected agent from Step 7:
  - Display name (pre-filled from discovered name, editable)
  - Tags (optional — e.g., "production", "staging", "content")
  - Owner assignment (dropdown of tenant users)
- Bulk actions: "Apply same tags to all", "Assign all to me"

**Step 9 — Emergency Controls (conditional — only if `'emergency' in config.steps`):**
- Currently shown for: OpenCLAW, Custom
- "Want Arkon to stop/restart the agent server in emergencies?"
- "This requires SSH access. Optional — you can always do it manually."
- [Skip] or [Set up SSH access]
- If SSH: host + user + key form with [Test SSH] button
- Explanation from `config.fields.ssh.explanation`

**Step 10 — Review & Save:**
- Summary card showing all collected config:
  - Framework, tenant, connection details (masked token)
  - Agents to import (count + names)
  - Kill capability level
  - Emergency controls status (configured/skipped)
- [Save & Connect] button
- On save: writes connectivity config to agents table metadata JSONB, triggers initial health check

---

#### Gaps Addressed (from 2026-04-05 review)

| Gap | Solution |
|-----|----------|
| Wizard was OpenCLAW-specific | Framework config schema drives all screens dynamically |
| No tenant assignment | Step 2 — required for multi-tenant |
| No agent naming/labeling | Step 8 — display name, tags, owner per agent |
| Device pairing not a screen | Inline in Step 7 (auto-detected during test) |
| No edit/reconnect flow | Add `/agents/{id}/edit` route that pre-fills wizard with existing config |
| No existing agent migration | Add "Attach Gateway" action on existing agents list page |
| Port hardcoded to 18789 | Port input per framework with editable default |
| No health monitoring design | `ConnectionStatusIndicator` polls every 60s via `/api/gateway/probe` |
| No "gateway offline" path | Save config as `status: "pending_verification"`, auto-verify on next probe |

---

#### Connection Strategy (per framework)

| Framework | Protocol | Auth | TLS | SSH Nuclear |
|-----------|----------|------|-----|-------------|
| OpenCLAW | WS-RPC | Token | Yes (fingerprint) | Yes |
| Paperclip | REST | Bearer | Via proxy | No |
| LangGraph | REST | Optional API key | Via proxy | No |
| n8n | REST | API Key header | Via proxy | No |
| AutoGen | WebSocket + REST | None | No | No |
| Dify | REST | Per-app Bearer | Via proxy | No |
| OpenHands | REST | API Key / Bearer | Via proxy | No |
| Custom | REST / SSH | Bearer | Optional | Yes |

**Key principle:** Only OpenCLAW has native TLS with fingerprint pinning. All other
REST-based frameworks rely on the user's reverse proxy (nginx, Caddy, Cloudflare)
for TLS. The wizard doesn't manage their TLS — it just connects to whatever URL
the user provides.

---

#### Per-Agent Connectivity Config (stored in agents table metadata JSONB)

All frameworks use the same schema shape with framework-specific fields:

```json
{
  "framework": "openclaw",
  "kill_protocol": "ws-rpc",
  "gateway_url": "wss://100.90.212.53:18789",
  "gateway_token": "...",
  "tls_fingerprint": "SHA256:abc...",
  "gateway_port": 18789,
  "ssh_host": "100.90.212.53",
  "ssh_user": "brynn",
  "tenant_id": "transformate",
  "display_name": "Lumina (HOFMI-EU-OPEN)",
  "tags": ["production", "primary"],
  "status": "connected",
  "last_probe": "2026-04-05T14:30:00Z",
  "kill_capability": "full"
}
```

---

#### Additional UI Components

- **`ConnectionStatusIndicator`** — persistent header/sidebar badge
  - Green: connected via primary protocol (WS-RPC or REST probe OK)
  - Yellow: SSH fallback active (primary protocol failed)
  - Red: disconnected (all probes failing)
  - Polls `/api/gateway/probe` every 60 seconds per connected agent
  - Click to expand: shows per-agent connection status list

- **`GatewayDashboardLink`** — external link component
  - Renders for frameworks with `dashboardUrl` in config
  - Opens framework's built-in web UI in new tab
  - Template: replaces `{host}` and `{port}` from agent config

- **`AgentSyncPanel`** — used in Step 7 (Test) and in agents list page
  - Shows discovered agents with checkboxes
  - Diff view: "New" (not in Arkon), "Existing" (already registered), "Removed" (in Arkon but not on gateway)

---

#### Files to Create/Modify (Phase 4b — Revised)

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/gateway/framework-configs.ts` | **NEW** | Framework config schema registry (12 configs) |
| `src/app/agents/add/page.tsx` | **NEW** | Wizard page container (step router) |
| `src/components/agents/wizard/wizard-shell.tsx` | **NEW** | Wizard chrome (progress bar, nav, step rendering) |
| `src/components/agents/wizard/framework-step.tsx` | **NEW** | Step 1: framework dropdown |
| `src/components/agents/wizard/tenant-step.tsx` | **NEW** | Step 2: tenant assignment |
| `src/components/agents/wizard/location-step.tsx` | **NEW** | Step 3: same/different/unsure |
| `src/components/agents/wizard/address-step.tsx` | **NEW** | Step 4: IP + port (dynamic defaults) |
| `src/components/agents/wizard/tls-step.tsx` | **NEW** | Step 5: TLS setup (conditional) |
| `src/components/agents/wizard/auth-step.tsx` | **NEW** | Step 6: token/API key (dynamic labels) |
| `src/components/agents/wizard/test-step.tsx` | **NEW** | Step 7: test + discover + pairing |
| `src/components/agents/wizard/naming-step.tsx` | **NEW** | Step 8: name/tag agents |
| `src/components/agents/wizard/emergency-step.tsx` | **NEW** | Step 9: SSH config (conditional) |
| `src/components/agents/wizard/summary-step.tsx` | **NEW** | Step 10: review & save |
| `src/components/agents/connection-status-indicator.tsx` | **NEW** | Header connectivity badge |
| `src/components/agents/gateway-dashboard-link.tsx` | **NEW** | External dashboard link |
| `src/components/agents/agent-sync-panel.tsx` | **NEW** | Agent import diff panel |
| `src/app/api/gateway/probe/route.ts` | **UPDATE** | Add multi-framework probe support |
| `src/app/agents/[id]/edit/page.tsx` | **NEW** | Edit existing agent config (re-uses wizard) |

### OpenCLAW Gateway Web UI ("OpenClaw Control") — Reference for Wizard UX

> **URL:** `http://<gateway-host>:18789/` (same port as WS-RPC)
> **Tech:** Lit web components (SPA), dark/light themes (claw, knot, dash), i18n (en, de, es, pt-BR, zh-CN, zh-TW)
> **Auth:** Uses same gateway token as WS-RPC

**Built-in pages (from control-ui asset analysis):**

| Page | Asset File | What It Does |
|------|-----------|--------------|
| Sessions | `sessions-*.js` | List/manage/abort sessions (same data as our `sessions.list` RPC) |
| Agents | `agents-*.js` | View registered agents, their configs, heartbeat status |
| Channels | `channels-*.js` + `channel-config-extras-*.js` | Telegram, Discord, Slack, WhatsApp channel config |
| Cron | `cron-*.js` | Scheduled task management |
| Logs | `logs-*.js` | Real-time log viewer |
| Debug | `debug-*.js` | System debug tools |
| Skills | `skills-*.js` + `skills-shared-*.js` | Agent skill management |
| Instances | `instances-*.js` | Multi-instance management |
| Nodes | `nodes-*.js` | Node/cluster topology |
| Model Providers | `anthropic-*.js`, `openai-*.js`, `google-*.js`, `mistral-*.js`, `azure-openai-responses-*.js`, `google-gemini-cli-*.js`, `google-vertex-*.js`, `openai-codex-responses-*.js` | Per-provider model configuration |

**Design principles for wizard:**

1. **Don't duplicate what the gateway UI already does** — the wizard CONNECTS Arkon to the gateway, not replicate the gateway's management UI.

2. **Link to gateway UI from Arkon** — After successful probe, show "Open {dashboardLabel}" link. This gives users a familiar fallback.

3. **TLS Setup (OpenCLAW)** — "Enabling TLS secures BOTH the Arkon connection AND the gateway dashboard."

4. **Device pairing (OpenCLAW)** — Auto-detected during Test step. Guides user to Gateway Dashboard → Devices → Approve.

### Phase 5: Paperclip Integration Planning (Research + Design — Git Required)
**What:** Design the two-layer kill for Paperclip-orchestrated agents
**Where:** New: `src/lib/kill-adapters/paperclip-adapter.ts` + `AGENT-FRAMEWORK-INTEGRATION.md`
**Why:** Arkon sits above Paperclip as governance. When Arkon kills a Paperclip agent, it must:
1. Call Paperclip API to set agent status to "terminated"
2. Identify which adapter/runtime the Paperclip agent uses (OpenCLAW Gateway, Claude Local, Process, etc.)
3. Kill the underlying runtime using the appropriate adapter
4. Verify both layers are dead
**Depends on:** Paperclip API documentation for agent termination (currently underdocumented — may need to read Paperclip source code)

### Phase 6: Documentation (Markdown — Git Required)
**What:** Create and update all documentation listed in Documentation Plan above
**Where:** Project root and `testing-research/`
**Why:** This failure happened because we built the kill switch UI without verifying the backend protocol. Documentation-first prevents this.

### Phase 7: Kill Verification & UI Updates (Code — Git Required)
**What:** After sending a kill command, verify the agent is actually dead. Update UI to show verified status.
**Where:**
- `src/hooks/use-active-runs.ts` — add verification polling after kill
- `src/components/mission-control/kill-confirm-modal.tsx` — show "Verifying..." → "Confirmed Dead" or "Kill Failed"
- `src/app/api/gateway/kill-agent/route.ts` — add verification step
**Why:** The current UI shows "success" based on the API response. It should show "success" only after confirming the agent stopped. This is the difference between "I sent the kill command" and "The agent is actually dead."

**Phase 7 Status (COMPLETE 2026-04-05):**
- Kill-agent route now waits 2s after abort, re-lists sessions to verify zero remain
- Returns `verification: { verified_dead, remaining_sessions, verification_method, detail }`
- Verification logged to audit_log, events table, and SSE broadcast
- `use-active-runs.ts`: burst polling (1s for 10s) after any kill, `KillResponse`/`KillVerification` types exported
- `killRun()` returns full response; only removes agent from local state if `verified_dead === true`
- `kill-confirm-modal.tsx`: complete rewrite with 4-phase flow (confirm → killing → verifying → result)
- Result states: "Confirmed Dead" (emerald/auto-close 4s), "Verification Inconclusive" (amber), "Kill Failed" (red)
- Per-session abort detail list with success/failure icons, verification badge
- `floating-kill-switch.tsx`: passes kill response to modal for verification display
- All pushed to GitHub commit `7122a99` on 2026-04-05

---

## Git Strategy

**All code changes (Phases 2-7) go into a single feature branch:**
```
feature/kill-switch-framework-adapters
```

**Commit sequence:**
1. `fix: add GATEWAY_URL/GATEWAY_TOKEN env var mapping` (Phase 2 route rewrite)
2. `feat: add nuclear gateway stop endpoint` (Phase 3)
3. `feat: add agent framework kill adapter system` (Phase 4)
4. `feat: add agent registration wizard with gateway connection setup` (Phase 4b)
5. `feat: add Paperclip two-layer kill adapter` (Phase 5)
6. `docs: add AGENT-FRAMEWORK-INTEGRATION.md and update API/README/FEATURES` (Phase 6)
7. `feat: add kill verification and UI confirmation` (Phase 7)

**Phase 1 (env vars) is server-only** — applied directly to `~/arkon/.env.local` on Hetzner EU, not in git.

---

## Pre-Deploy Checklist (New Standard)

Before deploying ANY agent integration feature, this checklist is MANDATORY:

- [ ] **Protocol verified** — Manually tested the target system's API/CLI (curl, WS client, SSH)
- [ ] **Kill command tested** — Sent a real kill command and confirmed the agent stopped
- [ ] **Env vars documented** — All required env vars listed with exact names (not guessed)
- [ ] **Adapter registered** — Framework metadata in agents table with kill_protocol
- [ ] **Fallback defined** — Nuclear option documented and tested
- [ ] **Verification works** — Can confirm agent is dead after kill (not just "command sent")
- [ ] **Audit trail logs correctly** — Kill method, success/failure, and framework recorded
- [ ] **Documentation written** — Entry in AGENT-FRAMEWORK-INTEGRATION.md before code is merged

---

## Files to Modify/Create

| File | Action | Phase |
|------|--------|-------|
| `~/arkon/.env.local` (server) | Add `GATEWAY_URL` + `GATEWAY_TOKEN` | 1 |
| `src/app/api/gateway/kill-agent/route.ts` | Rewrite to use WS-RPC | 2 |
| `src/app/api/gateway/stop-gateway/route.ts` | **NEW** — nuclear stop | 3 |
| `src/app/api/gateway/restart-gateway/route.ts` | **NEW** — gateway restart | 3 |
| `src/components/mission-control/nuclear-gateway-stop.tsx` | **NEW** — nuclear stop modal + restart button | 3 |
| `src/lib/kill-adapters/index.ts` | **NEW** — adapter registry | 4 |
| `src/lib/kill-adapters/openclaw-adapter.ts` | **NEW** | 4 |
| `src/lib/kill-adapters/process-adapter.ts` | **NEW** | 4 |
| `src/lib/kill-adapters/http-adapter.ts` | **NEW** | 4 |
| `src/lib/kill-adapters/paperclip-adapter.ts` | **NEW** | 5 |
| `src/lib/kill-adapters/noop-adapter.ts` | **NEW** — fallback | 4 |
| `src/app/agents/add/page.tsx` | **NEW** — agent registration wizard | 4b |
| `src/app/api/gateway/probe/route.ts` | **NEW** — gateway auto-detection | 4b |
| `src/components/agents/wizard/framework-select.tsx` | **NEW** — wizard step 1 | 4b |
| `src/components/agents/wizard/gateway-location.tsx` | **NEW** — wizard step 2 | 4b |
| `src/components/agents/wizard/gateway-address.tsx` | **NEW** — wizard step 3 | 4b |
| `src/components/agents/wizard/tls-setup.tsx` | **NEW** — wizard step 4 | 4b |
| `src/components/agents/wizard/gateway-token.tsx` | **NEW** — wizard step 5 | 4b |
| `src/components/agents/wizard/test-connection.tsx` | **NEW** — wizard step 6 | 4b |
| `src/components/agents/wizard/emergency-controls.tsx` | **NEW** — wizard step 7 | 4b |
| `AGENT-FRAMEWORK-INTEGRATION.md` | **NEW** — master integration doc | 6 |
| `API.md` | Update kill endpoints | 6 |
| `FEATURES.md` | Expand kill switch section | 6 |
| `README.md` | Update kill switch narrative | 6 |
| `testing-research/ARKON-TESTING-PLAN.md` | Add framework integration tests | 6 |
| `src/hooks/use-active-runs.ts` | Add kill verification | 7 |
| `src/components/mission-control/kill-confirm-modal.tsx` | Add verification UI | 7 |
| Database migration | Add framework metadata to agents | 4 |

---

## Verification Plan

### After Phase 1+2 (Immediate Fix):
1. Restart Arkon on Hetzner EU (`pm2 restart arkon`)
2. Trigger a test session on Lumina via Discord
3. Hit kill switch from Arkon UI
4. Check HOFMI-EU-OPEN gateway logs for `sessions.abort` call
5. Verify session status changes to aborted in `sessions.list`

### After Phase 3 (Nuclear Stop):
1. Start OpenCLAW gateway on HOFMI-EU-OPEN
2. Hit "Emergency Stop Gateway" from Arkon
3. Verify gateway service is stopped (`systemctl --user status openclaw-gateway`)
4. Verify health endpoint returns connection refused

### After Phase 4 (Adapter System):
1. Register a test agent with `framework: "openclaw"` in agents table
2. Kill via Arkon — should use openclaw adapter
3. Register a test agent with `framework: "unknown"` — should use noop adapter with WARNING

### After Phase 4b (Registration Wizard):
1. Open Arkon → Add Agent → OpenCLAW
2. Select "Different machine" → enter HOFMI-EU-OPEN Tailscale IP
3. Verify auto-probe detects gateway on port 18789
4. Complete TLS + token steps
5. [Test Connection] should show gateway health, all 10 agents
6. Save → verify agent appears in Arkon agent list with correct connectivity config
7. Kill via Arkon → should use ws-rpc adapter (not SSH)

### After Phase 7 (Verification):
1. Kill a running agent
2. UI should show "Verifying..." spinner
3. Then "Confirmed: Agent stopped" or "Warning: Agent may still be running"
