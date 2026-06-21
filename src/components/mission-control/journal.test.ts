import { describe, expect, it } from "vitest";
import {
  entryMatchesFilters,
  prependJournalEntry,
  type JournalEntry,
} from "./journal";

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 1,
    owner_agent: "warden",
    parent_id: null,
    category: "log",
    status: "log",
    priority: 0,
    title: "Test entry",
    body_md: "Body text",
    links: [],
    tags: ["infra"],
    related_project: "arkon",
    occurred_at: "2026-06-22T00:00:00.000Z",
    due_at: null,
    completed_at: null,
    created_at: "2026-06-22T00:00:00.000Z",
    updated_at: "2026-06-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("entryMatchesFilters", () => {
  it("accepts entries when no filters are active", () => {
    expect(entryMatchesFilters(makeEntry(), {})).toBe(true);
  });

  it("rejects entries that do not match status, category, owner, or project filters", () => {
    const entry = makeEntry({ status: "todo", category: "task", owner_agent: "lumina", related_project: "helm" });
    expect(entryMatchesFilters(entry, { status: "done" })).toBe(false);
    expect(entryMatchesFilters(entry, { category: "log" })).toBe(false);
    expect(entryMatchesFilters(entry, { owner: "warden" })).toBe(false);
    expect(entryMatchesFilters(entry, { project: "arkon" })).toBe(false);
    expect(entryMatchesFilters(entry, { status: "todo", category: "task", owner: "lumina", project: "helm" })).toBe(true);
  });

  it("applies the same search predicate as the feed filter", () => {
    const entry = makeEntry({ title: "Deploy plan", body_md: "Rollout steps", tags: ["release"] });
    expect(entryMatchesFilters(entry, { q: "deploy" })).toBe(true);
    expect(entryMatchesFilters(entry, { q: "rollout" })).toBe(true);
    expect(entryMatchesFilters(entry, { q: "release" })).toBe(true);
    expect(entryMatchesFilters(entry, { q: "missing" })).toBe(false);
  });
});

describe("prependJournalEntry", () => {
  it("prepends matching entries while preserving order", () => {
    const existing = [makeEntry({ id: 2, title: "Older" })];
    const incoming = makeEntry({ id: 3, title: "Newer" });
    expect(prependJournalEntry(existing, incoming, {})).toEqual([incoming, ...existing]);
  });

  it("drops duplicate ids instead of creating duplicate React keys", () => {
    const existing = [makeEntry({ id: 42, title: "Already here" })];
    const incoming = makeEntry({ id: 42, title: "SSE duplicate" });
    expect(prependJournalEntry(existing, incoming, {})).toBe(existing);
  });

  it("does not insert entries excluded by active filters", () => {
    const existing = [makeEntry({ id: 2 })];
    const incoming = makeEntry({ id: 3, owner_agent: "scout" });
    expect(prependJournalEntry(existing, incoming, { owner: "warden" })).toBe(existing);
  });
});