/**
 * /api/journal/stream — Server-Sent Events stream of journal events
 * Subscribes to the in-process event-bus and forwards journal.* events
 * filtered by the actor's tenant.
 */
import { NextRequest } from "next/server";
import { authorizeJournalActor } from "@/lib/journal-auth";
import { addListener } from "@/lib/event-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch { /* stream closed */ }
      };

      // initial hello
      send({ type: "hello", actor: actor.slug, tenant: actor.tenantId, ts: new Date().toISOString() });

      // keepalive ping every 25s
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)); }
        catch { clearInterval(ping); }
      }, 25_000);

      // Bridge the event-bus to SSE, filtered by tenant and prefix
      const removeListener = addListener((raw) => {
        try {
          const evt = JSON.parse(raw) as { type?: string; payload?: { tenant_id?: string } };
          if (!evt.type || !evt.type.startsWith("journal.")) return;
          if (evt.payload?.tenant_id && evt.payload.tenant_id !== actor.tenantId) return;
          send(evt);
        } catch { /* ignore malformed */ }
      });

      // Cleanup when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        removeListener();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
