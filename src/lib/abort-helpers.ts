/**
 * Hybrid abort signal: idle-reset timer + hard wall-clock ceiling.
 *
 * Mirrors the Phase 4b pattern in arkon-os/server/src/services/gateway.ts
 * (commit 1ce85eb→39be1a1). Use this for any long-running streaming fetch
 * (LLM SSE, MCP SSE proxy, large multi-chunk download) where:
 *
 *   - `AbortSignal.timeout(N)` cuts streams that are slow-but-progressing
 *     once N elapses, regardless of activity.
 *   - But a stalled stream should still be killed eventually.
 *
 * The returned `signal` aborts when EITHER:
 *   - `idleMs` elapses without a `resetIdle()` call (no chunk progress), or
 *   - `hardMs` elapses since `createIdleAndHardAbort()` was called (wall clock).
 *
 * Callers MUST invoke `clear()` once the stream completes (success or error)
 * to free the timers. They MUST invoke `resetIdle()` on every chunk read.
 *
 * @example
 *   const { signal, resetIdle, clear } = createIdleAndHardAbort({
 *     idleMs: 60_000,
 *     hardMs: 30 * 60_000,
 *   });
 *   try {
 *     const res = await fetch(url, { signal });
 *     const reader = res.body!.getReader();
 *     while (true) {
 *       const { done, value } = await reader.read();
 *       if (done) break;
 *       resetIdle();
 *       // ...handle chunk
 *     }
 *   } finally {
 *     clear();
 *   }
 */
export interface IdleAndHardAbort {
  signal: AbortSignal;
  resetIdle: () => void;
  clear: () => void;
}

export interface IdleAndHardAbortOptions {
  /** Idle budget in ms — fires when no `resetIdle()` for this long. */
  idleMs: number;
  /** Hard wall-clock ceiling in ms — fires regardless of progress. */
  hardMs: number;
  /** Optional label included in TimeoutError messages for log triage. */
  label?: string;
}

export function createIdleAndHardAbort(opts: IdleAndHardAbortOptions): IdleAndHardAbort {
  const { idleMs, hardMs, label } = opts;
  const tag = label ? `[${label}] ` : "";
  const ctrl = new AbortController();

  const hardTimer = setTimeout(() => {
    ctrl.abort(
      new DOMException(`${tag}hard ceiling of ${hardMs}ms exceeded`, "TimeoutError"),
    );
  }, hardMs);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      ctrl.abort(
        new DOMException(`${tag}idle timeout: no progress for ${idleMs}ms`, "TimeoutError"),
      );
    }, idleMs);
  };
  armIdle();

  return {
    signal: ctrl.signal,
    resetIdle: armIdle,
    clear: () => {
      clearTimeout(hardTimer);
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    },
  };
}
