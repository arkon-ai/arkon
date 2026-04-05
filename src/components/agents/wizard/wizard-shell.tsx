"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { WizardStep, FrameworkConfig } from "@/lib/gateway/framework-configs";
import { FRAMEWORK_CONFIGS, getActiveSteps } from "@/lib/gateway/framework-configs";

// ─── Wizard State ─────────────────────────────────────────────

export interface WizardData {
  frameworkId: string;
  tenantId: string;
  location: "local" | "remote" | "unsure" | "";
  address: string;
  port: number;
  tlsFingerprint: string;
  token: string;
  sshHost: string;
  sshUser: string;
  sshKey: string;
  discoveredAgents: DiscoveredAgent[];
  selectedAgentIds: string[];
  agentNames: Record<string, string>;
  agentTags: Record<string, string[]>;
}

export interface DiscoveredAgent {
  agentId: string;
  name: string;
  isDefault: boolean;
  sessionCount: number;
}

export const INITIAL_WIZARD_DATA: WizardData = {
  frameworkId: "",
  tenantId: "",
  location: "",
  address: "",
  port: 0,
  tlsFingerprint: "",
  token: "",
  sshHost: "",
  sshUser: "",
  sshKey: "",
  discoveredAgents: [],
  selectedAgentIds: [],
  agentNames: {},
  agentTags: {},
};

// ─── Step Labels ──────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  framework: "Framework",
  tenant: "Organization",
  location: "Location",
  address: "Address",
  tls: "Security",
  token: "Authentication",
  test: "Test Connection",
  naming: "Name Agents",
  emergency: "Emergency Controls",
  summary: "Review & Save",
};

// ─── Wizard Shell ─────────────────────────────────────────────

interface WizardShellProps {
  children: (props: {
    data: WizardData;
    setData: (update: Partial<WizardData>) => void;
    currentStep: WizardStep;
    config: FrameworkConfig | null;
  }) => React.ReactNode;
  onComplete: (data: WizardData) => void;
}

export function WizardShell({ children, onComplete }: WizardShellProps) {
  const [data, setDataRaw] = useState<WizardData>(INITIAL_WIZARD_DATA);
  const [stepIndex, setStepIndex] = useState(0);

  const setData = useCallback((update: Partial<WizardData>) => {
    setDataRaw((prev) => ({ ...prev, ...update }));
  }, []);

  const config = data.frameworkId ? FRAMEWORK_CONFIGS[data.frameworkId] ?? null : null;

  const steps = useMemo(() => {
    if (!data.frameworkId) return ["framework" as WizardStep];
    return getActiveSteps(data.frameworkId);
  }, [data.frameworkId]);

  const currentStep = steps[stepIndex] ?? "framework";
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case "framework": return !!data.frameworkId;
      case "tenant": return !!data.tenantId;
      case "location": return !!data.location;
      case "address": return !!data.address && data.port > 0;
      case "tls": return true; // Optional
      case "token": return true; // Optional for some frameworks
      case "test": return data.selectedAgentIds.length > 0;
      case "naming": return true;
      case "emergency": return true; // Optional
      case "summary": return true;
      default: return true;
    }
  }, [currentStep, data]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete(data);
      return;
    }

    // Skip location step if framework is "custom" (no location choice needed)
    let nextIndex = stepIndex + 1;
    const nextStep = steps[nextIndex];

    // Auto-skip: if location was "local", skip address step
    if (nextStep === "address" && data.location === "local") {
      nextIndex++;
    }

    setStepIndex(Math.min(nextIndex, steps.length - 1));
  }, [isLast, stepIndex, steps, data, onComplete]);

  const handleBack = useCallback(() => {
    let prevIndex = stepIndex - 1;

    // Auto-skip backwards: if location was "local", skip address step
    const prevStep = steps[prevIndex];
    if (prevStep === "address" && data.location === "local") {
      prevIndex--;
    }

    setStepIndex(Math.max(prevIndex, 0));
  }, [stepIndex, steps, data]);

  // When framework changes, reset to step 0 and clear downstream data
  const handleFrameworkChange = useCallback((frameworkId: string) => {
    const fw = FRAMEWORK_CONFIGS[frameworkId];
    setDataRaw((prev) => ({
      ...INITIAL_WIZARD_DATA,
      frameworkId,
      tenantId: prev.tenantId, // Preserve tenant if already set
      port: fw?.defaultPort ?? 0,
    }));
    setStepIndex(0);
  }, []);

  // Progress bar
  const progress = steps.length > 1 ? ((stepIndex) / (steps.length - 1)) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            {STEP_LABELS[currentStep]}
          </h2>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Step {stepIndex + 1} of {steps.length}
          </span>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1.5">
          {steps.map((step, i) => (
            <div
              key={step}
              className="h-1 rounded-full flex-1 transition-all duration-300"
              style={{
                backgroundColor: i <= stepIndex ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div
        className="rounded-xl border p-6 mb-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        {children({
          data: { ...data, frameworkId: data.frameworkId },
          setData: (update) => {
            if (update.frameworkId && update.frameworkId !== data.frameworkId) {
              handleFrameworkChange(update.frameworkId);
            } else {
              setData(update);
            }
          },
          currentStep,
          config,
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handleBack}
          disabled={isFirst}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: canGoNext ? "var(--accent)" : "var(--bg-surface-2)",
            color: canGoNext ? "var(--accent-foreground)" : "var(--text-tertiary)",
          }}
        >
          {isLast ? (
            <>
              <Check size={16} />
              Save & Connect
            </>
          ) : (
            <>
              Next
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
