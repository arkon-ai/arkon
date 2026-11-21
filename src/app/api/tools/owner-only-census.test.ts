import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { OWNER_ONLY_ROWS, CONTENT_FACTORY_GET } from "./owner-only-rows";

/* THE OWNER-ONLY CENSUS AND THE ASYNC TRAP (transformate WI-4498, S8). The shared OWNER-ONLY check
   (tools/_utils.ts validateOwner) is ASYNC: it reads the users session. A call without `await` is a Promise, and a
   Promise is truthy, so `if (!validateOwner(req))` would never refuse and `const isAdmin = validateOwner(req)` would
   be true for anyone (/api/health is PUBLIC: system details to the world). eslint.config.mjs has no typed rule
   (no no-floating-promises / no-misused-promises), so this grep test is the guard (the S8 grep road). */

const CALL = "validateOwner(";

/** Every call of validateOwner( in the text that is not directly preceded by `await ` (the definition excluded). */
export function unawaitedOwnerCalls(text: string): string[] {
  const bad: string[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    let at = line.indexOf(CALL);
    while (at >= 0) {
      const before = line.slice(0, at);
      const isDefinition = /function\s+$/.test(before);
      const isAwaited = /await\s*\(?\s*$/.test(before) || /await\s+$/.test(before);
      const isWord = !/[A-Za-z0-9_$]$/.test(before);
      if (isWord && !isDefinition && !isAwaited) bad.push(`${i + 1}: ${line.trim()}`);
      at = line.indexOf(CALL, at + CALL.length);
    }
  });
  return bad;
}

const srcFiles = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" }).trim().split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("the async-trap detector itself (S8)", () => {
  it("flags an un-awaited call in an if, in a value, in a ternary and after &&; passes awaited ones", () => {
    expect(unawaitedOwnerCalls("if (!validateOwner(req)) return unauthorized();")).toHaveLength(1);
    expect(unawaitedOwnerCalls("const isAdmin = validateOwner(req);")).toHaveLength(1);
    expect(unawaitedOwnerCalls("const isAdmin = !isValidCron && validateOwner(req);")).toHaveLength(1);
    expect(unawaitedOwnerCalls("const x = ok ? validateOwner(req) : false;")).toHaveLength(1);
    expect(unawaitedOwnerCalls("if (!(await validateOwner(req))) return unauthorized();")).toEqual([]);
    expect(unawaitedOwnerCalls("const isAdmin = !isValidCron && (await validateOwner(req));")).toEqual([]);
    expect(unawaitedOwnerCalls("export async function validateOwner(req: NextRequest) {")).toEqual([]);
  });
});

describe("THE OWNER-ONLY CENSUS at this tree (transformate WI-4498)", () => {
  it("the table holds the 101 census rows, one per exported handler and method", () => {
    expect(OWNER_ONLY_ROWS).toHaveLength(101);
    expect(new Set(OWNER_ONLY_ROWS.map((r) => `${r.file} ${r.method}`)).size).toBe(101);
    expect(new Set(OWNER_ONLY_ROWS.map((r) => r.file)).size).toBe(66);
  });

  it("each of the 101 rows holds the awaited OWNER-ONLY check at its file:line", () => {
    const wrong = OWNER_ONLY_ROWS.filter((r) => !readFileSync(r.file, "utf8").split("\n")[r.line - 1].includes(`await ${CALL}`))
      .map((r) => `${r.file}:${r.line} ${r.method}`);
    expect(wrong).toEqual([]);
  });

  it("content-factory/status GET holds the awaited OWNER-ONLY check and reads no mc_token cookie", () => {
    const text = readFileSync(CONTENT_FACTORY_GET.file, "utf8");
    expect(text.split("\n")[CONTENT_FACTORY_GET.line - 1]).toContain(`await ${CALL}`);
    expect(text).not.toContain("mc_token");
  });

  it("THE ASYNC TRAP: every validateOwner call in src is awaited, and there are exactly 102 route calls", () => {
    const unawaited = srcFiles.flatMap((f) => unawaitedOwnerCalls(readFileSync(f, "utf8")).map((b) => `${f}:${b}`));
    expect(unawaited).toEqual([]);
    const routeCalls = srcFiles.filter((f) => f.startsWith("src/app/api/") && f.endsWith("/route.ts"))
      .reduce((n, f) => n + (readFileSync(f, "utf8").split(`await ${CALL}`).length - 1), 0);
    expect(routeCalls).toBe(102);
  });

  it("zero route file calls validateAdmin( any more (the census at the tip: only tools/_utils.ts keeps it)", () => {
    const left = srcFiles.filter((f) => f !== "src/app/api/tools/_utils.ts" && /\bvalidateAdmin\(/.test(readFileSync(f, "utf8")));
    expect(left).toEqual([]);
  });
});
