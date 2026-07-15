import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import {
  AGENT_SLUGS,
  DEFAULT_AGENT_INGRESSES,
  buildManifest,
  forwardProvisionUpstream,
  manifestsEqual,
  validateEmail,
  type ProvisionFormState,
  type ProvisionManifest,
} from "./provision-manifest";
import { POST as previewPost } from "@/app/api/provision/human/preview/route";
import { POST as submitPost } from "@/app/api/provision/human/submit/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function emptyForm(overrides: Partial<ProvisionFormState> = {}): ProvisionFormState {
  return {
    email: "",
    displayName: "",
    mentionHandle: "",
    helmEnabled: false,
    helmRows: [{ tenant: "", role: "member" }],
    arkonosEnabled: false,
    arkonosRows: [{ tenant: "", role: "user" }],
    arkonEnabled: false,
    arkonRows: [{ tenant: "", role: "member" }],
    agents: Object.fromEntries(AGENT_SLUGS.map((slug) => [slug, false])) as ProvisionFormState["agents"],
    channelsEnabled: false,
    channelSlugs: [],
    identityExpanded: false,
    identityRole: "agent",
    ...overrides,
  };
}

function sampleManifest(): ProvisionManifest {
  return buildManifest(
    emptyForm({
      email: "alex@example.com",
      displayName: "Alex",
      mentionHandle: "@alex",
      helmEnabled: true,
      helmRows: [{ tenant: "transformate", role: "admin" }],
      agents: { warden: true, codesmith: false, dunamis: false, sentinel: false, lumina: false },
    }),
  );
}

function routeRequest(path: string, body: Record<string, unknown>, token?: string) {
  return new NextRequest(`https://arkon.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const envSnapshot = {
  ARKONOS_PROVISION_API_BASE: process.env.ARKONOS_PROVISION_API_BASE,
  ARKONOS_PROVISION_API_TOKEN: process.env.ARKONOS_PROVISION_API_TOKEN,
  MC_ADMIN_TOKEN: process.env.MC_ADMIN_TOKEN,
};

function restoreEnv(key: keyof typeof envSnapshot) {
  if (envSnapshot[key] === undefined) delete process.env[key];
  else process.env[key] = envSnapshot[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.ARKONOS_PROVISION_API_BASE = "https://provision.test";
  process.env.ARKONOS_PROVISION_API_TOKEN = "provision-secret";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("admin-session")) {
      return { rows: [{ id: 6, email: "admin@example.com", role: "admin", tenant_id: "transformate" }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("ARKONOS_PROVISION_API_BASE");
  restoreEnv("ARKONOS_PROVISION_API_TOKEN");
  restoreEnv("MC_ADMIN_TOKEN");
});

describe("validateEmail", () => {
  it("rejects empty and missing-at addresses", () => {
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("   ")).toBe(false);
    expect(validateEmail("not-an-email")).toBe(false);
  });

  it("accepts a non-empty address containing @", () => {
    expect(validateEmail("alex@example.com")).toBe(true);
  });
});

describe("buildManifest", () => {
  it("maps subject fields and fixed initiator metadata", () => {
    const manifest = buildManifest(
      emptyForm({
        email: "  alex@example.com ",
        displayName: " Alex ",
        mentionHandle: " @alex ",
      }),
    );

    expect(manifest.schema_version).toBe(1);
    expect(manifest.subject_kind).toBe("human");
    expect(manifest.subject_key).toBe("alex@example.com");
    expect(manifest.display_name).toBe("Alex");
    expect(manifest.mention_handle).toBe("@alex");
    expect(manifest.is_grant).toBe(true);
    expect(manifest.initiator).toEqual({
      kind: "owner",
      slug: "brynn",
      surface: "command_board",
    });
  });

  it("omits unchecked grant sections", () => {
    const manifest = buildManifest(emptyForm());

    expect(manifest.grants).toEqual({});
  });

  it("maps enabled helm, arkonos, and arkon tenant rows", () => {
    const manifest = buildManifest(
      emptyForm({
        helmEnabled: true,
        helmRows: [{ tenant: "transformate", role: "admin" }],
        arkonosEnabled: true,
        arkonosRows: [{ tenant: "client-a", role: "user" }],
        arkonEnabled: true,
        arkonRows: [{ tenant: "master", role: "member" }],
      }),
    );

    expect(manifest.grants.helm).toEqual([{ tenant: "transformate", role: "admin" }]);
    expect(manifest.grants.arkonos).toEqual([{ tenant: "client-a", role: "user" }]);
    expect(manifest.grants.arkon).toEqual([{ tenant: "master", role: "member" }]);
  });

  it("defaults checked agent ingresses to the V1 constant", () => {
    const manifest = buildManifest(
      emptyForm({
        agents: { warden: true, codesmith: true, dunamis: false, sentinel: false, lumina: false },
      }),
    );

    expect(manifest.grants.agents).toEqual([
      { agent_slug: "warden", ingresses: [...DEFAULT_AGENT_INGRESSES] },
      { agent_slug: "codesmith", ingresses: [...DEFAULT_AGENT_INGRESSES] },
    ]);
  });

  it("includes channels only when the section is enabled with slugs", () => {
    const manifest = buildManifest(
      emptyForm({
        channelsEnabled: true,
        channelSlugs: ["fleet-audit", "ops"],
      }),
    );

    expect(manifest.grants.channels).toEqual(["fleet-audit", "ops"]);
  });

  it("includes identity when agents are selected or the section is expanded", () => {
    const fromAgents = buildManifest(
      emptyForm({
        agents: { warden: true, codesmith: false, dunamis: false, sentinel: false, lumina: false },
        identityRole: "governor",
      }),
    );
    const fromExpansion = buildManifest(
      emptyForm({
        identityExpanded: true,
        identityRole: "agent",
      }),
    );

    expect(fromAgents.grants.identity).toEqual({ role: "governor" });
    expect(fromExpansion.grants.identity).toEqual({ role: "agent" });
  });
});

describe("manifestsEqual", () => {
  it("detects when a reviewed manifest no longer matches the live form", () => {
    const reviewed = sampleManifest();
    const edited = buildManifest(
      emptyForm({
        email: "alex@example.com",
        displayName: "Alex Renamed",
        mentionHandle: "@alex",
        helmEnabled: true,
        helmRows: [{ tenant: "transformate", role: "admin" }],
        agents: { warden: true, codesmith: false, dunamis: false, sentinel: false, lumina: false },
      }),
    );

    expect(manifestsEqual(reviewed, reviewed)).toBe(true);
    expect(manifestsEqual(reviewed, edited)).toBe(false);
    expect(manifestsEqual(null, reviewed)).toBe(false);
  });
});

describe("provision preview route", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const res = await previewPost(routeRequest("/api/provision/human/preview", { manifest: sampleManifest() }));

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream env vars are unset", async () => {
    delete process.env.ARKONOS_PROVISION_API_BASE;
    const res = await previewPost(
      routeRequest("/api/provision/human/preview", { manifest: sampleManifest() }, "admin-session"),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Provision API not configured");
  });

  it("forwards the manifest body with the bearer token and propagates upstream JSON", async () => {
    const upstream = {
      steps: [{ system: "helm", tenant: "transformate", action: "grant", detail: "admin" }],
      tier: "auto",
      requiresDoubleT: false,
      converged: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(upstream, { status: 200 })),
    );

    const manifest = sampleManifest();
    const res = await previewPost(
      routeRequest("/api/provision/human/preview", { manifest }, "admin-session"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    expect(fetch).toHaveBeenCalledWith(
      "https://provision.test/api/provision/human/preview",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer provision-secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ manifest }),
      }),
    );
  });

  it("rejects a non-object (array) manifest with 400 before forwarding", async () => {
    const res = await previewPost(
      routeRequest("/api/provision/human/preview", { manifest: [] }, "admin-session"),
    );

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts upstream calls after the timeout budget", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
              });
            }),
        ),
      );

      const promise = forwardProvisionUpstream("/api/provision/human/preview", sampleManifest());
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await promise;

      expect(result).toEqual({
        ok: false,
        status: 504,
        body: { error: "Upstream provision API timed out" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("provision submit route", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const res = await submitPost(routeRequest("/api/provision/human/submit", { manifest: sampleManifest() }));

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream env vars are unset", async () => {
    delete process.env.ARKONOS_PROVISION_API_TOKEN;
    const res = await submitPost(
      routeRequest("/api/provision/human/submit", { manifest: sampleManifest() }, "admin-session"),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Provision API not configured");
  });

  it("forwards the manifest body with the bearer token and propagates upstream JSON", async () => {
    const upstream = {
      manifestId: "mf-1",
      jobId: "job-1",
      gate: "double_t_pending",
      helmWiKey: "WI-2000",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(upstream, { status: 202 })),
    );

    const manifest = sampleManifest();
    const res = await submitPost(
      routeRequest("/api/provision/human/submit", { manifest }, "admin-session"),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(upstream);
    expect(fetch).toHaveBeenCalledWith(
      "https://provision.test/api/provision/human/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer provision-secret",
        }),
        body: JSON.stringify({ manifest }),
      }),
    );
  });
});
