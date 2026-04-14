import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { forbidden, unauthorized, validateRole } from "@/app/api/tools/_utils";

const execFileP = promisify(execFile);

// Small 5-minute cache so the UI can poll without SSHing repeatedly.
let cache: { at: number; data: unknown } | null = null;
const TTL_MS = 5 * 60 * 1000;

// GET — ChromaDB chunk counts per collection, fetched from EU-OPEN over SSH.
// Owner only; Dell reports stats via POST instead.
export async function GET(req: NextRequest) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const force = req.nextUrl.searchParams.get("refresh") === "true";
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }

  const pyScript = `
import json
try:
    import chromadb
    client = chromadb.PersistentClient(path="/home/brynn/.openclaw/workspace/youtube-kb/chromadb")
    out = {}
    for c in client.list_collections():
        try:
            out[c.name] = c.count()
        except Exception as e:
            out[c.name] = {"error": str(e)}
    print(json.dumps({"ok": True, "collections": out}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`.trim();

  try {
    // Pass the script through base64 — shell + ssh quoting mangle multiline Python otherwise.
    const b64 = Buffer.from(pyScript, "utf8").toString("base64");
    const { stdout } = await execFileP(
      "ssh",
      [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=8",
        "brynn@100.90.212.53",
        `echo ${b64} | base64 -d | python3 -`,
      ],
      { timeout: 20_000, maxBuffer: 1_000_000 }
    );

    const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
    cache = { at: Date.now(), data: parsed };
    return NextResponse.json({ ...parsed, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// POST — Dell pipeline reports completion stats per channel.
// Accepts a token (ARKON_PIPELINE_TOKEN env) to avoid owner-only friction.
export async function POST(req: NextRequest) {
  const pipelineToken = process.env.ARKON_PIPELINE_TOKEN ?? "";
  const provided = req.headers.get("x-pipeline-token") ?? "";
  if (!pipelineToken || provided !== pipelineToken) {
    return unauthorized();
  }

  const body = (await req.json()) as {
    results?: Array<{
      collection_name: string;
      video_count?: number;
      transcript_count?: number;
      chunk_count?: number;
      status?: string;
    }>;
  };

  if (!body.results || !Array.isArray(body.results)) {
    return NextResponse.json({ error: "results array required" }, { status: 400 });
  }

  let updated = 0;
  for (const r of body.results) {
    if (!r.collection_name) continue;
    const res = await query(
      `UPDATE youtube_channels
       SET last_pull_at = NOW(),
           last_pull_status = COALESCE($1, last_pull_status),
           video_count = COALESCE($2, video_count),
           transcript_count = COALESCE($3, transcript_count),
           chunk_count = COALESCE($4, chunk_count),
           updated_at = NOW()
       WHERE collection_name = $5`,
      [
        r.status ?? null,
        r.video_count ?? null,
        r.transcript_count ?? null,
        r.chunk_count ?? null,
        r.collection_name,
      ]
    );
    updated += res.rowCount ?? 0;
  }
  cache = null;
  return NextResponse.json({ ok: true, updated });
}
