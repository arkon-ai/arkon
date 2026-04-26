/**
 * BRYNN-87: tests for discoverMigrations() helper in scripts/migrate.ts
 *
 * Covers:
 *   1. Only .sql regular files are returned, in lex order; non-sql and subdirs excluded
 *   2. Non-existent directory throws with "not found" in the message
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { discoverMigrations } from "../../scripts/migrate";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "brynn-87-"));

  // Regular SQL files (out-of-order to verify sort)
  await writeFile(join(tmpDir, "010_c.sql"), "SELECT 3;");
  await writeFile(join(tmpDir, "001_a.sql"), "SELECT 1;");
  await writeFile(join(tmpDir, "002_b.sql"), "SELECT 2;");

  // Non-SQL file — must be excluded
  await writeFile(join(tmpDir, "README.md"), "# ignored");

  // Subdirectory — must be excluded even if it had a .sql suffix (it doesn't here,
  // but stat.isFile() guard would catch it regardless)
  await mkdir(join(tmpDir, "subdir"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("discoverMigrations", () => {
  it("returns only .sql regular files sorted lexicographically", async () => {
    const files = await discoverMigrations(tmpDir);
    expect(files).toEqual(["001_a.sql", "002_b.sql", "010_c.sql"]);
  });

  it("excludes README.md and subdirectory", async () => {
    const files = await discoverMigrations(tmpDir);
    expect(files).not.toContain("README.md");
    expect(files).not.toContain("subdir");
    expect(files).toHaveLength(3);
  });

  it("throws with 'not found' when directory does not exist", async () => {
    await expect(
      discoverMigrations("/tmp/brynn-87-does-not-exist-xyz")
    ).rejects.toThrow(/not found/i);
  });
});
