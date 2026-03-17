// In-memory event bus for SSE broadcasting
type Listener = (data: string) => void;
const listeners = new Set<Listener>();

export function addListener(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function broadcast(event: { type: string; payload: Record<string, unknown> }) {
  const data = JSON.stringify(event);
  for (const listener of listeners) {
    try {
      listener(data);
    } catch {
      listeners.delete(listener);
    }
  }
}

export function listenerCount() {
  return listeners.size;
}
