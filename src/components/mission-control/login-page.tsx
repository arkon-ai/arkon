"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AuthMode = "passphrase" | "email" | "magic";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const magicToken = searchParams.get("magic");
    const magicEmailParam = searchParams.get("email");
    if (magicToken && magicEmailParam) {
      verifyMagicLink(magicToken, magicEmailParam);
    }
  }, [searchParams]);

  async function verifyMagicLink(token: string, emailAddr: string) {
    setLoading(true);
    setError("");
    setMode("magic");

    try {
      const res = await fetch("/api/auth/verify-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: emailAddr }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid or expired link");
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

  async function handlePassphraseLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/init", {
        method: "POST",
        headers: { Authorization: `Bearer ${passphrase.trim()}` },
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

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: magicEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send link.");
        setLoading(false);
        return;
      }

      setMagicSent(true);
      setLoading(false);
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-white placeholder:text-[var(--text-tertiary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(0,212,126,0.5)] transition";
  const submitClass = "w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,212,126,0.25)] bg-[rgba(0,212,126,0.08)]">
            <span className="text-3xl font-extrabold text-[var(--accent)] font-[family-name:var(--font-display)]">A</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white font-[family-name:var(--font-display)]">Arkon</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">AI Control Plane</p>
        </div>

        <div className="mb-6 flex rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          {(["passphrase", "email", "magic"] as AuthMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); setMagicSent(false); }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                mode === m
                  ? "bg-[rgba(0,212,126,0.15)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {m === "passphrase" ? "Passphrase" : m === "email" ? "Email" : "Magic Link"}
            </button>
          ))}
        </div>

        {mode === "passphrase" && (
          <form onSubmit={handlePassphraseLogin} className="space-y-4">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase"
              autoFocus
              autoComplete="current-password"
              className={inputClass}
            />
            {error && (
              <p className="rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
            )}
            <button type="submit" disabled={loading || !passphrase.trim()} className={submitClass}>
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        )}

        {mode === "email" && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              autoComplete="email"
              className={inputClass}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className={inputClass}
            />
            {error && (
              <p className="rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
            )}
            <button type="submit" disabled={loading || !email.trim() || !password} className={submitClass}>
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        )}

        {mode === "magic" && !magicSent && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Enter your email and we will send you a sign-in link. No password needed.
            </p>
            <input
              type="email"
              value={magicEmail}
              onChange={(e) => setMagicEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              autoComplete="email"
              className={inputClass}
            />
            {error && (
              <p className="rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
            )}
            <button type="submit" disabled={loading || !magicEmail.trim()} className={submitClass}>
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
          </form>
        )}

        {mode === "magic" && magicSent && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(0,212,126,0.08)]">
              <svg className="h-8 w-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Check your email</p>
            <p className="text-xs text-[var(--text-secondary)]">
              If an account exists for <span className="text-[var(--accent)]">{magicEmail}</span>, a sign-in link was sent.
              The link expires in 15 minutes.
            </p>
            <button
              type="button"
              onClick={() => { setMagicSent(false); setMagicEmail(""); }}
              className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
            >
              Try a different email
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
          Secured by Arkon
        </p>
      </div>
    </div>
  );
}
