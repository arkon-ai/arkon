import { NextRequest, NextResponse } from "next/server";
import * as net from "net";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

interface ServiceDef {
  name: string;
  host: string;
  port: number;
  group: string;
}

/** Load service check definitions from infra_nodes metadata */
async function loadServices(): Promise<ServiceDef[]> {
  const result = await query(
    `SELECT id, name, ip, metadata FROM infra_nodes ORDER BY id`
  );
  const services: ServiceDef[] = [];
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const svcList = (meta.services ?? []) as Array<{ name: string; port: number }>;
    const nodeName = row.name as string;
    const ip = row.ip as string;
    const isLocal = meta.is_local === true;
    for (const svc of svcList) {
      services.push({
        name: svc.name,
        host: isLocal ? "127.0.0.1" : ip,
        port: svc.port,
        group: nodeName,
      });
    }
  }
  return services;
}

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

  const SERVICES = await loadServices();

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
