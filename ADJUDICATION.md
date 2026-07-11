# ADJUDICATION — WI-1699 gateway owner-only (round 1 panel, 2026-07-11)

Panel: opus + composer + grok45 + sol, quorum 4 lanes / 3 vendors, target sha 9bff220c2354.

## Findings adjudicated

1. **Proxy owner-only has no regression test** (grok Major, sol Major, composer Minor — convergent)
   — **CONFIRMED.** Highest-risk surface in the diff (server GATEWAY_TOKEN attachment); a
   one-line revert would keep CI green. **Fixed:** new `src/app/api/gateway/proxy/route.test.ts`
   (4 cases: unauth 401 + no fetch, tenant-admin 403 + no fetch, owner forwards allowlisted
   path, non-allowlisted path 403 even for owner).

2. **restart-gateway GET owner-only untested** (grok Minor, composer Minor)
   — **CONFIRMED.** **Fixed:** new `src/app/api/gateway/restart-gateway/route.test.ts`
   (unauth 401, tenant-admin 403).

3. **restart-gateway GET returns 401 for authenticated non-owners** (opus Minor, composer Minor,
   sol Minor — unanimous)
   — **CONFIRMED.** Conflated authn/authz, inconsistent with this file's own POST and the
   proxy/probe 401/403 split. **Fixed:** split into `!role → 401` / `role !== "owner" → 403`.

4. **Self-caught (not a lane finding):** my round-1 commit message + proxy comment said the proxy
   forwards "arbitrary gateway paths" — overstated; an allowlist (`/api/system-event`,
   `/hooks/agent`) already exists. Comment corrected to "allowlisted gateway paths"; the
   owner-only rationale stands (token amplification for low roles on allowlisted paths).

## Refuted / not filed
None — every filed finding was accepted. No lane filed a blocking finding against the authz
change itself; all four lanes independently endorsed the tightening.

## Round-1 verdict
1 Major class (test vacuity) confirmed and fixed → re-panel on the new diff (round 2).
Local state after fixes: gateway unit tests 12/12, `tsc --noEmit` clean.

---

# ADJUDICATION — round 2 (2026-07-11)

1. **Proxy allowlist prefix/traversal bypass** (composer Major, grok Major — convergent)
   — **CONFIRMED (real pre-existing bug on a diff-touched line; the diff's own tests claim to
   lock this allowlist).** `startsWith` passed `/api/system-event-backdoor` and, because fetch
   normalizes `..`, `/api/system-event/../admin/secrets` resolved to an un-allowlisted endpoint.
   **Fixed:** reject any path containing `..`, then require exact match OR a true `${p}/` segment
   child. +3 regression tests (prefix-sibling, traversal, legit child).

2. **Probe collapses 401/403** (opus NIT, composer Minor — convergent)
   — **CONFIRMED.** Probe returned 403 for unauthenticated callers while the sibling routes now
   split 401/403. **Fixed:** `!role → 401 (unauthorized())` before the owner check; probe test
   updated to assert 401 for the unauthenticated case.

3. **restart-gateway GET has only rejection tests** (sol Minor)
   — **CONFIRMED.** **Fixed:** added an owner-positive test asserting the owner passes authz and
   reaches the missing-config branch (503 without GATEWAY_SSH_HOST), so an accidental owner-lockout
   would fail CI.

## Round-2 verdict
All 3 confirmed and fixed. Local: gateway unit tests 16/16, `tsc --noEmit` clean. Re-panel (R3).

---

# ADJUDICATION — round 3 (2026-07-11)

1. **Percent-encoded traversal bypasses the R2 literal-`..` guard** (opus Major, grok Major,
   sol Major — convergent, all with Node repro)
   — **CONFIRMED (real, empirically reproduced).** The R2 fix rejected literal `..` then
   prefix-checked the RAW string; but `fetch`/WHATWG-URL decodes+collapses `%2e%2e`, `%2E%2E`,
   `.%2e` before the request leaves the process, so `/api/system-event/%2e%2e/admin/secrets`
   passed the raw-string allowlist while the actual request hit `/api/admin/secrets`. Same bypass
   class as R2, surviving via encoding.
   — **ROOT-CAUSE FIX (not whack-a-mole):** stop guessing raw-string forms — parse the full target
   URL once (`new URL(base + rawPath)`) and allowlist its normalized `.pathname` (what fetch will
   ACTUALLY request), then forward THAT SAME URL object. Check == use, so no encoding variant
   (`%2e%2e`, double-encode `%252e%252e`, `.%2e`) can diverge the checked path from the sent path.
   Concatenating onto the gateway base with a forced leading `/` also pins the origin (an
   `http://evil/...` or `//evil/...` path stays on the gateway origin AND fails the allowlist).
   Empirically verified via Node repro (every reviewer payload → allowed:false, checked path ==
   forwarded path). +5 regression cases (4 percent-encoded variants + origin-repoint).

## Round-3 verdict
The R3 Major is a confirmed real security bypass, not a nitpick — root-caused and fixed. Local:
gateway unit tests 21/21, `tsc --noEmit` clean, Node repro confirms closure. Per the converge
2-adversarial-round cap this fix is NOT re-adversaried locally (would be R4/grinding); it is
verified by the empirical repro + regression tests, and the CodeRabbit App review on the PR is the
external verifier. PR body carries a "not re-adversaried (converge cap)" note for this commit.

---

# ADJUDICATION — round 4 (2026-07-11)

1. **Encoded-slash traversal survives the R3 pathname allowlist** (composer Major, grok Major —
   convergent, both Node-reproduced)
   — **CONFIRMED. My R3 adjudication was WRONG:** I claimed "double-encode → allowed:false / check
   == use so no bypass." False. WHATWG-URL collapses `%2e%2e` (dot-encoded) but leaves
   percent-encoded SLASH intact as a single segment, so `/api/system-event/%2e%2e%2fadmin`,
   `..%2fadmin`, and `%252e%252e` all keep `resolvedPath` under the allowlisted prefix →
   `isAllowed=true` → forwarded with GATEWAY_TOKEN for the downstream gateway to decode `%2f`→`/`
   and normalize `../` out of the allowlist. The R3 tests covered dot-encoding but not slash-encoding.
   — **BULLETPROOF FIX (ends the whack-a-mole):** reject ANY path containing `%` outright, BEFORE
   the URL parse. The allowlisted endpoints and their legitimate children are plain-ASCII paths
   with no reserved characters, so a `%` can only be encoded-traversal smuggling. Combined with the
   R3 resolved-pathname check (catches literal `..`) and origin pinning, no encoding variant can
   pass. Node-repro confirms every reviewer payload → rejected; +4 encoded-slash/double-encode
   regression cases (8 encoded variants total). Full gateway suite 25/25, tsc clean.

## Round-4 verdict
The R4 Major was a real residual of the same traversal class (encoded slash), convergent across
two lineages with repro — correctly NOT waved through despite being past the nominal 2-round cap,
because each round closed a CONFIRMED exploit, not a nitpick. The `%`-reject rule is provably
complete for a plain-ASCII allowlist. Local: gateway 25/25, tsc clean, Node repro green. Re-panel
for the manifest.
