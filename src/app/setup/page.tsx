"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Bot,
  Code2,
  Zap,
  Rocket,
  Check,
  Copy,
  ShieldCheck,
  Wallet,
  Workflow,
  Network,
  BookOpen,
  Loader2,
  Sparkles,
  PartyPopper,
} from "lucide-react";

const TOTAL_STEPS = 5;

const FRAMEWORKS = [
  { value: "openclaw", label: "OpenClaw" },
  { value: "nemoclaw", label: "NemoClaw" },
  { value: "crewai", label: "CrewAI" },
  { value: "autogen", label: "AutoGen" },
  { value: "custom", label: "Custom / Other" },
];

/* ── Main Setup Wizard ─────────────────────────────────────────────────────── */

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — Account
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2 — Agent
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [framework, setFramework] = useState("openclaw");
  const [agentToken, setAgentToken] = useState("");
  const [agentId, setAgentId] = useState("");

  // Step 4 — First Event
  const [eventReceived, setEventReceived] = useState(false);
  const [listening, setListening] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if setup already done
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data: { setup_completed?: boolean }) => {
        if (data.setup_completed) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleStep1() {
    if (!orgName.trim() || !adminEmail.trim()) {
      setError("Organization name and email are required.");
      return;
    }
    if (password && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "account",
          org_name: orgName.trim(),
          admin_email: adminEmail.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create account.");
        return;
      }
      setStep(2);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2() {
    if (!agentName.trim()) {
      setError("Agent name is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "agent",
          agent_name: agentName.trim(),
          agent_description: agentDescription.trim(),
          framework,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to register agent.");
        return;
      }
      const data = await res.json();
      setAgentToken(data.token);
      setAgentId(data.agent_id);
      setStep(3);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    setListening(true);
    setEventReceived(false);

    // Poll for events from this agent
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        const since = new Date(start).toISOString();
        const res = await fetch(
          `/api/dashboard/activity?agent_id=${agentId}&since=${since}&limit=1`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            setEventReceived(true);
            setListening(false);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {
        // Silent — keep polling
      }

      // Timeout after 2 minutes
      if (Date.now() - start > 120000) {
        setListening(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  }

  async function sendTestEvent() {
    if (!agentToken) return;
    try {
      const baseUrl = window.location.origin;
      await fetch(`${baseUrl}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          type: "message_sent",
          content: "Hello from Arkon setup wizard! This is a test event.",
          metadata: { source: "setup-wizard", test: true },
        }),
      });
    } catch {
      // Silent — the polling will detect it
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "complete" }),
      });
      router.push("/?tour=1");
    } catch {
      router.push("/");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-4 py-12">
      {/* Background effects */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(6, 214, 160, 0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 20%, rgba(139,92,246,0.06), transparent 60%), radial-gradient(ellipse at 50% 80%, rgba(6,214,160,0.04), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo + progress */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a]">
            <span className="text-2xl font-bold text-[#06d6a0]">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {step === 1 && "Welcome to Arkon"}
            {step === 2 && "Register Your First Agent"}
            {step === 3 && "Install the SDK"}
            {step === 4 && "Send Your First Event"}
            {step === 5 && "You're All Set!"}
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-[#475569]">
            AI Control Plane
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex-1">
              <div
                className={`h-1 rounded-full transition-all duration-300 ${
                  i + 1 <= step
                    ? "bg-[#06d6a0]"
                    : "bg-[#1a2a4a]"
                }`}
              />
            </div>
          ))}
          <span className="ml-2 text-xs text-[#475569]">
            {step}/{TOTAL_STEPS}
          </span>
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── Step 1: Account ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-[#94a3b8]">
                Let&apos;s get your control plane running in a few minutes.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme AI Labs"
                  autoFocus
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <button
                type="button"
                onClick={handleStep1}
                disabled={loading || !orgName.trim() || !adminEmail.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#06d6a0] px-4 py-3 font-semibold text-[#050510] transition hover:bg-[#05c090] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Step 2: Register Agent ─────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-[#94a3b8]">
                Register your first AI agent to start monitoring.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Lumina, Atlas, My Assistant"
                  autoFocus
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Description <span className="text-[#475569]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value)}
                  placeholder="What does this agent do?"
                  className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-4 py-3 text-white placeholder:text-[#475569] focus:border-[#06d6a0]/50 focus:outline-none focus:ring-1 focus:ring-[#06d6a0]/50 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Framework
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FRAMEWORKS.map((fw) => (
                    <button
                      key={fw.value}
                      type="button"
                      onClick={() => setFramework(fw.value)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        framework === fw.value
                          ? "border-[#06d6a0]/50 bg-[#06d6a0]/10 text-[#06d6a0]"
                          : "border-[#1a2a4a] bg-[#050510] text-[#94a3b8] hover:border-[#2a3a5a]"
                      }`}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 rounded-xl border border-[#1a2a4a] px-4 py-3 text-sm text-[#94a3b8] transition hover:bg-white/[0.03]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStep2}
                  disabled={loading || !agentName.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06d6a0] px-4 py-3 font-semibold text-[#050510] transition hover:bg-[#05c090] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Register Agent
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: SDK Install ────────────────────────────────────── */}
          {step === 3 && <SdkStep agentToken={agentToken} onBack={() => setStep(2)} onNext={() => setStep(4)} />}

          {/* ── Step 4: First Event ────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              {eventReceived ? (
                <div className="flex flex-col items-center py-4">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#06d6a0]/10">
                    <PartyPopper className="h-8 w-8 text-[#06d6a0]" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Event Received!</h3>
                  <p className="mt-2 text-center text-sm text-[#94a3b8]">
                    Your agent is connected and sending events to Arkon.
                  </p>
                  <ConfettiEffect />
                </div>
              ) : listening ? (
                <div className="flex flex-col items-center py-6">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#06d6a0]/30">
                    <Zap className="h-8 w-8 animate-pulse text-[#06d6a0]" />
                  </div>
                  <h3 className="text-base font-semibold text-white">
                    Listening for your first event...
                  </h3>
                  <p className="mt-2 text-center text-sm text-[#94a3b8]">
                    Send an event from your agent, or use the test button below.
                  </p>
                  <div className="mt-4 flex h-1 w-48 overflow-hidden rounded-full bg-[#1a2a4a]">
                    <div className="animate-[shimmer_2s_ease-in-out_infinite] h-full w-1/3 rounded-full bg-[#06d6a0]/60" />
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm leading-6 text-[#94a3b8]">
                    Let&apos;s verify the connection. Click &quot;Start Listening&quot; then send
                    an event from your agent — or use the test button.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-3">
                {!listening && !eventReceived && (
                  <button
                    type="button"
                    onClick={startListening}
                    className="flex items-center gap-2 rounded-xl bg-[#8b5cf6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c4ddb] active:scale-[0.98]"
                  >
                    <Zap className="h-4 w-4" />
                    Start Listening
                  </button>
                )}
                {(listening || !eventReceived) && !eventReceived && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!listening) startListening();
                      sendTestEvent();
                    }}
                    className="flex items-center gap-2 rounded-xl border border-[#1a2a4a] px-4 py-2.5 text-sm font-medium text-[#94a3b8] transition hover:bg-white/[0.03]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Send Test Event
                  </button>
                )}
              </div>

              {!listening && !eventReceived && (
                <p className="text-center text-xs text-[#475569]">
                  Haven&apos;t received an event? Check your agent configuration and try again.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1 rounded-xl border border-[#1a2a4a] px-4 py-3 text-sm text-[#94a3b8] transition hover:bg-white/[0.03]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition active:scale-[0.98] ${
                    eventReceived
                      ? "bg-[#06d6a0] text-[#050510] hover:bg-[#05c090]"
                      : "border border-[#1a2a4a] text-[#94a3b8] hover:bg-white/[0.03]"
                  }`}
                >
                  {eventReceived ? "Continue" : "Skip for now"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: What's Next ────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-[#94a3b8]">
                Your control plane is ready. Here&apos;s what to explore:
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <FeatureCard
                  icon={ShieldCheck}
                  title="ThreatGuard"
                  description="Detect threats in agent activity"
                  href="/security"
                />
                <FeatureCard
                  icon={Wallet}
                  title="Costs"
                  description="Track spending by agent & model"
                  href="/costs"
                />
                <FeatureCard
                  icon={Workflow}
                  title="Workflows"
                  description="Automate your agent operations"
                  href="/workflows"
                />
                <FeatureCard
                  icon={Network}
                  title="Infrastructure"
                  description="Monitor your servers"
                  href="/infrastructure"
                />
                <FeatureCard
                  icon={Bot}
                  title="Agent Profile"
                  description="View & configure your agent"
                  href={agentId ? `/agent/${agentId}` : "/agents"}
                />
                <FeatureCard
                  icon={BookOpen}
                  title="Documentation"
                  description="Learn more about Arkon"
                  href="/tools/docs"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="flex items-center gap-1 rounded-xl border border-[#1a2a4a] px-4 py-3 text-sm text-[#94a3b8] transition hover:bg-white/[0.03]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06d6a0] px-4 py-3 font-semibold text-[#050510] transition hover:bg-[#05c090] active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Go to Dashboard
                      <Rocket className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[#475569]">
          Powered by Arkon
        </p>
      </div>
    </div>
  );
}

/* ── SDK Install Step (Step 3) ─────────────────────────────────────────────── */

function SdkStep({
  agentToken,
  onBack,
  onNext,
}: {
  agentToken: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<"node" | "python" | "curl" | "openclaw" | "nemoclaw">("curl");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-arkon-instance.com";

  const snippets: Record<string, { label: string; code: string }> = {
    curl: {
      label: "Shell / curl",
      code: `curl -X POST ${baseUrl}/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${agentToken}" \\
  -d '{
    "agent_id": "your-agent",
    "type": "message_sent",
    "content": "Hello from my agent!"
  }'`,
    },
    node: {
      label: "Node.js",
      code: `// npm install @arkon/sdk
import { Arkon } from "@arkon/sdk";

const arkon = new Arkon({
  baseUrl: "${baseUrl}",
  token: "${agentToken}",
});

await arkon.track("message_sent", {
  content: "Hello from my agent!",
});`,
    },
    python: {
      label: "Python",
      code: `# pip install arkon-sdk
from arkon import Arkon

arkon = Arkon(
    base_url="${baseUrl}",
    token="${agentToken}",
)

arkon.track("message_sent",
    content="Hello from my agent!",
)`,
    },
    openclaw: {
      label: "OpenClaw",
      code: `# In your OpenClaw .env file, add:
MC_INGEST_URL=${baseUrl}/api/ingest
MC_AGENT_TOKEN=${agentToken}

# OpenClaw will automatically send events to Arkon.`,
    },
    nemoclaw: {
      label: "NemoClaw",
      code: `# In your NemoClaw config, add:
telemetry:
  endpoint: ${baseUrl}/api/ingest
  token: ${agentToken}

# NemoClaw will automatically report to Arkon.`,
    },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-[#94a3b8]">
        Connect your agent to Arkon. Choose your integration method:
      </p>

      {/* Token display */}
      <div className="rounded-xl border border-[#06d6a0]/20 bg-[#06d6a0]/5 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-[#06d6a0]">Your API Token</span>
          <CopyButton text={agentToken} />
        </div>
        <code className="block break-all text-xs text-[#94a3b8]">{agentToken}</code>
        <p className="mt-1.5 text-[10px] text-[#475569]">
          Save this token — you won&apos;t see it again after leaving this page.
        </p>
      </div>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(snippets) as Array<keyof typeof snippets>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as typeof tab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === key
                ? "bg-[#06d6a0]/10 text-[#06d6a0]"
                : "text-[#475569] hover:text-[#94a3b8]"
            }`}
          >
            {snippets[key].label}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div className="relative rounded-xl border border-[#1a2a4a] bg-[#050510]">
        <div className="absolute right-2 top-2">
          <CopyButton text={snippets[tab].code} />
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-[#94a3b8]">
          <code>{snippets[tab].code}</code>
        </pre>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-xl border border-[#1a2a4a] px-4 py-3 text-sm text-[#94a3b8] transition hover:bg-white/[0.03]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06d6a0] px-4 py-3 font-semibold text-[#050510] transition hover:bg-[#05c090] active:scale-[0.98]"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full text-center text-xs text-[#475569] transition hover:text-[#94a3b8]"
      >
        Skip this step — I&apos;ll set up later
      </button>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#475569] transition hover:bg-white/[0.05] hover:text-[#94a3b8]"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-[#06d6a0]" />
          <span className="text-[#06d6a0]">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-[#1a2a4a] bg-[#050510] p-3 transition hover:border-[#2a3a5a] hover:bg-[#0a0a18]"
    >
      <Icon className="h-5 w-5 text-[#06d6a0]" />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] leading-4 text-[#475569]">{description}</p>
      </div>
    </a>
  );
}

function ConfettiEffect() {
  const colors = ["#06d6a0", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          className="absolute animate-[confetti_1.5s_ease-out_forwards]"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 40}%`,
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            backgroundColor: colors[i % colors.length],
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: `${Math.random() * 0.5}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
