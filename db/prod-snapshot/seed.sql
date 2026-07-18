--
-- PostgreSQL database dump
--

\restrict Hu6fyfIpxUL9sndMAeju600erPLRccPMIjIOgWFOg8Zvmgl1LzAHdixt8L4WZIU

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: _migrations; Type: TABLE DATA; Schema: public; Owner: mcadmin
--

INSERT INTO public._migrations (id, name, applied_at) VALUES (1, '001_create_tenants.sql', '2026-03-08 19:10:06.914099+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (2, '002_event_threat_actions.sql', '2026-03-17 19:54:47.194229+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (3, '003_setup_wizard.sql', '2026-03-17 19:56:19.971105+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (4, '004_notifications.sql', '2026-03-17 19:59:51.381961+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (5, '005_push_subscriptions.sql', '2026-03-17 20:00:01.256705+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (6, '000_base_schema.sql', '2026-03-31 15:40:57.319226+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (7, '006_user_accounts.sql', '2026-03-31 15:41:13.383421+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (8, '007_audit_log_v2.sql', '2026-03-31 15:41:13.444791+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (9, '008_rate_limit.sql', '2026-03-31 15:41:13.474765+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (10, '009_traces_spans.sql', '2026-03-31 19:44:25.407059+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (11, '010_api_keys_magic_links.sql', '2026-03-31 20:47:53.05843+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (12, '020_work_items.sql', '2026-04-18 11:16:20.745728+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (13, '011_token_split.sql', '2026-05-01 19:35:28.399928+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (14, '013_infra_costs.sql', '2026-05-01 19:35:28.418719+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (15, '014_reconciliation.sql', '2026-05-01 19:35:28.428917+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (16, '015_agent_models.sql', '2026-05-01 19:35:28.445424+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (17, '016_youtube_channels.sql', '2026-05-01 19:35:28.461342+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (18, '017_journal.sql', '2026-05-01 19:35:28.469141+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (19, '018_memory_v2.sql', '2026-05-01 19:35:28.484218+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (20, '019_agent_identities_refresh.sql', '2026-05-01 19:35:28.494229+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (21, '021_drop_youtube_channels.sql', '2026-05-01 19:35:28.496873+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (22, '022_cache_creation_multiplier.sql', '2026-05-01 19:35:28.510814+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (23, '022_memory_facts_decay_index.sql', '2026-05-01 19:35:28.517135+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (24, '023_memory_relevance_feedback.sql', '2026-05-01 19:35:28.52349+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (25, '024_seed_system_agent.sql', '2026-07-18 15:09:05.754291+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (26, '025_incidents.sql', '2026-07-18 15:09:05.759822+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (27, '026_cached_input_tokens.sql', '2026-07-18 15:09:05.765574+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (28, '027_workflows_webhook_token.sql', '2026-07-18 15:09:05.772362+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (29, '028_align_workflow_runs_tool_calls.sql', '2026-07-18 15:09:05.775189+00');
INSERT INTO public._migrations (id, name, applied_at) VALUES (30, '029_align_sessions.sql', '2026-07-18 15:09:05.798472+00');


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: mcadmin
--

INSERT INTO public.tenants (id, name, domain, plan, metadata, created_at, updated_at, setup_completed, admin_email) VALUES ('transformate', 'Transformate', 'transformateai.com', 'owner', '{}', '2026-03-08 19:10:06.914099+00', '2026-03-08 19:10:06.914099+00', true, NULL);
INSERT INTO public.tenants (id, name, domain, plan, metadata, created_at, updated_at, setup_completed, admin_email) VALUES ('hofmi', 'HOFMI', NULL, 'dfy', '{}', '2026-03-08 19:10:06.914099+00', '2026-03-08 19:10:06.914099+00', true, NULL);
INSERT INTO public.tenants (id, name, domain, plan, metadata, created_at, updated_at, setup_completed, admin_email) VALUES ('hofmi-team-1', 'HOFMI Team 1', NULL, 'dfy', '{}', '2026-04-05 20:28:09.444702+00', '2026-04-05 20:28:09.444702+00', true, NULL);
INSERT INTO public.tenants (id, name, domain, plan, metadata, created_at, updated_at, setup_completed, admin_email) VALUES ('audit-sandbox', 'Audit Sandbox', NULL, 'starter', '{}', '2026-05-06 20:08:16.679959+00', '2026-05-06 20:08:16.679959+00', true, NULL);


--
-- Name: _migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: mcadmin
--

SELECT pg_catalog.setval('public._migrations_id_seq', 30, true);


--
-- PostgreSQL database dump complete
--

\unrestrict Hu6fyfIpxUL9sndMAeju600erPLRccPMIjIOgWFOg8Zvmgl1LzAHdixt8L4WZIU

