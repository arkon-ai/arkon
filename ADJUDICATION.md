# ADJUDICATION — WI-1687 E2E from-scratch CI green (2026-07-11)

Panel: opus (Anthropic) + composer (xAI). sol/codex (OpenAI) HARD-CAPPED tonight (usage limit,
resets 11:10 PM) → 3-vendor quorum unachievable this session; pushed under PANEL_OVERRIDE=1
(WIP/draft, logged). Both available lineages returned **0 Critical/Major**.

## Findings

1. **budget DELETE: int4-overflow id still 500s** (opus Minor, composer Minor — convergent)
   — **CONFIRMED + FIXED.** `/^\d+$/` passed `9999999999` (> int4 max 2147483647) → Postgres 22003
   → 500, the same 500-instead-of-404 class the guard set out to eliminate. Bounded the check to
   `<= 2147483647` (kept decimal-only `\d+` so hex/float/sign that `Number()` accepts stay rejected)
   on both admin/budgets and costs/budgets. tsc clean; existing negative tests (non-decimal ids)
   unaffected.

2–5. **composer hygiene minors** (NOT applied — non-blocking, ship-at-green):
   - "404 when DELETE affects 0 rows" — the route returns ok on a no-op delete; the E2E test accepts
     [200,404]. Behavioral change with test-churn risk for no correctness gain. Noted.
   - "400 vs 404 for malformed ids" — style; opus explicitly endorsed 404. Noted.
   - migration-comment route list, and the loose budget DELETE regression test — cosmetic. Noted.

## Verdict
Green-at-bar: opus + composer both 0 Critical/Major, the one load-bearing minor fixed. Local
from-scratch proof (blank timescaledb pg16 → 24 migrations clean → build → tests/api+edge = 401
passed / 2 flaky / 0 failed) stands. a11y/ui/mobile/perf verified by the PR's own CI run. Pushed
WIP/draft under PANEL_OVERRIDE (OpenAI lane capped); CI + CodeRabbit App are the merge gates.
