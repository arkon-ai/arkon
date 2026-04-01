"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/mission-control/theme-provider";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const themeOptions: Array<{ value: ThemeMode; icon: typeof Sun; label: string; description: string }> = [
  { value: "system", icon: Monitor, label: "System", description: "Follow your operating system preference." },
  { value: "light", icon: Sun, label: "Light", description: "Light backgrounds with dark text." },
  { value: "dark", icon: Moon, label: "Dark", description: "Dark backgrounds with light text. Default." },
];

export default function AppearancePage() {
  const { mode, setMode } = useTheme();

  return (
    <div className="space-y-6">
      <SectionDescription id="appearance">
        Choose your preferred theme. The accent color (Quarn Emerald) stays
        consistent across all modes.
      </SectionDescription>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {themeOptions.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`relative card-hover rounded-2xl border p-5 text-left transition ${
                active
                  ? "border-[var(--accent)]/50 bg-[var(--accent-subtle)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)]"
              }`}
            >
              <GlowingEffect spread={40} glow disabled={!active} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  active ? "bg-[var(--accent)]/10" : "bg-[var(--bg-hover)]"
                }`}>
                  <Icon className={`h-5 w-5 ${active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`} />
                </div>
                {active && (
                  <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</h3>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
