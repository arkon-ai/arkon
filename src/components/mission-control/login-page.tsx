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
        // Route based on role: non-owners go to client portal
        const role = data.role || "viewer";
        if (role === "owner") {
          router.push("/");
        } else {
          router.push("/client");
        }
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
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0C] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-[#00D47E]/20 border border-cyan-500/30">
            <span className="text-3xl">MC</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Arkon</h1>
          <p className="mt-2 text-sm text-slate-400">Enter your passphrase to continue</p>
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
              className="w-full rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition"
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
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-3 font-semibold text-white transition hover:from-cyan-400 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Secured by Arkon
        </p>
      </div>
    </div>
  );
}
