"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ShellHeader, Card, SectionTitle } from "./dashboard";

/* ─── Types ─────────────────────────────────────────────── */
type Agent = {
  id: string;
  name: string;
  role: "owner" | "admin" | "agent" | "viewer";
  created_at: string;
  updated_at: string;
};

/* ─── Auth helpers ───────────────────────────────────────── */
function getHeaders(): Record<string, string> {
  const cookieToken = typeof document !== "undefined"
    ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "") : "";
  const token = cookieToken || "";
  const csrf = typeof document !== "undefined"
    ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (csrf) h["x-csrf-token"] = csrf;
  return h;
}

function getSessionRole(): string {
  if (typeof document === "undefined") return "owner";
  return document.cookie.match(/mc_role=([^;]+)/)?.[1] ?? "owner";
}

/* ─── Role badge ─────────────────────────────────────────── */
const ROLE_COLOURS: Record<string, string> = {
  owner: "bg-[rgba(0,212,126,0.15)] text-[#00D47E]",
  admin: "bg-[rgba(0,212,126,0.15)] text-cyan-400",
  agent: "bg-[rgba(59,130,246,0.15)] text-blue-400",
  viewer: "bg-[rgba(100,116,139,0.15)] text-slate-400",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOURS[role] ?? ""}`}>
      {role}
    </span>
  );
}

/* ─── Section wrapper ────────────────────────────────────── */
function AdminSection({
  icon, title, description, colour = "border-[#2E2E3A]", children,
}: {
  icon: string; title: string; description: string; colour?: string; children: React.ReactNode;
}) {
  return (
    <Card className={`border ${colour}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 text-2xl">{icon}</div>
        <div>
          <h3 className="text-base font-semibold text-[#E4E4ED]">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#8888A0]">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

/* ─── Styled inputs ──────────────────────────────────────── */
function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#8888A0]">{label}</label>
      <input
        {...props}
        className="w-full rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] px-3 py-2.5 text-sm text-[#E4E4ED] outline-none focus:border-[#00D47E] focus:ring-2 focus:ring-[rgba(0,212,126,0.12)] transition"
      />
    </div>
  );
}

function Textarea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#8888A0]">{label}</label>
      <textarea
        {...props}
        rows={3}
        className="w-full rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] px-3 py-2.5 text-sm text-[#E4E4ED] outline-none focus:border-[#00D47E] focus:ring-2 focus:ring-[rgba(0,212,126,0.12)] transition resize-y"
      />
    </div>
  );
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#8888A0]">{label}</label>
      <select
        {...props}
        className="w-full rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] px-3 py-2.5 text-sm text-[#E4E4ED] outline-none focus:border-[#00D47E] transition"
      >
        {children}
      </select>
    </div>
  );
}

function Btn({ children, variant = "primary", disabled, onClick, type = "button" }: {
  children: React.ReactNode; variant?: "primary" | "danger" | "ghost"; disabled?: boolean; onClick?: () => void; type?: "button" | "submit";
}) {
  const base = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-[#00D47E] text-[#0A0A0C] hover:opacity-90",
    danger: "bg-[rgba(239,68,68,0.15)] text-red-400 border border-red-500/30 hover:bg-[rgba(239,68,68,0.25)]",
    ghost: "border border-[#2E2E3A] text-[#94a3b8] hover:border-[#00D47E] hover:text-[#00D47E]",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

/* ─── Token reveal box ───────────────────────────────────── */
function TokenReveal({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-amber-500/30 bg-[rgba(245,158,11,0.08)] p-4">
      <p className="mb-2 text-xs font-semibold text-amber-400">⚠️ Copy this token now — it will never be shown again</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-[#0A0A0C] px-3 py-2 text-xs font-mono text-[#00D47E]">{token}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="rounded-lg border border-[#2E2E3A] px-3 py-2 text-xs text-[#8888A0] hover:text-[#00D47E] transition"
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
      <button onClick={onDismiss} className="mt-3 text-xs text-[#8888A0] hover:text-[#E4E4ED] transition">
        I've saved the token — dismiss
      </button>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export function AdminPanel() {
  const [sessionRole, setSessionRole] = useState<string>("owner");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Read role from cookie after mount
  useEffect(() => { setSessionRole(getSessionRole()); }, []);

  // Ingest state
  const [ingestAgent, setIngestAgent] = useState("");
  const [ingestType, setIngestType] = useState("message");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);

  // Purge state
  const [purgeAgent, setPurgeAgent] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);

  // Create agent state
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("agent");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  // Rotate token state
  const [rotateAgent, setRotateAgent] = useState("");
  const [rotateConfirm, setRotateConfirm] = useState("");
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const [rotateBusy, setRotateBusy] = useState(false);

  // Edit role state
  const [editAgent, setEditAgent] = useState("");
  const [editRole, setEditRole] = useState("agent");
  const [editBusy, setEditBusy] = useState(false);

  // Docs sync state
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Nuclear purge
  const [nukeConfirm, setNukeConfirm] = useState("");
  const [nukeBusy, setNukeBusy] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("/api/admin/agents", { headers: getHeaders() });
      const data = await res.json() as { agents: Agent[] };
      setAgents(data.agents ?? []);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  /* ── Ingest ── */
  const handleIngest = async () => {
    if (!ingestAgent || !ingestContent.trim()) {
      toast.error("Select an agent and enter content");
      return;
    }
    setIngestBusy(true);
    try {
      const agentToken = "";
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
        body: JSON.stringify({
          agent_id: ingestAgent,
          type: ingestType,
          content: ingestContent,
          metadata: {},
        }),
      });
      if (!res.ok) throw new Error("Ingest failed");
      toast.success(`Event logged for ${ingestAgent}`);
      setIngestContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setIngestBusy(false);
    }
  };

  /* ── Purge ── */
  const handlePurge = async () => {
    const target = agents.find((a) => a.id === purgeAgent);
    if (!target) { toast.error("Select an agent"); return; }
    if (purgeConfirm !== target.name) {
      toast.error(`Type "${target.name}" exactly to confirm`);
      return;
    }
    setPurgeBusy(true);
    try {
      const res = await fetch("/api/purge", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ agent_id: purgeAgent }),
      });
      if (!res.ok) throw new Error("Purge failed");
      toast.success(`All data for ${target.name} has been permanently deleted`);
      setPurgeAgent("");
      setPurgeConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurgeBusy(false);
    }
  };

  /* ── Create agent ── */
  const handleCreate = async () => {
    if (!newId.trim() || !newName.trim()) {
      toast.error("Agent ID and name are required");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ id: newId, name: newName, agentRole: newRole }),
      });
      const data = await res.json() as { ok?: boolean; token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setNewToken(data.token ?? null);
      setNewId(""); setNewName(""); setNewRole("agent");
      await fetchAgents();
      toast.success(`Agent "${newName}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  };

  /* ── Rotate token ── */
  const handleRotate = async () => {
    const target = agents.find((a) => a.id === rotateAgent);
    if (!target) { toast.error("Select an agent"); return; }
    if (rotateConfirm !== target.name) {
      toast.error(`Type "${target.name}" exactly to confirm`);
      return;
    }
    setRotateBusy(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ id: rotateAgent, action: "rotate_token" }),
      });
      const data = await res.json() as { ok?: boolean; token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rotate failed");
      setRotatedToken(data.token ?? null);
      setRotateConfirm("");
      toast.success("Token rotated — old token is now invalid");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotate failed");
    } finally {
      setRotateBusy(false);
    }
  };

  /* ── Edit role ── */
  const handleEditRole = async () => {
    if (!editAgent) { toast.error("Select an agent"); return; }
    setEditBusy(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ id: editAgent, action: "set_role", newRole: editRole }),
      });
      if (!res.ok) throw new Error("Role update failed");
      await fetchAgents();
      toast.success("Role updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setEditBusy(false);
    }
  };

  /* ── Docs sync ── */
  const handleSync = async () => {
    setSyncBusy(true);
    try {
      const res = await fetch("/api/tools/docs/sync", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ documents: [] }), // Server will handle full sync
      });
      if (!res.ok) throw new Error("Sync failed");
      setLastSync(new Date().toLocaleTimeString("en-ZA"));
      toast.success("Workspace docs synced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  };

  /* ── Nuclear purge ── */
  const handleNuke = async () => {
    if (nukeConfirm !== "DELETE EVERYTHING") {
      toast.error('Type "DELETE EVERYTHING" exactly');
      return;
    }
    setNukeBusy(true);
    try {
      for (const agent of agents) {
        await fetch("/api/purge", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ agent_id: agent.id }),
        });
      }
      toast.success("All agent data has been wiped");
      setNukeConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nuke failed");
    } finally {
      setNukeBusy(false);
    }
  };

  const agentOptions = agents.map((a) => (
    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
  ));

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="Admin Panel"
        subtitle={sessionRole === "owner"
          ? "Owner control centre — agents, tokens, roles, and system operations."
          : "Admin panel — manage events, approvals, and agent data."}
      />

      {/* ── Agent List ── */}
      <Card>
        <SectionTitle title="Registered Agents" note={loadingAgents ? "Loading..." : `${agents.length} agents`} />
        {loadingAgents ? (
          <div className="text-sm text-[#8888A0]">Loading agents...</div>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-[#2E2E3A] bg-[#0A0A0C]/70 px-4 py-3">
                <div>
                  <span className="text-sm font-semibold text-[#E4E4ED]">{a.name}</span>
                  <span className="ml-2 text-xs text-[#8888A0]">id: {a.id}</span>
                </div>
                <RoleBadge role={a.role} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Data Management ── */}
      <SectionTitle title="Data Management" />

      <AdminSection
        icon="📥"
        title="Manual Event Ingest"
        description="Manually push an event into Arkon's database. Use this to log something that happened outside the normal flow — for example a manual note, a completed task, or a system event you want tracked. This adds to the agent's history, it does not delete anything."
      >
        <div className="space-y-3">
          <Select label="Agent" value={ingestAgent} onChange={(e) => setIngestAgent(e.target.value)}>
            <option value="">Select agent...</option>
            {agentOptions}
          </Select>
          <Select label="Event Type" value={ingestType} onChange={(e) => setIngestType(e.target.value)}>
            <option value="message">message — a conversation or chat event</option>
            <option value="tool_call">tool_call — a tool or action was used</option>
            <option value="system">system — a system or infrastructure event</option>
            <option value="note">note — a manual note you want recorded</option>
            <option value="error">error — log an error that occurred</option>
          </Select>
          <Textarea label="Content" value={ingestContent} onChange={(e) => setIngestContent(e.target.value)} placeholder="Describe the event..." />
          <Btn onClick={handleIngest} disabled={ingestBusy}>
            {ingestBusy ? "Logging..." : "📥 Log Event"}
          </Btn>
        </div>
      </AdminSection>

      <AdminSection
        icon="🗑️"
        title="Purge Agent Data"
        description="Permanently deletes ALL events, tool calls, sessions, and stats for a specific agent. This CANNOT be undone. Use this to wipe an agent's history clean — for example if you're resetting a test agent, cleaning up old data, or starting fresh. The agent itself remains registered — only its history is deleted."
        colour="border-red-500/20"
      >
        <div className="space-y-3">
          <Select label="Agent to Purge" value={purgeAgent} onChange={(e) => { setPurgeAgent(e.target.value); setPurgeConfirm(""); }}>
            <option value="">Select agent...</option>
            {agentOptions}
          </Select>
          {purgeAgent && (
            <Input
              label={`Type "${agents.find(a => a.id === purgeAgent)?.name ?? ""}" to confirm`}
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="Type the agent's name exactly..."
            />
          )}
          <Btn variant="danger" onClick={handlePurge} disabled={purgeBusy || !purgeAgent || purgeConfirm !== (agents.find(a => a.id === purgeAgent)?.name ?? "____")}>
            {purgeBusy ? "Purging..." : "🗑️ Permanently Delete This Agent's Data"}
          </Btn>
        </div>
      </AdminSection>

      {/* ── Agent Management — owner only ── */}
      {sessionRole === "owner" && <SectionTitle title="Agent Management" />}

      {sessionRole === "owner" && <AdminSection
        icon="➕"
        title="Create New Agent"
        description="Register a new agent in Arkon. Each agent gets a unique token they use to send data. Use this when setting up a new AI assistant or a client deployment. The token is shown ONCE — copy it immediately and store it safely."
      >
        <div className="space-y-3">
          <Input label="Agent ID (slug — no spaces)" value={newId} onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="e.g. my-agent, client-01, test-agent" />
          <Input label="Display Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. My Assistant" />
          <Select label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="owner">owner — full control (use with caution)</option>
            <option value="admin">admin — can intervene, can't destroy</option>
            <option value="agent">agent — AI write-only (for AI assistants)</option>
            <option value="viewer">viewer — read-only access</option>
          </Select>
          <Btn onClick={handleCreate} disabled={createBusy || !newId || !newName}>
            {createBusy ? "Creating..." : "➕ Create Agent"}
          </Btn>
          {newToken && <TokenReveal token={newToken} onDismiss={() => setNewToken(null)} />}
        </div>
      </AdminSection>}

      {sessionRole === "owner" && <AdminSection
        icon="🔑"
        title="Rotate Agent Token"
        description="Generate a new token for an agent. Their old token stops working immediately — anything using the old token will be locked out. Use this if a token was compromised, shared accidentally, or needs to be refreshed. The new token is shown ONCE."
        colour="border-amber-500/20"
      >
        <div className="space-y-3">
          <Select label="Agent" value={rotateAgent} onChange={(e) => { setRotateAgent(e.target.value); setRotateConfirm(""); setRotatedToken(null); }}>
            <option value="">Select agent...</option>
            {agentOptions}
          </Select>
          {rotateAgent && (
            <Input
              label={`Type "${agents.find(a => a.id === rotateAgent)?.name ?? ""}" to confirm`}
              value={rotateConfirm}
              onChange={(e) => setRotateConfirm(e.target.value)}
              placeholder="Type the agent's name exactly..."
            />
          )}
          <Btn variant="ghost" onClick={handleRotate} disabled={rotateBusy || !rotateAgent || rotateConfirm !== (agents.find(a => a.id === rotateAgent)?.name ?? "____")}>
            {rotateBusy ? "Rotating..." : "🔑 Generate New Token"}
          </Btn>
          {rotatedToken && <TokenReveal token={rotatedToken} onDismiss={() => setRotatedToken(null)} />}
        </div>
      </AdminSection>}

      {sessionRole === "owner" && <AdminSection
        icon="⚙️"
        title="Change Agent Role"
        description="Change what an agent is allowed to do. Owner = full access. Admin = human operator who can intervene but not destroy. Agent = AI write-only. Viewer = read-only. Changing a role takes effect immediately on the next request — no restart needed."
      >
        <div className="space-y-3">
          <Select label="Agent" value={editAgent} onChange={(e) => setEditAgent(e.target.value)}>
            <option value="">Select agent...</option>
            {agentOptions}
          </Select>
          <Select label="New Role" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
            <option value="owner">owner — full control</option>
            <option value="admin">admin — can intervene, can't destroy</option>
            <option value="agent">agent — AI write-only</option>
            <option value="viewer">viewer — read-only</option>
          </Select>
          <Btn onClick={handleEditRole} disabled={editBusy || !editAgent}>
            {editBusy ? "Saving..." : "⚙️ Update Role"}
          </Btn>
        </div>
      </AdminSection>}

      {/* ── Docs — owner only ── */}
      {sessionRole === "owner" && <SectionTitle title="Workspace Docs" />}

      {sessionRole === "owner" && <AdminSection
        icon="🔄"
        title="Sync Workspace Docs"
        description="Scans your workspace files and pushes them into Arkon's document database. Run this after making changes to your workspace so the Docs Viewer stays up to date. Files larger than 30KB are skipped to keep the database lean."
      >
        <div className="flex items-center gap-4">
          <Btn onClick={handleSync} disabled={syncBusy}>
            {syncBusy ? "Syncing..." : "🔄 Sync Workspace Docs"}
          </Btn>
          {lastSync && <span className="text-xs text-[#8888A0]">Last synced: {lastSync}</span>}
        </div>
      </AdminSection>}

      {/* ── Danger Zone — owner only ── */}
      {sessionRole === "owner" && <>
        <SectionTitle title="⚠️ Danger Zone" />
        <AdminSection
          icon="💣"
          title="Wipe All Data"
          description="Permanently deletes ALL data for ALL agents — every event, session, token call, stat, approval, task, document, and calendar item. This cannot be undone. Use ONLY if you are resetting Arkon completely from scratch. The agents themselves remain registered."
          colour="border-red-500/40"
        >
          <div className="space-y-3">
            <Input
              label='Type "DELETE EVERYTHING" to unlock'
              value={nukeConfirm}
              onChange={(e) => setNukeConfirm(e.target.value)}
              placeholder='DELETE EVERYTHING'
            />
            <Btn
              variant="danger"
              onClick={handleNuke}
              disabled={nukeBusy || nukeConfirm !== "DELETE EVERYTHING"}
            >
              {nukeBusy ? "Wiping..." : "💣 Wipe All Agent Data"}
            </Btn>
          </div>
        </AdminSection>
      </>}

      {/* ── Role badge for current session ── */}
      <div className="flex items-center gap-2 pt-2 pb-4">
        <span className="text-xs text-[#8888A0]">Logged in as:</span>
        <RoleBadge role={sessionRole} />
      </div>
    </div>
  );
}
