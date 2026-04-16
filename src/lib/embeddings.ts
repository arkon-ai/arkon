/**
 * Embeddings — thin wrapper around Gemini text embeddings for Memory v2.
 *
 * Model: gemini-embedding-001 (native 3072-dim, truncated via MRL to GEMINI_EMBEDDING_DIM).
 * Dim:   1536 by default — below pgvector's 2000-dim HNSW cap, matches OpenAI
 *        text-embedding-3-small native so we have a drop-in fallback if needed.
 *
 * ENV:
 *   GOOGLE_API_KEY           required — Gemini API key
 *   GEMINI_EMBEDDING_MODEL   optional — defaults to 'gemini-embedding-001'
 *   GEMINI_EMBEDDING_DIM     optional — defaults to 1536
 *
 * Usage:
 *   import { embed, embedBatch } from '@/lib/embeddings';
 *   const v = await embed('some text');     // number[] of length GEMINI_EMBEDDING_DIM
 *   const vs = await embedBatch(['a', 'b']); // number[][], concurrency-capped
 */

const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const DIM = parseInt(process.env.GEMINI_EMBEDDING_DIM || "1536", 10);
const KEY = process.env.GOOGLE_API_KEY;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const CONCURRENCY = 5; // soft cap to stay under Gemini free-tier 1500 RPM
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 400;

export interface EmbedOptions {
  /** Override output dim for this call (still MRL-truncated). Defaults to GEMINI_EMBEDDING_DIM. */
  dim?: number;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/** Embed a single text. Retries on transient 5xx / 429. */
export async function embed(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  if (!KEY) throw new Error("GOOGLE_API_KEY not set — cannot embed");
  if (!text || !text.trim()) throw new Error("embed: empty text");
  const outputDim = opts.dim ?? DIM;
  const url = `${ENDPOINT}/${MODEL}:embedContent?key=${KEY}`;
  const body = JSON.stringify({
    content: { parts: [{ text }] },
    outputDimensionality: outputDim,
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: opts.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Gemini embed transient ${res.status}: ${await res.text()}`);
      }
      if (!res.ok) {
        throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values;
      if (!values || values.length !== outputDim) {
        throw new Error(`Gemini embed returned wrong dim: got ${values?.length}, expected ${outputDim}`);
      }
      return values;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr as Error;
}

/** Embed multiple texts with concurrency cap. Returns results in input order. */
export async function embedBatch(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  let cursor = 0;
  async function worker() {
    while (cursor < texts.length) {
      const i = cursor++;
      results[i] = await embed(texts[i], opts);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** pgvector accepts the literal '[0.1,0.2,...]' — not a JSON array. */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** Metadata a caller should record alongside each vector for provenance. */
export function embeddingMeta() {
  return { embedding_provider: "gemini", embedding_dim: DIM, model: MODEL };
}
