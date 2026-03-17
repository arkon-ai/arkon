import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";

const allowed = new Set([
  "agents-net",
  "architecture",
  "brainmap",
  "briefing",
  "cycling",
  "domains",
  "heatmap",
  "tokens",
]);

export default async function VisualDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!allowed.has(slug)) {
    notFound();
  }

  const htmlPath = path.join(process.cwd(), "reference", "visuals", `${slug}.html`);
  const html = await fs.readFile(htmlPath, "utf8");

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-text-dim">
          Visual Detail
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-text">{slug.replaceAll("-", " ")}</h1>
        <p className="mt-2 text-sm text-text-dim">
          Reference canvas rendered inside the PWA route.
        </p>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-border bg-bg-card">
        <iframe
          title={slug}
          srcDoc={html}
          className="min-h-[75vh] w-full bg-bg-deep"
          sandbox="allow-scripts allow-popups"
        />
      </div>
    </div>
  );
}
