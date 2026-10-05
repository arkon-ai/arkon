#!/usr/bin/env node
// CI-only stand-in for the official MCP registry (deck-main RULING 4864 (1)). The E2E
// "MCP Registry API" tests (tests/api/tools.api.spec.ts) must not depend on the live
// registry.modelcontextprotocol.io: playwright.yml starts this on 127.0.0.1 and points the app
// at it through MCP_REGISTRY_BASE. Node built-ins only.
//
// GET|HEAD /v0/servers?search&limit&offset -> { servers, metadata: { count } } from
// e2e-mcp-registry-fixture.json; search is a case-insensitive substring of the server name, as
// the official API's. Every other path or method answers 404.
// Port: MCP_REGISTRY_FIXTURE_PORT (default 4010; 0 = any free port). Prints "listening on <url>"
// from server.address(), the address it really bound (deck-main RULING 4872).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const { servers } = JSON.parse(readFileSync(new URL("./e2e-mcp-registry-fixture.json", import.meta.url), "utf8"));

function intParam(value, fallback, max) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isNaN(n) || n < 0 ? fallback : Math.min(n, max);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if ((req.method !== "GET" && req.method !== "HEAD") || url.pathname !== "/v0/servers") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  const search = (url.searchParams.get("search") ?? "").toLowerCase();
  const limit = intParam(url.searchParams.get("limit"), 30, 100);
  const offset = intParam(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER);
  const matched = servers.filter((entry) => entry.server.name.toLowerCase().includes(search));
  const page = matched.slice(offset, offset + limit);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(req.method === "HEAD" ? undefined : JSON.stringify({ servers: page, metadata: { count: page.length } }));
});

server.listen(Number(process.env.MCP_REGISTRY_FIXTURE_PORT ?? 4010), "127.0.0.1", () => {
  const { address, port } = server.address();
  console.log(`e2e-mcp-registry-fixture listening on http://${address}:${port}`);
});
