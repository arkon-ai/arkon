// src/instrumentation.ts — Next.js instrumentation hook
// Phase 5b: Start the workflow cron scheduler on app startup
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only start scheduler on the server (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/workflow-scheduler");
    console.log("[instrumentation] Starting workflow cron scheduler...");
    startScheduler();
  }
}
