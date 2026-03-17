import { NextRequest, NextResponse } from "next/server";
import * as net from "net";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

const SERVICES = [
  { name: "Arkon", host: "127.0.0.1", port: 4000, group: "Hetzner" },
  { name: "PostgreSQL", host: "127.0.0.1", port: 5432, group: "Hetzner" },
  { name: "Grafana", host: "127.0.0.1", port: 3001, group: "Hetzner" },
  { name: "OpenClaw Gateway", host: "100.99.150.81", port: 18789, group: "Dell" },
  { name: "Ollama", host: "100.99.150.81", port: 11434, group: "Dell" },
  { name: "n8n", host: "100.99.150.81", port: 5678, group: "Dell" },
];

function checkPort(host: string, port: number, timeoutMs = 2000): Promise<{ latencyMs: number | null; online: boolean }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ latencyMs, online: true });
    });
    socket.on("timeout", () => { socket.destroy(); resolve({ latencyMs: null, online: false }); });
    socket.on("error", () => { socket.destroy(); resolve({ latencyMs: null, online: false }); });
    socket.connect(port, host);
  });
}

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const { latencyMs, online } = await checkPort(svc.host, svc.port);
      return { ...svc, online, latencyMs, checkedAt: new Date().toISOString() };
    })
  );

  const byGroup = results.reduce<Record<string, typeof results>>((acc, svc) => {
    if (!acc[svc.group]) acc[svc.group] = [];
    acc[svc.group].push(svc);
    return acc;
  }, {});

  return NextResponse.json({
    services: results,
    byGroup,
    summary: {
      total: results.length,
      online: results.filter((s) => s.online).length,
      offline: results.filter((s) => !s.online).length,
    },
    checkedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
