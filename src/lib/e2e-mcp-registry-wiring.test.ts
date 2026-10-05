import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The E2E workflow must keep pointing the app at the local MCP registry fixture (deck-main
// RULING 4864 (1)); without it the "MCP Registry API" tests depend on the live registry again.
const WORKFLOW = fileURLToPath(new URL("../../.github/workflows/playwright.yml", import.meta.url));

type Step = { name: string; text: string };

/** The steps of the Playwright E2E job, in order (split on the job's `- name:` step lines). */
function e2eSteps(): Step[] {
  const yml = readFileSync(WORKFLOW, "utf8");
  const job = yml.slice(yml.indexOf("\n  test:\n"));
  const steps = job.slice(job.indexOf("\n    steps:\n")).split(/\n      - name: /).slice(1);
  return steps.map((s) => ({ name: s.split("\n")[0].trim(), text: s }));
}

describe("playwright.yml wires the MCP registry fixture", () => {
  const steps = e2eSteps();
  const fixture = steps.findIndex((s) => /run: node scripts\/e2e-mcp-registry-fixture\.mjs &/.test(s.text));
  const wait = steps.findIndex((s) => /run: npx wait-on \S*127\.0\.0\.1:4010\/v0\/servers/.test(s.text));
  const app = steps.findIndex((s) => /run: npm start &/.test(s.text));

  it("starts the fixture, then waits for it, before `npm start`", () => {
    expect(app, "app step").toBeGreaterThanOrEqual(0);
    expect(fixture, "fixture step").toBeGreaterThanOrEqual(0);
    expect(fixture).toBeLessThan(wait);
    expect(wait).toBeLessThan(app);
  });

  it("the fixture listens on the port the app is pointed at", () => {
    expect(steps[fixture]?.text ?? "").toMatch(/MCP_REGISTRY_FIXTURE_PORT: ['"]?4010['"]?\n/);
  });

  it("sets MCP_REGISTRY_BASE on the app step, to the fixture", () => {
    expect(steps[app].text).toMatch(/\n        env:\n(?:          .*\n)*?          MCP_REGISTRY_BASE: ['"]?http:\/\/127\.0\.0\.1:4010\/v0['"]?\n/);
  });

  it("sets MCP_REGISTRY_BASE nowhere else in the workflow", () => {
    const yml = readFileSync(WORKFLOW, "utf8");
    expect(yml.match(/^\s*MCP_REGISTRY_BASE:/gm)).toHaveLength(1);
    for (const [i, s] of steps.entries()) if (i !== app) expect(s.text, s.name).not.toMatch(/MCP_REGISTRY_BASE:/);
  });
});
