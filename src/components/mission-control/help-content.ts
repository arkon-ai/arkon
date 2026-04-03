/* ── Help content map — contextual help for every page ───────────────────── */

export interface HelpSection {
  title: string;
  description: string;
  concepts?: Array<{ term: string; explanation: string }>;
  tasks?: Array<{ label: string; detail: string }>;
  tips?: string[];
}

export const helpContent: Record<string, HelpSection> = {
  "/": {
    title: "Dashboard",
    description:
      "Your command center. See the overall health of your AI operations at a glance — active agents, event volume, threats, and spending.",
    concepts: [
      {
        term: "Health Score",
        explanation:
          "A composite 0–100 score based on agent uptime, threat level, budget status, and infrastructure health. Green (80+) is good, amber (50–79) needs attention, red (below 50) is critical.",
      },
      {
        term: "Daily Burn",
        explanation:
          "Estimated spend today based on token usage and model pricing across all agents.",
      },
      {
        term: "Events",
        explanation:
          "Every message, tool call, error, or action your agents perform is logged as an event.",
      },
    ],
    tasks: [
      { label: "Check agent health", detail: "Look at the Health Score gauge — hover for a breakdown of what's affecting it." },
      { label: "Spot threats", detail: "The threat count card links directly to ThreatGuard for details." },
      { label: "Monitor costs", detail: "The daily burn card shows real-time spending. Click through to Costs for per-agent breakdown." },
    ],
    tips: [
      "A healthy dashboard shows a green health score, zero critical threats, and spending within budget.",
      "Use the status summary sentence at the top for a quick natural-language overview.",
    ],
  },

  "/agents": {
    title: "Agents",
    description:
      "View and manage all registered AI agents. Each agent card shows its status, framework, recent cost, and threat count. Click any agent to see its full profile.",
    concepts: [
      {
        term: "Agent",
        explanation:
          "An AI model or system that sends events to Arkon. Could be an OpenClaw agent, NemoClaw agent, CrewAI crew, or any custom integration.",
      },
      {
        term: "Framework",
        explanation:
          "The platform running your agent — OpenClaw, NemoClaw, CrewAI, AutoGen, or Custom.",
      },
      {
        term: "Active Run",
        explanation:
          "An agent currently processing a request. You can pause or kill active runs.",
      },
    ],
    tasks: [
      { label: "Add an agent", detail: "Register a new agent via the setup wizard or Admin Panel." },
      { label: "Kill a rogue agent", detail: "Click the red stop button on any agent with an active run, or press Ctrl+Shift+K." },
      { label: "View agent details", detail: "Click any agent card to see its full profile — identity, security, performance, and activity." },
    ],
  },

  "/security": {
    title: "ThreatGuard",
    description:
      "ThreatGuard scans every message your agents send and receive for three types of threats: prompt injection attempts, dangerous shell commands, and credential leaks. When a threat is detected, it appears here with a severity rating and recommended actions.",
    concepts: [
      {
        term: "Prompt Injection",
        explanation:
          "An attempt to trick your agent into ignoring its instructions — e.g., 'ignore previous instructions' or persona hijacking.",
      },
      {
        term: "Shell Command",
        explanation:
          "A potentially dangerous system command like rm -rf, reverse shells, or downloading unknown scripts.",
      },
      {
        term: "Credential Leak",
        explanation:
          "An API key, password, or secret exposed in agent output. Immediate action: purge the message and rotate the credential.",
      },
    ],
    tasks: [
      { label: "Purge a credential leak", detail: "Click the Purge button on any credential leak event to delete it from Arkon and attempt channel deletion." },
      { label: "Dismiss a false positive", detail: "Click Dismiss on events you've reviewed and determined are safe." },
      { label: "Set up auto-response", detail: "Create a workflow with a Threat trigger to automatically pause agents on critical threats." },
    ],
    tips: [
      "Critical credential leaks should be purged immediately — then rotate the exposed credential.",
      "If the same pattern keeps triggering false positives, consider adjusting your agent's guardrails.",
    ],
  },

  "/analytics": {
    title: "Anomaly Detection",
    description:
      "Monitors your agents for unusual behavior patterns — sudden spikes in activity, unexpected silence, or abnormal token usage. Baselines are computed from rolling 7-day averages.",
    concepts: [
      {
        term: "Baseline",
        explanation:
          "The expected range of normal behavior for an agent, computed from its recent 7-day history.",
      },
      {
        term: "Spike",
        explanation:
          "Activity significantly above the baseline — could indicate a runaway agent or unexpected load.",
      },
      {
        term: "Silence",
        explanation:
          "An agent that hasn't sent events when it normally would — may indicate a crash or misconfiguration.",
      },
    ],
    tasks: [
      { label: "Investigate a spike", detail: "Click on any anomaly to see the agent's activity timeline and compare against its baseline." },
      { label: "Set up silence alerts", detail: "Configure notification preferences to get alerted when agents go quiet." },
    ],
  },

  "/costs": {
    title: "Costs",
    description:
      "Track how much your AI agents are spending across all model providers. See daily burn rate, per-agent and per-model breakdowns, and projected monthly spend. Set budget limits to prevent overspending.",
    concepts: [
      {
        term: "Daily Burn",
        explanation:
          "Today's estimated spend based on token usage and model pricing.",
      },
      {
        term: "Projected Monthly",
        explanation:
          "Extrapolates your current spending rate to estimate the full month's cost.",
      },
      {
        term: "Budget Limit",
        explanation:
          "A spending cap you set per tenant. Arkon alerts you at 80% and 100% of the limit.",
      },
    ],
    tasks: [
      { label: "Set a budget", detail: "Go to Admin Panel to set daily or monthly budget limits per tenant." },
      { label: "Export cost data", detail: "Click the CSV Export button for a downloadable cost report." },
      { label: "Find cost anomalies", detail: "Look for the anomaly badge on per-agent cards — these agents are spending significantly more than their 7-day average." },
    ],
    tips: [
      "Check Optimization Tips at the bottom for actionable suggestions to reduce costs.",
    ],
  },

  "/workflows": {
    title: "Workflows",
    description:
      "Automate responses to events in your AI infrastructure. Workflows use a visual node-based builder — connect triggers, conditions, HTTP requests, and notification nodes to create powerful automations.",
    concepts: [
      {
        term: "Trigger",
        explanation:
          "What starts a workflow — a cron schedule, a manual button click, or a webhook.",
      },
      {
        term: "Node",
        explanation:
          "A single step in a workflow — HTTP requests, conditions (if/else), or notifications.",
      },
      {
        term: "Template",
        explanation:
          "Pre-built workflow recipes for common tasks like health checks, threat responses, and cost reports.",
      },
    ],
    tasks: [
      { label: "Create from template", detail: "Click New Workflow and choose from 6 starter templates." },
      { label: "Build from scratch", detail: "Select Blank Canvas to start with an empty workflow." },
      { label: "Schedule a workflow", detail: "Use a Cron Trigger node with a cron expression (e.g., */5 * * * * for every 5 minutes)." },
    ],
  },

  "/tools/approvals": {
    title: "Approvals",
    description:
      "Review and act on pending approval requests from your agents. When agents request permission for sensitive actions (spending over a threshold, executing dangerous commands, etc.), the requests appear here.",
    concepts: [
      {
        term: "Approval Request",
        explanation:
          "A request from an agent asking for permission to perform a sensitive action.",
      },
      {
        term: "Auto-approve",
        explanation:
          "Rules that automatically approve certain request types without manual review.",
      },
    ],
    tasks: [
      { label: "Approve or reject", detail: "Click Approve or Reject on any pending request. Add an optional note explaining your decision." },
      { label: "View history", detail: "Switch to the Resolved tab to see past approval decisions." },
    ],
  },

  "/infrastructure": {
    title: "Infrastructure",
    description:
      "Monitor the servers running your AI agents. See CPU, memory, disk usage, and service status for each node. Arkon collects metrics via SSH (remote nodes) or self-reporting (local nodes).",
    concepts: [
      {
        term: "Node",
        explanation:
          "A server or machine in your infrastructure. Nodes self-report metrics or are polled via SSH.",
      },
      {
        term: "Degraded",
        explanation:
          "A node reporting high resource usage (CPU > 80%, memory > 90%, or disk > 85%) but still online.",
      },
      {
        term: "Offline",
        explanation:
          "A node that hasn't reported metrics recently. Check connectivity and services.",
      },
    ],
    tasks: [
      { label: "Add a server", detail: "Register a new node via the API or Admin Panel with its hostname and SSH credentials." },
      { label: "Check services", detail: "Each node card shows which services are running (e.g., OpenClaw, Ollama, Nginx)." },
      { label: "Set up alerts", detail: "Configure notifications to get alerted when nodes go offline or become degraded." },
    ],
  },

  "/tools/mcp-gateway": {
    title: "MCP Gateway",
    description:
      "The MCP (Model Context Protocol) Gateway proxies and secures your agents' access to external tools. Register MCP servers, control which agents can use which tools, and monitor tool usage.",
    concepts: [
      {
        term: "MCP",
        explanation:
          "Model Context Protocol — a standard for connecting AI models to external tools and data sources.",
      },
      {
        term: "MCP Server",
        explanation:
          "A service that provides tools to your agents via the MCP protocol (e.g., web search, file access, database queries).",
      },
      {
        term: "Gateway Proxy",
        explanation:
          "Arkon sits between your agents and MCP servers, adding authentication, logging, and access control.",
      },
    ],
    tasks: [
      { label: "Register an MCP server", detail: "Add a new server with its URL and supported tools." },
      { label: "Control access", detail: "Assign which agents can use which MCP servers." },
      { label: "Monitor usage", detail: "View call counts and latency for each MCP server." },
    ],
  },

  "/tools/mcp": {
    title: "MCP Servers",
    description:
      "Manage your MCP server inventory. View registered servers, their tools, connection status, and configuration. Export server configs for sharing across environments.",
    tasks: [
      { label: "Add a server", detail: "Register a new MCP server with its endpoint URL and authentication details." },
      { label: "Export config", detail: "Download a server's configuration for use in another Arkon instance." },
      { label: "Assign to agents", detail: "Link MCP servers to specific agents to control tool access." },
    ],
  },

  "/compliance": {
    title: "Compliance",
    description:
      "Audit logs, data export, and GDPR compliance tools. Every action in Arkon is logged — agent events, user actions, kills, purges, and configuration changes. Export data for regulatory requirements.",
    concepts: [
      {
        term: "Audit Log",
        explanation:
          "A tamper-evident record of every action taken in Arkon — who did what, when, and why.",
      },
      {
        term: "GDPR Purge",
        explanation:
          "Delete all data associated with a specific user or agent to comply with data deletion requests.",
      },
    ],
    tasks: [
      { label: "Search audit logs", detail: "Filter by actor, action type, resource, or date range." },
      { label: "Export data", detail: "Download audit logs or event data as CSV for external analysis." },
      { label: "Purge user data", detail: "Use the GDPR purge tool to delete all data for a specific entity." },
    ],
  },

  "/benchmarks": {
    title: "Benchmarks",
    description:
      "Compare agent performance across key metrics — response time, cost efficiency, error rate, and throughput. Identify your best and worst performers.",
    concepts: [
      {
        term: "Cost per Message",
        explanation:
          "Average cost to process one message — lower is more efficient.",
      },
      {
        term: "Error Rate",
        explanation:
          "Percentage of events that resulted in errors — lower is better.",
      },
    ],
    tasks: [
      { label: "Compare agents", detail: "Select two or more agents to see a side-by-side performance comparison." },
      { label: "Identify issues", detail: "Look for agents with high error rates or unusually high cost per message." },
    ],
  },

  "/tools/intake": {
    title: "Client Intake",
    description:
      "Manage client onboarding forms. When new clients submit intake forms, their information appears here for review and processing. Create agents and tenants from intake submissions.",
    tasks: [
      { label: "Review submissions", detail: "Click any submission to see the full intake form details." },
      { label: "Provision a client", detail: "Use the quick-provision flow to create a tenant and agent from an intake submission." },
    ],
  },

  "/activity": {
    title: "Activity",
    description:
      "Real-time event stream showing everything your agents are doing — messages sent and received, tool calls, errors, and system events. Filter by agent, event type, or time range.",
    tasks: [
      { label: "Filter events", detail: "Use the type filter to focus on specific event types (messages, tool calls, errors)." },
      { label: "Find threats", detail: "Events with threat indicators are highlighted — click through to ThreatGuard for details." },
    ],
  },

  "/settings/notifications": {
    title: "Notification Settings",
    description:
      "Configure how and where you receive alerts. Set up channels (Telegram, Slack, Discord, Email, Webhook) and choose which notification types each channel receives.",
    tasks: [
      { label: "Add a channel", detail: "Enable a notification channel and provide its configuration (webhook URL, bot token, etc.)." },
      { label: "Test delivery", detail: "Click the Test button on any channel to send a test notification and verify it works." },
      { label: "Customize types", detail: "Toggle which notification types (threats, anomalies, budget alerts, etc.) each channel receives." },
    ],
  },

  "/settings": {
    title: "Settings",
    description:
      "Configure your Arkon instance — notification preferences, admin settings, and system configuration.",
    tasks: [
      { label: "Set up notifications", detail: "Configure alert channels in Notification Settings." },
    ],
  },

  "/tools/command": {
    title: "Command",
    description:
      "Send direct commands to your agents. Use the command interface to instruct agents to perform specific tasks, run tools, or execute actions.",
    tasks: [
      { label: "Send a command", detail: "Type a command and select which agent should execute it." },
    ],
  },

  "/tools/tasks": {
    title: "Tasks",
    description:
      "Track action items and to-dos across your AI operations. Create, assign, and prioritize tasks for yourself or your agents.",
    tasks: [
      { label: "Create a task", detail: "Click Add Task to create a new action item." },
      { label: "Reorder tasks", detail: "Drag and drop tasks to change their priority order." },
    ],
  },

  "/tools/agents-live": {
    title: "Live Agents",
    description:
      "Monitor active agent sessions in real time. See what each agent is currently doing, how long it's been running, and take immediate action if needed.",
    tasks: [
      { label: "Kill an agent", detail: "Click the Kill button to immediately stop an agent's current action." },
      { label: "Pause an agent", detail: "Click Pause to temporarily suspend an agent without terminating its session." },
    ],
  },

  "/tools/crons": {
    title: "Cron Jobs",
    description:
      "View and manage scheduled automations. Cron jobs run on a schedule (e.g., every 5 minutes, daily at midnight) to perform automated tasks.",
    tasks: [
      { label: "View schedules", detail: "See all active cron jobs with their next run time." },
    ],
  },

  "/tools/docs": {
    title: "Docs",
    description:
      "Agent documentation and knowledge base. Store and organize reference documents, SOPs, and configuration guides that your agents can access.",
    tasks: [
      { label: "Add a document", detail: "Click New Doc to create a new document or upload an existing file." },
      { label: "Pin for quick access", detail: "Star important documents to pin them to the sidebar for quick access." },
    ],
  },

  "/tools/calendar": {
    title: "Calendar",
    description:
      "Schedule and events view. Track important dates, deadlines, and scheduled operations across your AI infrastructure.",
    tasks: [
      { label: "Create an event", detail: "Click on any date to create a new calendar event." },
    ],
  },
};

/* ── Glossary terms ───────────────────────────────────────────────────────── */

export interface GlossaryTerm {
  term: string;
  definition: string;
  link?: string;
}

export const glossaryTerms: GlossaryTerm[] = [
  { term: "Agent", definition: "An AI model or system that sends events to Arkon for monitoring and governance. Could be powered by OpenClaw, NemoClaw, CrewAI, AutoGen, or any custom framework.", link: "/agents" },
  { term: "Anomaly", definition: "A deviation from an agent's normal behavior pattern — a spike in activity, unexpected silence, or abnormal spending. Detected by comparing against a rolling 7-day baseline.", link: "/analytics" },
  { term: "Approval", definition: "A request from an agent asking for human permission before performing a sensitive action. Approvals are configured per agent and action type.", link: "/tools/approvals" },
  { term: "Baseline", definition: "The expected range of normal behavior for an agent, computed from its rolling 7-day history. Used to detect anomalies.", link: "/analytics" },
  { term: "Budget Limit", definition: "A spending cap set per tenant. Arkon sends alerts at 80% and 100% of the limit. Configurable as daily or monthly.", link: "/costs" },
  { term: "Control Plane", definition: "The management layer that monitors, governs, and orchestrates AI agents. Arkon is an AI Operations Control Plane." },
  { term: "Credential Leak", definition: "A threat class where an agent exposes an API key, password, or secret in its output. Requires immediate purging and credential rotation.", link: "/security" },
  { term: "Event", definition: "Any logged action from an agent — messages sent/received, tool calls, errors, or system actions. Events are the core data unit in Arkon.", link: "/activity" },
  { term: "Health Score", definition: "A composite 0–100 score combining agent uptime (25pts), threat level (25pts), budget status (25pts), and infrastructure health (25pts).", link: "/" },
  { term: "Ingest", definition: "The process of receiving events from agents. Agents send events to Arkon's /api/ingest endpoint with their API token." },
  { term: "Kill Switch", definition: "Emergency controls to immediately stop a running agent. Available via the global banner, per-agent buttons, or Ctrl+Shift+K keyboard shortcut.", link: "/tools/agents-live" },
  { term: "MCP", definition: "Model Context Protocol — an open standard for connecting AI models to external tools and data sources. Arkon can proxy and secure MCP connections.", link: "/tools/mcp-gateway" },
  { term: "NemoClaw", definition: "NVIDIA's enterprise AI agent framework, announced at GTC 2026. Arkon provides native monitoring support for NemoClaw agents." },
  { term: "Node", definition: "A server or machine in your infrastructure that runs agents or services. Nodes report metrics to Arkon for monitoring.", link: "/infrastructure" },
  { term: "OpenClaw", definition: "An open-source AI agent framework. Arkon was originally built for OpenClaw and provides deep integration with its gateway and event system." },
  { term: "OpenShell", definition: "NemoClaw's policy system for controlling agent behavior. Arkon can display and monitor OpenShell policies." },
  { term: "Prompt Injection", definition: "A threat class where someone tries to trick an agent into ignoring its instructions — e.g., 'ignore previous instructions' or persona hijacking attempts.", link: "/security" },
  { term: "Purge", definition: "Permanently delete an event from Arkon's database. For credential leaks, Arkon also attempts to delete the message from the source channel (Discord, Telegram, etc.).", link: "/security" },
  { term: "Redact", definition: "Replace sensitive content in an event with [REDACTED] placeholders while keeping the event for audit purposes.", link: "/security" },
  { term: "Session", definition: "A continuous period of agent activity. Sessions are tracked for duration, cost, and action count." },
  { term: "Severity", definition: "The urgency level of a threat — Critical (immediate action), High (urgent), Medium (review), or Low (informational).", link: "/security" },
  { term: "Tenant", definition: "An organization or client in Arkon's multi-tenant system. Each tenant has its own agents, budgets, and data isolation." },
  { term: "Threat Class", definition: "The category of a detected threat — prompt_injection, shell_command, or credential_leak. Each class has different recommended actions.", link: "/security" },
  { term: "Token", definition: "The basic unit of text that AI models process. Input tokens (what you send) and output tokens (what the model generates) determine cost." },
  { term: "Tool Call", definition: "When an agent uses an external tool — web search, file access, API call, code execution, etc. Tool calls are logged as events.", link: "/activity" },
  { term: "Trigger", definition: "What starts a workflow — a cron schedule (time-based), manual button press, or webhook (external event).", link: "/workflows" },
  { term: "Workflow", definition: "An automation built with Arkon's visual builder. Workflows connect triggers, conditions, API calls, and notifications to automate operations.", link: "/workflows" },
];
