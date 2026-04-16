"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare, Send, AlertTriangle, RefreshCw } from "lucide-react";

type Role = "user" | "assistant";

interface UsageInfo {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cost?: { total: number; source: string };
}

interface ChatMessage {
  role: Role;
  content: string;
  messageId?: string;
  model?: string;
  cost?: number;
  usage?: UsageInfo;
  footerMarkdown?: string;
  error?: string;
}

interface SessionEvent {
  sessionId: string;
  title: string;
  isNew: boolean;
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}

function buildAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = readCookie("mc_auth");
  if (token) h["Authorization"] = `Bearer ${token}`;
  const csrf = readCookie("mc_csrf");
  if (csrf) h["x-csrf-token"] = csrf;
  return h;
}

function formatCost(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "$0.0000";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

// Minimal SSE parser over a ReadableStream<Uint8Array>.
// Splits on blank-line delimiters and extracts `event:` + `data:` fields.
async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (name: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const onAbort = () => {
    reader.cancel().catch(() => { /* ignore */ });
  };
  signal.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF → LF so splits are consistent
      buffer = buffer.replace(/\r\n/g, "\n");

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!raw.trim()) continue;

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) continue; // comment
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length === 0) continue;
        onEvent(eventName, dataLines.join("\n"));
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

export default function WardenChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessionTitle, setSessionTitle] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages grow
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Cancel in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const totalCost = useMemo(
    () =>
      messages.reduce(
        (acc, m) => acc + (m.cost ?? m.usage?.cost?.total ?? 0),
        0,
      ),
    [messages],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setError(null);
      setSending(true);

      // Append user + empty assistant placeholder
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/warden-chat", {
          method: "POST",
          headers: buildAuthHeaders(),
          credentials: "include",
          body: JSON.stringify({ sessionId, message: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(
            `Request failed (${res.status})${txt ? `: ${txt.slice(0, 200)}` : ""}`,
          );
        }

        await readSSE(
          res.body,
          (name, data) => {
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              return;
            }

            if (name === "session") {
              const s = payload as SessionEvent;
              setSessionId(s.sessionId);
              if (s.title) setSessionTitle(s.title);
              return;
            }

            if (name === "delta") {
              const { text: chunk } = payload as { text: string };
              if (typeof chunk !== "string") return;
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                if (i >= 0 && next[i].role === "assistant") {
                  next[i] = { ...next[i], content: next[i].content + chunk };
                }
                return next;
              });
              return;
            }

            if (name === "usage") {
              const u = payload as UsageInfo;
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                if (i >= 0 && next[i].role === "assistant") {
                  next[i] = {
                    ...next[i],
                    usage: u,
                    model: u.model ?? next[i].model,
                    cost: u.cost?.total ?? next[i].cost,
                  };
                }
                return next;
              });
              return;
            }

            if (name === "footer") {
              const { markdown } = payload as { markdown: string };
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                if (i >= 0 && next[i].role === "assistant") {
                  const combined = next[i].content
                    ? `${next[i].content}\n\n${markdown ?? ""}`
                    : markdown ?? "";
                  next[i] = { ...next[i], content: combined, footerMarkdown: markdown };
                }
                return next;
              });
              return;
            }

            if (name === "done") {
              const { messageId } = payload as { messageId: string };
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                if (i >= 0 && next[i].role === "assistant") {
                  next[i] = { ...next[i], messageId };
                }
                return next;
              });
              return;
            }

            if (name === "error") {
              const { message } = payload as { message: string };
              setError(message || "Stream error");
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                if (i >= 0 && next[i].role === "assistant") {
                  next[i] = { ...next[i], error: message || "Stream error" };
                }
                return next;
              });
            }
          },
          controller.signal,
        );
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        setMessages((prev) => {
          const next = prev.slice();
          const i = next.length - 1;
          if (i >= 0 && next[i].role === "assistant" && !next[i].content) {
            next[i] = { ...next[i], error: msg };
          }
          return next;
        });
      } finally {
        setSending(false);
        // Return focus to the input for fast follow-ups
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [sending, sessionId],
  );

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = input;
      setInput("");
      void send(text);
    },
    [input, send],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = input;
        setInput("");
        void send(text);
      }
    },
    [input, send],
  );

  const retryLast = useCallback(() => {
    // Re-send the most recent user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setError(null);
    // Trim the failed assistant placeholder + last user, so send() re-appends cleanly
    setMessages((prev) => {
      const next = prev.slice();
      // Drop trailing assistant w/ error or empty content
      if (
        next.length &&
        next[next.length - 1].role === "assistant" &&
        (next[next.length - 1].error || !next[next.length - 1].content)
      ) {
        next.pop();
      }
      // Drop the last user so send() adds it again
      if (next.length && next[next.length - 1].role === "user") next.pop();
      return next;
    });
    void send(lastUser.content);
  }, [messages, send]);

  return (
    <div
      className="flex min-h-screen flex-col text-slate-100"
      style={{ background: "#0A0A0C" }}
    >
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-screen-lg items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-amber-500" />
            <div>
              <h1 className="text-lg font-semibold">Warden Chat</h1>
              <p className="text-xs text-slate-400">
                {sessionTitle
                  ? sessionTitle
                  : sessionId
                    ? `Session ${sessionId.slice(0, 8)}…`
                    : "New session"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Cost so far
            </div>
            <div className="text-sm font-medium text-slate-200">
              {formatCost(totalCost)}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="Warden Chat conversation"
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="mx-auto flex max-w-screen-lg flex-col gap-4">
            {messages.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-500">
                Start a conversation with Warden.
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {sending && (
              <div role="status" className="text-xs text-slate-500">
                Warden is thinking…
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="flex-1">
                  <div className="font-medium">Error</div>
                  <div className="text-red-300/90">{error}</div>
                </div>
                <button
                  type="button"
                  onClick={retryLast}
                  className="flex items-center gap-1 rounded-md border border-red-800 bg-red-950/60 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-slate-800 px-6 py-4"
        >
          <div className="mx-auto flex max-w-screen-lg items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Message Warden… (Enter to send, Shift+Enter for newline)"
              aria-label="Message Warden"
              className="min-h-[44px] flex-1 resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-amber-600/90 text-white"
            : "border border-slate-800 bg-slate-900 text-slate-100"
        }`}
      >
        <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
          {isUser ? "You" : "Warden"}
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
          {message.content}
          {!isUser && !message.content && !message.error ? "…" : ""}
        </pre>
        {message.error && (
          <div className="mt-2 text-xs text-red-300">⚠ {message.error}</div>
        )}
        {!isUser && (message.model || message.cost !== undefined) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {message.model && <span>model: {message.model}</span>}
            {message.usage?.inputTokens !== undefined && (
              <span>in: {message.usage.inputTokens}</span>
            )}
            {message.usage?.outputTokens !== undefined && (
              <span>out: {message.usage.outputTokens}</span>
            )}
            {message.cost !== undefined && (
              <span>cost: {formatCost(message.cost)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
