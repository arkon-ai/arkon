"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, BookOpen, ArrowRight } from "lucide-react";
import { glossaryTerms } from "@/components/mission-control/help-content";

export default function GlossaryPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return glossaryTerms;
    const q = query.toLowerCase();
    return glossaryTerms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q)
    );
  }, [query]);

  // Group by first letter
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const term of filtered) {
      const letter = term.term[0].toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(term);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-[#06d6a0]" />
          <h1 className="text-xl font-bold text-[#e2e8f0]">Glossary</h1>
        </div>
        <p className="text-sm text-[#94a3b8]">
          Searchable reference for Arkon terminology. Click any linked term to navigate to its page.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms..."
          className="w-full rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] py-2.5 pl-10 pr-4 text-sm text-[#e2e8f0] placeholder-[#475569] outline-none transition focus:border-[#06d6a0]/50 focus:ring-1 focus:ring-[#06d6a0]/20"
        />
        {query && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#475569]">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Terms grouped by letter */}
      {grouped.length === 0 ? (
        <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a]/60 px-6 py-8 text-center">
          <p className="text-sm text-[#64748b]">No terms match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([letter, terms]) => (
            <section key={letter}>
              <div className="sticky top-14 z-10 mb-2 bg-[#050510]/95 py-1 backdrop-blur">
                <h2 className="text-sm font-bold text-[#06d6a0]">{letter}</h2>
              </div>
              <div className="space-y-1.5">
                {terms.map((t) => (
                  <div
                    key={t.term}
                    className="rounded-xl border border-[#1a2a4a]/50 bg-[#0d0d1a]/40 px-4 py-3 transition hover:border-[#1a2a4a]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[#e2e8f0]">
                          {t.term}
                        </h3>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-[#94a3b8]">
                          {t.definition}
                        </p>
                      </div>
                      {t.link && (
                        <Link
                          href={t.link}
                          className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#06d6a0] transition hover:bg-[#06d6a0]/10"
                        >
                          View
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
