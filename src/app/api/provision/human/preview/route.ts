import { NextRequest, NextResponse } from "next/server";
import { unauthorized, validateRole } from "@/app/api/tools/_utils";
import {
  forwardProvisionUpstream,
  type ProvisionManifest,
} from "@/lib/provision-manifest";

export async function POST(req: NextRequest) {
  const role = await validateRole(req, "admin");
  if (!role) return unauthorized();

  let body: { manifest?: ProvisionManifest };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.manifest || typeof body.manifest !== "object" || Array.isArray(body.manifest)) {
    return NextResponse.json({ error: "manifest required" }, { status: 400 });
  }

  const result = await forwardProvisionUpstream(
    "/api/provision/human/preview",
    body.manifest,
  );

  return NextResponse.json(result.body, { status: result.status });
}
