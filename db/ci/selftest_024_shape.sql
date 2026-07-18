-- db/ci/selftest_024_shape.sql — CI SELF-TEST FIXTURE (transformate WI-2075).
-- NEVER apply to a real database; it lives outside migrations/ on purpose.
-- scripts/ci/migration-dryrun.sh copies it in as 999_ci_selftest_024_shape.sql
-- during the selftest mode ONLY, and the workflow requires the migrator to ABORT.
--
-- Shaped like migrations/024_seed_system_agent.sql's 2026-07-18 prod failure
-- (see arkon #90/#91): two independent abort causes so the fixture stays fatal
-- even if the prod schema evolves —
--   (a) references a column ("description") that does not exist on prod agents;
--   (b) FK-references a tenants row that does not exist.
INSERT INTO agents (id, name, description, token_hash, tenant_id)
VALUES ('ci-selftest-9999', 'CI Selftest Agent', 'column absent on prod', 'ci-selftest-hash', 'no-such-tenant-9999')
ON CONFLICT (id) DO NOTHING;
