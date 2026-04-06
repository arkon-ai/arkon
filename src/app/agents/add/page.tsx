"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WizardShell, type WizardData } from "@/components/agents/wizard/wizard-shell";
import { FrameworkStep } from "@/components/agents/wizard/framework-step";
import { TenantStep } from "@/components/agents/wizard/tenant-step";
import { LocationStep } from "@/components/agents/wizard/location-step";
import { AddressStep } from "@/components/agents/wizard/address-step";
import { TlsStep } from "@/components/agents/wizard/tls-step";
import { AuthStep } from "@/components/agents/wizard/auth-step";
import { TestStep } from "@/components/agents/wizard/test-step";
import { NamingStep } from "@/components/agents/wizard/naming-step";
import { EmergencyStep } from "@/components/agents/wizard/emergency-step";
import { SummaryStep } from "@/components/agents/wizard/summary-step";

export default function AddAgentPage() {
  const router = useRouter();

  const handleComplete = useCallback(async (data: WizardData) => {
    const csrfMatch = document.cookie.match(/mc_csrf=([^;]+)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (csrfToken) headers["x-csrf-token"] = csrfToken;

    const res = await fetch("/api/agents/register", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        frameworkId: data.frameworkId,
        tenantId: data.tenantId,
        location: data.location,
        address: data.address,
        port: data.port,
        tlsFingerprint: data.tlsFingerprint || undefined,
        token: data.token || undefined,
        sshHost: data.sshHost || undefined,
        sshUser: data.sshUser || undefined,
        sshKey: data.sshKey || undefined,
        agents: data.selectedAgentIds.map((id) => {
          const agent = data.discoveredAgents.find((a) => a.agentId === id);
          return {
            agentId: id,
            name: data.agentNames[id] || agent?.name || id,
            tags: data.agentTags[id] || [],
            isDefault: agent?.isDefault ?? false,
          };
        }),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Save failed" }));
      throw new Error(err.error ?? "Failed to register agents");
    }

    router.push("/agents");
  }, [router]);

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm mb-4 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={14} />
          Back to Agents
        </Link>
        <h1
          className="text-2xl font-extrabold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          Connect Agent
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Connect an existing agent to Arkon for monitoring and control.
        </p>
      </div>

      {/* Wizard */}
      <WizardShell onComplete={handleComplete}>
        {({ data, setData, currentStep, config }) => {
          switch (currentStep) {
            case "framework":
              return (
                <FrameworkStep
                  selectedId={data.frameworkId}
                  onSelect={(id) => setData({ frameworkId: id })}
                />
              );

            case "tenant":
              return (
                <TenantStep
                  selectedId={data.tenantId}
                  onSelect={(id) => setData({ tenantId: id })}
                />
              );

            case "location":
              return (
                <LocationStep
                  selected={data.location}
                  onSelect={(loc) => setData({ location: loc })}
                  config={config}
                  onAutoConfigLocal={() => {
                    if (config) {
                      setData({
                        location: "local",
                        address: "127.0.0.1",
                        port: config.defaultPort,
                      });
                    }
                  }}
                />
              );

            case "address":
              return (
                <AddressStep
                  address={data.address}
                  port={data.port}
                  onUpdate={(u) => setData(u)}
                  config={config}
                />
              );

            case "tls":
              return (
                <TlsStep
                  tlsFingerprint={data.tlsFingerprint}
                  onUpdate={(u) => setData(u)}
                  config={config}
                />
              );

            case "token":
              return (
                <AuthStep
                  token={data.token}
                  onUpdate={(u) => setData(u)}
                  config={config}
                />
              );

            case "test":
              return (
                <TestStep
                  address={data.address}
                  port={data.port}
                  token={data.token}
                  tlsFingerprint={data.tlsFingerprint}
                  discoveredAgents={data.discoveredAgents}
                  selectedAgentIds={data.selectedAgentIds}
                  onUpdate={(u) => setData(u)}
                  config={config}
                />
              );

            case "naming":
              return (
                <NamingStep
                  discoveredAgents={data.discoveredAgents}
                  selectedAgentIds={data.selectedAgentIds}
                  agentNames={data.agentNames}
                  agentTags={data.agentTags}
                  onUpdate={(u) => setData(u)}
                />
              );

            case "emergency":
              return (
                <EmergencyStep
                  sshHost={data.sshHost}
                  sshUser={data.sshUser}
                  sshKey={data.sshKey}
                  onUpdate={(u) => setData(u)}
                  config={config}
                  address={data.address}
                />
              );

            case "summary":
              return (
                <SummaryStep
                  data={data}
                  config={config}
                  onSave={() => handleComplete(data)}
                />
              );

            default:
              return (
                <div className="py-12 text-center">
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Step &quot;{currentStep}&quot; is coming soon.
                  </p>
                </div>
              );
          }
        }}
      </WizardShell>
    </div>
  );
}
