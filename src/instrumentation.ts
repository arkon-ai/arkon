// src/instrumentation.ts — Next.js instrumentation hook
// Phase 5b: Start the workflow cron scheduler on app startup
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only start scheduler on the server (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // [auth-legacy] boot rows (transformate WI-4496, S9 (c); RULING 9304): ONE row per legacy auth path, armed or off.
    // Zero value, zero hash, zero count of pairs, zero agent id. The browser row is never a fixed string: it is probed
    // in-process from this build's own code: the owner key is armed for the browser when init sets an mc_auth cookie
    // for it, or when the key carried in the mc_auth cookie resolves owner in request-auth or opens the OWNER-ONLY check.
    const ownerKey = process.env.MC_ADMIN_TOKEN ?? "";
    let browserPath = "off";
    if (ownerKey) {
      try {
        const { NextRequest } = await import("next/server");
        const { POST: init } = await import("@/app/api/auth/init/route");
        const { resolveRequestCredential } = await import("@/lib/request-auth");
        const { validateOwner } = await import("@/app/api/tools/_utils");
        const initRes = await init(new NextRequest("http://boot.probe/api/auth/init", {
          method: "POST",
          headers: { authorization: `Bearer ${ownerKey}` },
        }));
        const initSetsKey = initRes.headers.getSetCookie().some((c) => /^mc_auth=[^;]/.test(c));
        const keyInCookie = () => {
          const req = new NextRequest("http://boot.probe/api/x");
          req.cookies.set("mc_auth", ownerKey);
          return req;
        };
        const cookieResolves = (await resolveRequestCredential(keyInCookie()))?.type === "owner_token"
          || (await validateOwner(keyInCookie()));
        browserPath = initSetsKey || cookieResolves ? "armed" : "off";
      } catch {
        browserPath = "unknown (probe failed)";
      }
    }
    const envAgentPath = (process.env.MC_AGENT_TOKENS ?? "").split(",").some((pair) => {
      const [agentId, key] = pair.split(":");
      return !!agentId?.trim() && !!key?.trim();
    });
    console.log(`[auth-legacy] arkon MC_ADMIN_TOKEN browser path: ${browserPath}`);
    console.log(`[auth-legacy] arkon MC_ADMIN_TOKEN server path: ${ownerKey ? "armed" : "off"}`);
    console.log(`[auth-legacy] arkon MC_AGENT_TOKENS env agent path: ${envAgentPath ? "armed" : "off"}`);

    const { startScheduler } = await import("@/lib/workflow-scheduler");
    console.log("[instrumentation] Starting workflow cron scheduler...");
    startScheduler();

    // Hydrate active runs from DB so kill switch works immediately
    const { hydrateFromDb } = await import("@/lib/active-runs");
    const { query } = await import("@/lib/db");
    console.log("[instrumentation] Hydrating active runs...");
    await hydrateFromDb(query);
  }
}
