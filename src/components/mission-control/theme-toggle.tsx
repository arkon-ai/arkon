"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "./theme-provider";

const modes: Array<{ value: ThemeMode; icon: typeof Sun; label: string }> = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  // Cycle through: dark → light → system → dark
  const cycle = () => {
    const order: ThemeMode[] = ["dark", "light", "system"];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  };

  const current = modes.find((m) => m.value === mode) ?? modes[1];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      aria-label={`Theme: ${current.label}. Click to change.`}
      title={`Theme: ${current.label}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
