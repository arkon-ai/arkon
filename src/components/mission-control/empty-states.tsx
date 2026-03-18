"use client";

import Link from "next/link";
import {
  Sparkles,
  UserPlus,
  Settings,
  ShieldCheck,
  Wallet,
  Workflow,
  Radio,
  Server,
  CheckCircle,
  Globe,
  Inbox,
  Bot,
} from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  actionHref,
  icon: Icon = Sparkles,
  compact = false,
}: {
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
  icon?: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[16px] border border-border border-dashed bg-bg-card/50 text-center ${
        compact ? "px-4 py-8" : "px-6 py-12"
      }`}
    >
      <div
        className={`mb-4 flex items-center justify-center rounded-2xl border border-border bg-bg-deep ${
          compact ? "h-10 w-10" : "h-14 w-14"
        }`}
      >
        <Icon className={`${compact ? "h-4 w-4" : "h-6 w-6"} text-text-muted`} />
      </div>
      <h3 className={`font-semibold text-text ${compact ? "text-sm" : "text-base"}`}>{title}</h3>
      <p className={`mt-2 max-w-sm leading-6 text-text-dim ${compact ? "text-xs" : "text-sm"}`}>
        {description}
      </p>
      {action && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 rounded-[12px] bg-accent/8 px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/14"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

/* ── Section-specific empty states ─────────────────────────────────────── */

export function ThreatGuardEmpty() {
  return (
    <EmptyState
      icon={ShieldCheck}
      title="No threats detected"
      description="ThreatGuard is actively monitoring your agents. When threats are detected, they'll appear here with severity ratings and recommended actions."
    />
  );
}

export function CostsEmpty() {
  return (
    <EmptyState
      icon={Wallet}
      title="No cost data yet"
      description="Once your agents start processing requests, costs will appear here with daily burn rate, per-agent breakdown, and model-level detail."
    />
  );
}

export function WorkflowsEmpty() {
  return (
    <EmptyState
      icon={Workflow}
      title="No workflows yet"
      description="Automate your agent operations with workflows. Run health checks, auto-respond to threats, or send daily cost reports."
      action="Create your first workflow"
      actionHref="/workflows?new=1"
    />
  );
}

export function ActivityEmpty() {
  return (
    <EmptyState
      icon={Radio}
      title="Waiting for events"
      description="No events match your filters. Once your agents start sending events via the ingest API, they'll stream here in real-time."
    />
  );
}

export function InfrastructureEmpty() {
  return (
    <EmptyState
      icon={Server}
      title="No servers monitored"
      description="Add your first server to start monitoring CPU, memory, disk, and service health across your infrastructure."
      action="Add a server"
      actionHref="/admin"
    />
  );
}

export function ApprovalsEmpty() {
  return (
    <EmptyState
      icon={CheckCircle}
      title="No pending approvals"
      description="When agents request approval for sensitive actions, they'll appear here for your review."
    />
  );
}

export function McpGatewayEmpty() {
  return (
    <EmptyState
      icon={Globe}
      title="No proxy traffic yet"
      description="Register MCP servers and route agent tool calls through the gateway to add logging, rate limits, and access controls."
      action="Register MCP server"
      actionHref="/tools/mcp"
    />
  );
}

export function IntakeEmpty() {
  return (
    <EmptyState
      icon={Inbox}
      title="No submissions yet"
      description="Share your intake form URL with clients. When they submit, their responses will appear here for review."
    />
  );
}

export function AgentsEmpty() {
  return (
    <EmptyState
      icon={Bot}
      title="No agents registered"
      description="Register your first agent to start monitoring activity, costs, and security across your AI infrastructure."
      action="Add agent"
      actionHref="/admin"
    />
  );
}

/* ── First-run banner ────────────────────────────────────────────────────── */

export function FirstRunBanner() {
  return (
    <div className="rounded-[16px] border border-accent/20 bg-[linear-gradient(135deg,rgba(0,212,126,0.04),rgba(0,212,126,0.04))] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-text">Welcome to Arkon</h2>
          <p className="mt-1 text-sm leading-6 text-text-dim">
            Your agent monitoring dashboard is ready. Connect your first OpenClaw agent to start
            seeing real-time events, session data, and performance metrics.
          </p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 rounded-[12px] bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:bg-accent/16"
        >
          Set up first agent
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Step number={1} title="Register Agent" description="Create an agent in Admin Panel and get the token" icon={UserPlus} />
        <Step number={2} title="Configure OpenClaw" description="Add MC_AGENT_TOKEN to your agent's .env" icon={Settings} />
        <Step number={3} title="Start Monitoring" description="Events will appear here in real-time" icon={Sparkles} />
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex gap-3 rounded-[12px] bg-bg-deep/50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/20 text-xs font-bold text-accent">
        {number}
      </div>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-text-dim">{description}</p>
      </div>
    </div>
  );
}
