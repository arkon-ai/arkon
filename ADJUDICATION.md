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
