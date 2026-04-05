/**
 * Framework Config Schema Registry
 * Drives the agent registration wizard — all screens adapt dynamically
 * based on the selected framework's config.
 */

export type WizardStep =
  | "framework"
  | "tenant"
  | "location"
  | "address"
  | "tls"
  | "token"
  | "test"
  | "naming"
  | "emergency"
  | "summary";

export type KillCapability = "full" | "partial" | "none";
export type FrameworkStatus = "supported" | "beta" | "coming-soon";
export type ProtocolType = "ws-rpc" | "rest" | "websocket" | "grpc";
export type AuthType = "token" | "api-key" | "bearer" | "none";

export interface FieldConfig {
  label: string;
  placeholder?: string;
  helper: string;
  findCommand?: string;
  setCommand?: string;
}

export interface TlsFieldConfig {
  explanation: string;
  enableCommand?: string;
  fingerprintCommand?: string;
}

export interface FrameworkConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  status: FrameworkStatus;

  defaultPort: number;
  protocol: ProtocolType;
  authType: AuthType;
  tlsRequired: boolean;

  probeEndpoint: string;
  steps: WizardStep[];

  fields: {
    address?: FieldConfig;
    port?: { label: string; default: number; helper: string };
    token?: FieldConfig;
    tls?: TlsFieldConfig;
    ssh?: { explanation: string };
  };

  helperCommands: Record<string, string>;

  killCapability: KillCapability;
  killMethod: string;

  dashboardUrl?: string;
  dashboardLabel?: string;
}

// ─── Framework Registry ───────────────────────────────────────

export const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
  openclaw: {
    id: "openclaw",
    label: "OpenCLAW",
    icon: "Cpu",
    description: "AI agent gateway with WS-RPC protocol",
    status: "supported",
    defaultPort: 18789,
    protocol: "ws-rpc",
    authType: "token",
    tlsRequired: true,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "tls", "token", "test", "naming", "emergency", "summary"],
    fields: {
      address: {
        label: "Gateway Address",
        placeholder: "100.90.212.53",
        helper: "On the gateway server, run: openclaw gateway status \u2014 look for the Listening: line",
      },
      port: { label: "Gateway Port", default: 18789, helper: "Default: 18789" },
      token: {
        label: "Gateway Token",
        helper: "This is the shared secret that lets Arkon authenticate with the gateway.",
        findCommand: "openclaw gateway call config.get --params '{\"path\":\"gateway.auth.token\"}' --json",
        setCommand: "openclaw gateway call config.set --params '{\"path\":\"gateway.auth.token\",\"value\":\"<choose-a-strong-token>\"}'",
      },
      tls: {
        explanation: "Your gateway needs a secure connection. Enabling TLS secures BOTH the Arkon connection AND the gateway dashboard.",
        enableCommand: "openclaw gateway call config.set --params '{\"path\":\"gateway.tls.enabled\",\"value\":true}'\nopenclaw gateway restart",
        fingerprintCommand: "openclaw gateway status",
      },
      ssh: { explanation: "SSH access enables Arkon to stop/restart the entire gateway in emergencies." },
    },
    helperCommands: {
      findAddress: "openclaw gateway status",
      checkRunning: "systemctl --user status openclaw-gateway.service",
    },
    killCapability: "full",
    killMethod: "WS-RPC sessions.abort per session, gateway stop for nuclear",
    dashboardUrl: "http://{host}:{port}/",
    dashboardLabel: "OpenClaw Control",
  },

  paperclip: {
    id: "paperclip",
    label: "Paperclip",
    icon: "Paperclip",
    description: "Multi-agent company orchestration platform",
    status: "beta",
    defaultPort: 3100,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "Paperclip Server Address", placeholder: "localhost", helper: "The IP or hostname where Paperclip is running." },
      port: { label: "Server Port", default: 3100, helper: "Default: 3100" },
      token: { label: "API Key", helper: "Bearer token for Paperclip API authentication.", findCommand: "Check your Paperclip .env file for PAPERCLIP_API_KEY" },
    },
    helperCommands: { findAddress: "Check your Paperclip deployment config" },
    killCapability: "full",
    killMethod: "REST DELETE + PATCH pause/resume. Two-layer: Paperclip status + underlying runtime kill.",
    dashboardUrl: "http://{host}:{port}/",
    dashboardLabel: "Paperclip Dashboard",
  },

  langgraph: {
    id: "langgraph",
    label: "LangGraph",
    icon: "GitBranch",
    description: "Stateful agent workflow platform (LangChain)",
    status: "beta",
    defaultPort: 2024,
    protocol: "rest",
    authType: "none",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "LangGraph Server Address", placeholder: "localhost", helper: "The IP or hostname where LangGraph Server is running." },
      port: { label: "Server Port", default: 2024, helper: "Default: 2024" },
      token: { label: "API Key (optional)", helper: "Required if LangGraph Server has auth enabled." },
    },
    helperCommands: { findAddress: "Check your LangGraph Server or LangSmith deployment" },
    killCapability: "full",
    killMethod: "REST cancel with interrupt or rollback action. Bulk cancel supported.",
  },

  n8n: {
    id: "n8n",
    label: "n8n",
    icon: "Workflow",
    description: "Workflow automation platform",
    status: "beta",
    defaultPort: 5678,
    protocol: "rest",
    authType: "api-key",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "n8n Instance Address", placeholder: "n8n.transformateai.com", helper: "Your n8n instance URL or IP address." },
      port: { label: "Port", default: 5678, helper: "Default: 5678 (may differ behind reverse proxy)" },
      token: { label: "API Key", helper: "Generate in n8n: Settings \u2192 API \u2192 Create API Key", findCommand: "n8n Settings \u2192 API \u2192 Create API Key" },
    },
    helperCommands: { findAddress: "Check your n8n deployment or reverse proxy config" },
    killCapability: "partial",
    killMethod: "Can deactivate workflows but cannot stop running executions via public API.",
    dashboardUrl: "http://{host}:{port}/",
    dashboardLabel: "n8n Editor",
  },

  autogen: {
    id: "autogen",
    label: "AutoGen / AG2",
    icon: "Network",
    description: "Multi-agent conversation framework (Microsoft)",
    status: "beta",
    defaultPort: 8081,
    protocol: "websocket",
    authType: "none",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "test", "naming", "summary"],
    fields: {
      address: { label: "AutoGen Studio Address", placeholder: "localhost", helper: "The IP or hostname where AutoGen Studio is running." },
      port: { label: "Studio Port", default: 8081, helper: "Default: 8081" },
    },
    helperCommands: { findAddress: "Check your AutoGen Studio startup config" },
    killCapability: "full",
    killMethod: "WebSocket stop message. SDK: ExternalTermination.set(). gRPC: worker.stop().",
  },

  dify: {
    id: "dify",
    label: "Dify",
    icon: "Bot",
    description: "LLM app development platform",
    status: "beta",
    defaultPort: 443,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "Dify Instance Address", placeholder: "dify.example.com", helper: "Your Dify instance URL (self-hosted or cloud.dify.ai)." },
      port: { label: "Port", default: 443, helper: "Default: 443 (HTTPS) or 80 (HTTP)" },
      token: { label: "App API Key", helper: "Each Dify app has its own API key. Found in: App \u2192 API Access \u2192 API Key", findCommand: "Dify Dashboard \u2192 Your App \u2192 API Access \u2192 API Key" },
    },
    helperCommands: { findAddress: "Check your Dify deployment or use cloud.dify.ai" },
    killCapability: "full",
    killMethod: "REST stop endpoints for chat and workflow (streaming mode only).",
  },

  openhands: {
    id: "openhands",
    label: "OpenHands",
    icon: "Terminal",
    description: "AI software development agent",
    status: "beta",
    defaultPort: 3000,
    protocol: "rest",
    authType: "api-key",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "OpenHands Server Address", placeholder: "localhost", helper: "Your OpenHands server URL." },
      port: { label: "Port", default: 3000, helper: "Default: 3000" },
      token: { label: "Session API Key", helper: "X-Session-API-Key for OpenHands Cloud, or Bearer token for self-hosted." },
    },
    helperCommands: {},
    killCapability: "full",
    killMethod: "REST DELETE conversation. Pause via SDK only (not REST yet).",
  },

  haystack: {
    id: "haystack",
    label: "Haystack",
    icon: "Search",
    description: "Pipeline-based AI framework (deepset)",
    status: "coming-soon",
    defaultPort: 1416,
    protocol: "rest",
    authType: "none",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "test", "naming", "summary"],
    fields: {
      address: { label: "Hayhooks Server Address", placeholder: "localhost", helper: "Where Hayhooks is running." },
      port: { label: "Port", default: 1416, helper: "Default: 1416" },
    },
    helperCommands: { findAddress: "hayhooks status" },
    killCapability: "partial",
    killMethod: "Undeploy removes pipeline but cannot cancel in-flight runs.",
  },

  "semantic-kernel": {
    id: "semantic-kernel",
    label: "Semantic Kernel",
    icon: "Shield",
    description: "Microsoft agent framework (.NET/Python/Java)",
    status: "coming-soon",
    defaultPort: 0,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "Agent Service Endpoint", placeholder: "your-endpoint.azure.com", helper: "Azure AI Agent Service endpoint, or your custom REST wrapper URL." },
      token: { label: "API Key / Bearer Token", helper: "Azure AI Agent Service key, or your custom wrapper auth token." },
    },
    helperCommands: {},
    killCapability: "partial",
    killMethod: "Azure: cancel via REST. Self-hosted: CancellationToken or SignalDispatcher.",
  },

  crewai: {
    id: "crewai",
    label: "CrewAI",
    icon: "Users",
    description: "Multi-agent orchestration framework",
    status: "coming-soon",
    defaultPort: 8000,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "CrewAI Enterprise URL", placeholder: "your-crew.app.crewai.com", helper: "Your deployed crew URL from CrewAI Enterprise (AMP)." },
      token: { label: "Bearer Token", helper: "CrewAI Enterprise API token for your deployed crew." },
    },
    helperCommands: {},
    killCapability: "none",
    killMethod: "No native kill API. Process-level SIGTERM only.",
  },

  flowise: {
    id: "flowise",
    label: "Flowise",
    icon: "Workflow",
    description: "Visual LLM flow builder",
    status: "coming-soon",
    defaultPort: 3000,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "location", "address", "token", "test", "naming", "summary"],
    fields: {
      address: { label: "Flowise Server Address", placeholder: "localhost", helper: "Where Flowise is running." },
      port: { label: "Port", default: 3000, helper: "Default: 3000" },
      token: { label: "API Key (optional)", helper: "Flowise API key if authentication is enabled." },
    },
    helperCommands: {},
    killCapability: "none",
    killMethod: "No kill API. Read-only monitoring only.",
  },

  custom: {
    id: "custom",
    label: "Custom / Other",
    icon: "Plug",
    description: "HTTP callback or process-level control",
    status: "supported",
    defaultPort: 0,
    protocol: "rest",
    authType: "bearer",
    tlsRequired: false,
    probeEndpoint: "/api/gateway/probe",
    steps: ["framework", "tenant", "address", "token", "test", "naming", "emergency", "summary"],
    fields: {
      address: { label: "Agent Server Address", placeholder: "your-agent-host.com", helper: "The IP or hostname where your agent is running." },
      port: { label: "Port", default: 0, helper: "The port your agent's API listens on" },
      token: { label: "Auth Token / API Key", helper: "Authentication credential for your agent's API." },
      ssh: { explanation: "SSH enables process-level kill (SIGTERM) as a fallback." },
    },
    helperCommands: {},
    killCapability: "partial",
    killMethod: "HTTP callback to user-provided kill endpoint, or SSH + SIGTERM.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────

export function getFrameworksByStatus(): Record<FrameworkStatus, FrameworkConfig[]> {
  const grouped: Record<FrameworkStatus, FrameworkConfig[]> = { supported: [], beta: [], "coming-soon": [] };
  for (const config of Object.values(FRAMEWORK_CONFIGS)) {
    grouped[config.status].push(config);
  }
  return grouped;
}

export function getActiveSteps(frameworkId: string): WizardStep[] {
  const config = FRAMEWORK_CONFIGS[frameworkId];
  if (!config) return ["framework"];
  return config.steps;
}

export function isStepActive(frameworkId: string, step: WizardStep): boolean {
  return getActiveSteps(frameworkId).includes(step);
}

export function resolveDashboardUrl(config: FrameworkConfig, host: string, port: number): string | null {
  if (!config.dashboardUrl) return null;
  return config.dashboardUrl.replace("{host}", host).replace("{port}", String(port));
}

export function killCapabilityColor(cap: KillCapability): string {
  switch (cap) {
    case "full": return "text-emerald-400";
    case "partial": return "text-amber-400";
    case "none": return "text-red-400";
  }
}

export function killCapabilityLabel(cap: KillCapability): string {
  switch (cap) {
    case "full": return "Full Control";
    case "partial": return "Limited Control";
    case "none": return "Monitor Only";
  }
}
