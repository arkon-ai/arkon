"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, ArrowRight, ArrowLeft } from "lucide-react";

const TOUR_DISMISSED_KEY = "arkon-tour-dismissed";

type TourStep = {
  /** CSS selector for the element to highlight */
  selector: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Which side of the element to place the tooltip */
  placement: "bottom" | "right" | "left" | "top";
};

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="dashboard"]',
    title: "Dashboard",
    description:
      "This is your command center. See all agent activity, health score, and key metrics at a glance.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="health-gauge"]',
    title: "Health Score",
    description:
      "This score tells you if everything is healthy. Green means good. Hover for a breakdown of what's contributing.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-agents"]',
    title: "Agents",
    description:
      "Manage your AI agents here. Click any agent for its full profile with security, performance, and activity data.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-threatguard"]',
    title: "ThreatGuard",
    description:
      "We scan every message for threats — prompt injection, dangerous commands, and credential leaks. You'll get alerts for anything serious.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-costs"]',
    title: "Costs",
    description:
      "Track what your agents are spending across all model providers. Set budgets to control costs and see daily burn rate.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-workflows"]',
    title: "Workflows",
    description:
      "Build automations to respond to events. Start with a template or create from scratch on the visual canvas.",
    placement: "right",
  },
];

export function GuidedTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    placement: string;
  } | null>(null);

  // Activate tour when ?tour=1 is in URL and tour hasn't been dismissed
  useEffect(() => {
    const shouldTour = searchParams.get("tour") === "1";
    const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY);
    if (shouldTour && !dismissed) {
      // Small delay to let the page render
      const timer = setTimeout(() => setActive(true), 500);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const positionTooltip = useCallback((stepIndex: number) => {
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;

    const el = document.querySelector(step.selector);
    if (!el) {
      // Element not visible (maybe on mobile) — skip to next
      if (stepIndex < TOUR_STEPS.length - 1) {
        setCurrentStep(stepIndex + 1);
      } else {
        closeTour();
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    let top = 0;
    let left = 0;

    switch (step.placement) {
      case "bottom":
        top = rect.bottom + 12;
        left = rect.left + rect.width / 2;
        break;
      case "right":
        top = rect.top + rect.height / 2;
        left = rect.right + 12;
        break;
      case "left":
        top = rect.top + rect.height / 2;
        left = rect.left - 12;
        break;
      case "top":
        top = rect.top - 12;
        left = rect.left + rect.width / 2;
        break;
    }

    setTooltipPos({ top, left, placement: step.placement });

    // Scroll element into view if needed
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    if (active) {
      positionTooltip(currentStep);
    }
  }, [active, currentStep, positionTooltip]);

  // Reposition on resize
  useEffect(() => {
    if (!active) return;
    const handler = () => positionTooltip(currentStep);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [active, currentStep, positionTooltip]);

  function closeTour() {
    setActive(false);
    localStorage.setItem(TOUR_DISMISSED_KEY, "1");
    // Clean up URL param
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  function nextStep() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      closeTour();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  if (!active || !tooltipPos) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Compute transform based on placement
  let transform = "";
  switch (tooltipPos.placement) {
    case "bottom":
      transform = "translateX(-50%)";
      break;
    case "top":
      transform = "translate(-50%, -100%)";
      break;
    case "right":
      transform = "translateY(-50%)";
      break;
    case "left":
      transform = "translate(-100%, -50%)";
      break;
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={closeTour} />

      {/* Tooltip */}
      <div
        className="fixed z-[9999] w-72 rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          transform,
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={closeTour}
          className="absolute right-2 top-2 rounded-lg p-1 text-[#475569] transition hover:text-[#94a3b8]"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        <h4 className="text-sm font-semibold text-white">{step.title}</h4>
        <p className="mt-1.5 text-xs leading-5 text-[#94a3b8]">
          {step.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] text-[#475569]">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[#94a3b8] transition hover:bg-white/[0.05]"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-1 rounded-lg bg-[#00D47E]/10 px-3 py-1.5 text-xs font-semibold text-[#00D47E] transition hover:bg-[#00D47E]/20"
            >
              {isLast ? "Finish" : "Next"}
              {!isLast && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Don't show again */}
        <button
          type="button"
          onClick={closeTour}
          className="mt-2 w-full text-center text-[10px] text-[#475569] transition hover:text-[#94a3b8]"
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  );
}
