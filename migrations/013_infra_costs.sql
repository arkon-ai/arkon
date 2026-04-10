-- Phase 4: Infrastructure Cost Tracking
-- Tracks server/service costs with per-tenant allocation

CREATE TABLE IF NOT EXISTS infra_costs (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  category varchar(100) NOT NULL,  -- server, service, api_subscription, domain, other
  monthly_cost_usd numeric(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'USD',
  tenant_allocations jsonb DEFAULT '{}'::jsonb,  -- e.g. {"transformate": 0.7, "hofmi": 0.3}
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infra_costs_active ON infra_costs(active);
CREATE INDEX IF NOT EXISTS idx_infra_costs_category ON infra_costs(category);

-- Seed known infrastructure
INSERT INTO infra_costs (name, category, monthly_cost_usd, tenant_allocations, notes) VALUES
  ('Hetzner EU (brynnopenclaw)', 'server', 12.00, '{"transformate": 0.7, "hofmi": 0.3}'::jsonb, 'Arkon, Docker, n8n, Moodle'),
  ('HOFMI-EU-OPEN (Lumina brain)', 'server', 8.00, '{"transformate": 1.0}'::jsonb, 'OpenClaw gateway, all 4 channels'),
  ('Hetzner NA (static)', 'server', 5.00, '{"transformate": 0.5, "hofmi": 0.5}'::jsonb, 'Nginx, hfbiusa.org static'),
  ('HOFMI-TEAM-1 (Apollo)', 'server', 8.00, '{"hofmi": 1.0}'::jsonb, 'Matt DFY OpenClaw deployment'),
  ('hofmi-app-1 (Coolify)', 'server', 8.00, '{"hofmi": 1.0}'::jsonb, 'HOFMI Fleet App'),
  ('Dell G5 (electricity)', 'server', 15.00, '{"transformate": 1.0}'::jsonb, 'Content Factory home standby'),
  ('Tailscale', 'service', 0.00, '{"transformate": 0.7, "hofmi": 0.3}'::jsonb, 'Free tier'),
  ('OpenAI Codex', 'api_subscription', 200.00, '{"transformate": 1.0}'::jsonb, 'GPT-5.1 OAuth — already in model_pricing as subscription'),
  ('Cloudflare (domains + pages)', 'service', 0.00, '{"transformate": 1.0}'::jsonb, 'Free tier')
ON CONFLICT DO NOTHING;
