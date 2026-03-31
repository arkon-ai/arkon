"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "passphrase" | "email";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handlePassphraseLogin(e: React.FormEvent) {
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
        const role = data.role || "viewer";
        router.push(role === "owner" ? "/" : "/client");
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

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        setLoading(false);
        return;
      }

      if (data.ok) {
        const role = data.role || "viewer";
        router.push(role === "owner" || role === "admin" || role === "operator" ? "/" : "/client");
        router.refresh();
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,212,126,0.25)] bg-[rgba(0,212,126,0.08)]">
            <span className="text-3xl font-extrabold text-[#00D47E] font-[family-name:var(--font-display)]">A</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white font-[family-name:var(--font-display)]">Arkon</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">AI Control Plane</p>
        </div>

        {/* Auth mode toggle */}
        <div className="mb-6 flex rounded-xl border border-[#1E1E2A] bg-[#111118] p-1">
          <button
            type="button"
            onClick={() => { setMode("passphrase"); setError(""); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === "passphrase"
                ? "bg-[rgba(0,212,126,0.15)] text-[#00D47E]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Passphrase
          </button>
          <button
            type="button"
            onClick={() => { setMode("email"); setError(""); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === "email"
                ? "bg-[rgba(0,212,126,0.15)] text-[#00D47E]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Email
          </button>
        </div>

        {mode === "passphrase" ? (
          <form onSubmit={handlePassphraseLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-xl border border-[#1E1E2A] bg-[#0a0a14] px-4 py-3 text-white placeholder:text-[var(--text-tertiary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(0,212,126,0.5)] transition"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !passphrase.trim()}
              className="w-full rounded-xl bg-[#00D47E] px-4 py-3 font-semibold text-[#0A0A0C] transition hover:bg-[#00E88A] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-[#1E1E2A] bg-[#0a0a14] px-4 py-3 text-white placeholder:text-[var(--text-tertiary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(0,212,126,0.5)] transition"
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-[#1E1E2A] bg-[#0a0a14] px-4 py-3 text-white placeholder:text-[var(--text-tertiary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(0,212,126,0.5)] transition"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full rounded-xl bg-[#00D47E] px-4 py-3 font-semibold text-[#0A0A0C] transition hover:bg-[#00E88A] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
          Secured by Arkon
        </p>
      </div>
    </div>
  );
}
