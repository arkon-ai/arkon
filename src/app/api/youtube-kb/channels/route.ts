import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { forbidden, unauthorized, validateRole } from "@/app/api/tools/_utils";

// Row shape as stored (snake_case from pg).
interface ChannelRow {
  id: number;
  name: string;
  url: string;
  collection_name: string;
  dir_name: string;
  max_videos: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_pull_at: string | null;
  last_pull_status: string | null;
  video_count: number;
  transcript_count: number;
  chunk_count: number;
}

// Derive a slug suitable for collection_name / dir_name from a YouTube handle URL.
// Example: https://www.youtube.com/@ColeMedin/videos -> "cole-medin"
function slugFromUrl(url: string): string | null {
  const match = url.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (!match) return null;
  return match[1]
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[._]/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidYoutubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+)(\/videos)?\/?$/.test(url);
}

// GET — public (Dell pipeline fetches without auth so it can run unattended).
// Returns the same shape the existing channels.json has.
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "pipeline";
  const includeDisabled = req.nextUrl.searchParams.get("all") === "true";

  const result = await query(
    `SELECT id, name, url, collection_name, dir_name, max_videos, enabled,
            created_at, updated_at, last_pull_at, last_pull_status,
            video_count, transcript_count, chunk_count
     FROM youtube_channels
     ${includeDisabled ? "" : "WHERE enabled = TRUE"}
     ORDER BY name`
  );
  const rows = result.rows as ChannelRow[];

  if (format === "ui") {
    return NextResponse.json({ channels: rows });
  }

  // Pipeline format — matches legacy channels.json so pull_transcripts.py can drop in.
  const channels = rows.map((r) => ({
    name: r.name,
    url: r.url,
    collection: r.collection_name,
    dir: r.dir_name,
    max_videos: r.max_videos,
  }));
  return NextResponse.json({
    channels,
    settings: {
      dell_base_dir: "/home/brynn-bendixen/yt-kb-pipeline",
      euopen_base_dir: "/home/brynn/.openclaw/workspace/youtube-kb",
      euopen_host: "brynn@100.90.212.53",
      chromadb_dir: "/home/brynn/.openclaw/workspace/youtube-kb/chromadb",
      ollama_url: "http://localhost:11434/api/embeddings",
      ollama_model: "nomic-embed-text",
      chunk_size: 1500,
      chunk_overlap: 200,
      rate_limit_seconds: 1.0,
    },
  });
}

// POST — owner only. Add a channel by URL; name and slugs auto-derived if absent.
export async function POST(req: NextRequest) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const body = (await req.json()) as {
    url?: string;
    name?: string;
    max_videos?: number;
  };

  const url = (body.url ?? "").trim();
  if (!url || !isValidYoutubeUrl(url)) {
    return NextResponse.json(
      { error: "Valid YouTube channel URL required (e.g. https://www.youtube.com/@handle/videos)" },
      { status: 400 }
    );
  }

  const slug = slugFromUrl(url);
  if (!slug) {
    return NextResponse.json({ error: "Could not derive slug from URL" }, { status: 400 });
  }

  const collection_name = `${slug.replace(/-/g, "_")}_channel`;
  const dir_name = `${slug}-index`;
  const name = (body.name ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).trim();
  const max_videos = Math.min(Math.max(body.max_videos ?? 80, 1), 500);

  try {
    const result = await query(
      `INSERT INTO youtube_channels (name, url, collection_name, dir_name, max_videos)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, url, collection_name, dir_name, max_videos]
    );
    return NextResponse.json({ ok: true, channel: result.rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "Channel already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
