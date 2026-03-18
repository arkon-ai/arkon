"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/init", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${passphrase.trim()}`,
        },
      });

      if (!res.ok) {
        setError("Invalid passphrase. Please try again.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Authentication failed.");
        setLoading(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0A0A0C] px-4">
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0, 212, 126, 0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Subtle green radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, rgba(0, 212, 126, 0.04), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] border border-[#2E2E3A] bg-[#1A1A22]">
            <span className="text-2xl font-bold text-[#00D47E]">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Arkon</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-[#555566]">AI Governance Platform</p>
          <p className="mt-2 text-sm text-[#8888A0]">Enter your passphrase to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl border border-[#2E2E3A] bg-[#1A1A22] px-4 py-3 text-white placeholder:text-[#555566] focus:border-[#00D47E]/50 focus:outline-none focus:ring-1 focus:ring-[#00D47E]/50 transition"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase.trim()}
            className="w-full rounded-xl bg-[#00D47E] px-4 py-3 font-semibold text-[#0A0A0C] transition hover:bg-[#05c090] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#555566]">
          Secured by Arkon
        </p>
      </div>
    </div>
  );
}
